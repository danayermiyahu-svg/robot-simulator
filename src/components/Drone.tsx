// File: src/components/Drone.tsx
// Aerial drone that hovers over the UGV. Its camera is a "payload" mounted on a
// gimbal with yaw + pitch (no roll). Two flight modes:
//   • Follow (default): drone chases the UGV automatically.
//   • Manual (N key): WASD forward/backward/strafe, Space=up, Shift=down.
// Arrow keys always control the payload gimbal. [ / ] adjust FOV.

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore, ScreenLayout} from '../store';
import { useKeyboard } from '../hooks/useKeyboard';

const DEG2RAD = Math.PI / 180;
// בסיס התקנת מצלמת המטען על גוף הרחפן (היסט במטרים, סיבוב במעלות [yaw,pitch,roll]).
const DRONE_CAM_OFFSET: [number, number, number] = [0, -0.02, 0.16];
const DRONE_CAM_ROT: [number, number, number] = [0, -15, 0];

// Where the drone hovers relative to the UGV (world space): up and slightly behind.
const HOVER_OFFSET = new THREE.Vector3(0, 6, 4);
// How quickly the drone chases the hover target (higher = snappier follow).
const FOLLOW_RATE = 2.5;
// מהירות מעקב מקסימלית (מ'/ש') — כדי שהדבקה ממרחק תיקח כמה שניות ולא תהיה קפיצה לא-מציאותית.
const FOLLOW_MAX_SPEED = 8;
// Manual flight speed (m/s)
const FLY_SPEED = 7;
// היסט הישיבה של הרחפן על החלק האחורי של הרובוט (במרחב המקומי של הרובוט).
const DRONE_REST_OFFSET = new THREE.Vector3(0, 0.28, 0.45); // מעט מעל ומאחור
const DRONE_REST_SCALE = 0.6;   // הקטנה נראותית כדי שיישב יפה
const LAUNCH_SPEED = 2;         // מהירות ההמראה האנכית (מ'/ש')
// מזהה שלט PlayStation (DualSense/DualShock). רק כשהוא מחובר — מיפוי הרחפן-שלט פעיל.
const isPsPad = (p: Gamepad | null) =>
  !!p && /dualsense|dualshock|wireless controller|054c|sony/i.test(p.id);

// ===== Reusable math temporaries (module scope → no per-frame allocation) =====
const _robotPos = new THREE.Vector3();
const _hoverTarget = new THREE.Vector3();
const _bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _bodyQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _localEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _localQuat = new THREE.Quaternion();
const _camPos = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _flyDir = new THREE.Vector3();

// ===== Thrustmaster A-10C (2 מכשירים) → רחפן =====
// ריחוף ידני (סטיק/הדק/האט/B6-B8) או מעקב-רובוט (כפתור אפור B14-18).
// המספרים תואמים למה שמופיע ב-gamepad-tester.com.

// מפענח את האט (AXIS 9) לכיווני x/y.
function decodeHatAxis(v: number | undefined): { x: number; y: number } {
  if (v === undefined || v > 1.05 || v < -1.05) return { x: 0, y: 0 };
  const idx = Math.round((v + 1) / (2 / 7));
  const map: Record<number, { x: number; y: number }> = {
    0: { x: 0, y: -1 }, 1: { x: 1, y: -1 }, 2: { x: 1, y: 0 }, 3: { x: 1, y: 1 },
    4: { x: 0, y: 1 }, 5: { x: -1, y: 1 }, 6: { x: -1, y: 0 }, 7: { x: -1, y: -1 },
  };
  return map[idx] || { x: 0, y: 0 };
}

export function DroneControls() {
  const keys = useKeyboard();
  const prevFollowBtn = useRef(false); // מצב הכפתור האפור בפריים הקודם (לזיהוי רגע לחיצה)

  useFrame((_, delta) => {
    const s = useTelemetryStore.getState();

    // ===== מקרה מיוחד: צימוד פעיל + שליטה על הרובוט + Thrustmaster ב' + פריסה מפוצלת =====
    // רק אז — סטיק שמאל שולט במצלמת הרחפן במקביל, בלי להעביר שליטה.
    if (!s.isControllingDrone()) {
      // --- ניתוק צימוד: אם אני בצימוד ועומדת על חוזי הרחפן ומזיזה פקד טיסה → מנתקים ---
      // ברגע הניתוק droneManual הופך ל-true, ולוגיקת הטיסה הרגילה תופסת פיקוד מהפריים הבא.
      if (!s.droneManual && s.steerMode === 'B' && s.isControllingDrone() === false) {
        // "חוזי הרחפן פעיל" = החלונית הפעילה מציגה רחפן. נבדוק לפי אותה לוגיקה של הסטור.
        const dronePaneActive =
          (s.screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO &&
            ((s.activePane === 1 && s.videoSlot1 === 'drone') || (s.activePane === 2 && s.videoSlot2 === 'drone'))) ||
          (s.screenLayout === ScreenLayout.MAP_TWO_VIDEO &&
            ((s.activePane === 2 && s.videoSlot2 === 'drone') || (s.activePane === 3 && s.videoSlot1 === 'drone')));

        if (dronePaneActive) {
          const padsX = navigator.getGamepads();
          const isWheelX = (p: Gamepad | null) => !!p && /g920|logitech|racing wheel/i.test(p.id);
          const isPsX = (p: Gamepad | null) => !!p && /dualsense|dualshock|wireless controller|054c|sony/i.test(p.id);
          const stx = padsX.filter(p => p && !isWheelX(p) && !isPsX(p)) as Gamepad[]; // Thrustmaster בלבד
          const gL = stx[0] || null, gR = stx[1] || null;
          // פקד טיסה = כפתורי ניהוג B6/B8 בכל צד, או ה-hat (ציר 9) של אחד המכשירים
          const flyBtn =
            gL?.buttons?.[6]?.pressed || gL?.buttons?.[8]?.pressed ||
            gR?.buttons?.[6]?.pressed || gR?.buttons?.[8]?.pressed || false;
          const hatV = (gR?.axes?.[9] !== undefined) ? gR.axes[9] : gL?.axes?.[9];
          const hatDecoded = decodeHatAxis(hatV);
          const hatActive = hatDecoded.x !== 0 || hatDecoded.y !== 0;

          if (flyBtn || hatActive) {
            s.setDroneLink(false); // מנתק צימוד → droneManual=true
            return;
          }
        }
      }

      const splitWithBoth =
        s.screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO ||
        s.screenLayout === ScreenLayout.MAP_TWO_VIDEO;
      const pads = navigator.getGamepads();
      const isWheelP = (p: Gamepad | null) => !!p && /g920|logitech|racing wheel/i.test(p.id);
      const isPsP = (p: Gamepad | null) => !!p && /dualsense|dualshock|wireless controller|054c|sony/i.test(p.id);
      const sticks = pads.filter(p => p && !isWheelP(p) && !isPsP(p)) as Gamepad[]; // Thrustmaster בלבד
      const hasThrustmaster = sticks.length > 0;

      if (!s.droneManual && s.steerMode === 'B' && splitWithBoth && hasThrustmaster) {
        const gpL = sticks[0] || null;
        const lx = gpL?.axes?.[0] ?? 0, ly = gpL?.axes?.[1] ?? 0;
        const DZ = 0.12, YR = 70, PR = 55;
        let yaw = s.droneGimbalYaw, pitch = s.droneGimbalPitch;
        if (Math.abs(lx) > DZ) yaw   -= lx * YR * delta;
        if (Math.abs(ly) > DZ) pitch -= ly * PR * delta;
        if (yaw !== s.droneGimbalYaw || pitch !== s.droneGimbalPitch) s.setDroneGimbal(yaw, pitch);
      }
      return; // כל שאר השליטה על הרחפן לא רצה כשלא שולטים בו
    }
    const k = keys.current;

    const YAW_RATE = 60, PITCH_RATE = 45, FOV_RATE = 40;
    const AIM_PX_RATE = 360, AIM_MAX_PX = 300, STICK_DEADZONE = 0.12;
    const STICK_CAM_YAW_RATE = 70, STICK_CAM_PITCH_RATE = 55; // סטיק שמאל → מצלמה במצב מעקב
    const STRAFE_GAIN = 1.6, VERT_GAIN = 0.9;
    const HAT_STRAFE_RATE = 1.0, HAT_LIFT_RATE = 1.0, DIFF_YAW_RATE = 1.4;

    // --- מכשירים ---
    const allPads = navigator.getGamepads();
    const isWheel = (p: Gamepad | null) => !!p && /g920|logitech|racing wheel/i.test(p.id);
    const stickPads = allPads.filter(p => p && !isWheel(p)) as Gamepad[];
        // --- שלט PS: מכשיר נפרד לגמרי. אם הוא מחובר, הרחפן מנוהג ממנו בלבד. ---
    const psPad = allPads.find(isPsPad) || null;
    const gpLeft  = stickPads[0] || null;
    const gpRight = stickPads[1] || stickPads[0] || null;
    const ax  = gpRight?.axes;
    const bt  = gpRight?.buttons;
    const btL = gpLeft?.buttons;
    // כל עוד הרחפן לא המריא — הוא יושב על הרובוט, ואין עליו שום שליטה.
    // (ההמראה עצמה מטופלת ב-Robot.tsx כדי שתעבוד בכל פריסה, גם בלי חלונית רחפן.)
    if (!s.droneLaunched) return;



    // ===== גימבל =====
    let yaw = s.droneGimbalYaw, pitch = s.droneGimbalPitch;
    if (k['ArrowLeft']) yaw += YAW_RATE * delta;
    if (k['ArrowRight']) yaw -= YAW_RATE * delta;
    if (k['ArrowUp']) pitch += PITCH_RATE * delta;
    if (k['ArrowDown']) pitch -= PITCH_RATE * delta;
    // במצב מעקב (קישור): סטיק שמאל שולט רק במצלמה, ותו לא
    if (!s.droneManual) {
      const lx = gpLeft?.axes?.[0] ?? 0, ly = gpLeft?.axes?.[1] ?? 0;
      if (Math.abs(lx) > STICK_DEADZONE) yaw   -= lx * STICK_CAM_YAW_RATE * delta;
      if (Math.abs(ly) > STICK_DEADZONE) pitch -= ly * STICK_CAM_PITCH_RATE * delta;
    }
    if (yaw !== s.droneGimbalYaw || pitch !== s.droneGimbalPitch) s.setDroneGimbal(yaw, pitch);

    // ===== זום: מקלדת בלבד =====
    let fov = s.droneFov;
    if (k['BracketLeft']) fov -= FOV_RATE * delta;
    if (k['BracketRight']) fov += FOV_RATE * delta;
    if (fov !== s.droneFov) s.setDroneFov(fov);

    // ===== הצלב המעוגל — סטיק ימין מזיז אותו רק בריחוף ידני =====
    let aimX = s.droneAimX, aimY = s.droneAimY;
    if (s.droneManual && ax) {
      const sx = ax[0] ?? 0, sy = ax[1] ?? 0;
      if (Math.abs(sx) > STICK_DEADZONE) aimX += sx * AIM_PX_RATE * delta;
      if (Math.abs(sy) > STICK_DEADZONE) aimY -= sy * AIM_PX_RATE * delta; // משיכה → צלב למעלה, דחיפה → למטה
    }
    aimX = Math.max(-AIM_MAX_PX, Math.min(AIM_MAX_PX, aimX));
    aimY = Math.max(-AIM_MAX_PX, Math.min(AIM_MAX_PX, aimY));

    // ===== טיסה — רק בריחוף ידני =====
    if (s.droneManual) {
      const [px, py, pz] = s.dronePosition;
      let nx = px, ny = py, nz = pz;
      let bodyYaw = s.droneYaw;
      const step = FLY_SPEED * delta;

            // ===== ניהוג זחלים בשלט PS — רק כשמחובר שלט PS וגם מצב הניהוג 'A' =====
      if (psPad && s.steerMode === 'A') {
        const pax = psPad.axes;
        const pbt = psPad.buttons;
        const DZ = 0.12;

        // כל סטיק אנכי מנהג "צד" של הרחפן (שמאל=ציר 1, ימין=ציר 3)
        const rawL = pax?.[1] ?? 0;
        const rawR = pax?.[3] ?? 0;
        const leftSide  = Math.abs(rawL) > DZ ? -rawL : 0; // דחיפה קדימה (שלילי) → +
        const rightSide = Math.abs(rawR) > DZ ? -rawR : 0;

        const drive = (leftSide + rightSide) / 2;   // שניהם → קדימה/אחורה
        const turn  = rightSide - leftSide;          // צד אחד → סיבוב
        const DIFF_YAW_RATE = 1.4;
        bodyYaw += turn * DIFF_YAW_RATE * delta;

        const fX = -Math.sin(bodyYaw), fZ = -Math.cos(bodyYaw);
        const rX =  Math.cos(bodyYaw), rZ = -Math.sin(bodyYaw);
        nx += fX * drive * step; nz += fZ * drive * step;

        // חצים: מעלה/מטה = גובה, ימין/שמאל = הסטה הצידה
        if (pbt?.[12]?.pressed) ny += step;              // B12 חץ עליון = עלייה
        if (pbt?.[13]?.pressed) ny -= step;              // B13 חץ תחתון = ירידה
        if (pbt?.[15]?.pressed) { nx += rX * step; nz += rZ * step; }  // B15 ימינה
        if (pbt?.[14]?.pressed) { nx -= rX * step; nz -= rZ * step; }  // B14 שמאלה

        // שמירה ויציאה — כדי שלא יתערבב עם לוגיקת ה-Thrustmaster שממשיכה למטה
        if (nx !== px || ny !== py || nz !== pz || bodyYaw !== s.droneYaw) {
          s.setDroneYaw(bodyYaw);
          s.setDronePosition([nx, Math.max(0.5, Math.min(40, ny)), nz]);
        }
        return;
      }

      // ניהוג דיפרנציאלי (B6=קדימה, B8=אחורה, בכל צד)
      const rightSide = bt?.[6]?.pressed ? 1 : (bt?.[8]?.pressed ? -1 : 0);
      const leftSide  = btL?.[6]?.pressed ? 1 : (btL?.[8]?.pressed ? -1 : 0);
      const drive = (leftSide + rightSide) / 2;
      const turn  = rightSide - leftSide;
      bodyYaw += turn * DIFF_YAW_RATE * delta;

      const fX = -Math.sin(bodyYaw), fZ = -Math.cos(bodyYaw);
      const rX =  Math.cos(bodyYaw), rZ = -Math.sin(bodyYaw);
      nx += fX * drive * step; nz += fZ * drive * step;

      // האט (AXIS 9): מעלה/מטה = גובה, שמאל/ימין = הצידה
      const hatV = (ax?.[9] !== undefined) ? ax[9] : gpLeft?.axes?.[9];
      const hat = decodeHatAxis(hatV);
      ny += -hat.y * HAT_LIFT_RATE * step;
      nx += rX * hat.x * HAT_STRAFE_RATE * step;
      nz += rZ * hat.x * HAT_STRAFE_RATE * step;

      // גיבוי מקלדת (יחסית לכיוון הגוף)
      if (k['KeyI']) { nx += fX * step; nz += fZ * step; }
      if (k['KeyK']) { nx -= fX * step; nz -= fZ * step; }
      if (k['KeyU']) { nx -= rX * step; nz -= rZ * step; }
      if (k['KeyO']) { nx += rX * step; nz += rZ * step; }
      if (k['Space']) ny += step;
      if (k['ControlLeft'] || k['ControlRight']) ny -= step;

      // --- ההדק: אופקי = סיבוב הגוף (מתכנס); אנכי = גובה שנשאר (לא מתכנס) ---
      const trigger = bt?.[0]?.pressed || false;
      if (trigger) {
        const AIM_MAX_ANGLE = 0.7, DRIVE_SPEED = 1.0, TURN_SLOWDOWN = 0.3, DRONE_TURN_RATE = 2.2;
        const ndx = aimX / AIM_MAX_PX;   // -1..1 (ימין חיובי)
        const ndy = aimY / AIM_MAX_PX;   // -1..1 (מסך למטה חיובי)

        // ----- ציר אופקי: סיבוב הגוף אל הצלב, והצלב מתכנס למרכז -----
        const err = ndx * AIM_MAX_ANGLE;
        const steer = Math.max(-1, Math.min(1, err * STRAFE_GAIN));
        const turnAngle = steer * DRONE_TURN_RATE * delta;
        bodyYaw -= turnAngle;
        aimX -= (turnAngle / AIM_MAX_ANGLE) * AIM_MAX_PX;
        aimX = Math.max(-AIM_MAX_PX, Math.min(AIM_MAX_PX, aimX));

        // ----- טיסה קדימה לכיוון הגוף (מואטת בפנייה חדה) -----
        const camYaw = bodyYaw + s.droneGimbalYaw * DEG2RAD;
        const cfX = -Math.sin(camYaw), cfZ = -Math.cos(camYaw);
        const drv = DRIVE_SPEED * (1 - TURN_SLOWDOWN * Math.abs(steer));
        nx += cfX * drv * step; nz += cfZ * drv * step;

        // ----- ציר אנכי: "מצערת גובה" — בקצה הצלב הרחפן ממשיך לעלות/לרדת בקצב מלא -----
        // עד 70% מהטווח: עלייה יחסית. מעבר לזה (הצלב קרוב לקצה): קצב מלא וקבוע, ממשיך כל עוד שם.
        const vMag = Math.abs(ndy);
        const vDir = ndy < 0 ? 1 : -1; // צלב למעלה (ndy שלילי) → עלייה (+)
        let climb;
        if (vMag > 0.7) climb = vDir;
        else climb = vDir * (vMag / 0.7);
        ny += climb * VERT_GAIN * step;

        // שומרים רק את aimX המעודכן (המתכנס); aimY נשאר איפה ששמת אותו
        s.setDroneAim(aimX, aimY);
      }

      if (nx !== px || ny !== py || nz !== pz || bodyYaw !== s.droneYaw) {
        s.setDroneYaw(bodyYaw);
        s.setDronePosition([nx, Math.max(0.5, Math.min(40, ny)), nz]);
      }
    }

    if (aimX !== s.droneAimX || aimY !== s.droneAimY) s.setDroneAim(aimX, aimY);
  });

  return null;
}

/**
 * The visual drone body. Renders the mesh (and optionally the payload camera).
 * The hover position tracks the UGV; the body yaws to keep the UGV framed.
 */
export function DroneVisuals({ camera = false, forceActive = false }: { camera?: boolean; forceActive?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rotorRefs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const robotBodyRef = useTelemetryStore(s => s.robotBodyRef);
  const droneView = useTelemetryStore(s => s.droneView);
  const posInit = useRef(false);
  const smoothPos = useMemo(() => new THREE.Vector3(0, HOVER_OFFSET.y, 0), []);
    const prevYRef = useRef(HOVER_OFFSET.y);
  const smoothClimbRef = useRef(0);

  useFrame((state, delta) => {
    const body = robotBodyRef.current;
    if (body) {
      const p = body.translation();
      _robotPos.set(p.x, p.y, p.z);
    } else {
      _robotPos.set(0, 0, 0);
    }

    const s = useTelemetryStore.getState();
    const manual = s.droneManual;

    // ===== טרם המראה: הרחפן יושב על החלק האחורי של הרובוט =====
    if (!s.droneLaunched) {
      const body = robotBodyRef.current;
      if (body && groupRef.current) {
        const rp = body.translation();
        const rq = body.rotation();
        _bodyQuat.set(rq.x, rq.y, rq.z, rq.w);
        // נקודת הישיבה = מיקום הרובוט + היסט מקומי מסובב עם הרובוט
        _camOffset.copy(DRONE_REST_OFFSET).applyQuaternion(_bodyQuat);
        const restX = rp.x + _camOffset.x, restY = rp.y + _camOffset.y, restZ = rp.z + _camOffset.z;
        posInit.current = false; // כדי שאחרי המראה במעקב זה יתחיל נקי
        // כל עותק מצייר לבד לפי מיקום הרובוט הנוכחי — בלי לכתוב ל-store (מונע התנגשות בין חלוניות)
        groupRef.current.position.set(restX, restY, restZ);
        groupRef.current.quaternion.copy(_bodyQuat);
        groupRef.current.scale.setScalar(DRONE_REST_SCALE);
        // רק העותק שמחזיק את המצלמה מסנכרן את ה-store, כדי שההמראה תתחיל מהמקום הנכון
        if (camera) s.setDronePosition([restX, restY, restZ]);
      }
      return;
    }
    // אחרי שהמריא — הסקייל חוזר לרגיל
    if (groupRef.current) groupRef.current.scale.setScalar(1);

    if (manual) {
      // --- Manual mode: position comes from the store ---
      const [mx, my, mz] = s.dronePosition;
      smoothPos.set(mx, my, mz);
    } else {
      // --- מצב מעקב (קישור): טס אל מעל-ומאחורי הרובוט, תמיד שואף למאחור ---
      // היעד = מיקום הרובוט + היסט "מאחור" המסובב לפי כיוון הרובוט (לא היסט עולמי קבוע)
      const rq = body ? body.rotation() : { x: 0, y: 0, z: 0, w: 1 };
      _bodyQuat.set(rq.x, rq.y, rq.z, rq.w);
      _bodyEuler.setFromQuaternion(_bodyQuat, 'YXZ');
      const robotYaw = _bodyEuler.y;
      // HOVER_OFFSET הוא (0, גובה, מרחק-אחורה); מסובבים את המרכיב האופקי לפי כיוון הרובוט
      const backX = Math.sin(robotYaw) * HOVER_OFFSET.z;
      const backZ = Math.cos(robotYaw) * HOVER_OFFSET.z;
      _hoverTarget.set(_robotPos.x + backX, _robotPos.y + HOVER_OFFSET.y, _robotPos.z + backZ);

      if (!posInit.current) {
        smoothPos.copy(_hoverTarget);
        posInit.current = true;
      } else {
        _flyDir.copy(_hoverTarget).sub(smoothPos);
        const dist = _flyDir.length();
        if (dist > 0.0001) {
          const speed = Math.min(dist * FOLLOW_RATE, FOLLOW_MAX_SPEED);
          smoothPos.addScaledVector(_flyDir.multiplyScalar(1 / dist), Math.min(speed * delta, dist));
        }
      }
      s.setDronePosition([smoothPos.x, smoothPos.y, smoothPos.z]);
      // שומרים גם את הזווית כל פריים, כך שבניתוק הרחפן יישאר בזווית הנוכחית ולא יקפוץ לישנה
      s.setDroneYaw(robotYaw);
    }

    // Gentle hover bob.
    const t = state.clock.elapsedTime;
    const bobY = Math.sin(t * 1.6) * 0.12;
    const dronePosY = smoothPos.y + bobY;

        // Body yaw: במצב מעקב הרחפן פונה אל הרובוט. במצב ידני (headless) הוא שומר
    // על כיוון קבוע (אף "צפונה") כדי שקדימה תמיד יהיה קדימה, בלי הסתובבות אוטומטית.
    let bodyYaw;
    if (manual) {
      bodyYaw = s.droneYaw; // הגוף מסתובב לפי הניהוג הדיפרנציאלי (B6/B8)
    } else {
      const dx = _robotPos.x - smoothPos.x;
      const dz = _robotPos.z - smoothPos.z;
      bodyYaw = Math.atan2(-dx, -dz);
    }
    _bodyEuler.set(0, bodyYaw, 0);
    _bodyQuat.setFromEuler(_bodyEuler);

    // שומרים את כיוון המצלמה (גוף + גימבל) ל-store עבור המצפן (במעלות 0-360)
    {
      // כיוון הגוף במעלות + סיבוב הגימבל (droneGimbalYaw כבר במעלות)
      let deg = (-bodyYaw * 180) / Math.PI + s.droneGimbalYaw;
      deg = ((deg % 360) + 360) % 360;
      s.setDroneHeading(deg);
    }

    if (groupRef.current) {
      // מהירות טיפוס/צלילה — מחושבת מהגובה החלק (בלי הבוב) כדי להטות את האף
      const rawClimb = (smoothPos.y - prevYRef.current) / Math.max(delta, 1e-4);
      prevYRef.current = smoothPos.y;
      smoothClimbRef.current += (rawClimb - smoothClimbRef.current) * Math.min(1, delta * 6);
      const noseTilt = THREE.MathUtils.clamp(smoothClimbRef.current * 0.05, -0.3, 0.3);

      groupRef.current.position.set(smoothPos.x, dronePosY, smoothPos.z);
      groupRef.current.quaternion.copy(_bodyQuat);
      // אף למטה בסיסי + בוב + הרמת אף בטיפוס / הורדת אף בצלילה
      groupRef.current.rotateX(Math.sin(t * 1.2) * 0.03 - 0.05 + noseTilt);
      groupRef.current.rotateZ(Math.sin(t * 0.9) * 0.04);
    }

    // Spin the rotors.
    rotorRefs.forEach((r, i) => {
      if (r.current) r.current.rotation.y += delta * (28 + i * 2);
    });

    // ===== Payload camera =====
    if (camera && cameraRef.current) {
      const cam = cameraRef.current;
      const s = useTelemetryStore.getState();
      const [ox, oy, oz] = DRONE_CAM_OFFSET;
      const [ryDeg, rpDeg, rrDeg] = DRONE_CAM_ROT;

      // yaw-only body frame for the payload mount (so the bob tilt/roll doesn't
      // fight the gimbal); camera position offset from the drone body.
      _yawQuat.copy(_bodyQuat);
      _camOffset.set(ox, oy, oz).applyQuaternion(_yawQuat);
      _camPos.set(smoothPos.x, dronePosY, smoothPos.z).add(_camOffset);
      cam.position.copy(_camPos);

      // Local orientation = base mount rotation + live gimbal (payload, yaw+pitch only).
      _localEuler.set(
        (rpDeg + s.droneGimbalPitch) * DEG2RAD,
        (ryDeg + s.droneGimbalYaw) * DEG2RAD,
        rrDeg * DEG2RAD,
      );
      _localQuat.setFromEuler(_localEuler);
      cam.quaternion.copy(_yawQuat).multiply(_localQuat);

      const targetFov = s.droneFov;
      if (Math.abs(cam.fov - targetFov) > 0.01) {
        cam.fov = targetFov;
        cam.updateProjectionMatrix();
      }
    }
  });

  return (
    <>
      {camera && (
        <PerspectiveCamera ref={cameraRef} makeDefault={forceActive || droneView} fov={60} near={0.1} far={1000} />
      )}
      <group ref={groupRef} visible={!camera}>
        {/* Central body */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.32, 0.12, 0.42]} />
          <meshStandardMaterial color="#2b2f36" roughness={0.55} metalness={0.5} />
        </mesh>
        {/* Top canopy */}
        <mesh castShadow position={[0, 0.09, 0.02]}>
          <boxGeometry args={[0.22, 0.06, 0.26]} />
          <meshStandardMaterial color="#3a4048" roughness={0.4} metalness={0.6} />
        </mesh>

        {/* Four arms + rotors (X configuration) */}
        {[
          { x: 0.32, z: 0.32, i: 0 },
          { x: -0.32, z: 0.32, i: 1 },
          { x: 0.32, z: -0.32, i: 2 },
          { x: -0.32, z: -0.32, i: 3 },
        ].map(({ x, z, i }) => {
          const ang = Math.atan2(z, x);
          const len = Math.hypot(x, z);
          return (
            <group key={i}>
              {/* arm */}
              <mesh position={[x / 2, 0, z / 2]} rotation={[0, -ang, 0]} castShadow>
                <boxGeometry args={[len, 0.03, 0.05]} />
                <meshStandardMaterial color="#22262c" roughness={0.6} metalness={0.4} />
              </mesh>
              {/* motor hub */}
              <mesh position={[x, 0.02, z]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 0.06, 12]} />
                <meshStandardMaterial color="#15181c" metalness={0.7} roughness={0.3} />
              </mesh>
              {/* rotor disc */}
              <mesh ref={rotorRefs[i]} position={[x, 0.07, z]}>
                <boxGeometry args={[0.34, 0.006, 0.03]} />
                <meshStandardMaterial color="#0e1013" transparent opacity={0.55} />
              </mesh>
            </group>
          );
        })}

        {/* Gimbal ball + camera lens (the payload), slung under the nose */}
        <group position={[0, -0.09, 0.16]}>
          <mesh castShadow>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color="#1a1d21" roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.02, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.05, 16]} />
            <meshStandardMaterial color="#05060a" metalness={0.9} roughness={0.1} emissive="#0a2540" emissiveIntensity={0.4} />
          </mesh>
        </group>

      </group>
    </>
  );
}
