// File: src/components/Robot.tsx
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { RigidBody, RapierRigidBody, CuboidCollider, CapsuleCollider, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useKeyboard } from '../hooks/useKeyboard';
import { getGamepadAxes } from '../hooks/useGamepads';
import { useTelemetryStore, ViewMode } from '../store';
export const physicalSpeeds = { left: 0, right: 0 };
// ===== מיפוי הגה+דוושות Logitech G920 (steerMode 'C') =====
const WHEEL_AXIS   = 0;   // ציר סיבוב ההגה
const GAS_AXIS     = 1;   // דוושת גז (קדימה)
const REVERSE_AXIS = 2;   // דוושת רוורס (אחורה)
const GAS_BTN      = 1;   // כפתור B בהגה — גז קדימה
const REVERSE_BTN  = 0;   // כפתור A בהגה — רוורס

const WHEEL_RANGE     = 0.7;    // הטווח האמיתי של ההגה (±1 מלא)
const WHEEL_DEADZONE  = 0.05;   // אזור מת קטן סביב המרכז
const GAS_PRESSED     = -1.0;   // ערך דוושת הגז בלחיצה מלאה
const REVERSE_PRESSED =  0.60;  // ערך דוושת הרוורס בלחיצה מלאה
const STEER_STRENGTH  = 1.0;    // עוצמת הפנייה של ההגה
const WHEEL_INVERT    = false;  // אם ההגה מפנה הפוך — true

// ההגה: ±WHEEL_RANGE -> ±1, עם deadzone סביב 0
const normWheel = (raw: number) => {
  if (Math.abs(raw) < WHEEL_DEADZONE) return 0;
  return Math.max(-1, Math.min(1, raw / WHEEL_RANGE));
};

// דוושה: מ-1 (נח) עד pressedVal (לחוץ מלא) -> 0..1
const normPedal = (raw: number, pressedVal: number) =>
  Math.max(0, Math.min(1, (1 - raw) / (1 - pressedVal)));

// Shared global refs for gamepad controls and camera direction to sync between components
const modeRef = { current: 'A' as 'A' | 'B' | 'C' };
const prevB3Ref = { current: false };
const aimInvertYRef = { current: false };   // האם ציר ה-Y של הצלב הפוך (החלפה בכפתור ריבוע)
const prevSquareRef = { current: false };   // מצב כפתור ריבוע בפריים הקודם — לזיהוי רגע הלחיצה
const cameraYawRef = { current: 0 };
const cameraPitchRef = { current: 0 };
const aimTargetYawRef = { current: 0 };
const aimLockedRef = { current: false };
const aimIdleTimeRef = { current: 0 };
export const physicsEnv: { rapier: any, world: any } = { rapier: null, world: null };

// נקודת הזינוק של הרובוט. הוזזה ל-z=7 (יותר קדימה) כי שטיח תחילת הניסוי (sensor-2)
// הוזז ל-z=3.5 בעקבות מתיחת גבעה 1. כך הרובוט מתחיל לפני השטיח וחוצה אותו בנסיעה.
const SPAWN = { x: 0, y: 1.5, z: 7 };

// ===== קבועי ניהוג ב' (מעקב אחרי הצלב העגול) =====
// כל הזוויות ברדיאנים. כל הקצבים הם "ליחידת זמן", לא "לפריים".
const CAM_PAN_RATE   = 1.2;   // rad/s - פאן מצלמה במצב א' (כפתורים 11/13)
const AIM_RATE       = 0.9;   // rad/s - קצב הזזת הצלב עם הסטיק הימני
const AIM_MAX_YAW    = 0.70;  // rad (~40°) - כמה הצלב יכול להתרחק ימינה/שמאלה
const AIM_MAX_PITCH  = 0.35;  // rad (~20°) - כמה הצלב יכול לעלות/לרדת
const STEER_GAIN     = 1.5;   // כמה חזק הרובוט פונה לפי גודל השגיאה
const DRIVE_SPEED    = 0.9;   // מהירות קדימה בזמן מעקב (0..1). 1.0 = מהירות מלאה.
const TURN_SLOWDOWN  = 0.25;  // כמה להאט קדימה בפנייה חדה
const AIM_IDLE_DELAY = 1.7;   // שניות בלי נגיעה בסטיק עד שהצלב חוזר למרכז
const AIM_IDLE_TAU   = 0.35;  // שניות - כמה מהר הוא חוזר
const AIM_RELOCK_ERR = 1.4;   // rad - שגיאה גדולה מזו = קפיצת מיקום, נועלים יעד חדש
const AIM_LOOKAHEAD  = 10;    // מטרים - כמה רחוק לפני הרובוט "יושבת" נקודת היעד
const AIM_HEIGHT     = 0.0;   // מטרים - גובה נקודת היעד ביחס למרכז הרובוט

/**
 * Main Robot Physics Controller
 */
export function Robot({ hideVisuals = false }: { hideVisuals?: boolean }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const robotBodyRef = useTelemetryStore(s => s.robotBodyRef);
  const setTelemetry = useTelemetryStore(s => s.setTelemetry);
  const keys = useKeyboard();
  const rapierContext = useRapier();
  physicsEnv.rapier = rapierContext.rapier;
  physicsEnv.world = rapierContext.world;

  const trackSpeedL = useRef(0);
  const trackSpeedR = useRef(0);
  const lastTimeRef = useRef(0);
  const isFlippedRef = useRef(false);
  const lastResetRef = useRef(0);
  const prevEKeyRef = useRef(false);
  const prevLinkBtnRef = useRef(false);

  // ===== מתגי פיזיקה - בשלב 0 הכל כבוי (התנהגות זהה למקור) =====
  const USE_IMPULSE_DRIVE = true;
  const CANCEL_LATERAL_DRIFT = true;
  const ALLOW_PITCH_SWAY = true;
  // ==============================================================

  const maxSpeed = 3.5;
  const accel = 3;
  const decel = 4;
  const trackWidth = 0.7;

  useEffect(() => {
    if (bodyRef.current) {
      robotBodyRef.current = bodyRef.current;
    }
  }, [robotBodyRef]);

  useFrame((state, delta) => {
    if (!bodyRef.current) return;

    // --- איפוס מיקום הרובוט בעת מעבר בין שלבי הניסוי ---
    const resetReq = useTelemetryStore.getState().resetRequest;
    if (resetReq !== lastResetRef.current) {
      lastResetRef.current = resetReq;
      bodyRef.current.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      trackSpeedL.current = 0;
      trackSpeedR.current = 0;
      isFlippedRef.current = false;
      cameraYawRef.current = 0;
      cameraPitchRef.current = 0;
      aimLockedRef.current = false;
      return;
    }

    // סנכרון: אם המצב שונה מבחוץ (למשל מקש Tab במקלדת) — מיישרים את modeRef
    const storeMode = useTelemetryStore.getState().steerMode;
    if (storeMode !== modeRef.current) {
      modeRef.current = storeMode;
      cameraYawRef.current = 0;
      cameraPitchRef.current = 0;
    }

    const allPads = navigator.getGamepads();
        // ===== המראת הרחפן — הדרגתי כל עוד לוחצים. רץ תמיד ובכל פריסה. =====
    {
      const st = useTelemetryStore.getState();
      const LAUNCH_SPEED = 1.5; // מהירות ההמראה (מ'/ש')
      const atCeiling = st.droneLaunched && st.dronePosition[1] >= 7.4;

      const psRe = /dualsense|dualshock|wireless controller|054c|sony/i;
      // שלט PS: המראה בחץ העליון (B12) — רק במצב א'. על הרובוט = המראה; על הרחפן = עלייה בגובה.
      const psPad = allPads.find(p => p && psRe.test(p.id)) || null;
      const psLaunch = st.steerMode === 'A' && !st.layoutMenuOpen && (psPad?.buttons?.[12]?.pressed || false);

      // Thrustmaster וכו': הדק-שמאל (B0/B5 של המכשיר השמאלי שאינו שלט ואינו הגה)
      const otherPads = allPads.filter(p => p && !/g920|logitech|racing wheel/i.test(p.id) && !psRe.test(p.id)) as Gamepad[];
      const leftPad = otherPads[0] || null;
      const tmLaunch = (leftPad?.buttons?.[0]?.pressed || leftPad?.buttons?.[5]?.pressed) || false;

      if ((psLaunch || tmLaunch) && !atCeiling) {
        st.launchDrone(LAUNCH_SPEED * delta);
      }
    }

    // ===== צימוד רחפן ⇄ רובוט: B2 של הג'ויסטיק, רק במצב ב'. =====
    // רץ *לפני* בדיקת השליטה, כדי שהכפתור יעבוד גם כשעומדים על חוזי הרחפן.
    {
      const st2 = useTelemetryStore.getState();
      const psRe2 = /dualsense|dualshock|wireless controller|054c|sony/i;
      const sticks2 = allPads.filter(p => p && !/g920|logitech|racing wheel/i.test(p.id) && !psRe2.test(p.id)) as Gamepad[];
      const b2Now = st2.steerMode === 'B' && sticks2.some(p => p.buttons?.[2]?.pressed);
      if (b2Now && !prevLinkBtnRef.current) {
        st2.toggleDroneManual();
      }
      prevLinkBtnRef.current = b2Now;
    }

    // כשהשליטה עברה לרחפן — הרובוט "חונה" במקום ואינו מגיב לפקדים
    if (useTelemetryStore.getState().isControllingDrone()) {
      trackSpeedL.current = 0;
      trackSpeedR.current = 0;
      physicalSpeeds.left = 0;
      physicalSpeeds.right = 0;
      if (!isFlippedRef.current) {
        const cv = bodyRef.current.linvel();
        bodyRef.current.setLinvel({ x: 0, y: cv.y, z: 0 }, true);
        bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    // מזהים את ההגה לפי ה-id (G920 / Logitech) ומבודדים אותו מהג'ויסטיקים.
    // כך מצבים A/B רואים רק סטיקים אמיתיים, וההגה משמש רק את מצב C.
    const isWheel = (p: Gamepad | null) =>
      !!p && /g920|logitech|racing wheel/i.test(p.id);

    const wheelPad = allPads.find(isWheel) || null;
    const stickPads = allPads.filter(p => p && !isWheel(p));

    const gpLeft  = stickPads[0] || null;  // ג'ויסטיק שמאל (רק סטיקים אמיתיים)
    const gpRight = stickPads[1] || null;  // ג'ויסטיק ימין

    const axesLeft = gpLeft?.axes;
    const axesRight = gpRight?.axes;
    const btnsLeft = gpLeft?.buttons;
    const btnsRight = gpRight?.buttons;

    const deadzone = 0.07;
    const fineMultiplier = 0.40;

    // B3 עבר לשמש את מחזור ה-POV (ב-App.tsx). כאן הוא כבר לא מחליף מצב ניהוג.
    const b3Pressed = btnsRight?.[3]?.pressed || false;
    prevB3Ref.current = b3Pressed;
    // כפתור ריבוע (2) בשלט PS יחיד: החלפת כיוון ציר ה-Y של הצלב.
    // רק כשאין ג'ויסטיקים גדולים מחוברים. סופרים רק את רגע הלחיצה.
    const squarePressed = !axesRight && (gpLeft?.buttons?.[2]?.pressed || false);
    if (squarePressed && !prevSquareRef.current) {
      aimInvertYRef.current = !aimInvertYRef.current;
      console.log("Aim Y-axis inverted:", aimInvertYRef.current);
    }
    prevSquareRef.current = squarePressed;

    // כשתפריט הלייאאוט פתוח — B10-13 שייכים לדפדוף בתפריט, אז הרובוט מתעלם מהם לגמרי
    const layoutMenuOpen = useTelemetryStore.getState().layoutMenuOpen;

    // מצב א' בלבד: פאן מצלמה בכפתורים. כל טיפול הצלב של מצב ב' עבר לבלוק ההדק למטה.
    if (modeRef.current === 'A' && !layoutMenuOpen) {
      if (btnsRight?.[11]?.pressed) cameraYawRef.current -= CAM_PAN_RATE * delta;
      if (btnsRight?.[13]?.pressed) cameraYawRef.current += CAM_PAN_RATE * delta;
    }

    let mainLeft = 0;
    let mainRight = 0;

    if (modeRef.current === 'A') {
      // שני ג'ויסטיקים גדולים מחוברים: כל אחד שולט על זחל אחד (כמו קודם).
      // רק שלט PS אחד (DualSense) מזוהה: סטיק שמאלי = זחל שמאל, סטיק ימני = זחל ימין.
      if (axesRight) {
        mainLeft = -axesLeft[1];
        mainRight = -axesRight[1];
      } else if (axesLeft) {
        // שלט יחיד: שני הסטיקים על אותו pad. ציר 1 = סטיק שמאלי, ציר 3 = סטיק ימני.
        mainLeft = -(axesLeft[1] ?? 0);
        mainRight = -(axesLeft[3] ?? 0);
      }
      if (Math.abs(mainLeft) < deadzone) mainLeft = 0;
      if (Math.abs(mainRight) < deadzone) mainRight = 0;
    } else {
      // מצב ב': ניהוג גס דרך כפתורים 10/12 — מושתק כשתפריט הלייאאוט פתוח.
      if (axesRight && !layoutMenuOpen) {
        if (btnsLeft?.[10]?.pressed) mainLeft = 1;
        else if (btnsLeft?.[12]?.pressed) mainLeft = -1;
        if (btnsRight?.[10]?.pressed) mainRight = 1;
        else if (btnsRight?.[12]?.pressed) mainRight = -1;
      }
    }

    // ניהוג עדין דרך כפתורים B6 (קדימה) ו-B8 (אחורה) - פעיל בשני המצבים (א' וגם ב')
    let hatLeft = 0;
    let hatRight = 0;
    if (btnsLeft?.[6]?.pressed) hatLeft = 1 * fineMultiplier;
    else if (btnsLeft?.[8]?.pressed) hatLeft = -1 * fineMultiplier;

    if (btnsRight?.[6]?.pressed) hatRight = 1 * fineMultiplier;
    else if (btnsRight?.[8]?.pressed) hatRight = -1 * fineMultiplier;
    // ניהוג עדין במצב א' דרך שלט PS יחיד (רק כשאין ג'ויסטיקים גדולים מחוברים).
    // L2 (הדק שמאלי, כפתור 6) = זחל שמאל עדין קדימה, L1 (כפתור 4) = אחורה.
    // R2 (הדק ימני, כפתור 7)  = זחל ימין עדין קדימה,  R1 (כפתור 5) = אחורה.
    // כל לחיצה = עוצמה קבועה, בדיוק כמו הכפתורים העדינים של הג'ויסטיקים.
    if (modeRef.current === 'A' && !axesRight && gpLeft) {
      const b = gpLeft.buttons;
      if (b?.[6]?.pressed) hatLeft = 1 * fineMultiplier;
      else if (b?.[4]?.pressed) hatLeft = -1 * fineMultiplier;

      if (b?.[7]?.pressed) hatRight = 1 * fineMultiplier;
      else if (b?.[5]?.pressed) hatRight = -1 * fineMultiplier;
    }

    // ניהוג עדין במצב ב' דרך שלט PS יחיד (רק כשאין ג'ויסטיקים גדולים מחוברים).
    // זחל שמאל: חץ למעלה (12) עדין קדימה, חץ למטה (13) עדין אחורה.
    // זחל ימין:  משולש (3) עדין קדימה,   X (0) עדין אחורה.
    if (modeRef.current === 'B' && !axesRight && gpLeft) {
      const b = gpLeft.buttons;
      if (b?.[12]?.pressed) hatLeft = 1 * fineMultiplier;
      else if (b?.[13]?.pressed) hatLeft = -1 * fineMultiplier;

      if (b?.[3]?.pressed) hatRight = 1 * fineMultiplier;
      else if (b?.[0]?.pressed) hatRight = -1 * fineMultiplier;
    }

    let leftTargetInput = mainLeft + hatLeft;
    let rightTargetInput = mainRight + hatRight;

    // ההדק פועל אך ורק במצב ב'. במצב א' הוא מנוטרל לגמרי.
    const singleTrigger = !axesRight && (gpLeft?.buttons?.[7]?.pressed || false);
    const triggerPressed = modeRef.current === 'B' && ((btnsRight?.[0]?.pressed || false) || singleTrigger);

    if (modeRef.current === 'B') {
      // שני ג'ויסטיקים: הסטיק הימני. שלט PS יחיד: הסטיק הימני = צירים 2 ו-3.
      const rightX = axesRight ? axesRight[0] : (axesLeft?.[2] ?? 0);
      const rightY = axesRight ? axesRight[1] : (axesLeft?.[3] ?? 0);
      const stickX = Math.abs(rightX) > deadzone ? rightX : 0;
      // אם ההיפוך פעיל (כפתור ריבוע), הופכים את סימן הציר האנכי של הצלב.
      const stickY = (Math.abs(rightY) > deadzone ? rightY : 0) * (aimInvertYRef.current ? -1 : 1);
      const touchingStick = stickX !== 0 || stickY !== 0;

      if (triggerPressed) {
        // בזמן מעקב מנטרלים את הכפתורים העדינים, אחרת הם חותכים 55% מהסיבוב.
        hatLeft = 0;
        hatRight = 0;

        const _rot = bodyRef.current.rotation();
        const robotYaw = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion(_rot.x, _rot.y, _rot.z, _rot.w), 'YXZ'
        ).y;

        // רגע הלחיצה: הצלב (כבר ברדיאנים) הופך ליעד מוחלט בעולם.
        if (!aimLockedRef.current) {
          aimTargetYawRef.current = robotYaw + cameraYawRef.current;
          aimLockedRef.current = true;
        }

        // הסטיק ממשיך להזיז את היעד עצמו, באותו קצב כמו בלי ההדק.
        aimTargetYawRef.current -= stickX * AIM_RATE * delta;

        let err = aimTargetYawRef.current - robotYaw;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;

        // הגנה מפני קפיצת מיקום (מקש E/R תוך כדי לחיצה): נועלים יעד חדש סביר.
        if (Math.abs(err) > AIM_RELOCK_ERR) {
          err = Math.max(-AIM_MAX_YAW, Math.min(AIM_MAX_YAW, err));
          aimTargetYawRef.current = robotYaw + err;
        }

        // אזור מת סביב היישור: כשהרובוט מספיק קרוב לכיוון היעד — מפסיקים לפנות
        // ומיישרים לגמרי את היעד לכיוון הרובוט. כך הגלגלים מתיישרים והצלב מתלכד
        // נקי במרכז, בלי רדיפה אינסופית אחרי דיוק מושלם.
        const YAW_SNAP = 0.01;  // rad (~1.7°) — מתחת לזה נחשב "מיושר לגמרי"
        if (Math.abs(err) < YAW_SNAP) {
          aimTargetYawRef.current = robotYaw;  // מיישר את היעד בדיוק לכיוון הנוכחי
          err = 0;
        }

        // הצלב יושב על היעד המוחלט בעולם (aimTargetYawRef), ולא על err חסום.
        // כך צלב-המרכז (robotYaw) מתלכד עם הצלב המעוגל כשהרובוט מיושר — בלי מרדף.
        // cameraYawRef כאן משמש רק לחישוב מיקום הצלב, ולכן שם אותו על ההפרש המלא (לא חסום).
        cameraYawRef.current = err;

        // נהיגה: יחס פנייה/קדימה נשמר במקום להיחתך אסימטרית.
        const steer = Math.max(-1, Math.min(1, err * STEER_GAIN));
        const drive = DRIVE_SPEED * (1 - TURN_SLOWDOWN * Math.abs(steer));
        let L = drive - steer;
        let R = drive + steer;
        const norm = Math.max(1, Math.abs(L), Math.abs(R));
        leftTargetInput = L / norm;
        rightTargetInput = R / norm;

        // הציר האנכי: הסטיק מזיז (כיוון הפוך).
        cameraPitchRef.current += stickY * AIM_RATE * delta;   // הפוך: קדימה=למטה, אחורה=למעלה

        // הגובה זוחל למרכז רק אחרי שהרובוט כמעט מיושר אופקית (err קטן).
        // כל עוד הרובוט עוד מסתובב אל היעד — הגובה נשאר במקום ומחכה.
        const ALIGN_THRESHOLD = 0.05;  // rad (~7°) — מתחת לזה נחשב "מיושר", מתחיל זחילה
        if (Math.abs(err) < ALIGN_THRESHOLD) {
          // ככל שה-err קטן יותר, הזחילה מלאה יותר (0 בסף, 1 כשמיושר לגמרי)
          const alignFactor = 1 - (Math.abs(err) / ALIGN_THRESHOLD);
          const pitchDecay = (1 - Math.exp(-delta / AIM_IDLE_TAU)) * alignFactor;
          cameraPitchRef.current -= cameraPitchRef.current * pitchDecay;
        }
        cameraPitchRef.current = Math.max(-AIM_MAX_PITCH, Math.min(AIM_MAX_PITCH, cameraPitchRef.current));

        aimIdleTimeRef.current = 0;
      } else {
        aimLockedRef.current = false;

        // הצלב הוא פקד מיקום: הסטיק מזיז אותו, והוא נשאר איפה שהושאר.
        cameraYawRef.current   -= stickX * AIM_RATE * delta;
        cameraPitchRef.current += stickY * AIM_RATE * delta;   // הפוך: קדימה=למטה, אחורה=למעלה
        cameraYawRef.current   = Math.max(-AIM_MAX_YAW,   Math.min(AIM_MAX_YAW,   cameraYawRef.current));
        cameraPitchRef.current = Math.max(-AIM_MAX_PITCH, Math.min(AIM_MAX_PITCH, cameraPitchRef.current));

        if (touchingStick) {
          aimIdleTimeRef.current = 0;
        } else {
          aimIdleTimeRef.current += delta;
          if (aimIdleTimeRef.current > AIM_IDLE_DELAY) {
            const decay = 1 - Math.exp(-delta / AIM_IDLE_TAU);
            cameraYawRef.current   -= cameraYawRef.current * decay;
            cameraPitchRef.current -= cameraPitchRef.current * decay;
          }
        }
      }
    } else {
      aimLockedRef.current = false;
    }

    // ===== מצב ג': הגה + דוושות =====
    if (modeRef.current === 'C') {
      const wAxes = wheelPad?.axes;
      const wBtns = wheelPad?.buttons;

      const wheelRaw   = wAxes?.[WHEEL_AXIS]   ?? 0;
      const gasRaw     = wAxes?.[GAS_AXIS]     ?? 1;
      const reverseRaw = wAxes?.[REVERSE_AXIS] ?? 1;

      let wheel = normWheel(wheelRaw);
      if (WHEEL_INVERT) wheel = -wheel;

      // גז מהדוושה (0..1) או מכפתור B בהגה (בינארי מלא) — הגדול מביניהם
      const gasPedal = normPedal(gasRaw, GAS_PRESSED);
      const gasBtn   = wBtns?.[GAS_BTN]?.pressed ? 1 : 0;
      const gas      = Math.max(gasPedal, gasBtn);

      // רוורס מהדוושה (0..1) או מכפתור A בהגה (בינארי מלא) — הגדול מביניהם
      const revPedal = normPedal(reverseRaw, REVERSE_PRESSED);
      const revBtn   = wBtns?.[REVERSE_BTN]?.pressed ? 1 : 0;
      const reverse  = Math.max(revPedal, revBtn);

      // גז ורוורס מתקזזים
      const drive = gas - reverse;              // -1..1
      const steer = wheel * STEER_STRENGTH;

      let L = drive + steer;
      let R = drive - steer;
      const norm = Math.max(1, Math.abs(L), Math.abs(R));
      leftTargetInput  = L / norm;
      rightTargetInput = R / norm;
    }

    if (leftTargetInput === 0 && rightTargetInput === 0) {
      if (keys.current['KeyA']) leftTargetInput = 1;
      else if (keys.current['KeyZ']) leftTargetInput = -1;
      if (keys.current['KeyD']) rightTargetInput = 1;
      else if (keys.current['KeyC']) rightTargetInput = -1;
    }

    leftTargetInput = Math.max(-1, Math.min(1, leftTargetInput));
    rightTargetInput = Math.max(-1, Math.min(1, rightTargetInput));

    const isShift = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const slowMultiplier = 0.35;

    let leftTarget = leftTargetInput * maxSpeed * (isShift ? slowMultiplier : 1.0);
    let rightTarget = rightTargetInput * maxSpeed * (isShift ? slowMultiplier : 1.0);

    // חזרה לשטיח האחרון (מקש E)
    if (keys.current['KeyE']) {
      // סופרים לחיצה רק ברגע המעבר מ"לא לחוץ" ל"לחוץ" (לא בכל פריים שהמקש מוחזק)
      if (!prevEKeyRef.current) {
        useTelemetryStore.getState().recordEPress();
      }
      prevEKeyRef.current = true;
      const checkpoint = useTelemetryStore.getState().lastCheckpoint;
      // אם יש צ'קפוינט שמור - נחזור אליו. אם לא (עדיין לא נגענו בשום שטיח) - נחזור לנקודת הזינוק
      const targetPos = checkpoint ? checkpoint.pos : { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };
      const targetRot = checkpoint ? checkpoint.rot : { x: 0, y: 0, z: 0, w: 1 };

      bodyRef.current.setTranslation(targetPos, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setRotation(targetRot, true);
      
      trackSpeedL.current = 0; 
      trackSpeedR.current = 0; 
      isFlippedRef.current = false;
      cameraYawRef.current = 0;
      cameraPitchRef.current = 0;
      aimLockedRef.current = false;
      return;
    } else {
      // שוחרר מקש E — מוכנים לספור את הלחיצה הבאה
      prevEKeyRef.current = false;
    }

    if (keys.current['KeyR']) {
      bodyRef.current.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      trackSpeedL.current = 0; trackSpeedR.current = 0; isFlippedRef.current = false;
      cameraYawRef.current = 0;
      cameraPitchRef.current = 0;
      aimLockedRef.current = false;
      return;
    }
    if (keys.current['Digit6']) {
      bodyRef.current.setTranslation({ x: 0, y: 1.5, z: -50 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      trackSpeedL.current = 0; trackSpeedR.current = 0; isFlippedRef.current = false;
      return;
    }
    if (keys.current['Digit5']) {
      bodyRef.current.setTranslation({ x: 0, y: 1.5, z: -121 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      trackSpeedL.current = 0; trackSpeedR.current = 0; isFlippedRef.current = false;
      return;
    }

    const updateTrackSpeed = (current: number, target: number) => {
      const step = (Math.abs(target) > 0.01 && (Math.sign(target) === Math.sign(current) || current === 0))
        ? accel * delta : decel * delta;
      if (current < target) return Math.min(current + step, target);
      if (current > target) return Math.max(current - step, target);
      return target;
    };

    trackSpeedL.current = updateTrackSpeed(trackSpeedL.current, leftTarget);
    trackSpeedR.current = updateTrackSpeed(trackSpeedR.current, rightTarget);

    physicalSpeeds.left = trackSpeedL.current;
    physicalSpeeds.right = trackSpeedR.current;

    const rotation = bodyRef.current.rotation();
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const rightVec = new THREE.Vector3(-1, 0, 0).applyQuaternion(quat);

    let pitch = Math.asin(Math.max(-1, Math.min(1, forwardVec.y))) * THREE.MathUtils.RAD2DEG;
    let roll = Math.asin(Math.max(-1, Math.min(1, rightVec.y))) * THREE.MathUtils.RAD2DEG;

    if (!isFlippedRef.current && (Math.abs(pitch) > 30 || Math.abs(roll) > 30)) {
      isFlippedRef.current = true;
    }

    if (isFlippedRef.current) {
      trackSpeedL.current = 0;
      trackSpeedR.current = 0;
    } else {
      const curVel = bodyRef.current.linvel();
      const curAng = bodyRef.current.angvel();
      const avgSpeed = (trackSpeedL.current + trackSpeedR.current) / 2;

      // האם הסיבוב נוצר מהכפתורים העדינים? (לחיצה על כפתור אחד = שני הצדדים אינם זהים)
      const fineTurning = (hatLeft !== 0 || hatRight !== 0) && (hatLeft !== hatRight);
      // עד כמה לרכך את הסיבוב העדין. מספר קטן יותר = סיבוב עדין ואיטי יותר.
      const fineTurnDamp = fineTurning ? 0.45 : 1.0;

      const angularVelY = (((trackSpeedR.current - trackSpeedL.current) / trackWidth) / 1.6) * fineTurnDamp;

      if (USE_IMPULSE_DRIVE) {
        // --- מצב Impulse (כבד) - כבוי כרגע ---
        const m = bodyRef.current.mass();
        const targetWorldVelocity = new THREE.Vector3(0, 0, -avgSpeed).applyQuaternion(quat);
        if (CANCEL_LATERAL_DRIFT) {
          const currentVelocityVec = new THREE.Vector3(curVel.x, curVel.y, curVel.z);
          const lateralVelocity = currentVelocityVec.dot(rightVec);
          const antiDriftImpulse = rightVec.clone().multiplyScalar(-lateralVelocity * m * 0.8);
          bodyRef.current.applyImpulse(antiDriftImpulse, true);
        }
        const dvx = targetWorldVelocity.x - curVel.x;
        const dvz = targetWorldVelocity.z - curVel.z;
        const kLinear = 0.6;
        bodyRef.current.applyImpulse({ x: dvx * m * kLinear, y: 0, z: dvz * m * kLinear }, true);
      } else {
        // --- המצב המקורי שלך (פעיל כרגע) ---
        const worldVelocity = new THREE.Vector3(0, 0, -avgSpeed).applyQuaternion(quat);
        bodyRef.current.setLinvel({ x: worldVelocity.x, y: curVel.y, z: worldVelocity.z }, true);
      }

      bodyRef.current.setAngvel({
        x: ALLOW_PITCH_SWAY ? curAng.x : 0,
        y: angularVelY,
        z: ALLOW_PITCH_SWAY ? curAng.z : 0
      }, true);
    }

    // הצלב מתעדכן בכל פריים כדי שלא ידלג.
    useTelemetryStore.getState().setCameraYaw(cameraYawRef.current);
    useTelemetryStore.getState().setCameraPitch(cameraPitchRef.current);

    lastTimeRef.current += delta;
    if (lastTimeRef.current > 0.1) {
      lastTimeRef.current = 0;
      setTelemetry(Math.round(pitch), Math.round(roll), isFlippedRef.current);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[SPAWN.x, 1, SPAWN.z]}
      enabledRotations={[true, true, true]}
      mass={28}
      gravityScale={2.5}
      friction={1.5}
      linearDamping={1.0}
      angularDamping={4.5}
    >
      <CapsuleCollider args={[0.25, 0.2]} position={[-0.35, 0, 0]} rotation={[Math.PI / 2, 0, 0]} friction={0.5} />
      <CapsuleCollider args={[0.25, 0.2]} position={[0.35, 0, 0]} rotation={[Math.PI / 2, 0, 0]} friction={0.5} />
      <CuboidCollider args={[0.25, 0.1, 0.4]} position={[0, 0.1, 0]} />
      {!hideVisuals && <RobotVisuals sync={false} />}
    </RigidBody>
  );
}

/**
 * A single metallic tread plate (link)
 */
function TreadLink({ position, rotation, scale = 1 }: { position: [number, number, number], rotation: [number, number, number], scale?: number }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Main Plate */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.04, 0.12]} />
        <meshStandardMaterial color="#333" metalness={0.8} roughness={0.4} />
      </mesh>
      {/* Outer detail / treads */}
      <mesh castShadow receiveShadow position={[0, 0.025, 0]}>
        <boxGeometry args={[0.25, 0.02, 0.06]} />
        <meshStandardMaterial color="#222" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Hinges / Pins */}
      <mesh castShadow receiveShadow position={[0, -0.01, 0.06]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.32, 8]} />
        <meshStandardMaterial color="#111" metalness={1} />
      </mesh>
    </group>
  );
}

/**
 * Articulated Tank Track Component
 */
function ArticulatedTrack({ side }: { side: 'left' | 'right' }) {
  const trackOffset = useRef(0);
  const linksRef = useRef<THREE.Group>(null);

  const numLinks = 28;
  const wheelRadius = 0.2;
  const wheelSpacing = 0.9; // center to center
  const straightLength = wheelSpacing;
  const curveLength = Math.PI * wheelRadius;
  const totalLength = 2 * straightLength + 2 * curveLength;
  const linkInterval = totalLength / numLinks;

  useFrame((state, delta) => {
    if (!linksRef.current) return;

    // קריאה ישירה של המהירות בכל פריים מבלי לגרום לרינדור כבד של React
    const currentSpeed = side === 'left' ? physicalSpeeds.left : physicalSpeeds.right;
    
    // Apply visual rotation based on physical speed
    const step = -currentSpeed * 1.5 * delta;
    trackOffset.current += step;

    // Calculate a clank factor for audio-visual synchronization (visual only here)
    const linkProgress = (trackOffset.current / linkInterval) % 1.0;
    const clankJitter = Math.sin(linkProgress * Math.PI) * 0.005;

    // Update link positions
    linksRef.current.children.forEach((child, i) => {
      let d = (i * linkInterval + trackOffset.current) % totalLength;
      if (d < 0) d += totalLength;

      let x = 0, y = 0, z = 0, rotX = 0;

      // Path logic
      if (d < straightLength) {
        // Top straight
        z = -wheelSpacing / 2 + d;
        y = wheelRadius;
        rotX = 0;
        // Mechanical slack and clank jitter
        const dip = Math.sin((d / straightLength) * Math.PI) * 0.025;
        y -= dip + clankJitter;
      } else if (d < straightLength + curveLength) {
        // Front curve (rounding the sprocket)
        const curveProgress = (d - straightLength) / curveLength;
        const angle = curveProgress * Math.PI;
        
        // Add a "staccato" hexagonal rounding effect to the sprocket
        // Real sprockets have teeth, causing the path to be slightly polygonal
        const sprocketTeeth = 8;
        const polyRadius = wheelRadius * (1 + Math.cos(angle * sprocketTeeth) * 0.02);
        
        z = wheelSpacing / 2 + Math.sin(angle) * polyRadius;
        y = Math.cos(angle) * polyRadius;
        rotX = angle;
      } else if (d < 2 * straightLength + curveLength) {
        // Bottom straight (contact with ground)
        const d2 = d - (straightLength + curveLength);
        z = wheelSpacing / 2 - d2;
        y = -wheelRadius;
        rotX = Math.PI;
      } else {
        // Back curve
        const curveProgress = (d - (2 * straightLength + curveLength)) / curveLength;
        const angle = curveProgress * Math.PI + Math.PI;
        
        const sprocketTeeth = 8;
        const polyRadius = wheelRadius * (1 + Math.cos(angle * sprocketTeeth) * 0.02);

        z = -wheelSpacing / 2 + Math.sin(angle) * polyRadius;
        y = Math.cos(angle) * polyRadius;
        rotX = angle;
      }

      child.position.set(x, y, z);
      child.rotation.x = rotX;
    });
  });

  const links = useMemo(() => {
    return Array.from({ length: numLinks }).map((_, i) => (
      <TreadLink key={i} position={[0, 0, 0]} rotation={[0, 0, 0]} />
    ));
  }, []);

  return (
    <group>
      <group ref={linksRef}>
        {links}
      </group>
      {/* Inner Wheels / Sprockets */}
      <mesh position={[0, 0, 0.45]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.25, 12]} />
        <meshStandardMaterial color="#222" metalness={1} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.45]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.25, 12]} />
        <meshStandardMaterial color="#222" metalness={1} roughness={0.5} />
      </mesh>
      {/* Static side plate */}
      <mesh position={[side === 'left' ? 0.12 : -0.12, 0, 0]}>
        <boxGeometry args={[0.02, 0.3, 1.1]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

/**
 * Robot Visual Mesh & POV Component
 */
export function RobotVisuals({ mode, sync = false, showPredictive = false, yieldToDrone = false, hideCameras = false }: { mode?: ViewMode, sync?: boolean, showPredictive?: boolean, yieldToDrone?: boolean, hideCameras?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const robotBodyRef = useTelemetryStore(s => s.robotBodyRef);
  const viewMode = useTelemetryStore(s => s.viewMode);
  const steerMode = useTelemetryStore(s => s.steerMode);
  const droneView = useTelemetryStore(s => s.droneView);
  
  const activeMode = mode || (viewMode === ViewMode.SPLIT ? ViewMode.POV3 : viewMode);


  // עצמי עזר (כדי לא להקצות זיכרון בכל פריים)
  const _robotQuat = useMemo(() => new THREE.Quaternion(), []);
  const _robotPos = useMemo(() => new THREE.Vector3(), []);
  const _euler = useMemo(() => new THREE.Euler(), []);
  const _yawQuat = useMemo(() => new THREE.Quaternion(), []);
  const targetOffset = useMemo(() => new THREE.Vector3(), []);
  const easedOffset = useMemo(() => new THREE.Vector3(0, 1.3, 1.7), []); // ברירת מחדל POV2
  const localQuatTarget = useMemo(() => new THREE.Quaternion(), []);
  const easedLocalQuat = useMemo(() => new THREE.Quaternion(), []);
  const camPosTarget = useMemo(() => new THREE.Vector3(), []);
  const camQuatTarget = useMemo(() => new THREE.Quaternion(), []);
  const _aimPoint = useMemo(() => new THREE.Vector3(), []);
  const _aimNdc = useMemo(() => new THREE.Vector3(), []);
  const _camFwd = useMemo(() => new THREE.Vector3(), []);
  const _camToAim = useMemo(() => new THREE.Vector3(), []);
  const smoothYaw = useRef(0);
  const camInit = useRef(false);

  // כמה זמן (שניות, בקירוב) למצלמת המרדף ב-POV3 להתיישב מאחורי הרובוט. גדול יותר = רך/איטי יותר.
  const POV3_YAW_LAG = 0.2;
  // נטיית המצלמה כלפי מטה ב-POV3. roll תמיד 0 ו-pitch קבוע => האופק תמיד ישר.
  const POV3_PITCH = -0.3;

  useFrame((state, delta) => {
    const cam = cameraRef.current;

    // סנכרון הגוף הויזואלי של הרובוט – נשאר עם הסיבוב המלא => נראה מוטה בשיפוע
    if (sync && robotBodyRef.current && groupRef.current) {
      const p = robotBodyRef.current.translation();
      const q = robotBodyRef.current.rotation();
      groupRef.current.position.set(p.x, p.y, p.z);
      groupRef.current.quaternion.set(q.x, q.y, q.z, q.w);
    }

    // נתיב המצלמה פעיל רק בתצוגת View מסונכרנת
    if (!cam || !sync || !robotBodyRef.current) return;

    const p = robotBodyRef.current.translation();
    const q = robotBodyRef.current.rotation();
    _robotQuat.set(q.x, q.y, q.z, q.w);
    _robotPos.set(p.x, p.y, p.z);

    // ===== מצלמת מבט-על (Overhead) עבור חלונית ה-PiP =====
    // המצלמה יושבת ישר מעל הרובוט ומביטה ישר מטה. כיוון הנסיעה של
    // הרובוט תמיד "כלפי מעלה" במסך, כמו מצלמת חנייה עילית.
    if (activeMode === ViewMode.OVERHEAD) {
      const overheadHeight = 2; // גובה המצלמה מעל הרובוט (מטרים). גדול יותר = רואים שטח רחב יותר
      _euler.setFromQuaternion(_robotQuat, 'YXZ');
      const overheadYaw = _euler.y;
      cam.position.set(_robotPos.x, _robotPos.y + overheadHeight, _robotPos.z);
      cam.up.set(-Math.sin(overheadYaw), 0, -Math.cos(overheadYaw));
      cam.lookAt(_robotPos.x, _robotPos.y, _robotPos.z);
      cam.fov = 60;
      cam.updateProjectionMatrix();
      return;
    }
        // ===== מצלמת מפה (Map) — קבועה, גבוהה, מכסה את כל השטח =====
    // לא עוקבת אחרי אף אחד. הרובוט והרחפן נעים בתוך התמונה.
    if (activeMode === ViewMode.MAP) {
      const MAP_CENTER_X = 0;
      const MAP_CENTER_Z = -75;   // מרכז השטח: מ-z=+7 (זינוק) עד z=-160 (בניין)
      const MAP_HEIGHT = 160;     // גובה המצלמה — גדול יותר = רואים שטח רחב יותר

      cam.position.set(MAP_CENTER_X, MAP_HEIGHT, MAP_CENTER_Z);
      cam.up.set(0, 0, -1);       // "צפון" (z שלילי) כלפי מעלה במסך
      cam.lookAt(MAP_CENTER_X, 0, MAP_CENTER_Z);
      cam.fov = 60;
      cam.updateProjectionMatrix();
      return;
    }

    // יעדים לפי מצב
    let targetFov = 72;
    // הגדרות POV4 נקראות מה-store בכל פריים => שליטה חיה בסליידרים
    const pov4 = useTelemetryStore.getState().pov4;
    if (activeMode === ViewMode.POV1) {
      targetOffset.set(0, 0.65, -0.01);
      targetFov = 80;
    } else if (activeMode === ViewMode.POV2) {
      targetOffset.set(0, 1.3, 1.7);
    } else if (activeMode === ViewMode.POV4) {
      // צירי-המשתמש -> צירי-הרובוט: Z קדימה(+) = -Z מקומי => שלילה
      targetOffset.set(pov4.posX, pov4.posY, -pov4.posZ);
    } else { // POV3
      targetOffset.set(0, 2.3, 3.5);
    }

    // ריכוך מעבר בין מצבים (offset + fov)
    const k = 1;
    easedOffset.lerp(targetOffset, k);
    cam.fov += (targetFov - cam.fov) * k;
    cam.updateProjectionMatrix();

    if (activeMode === ViewMode.POV3) {
      // ===== מצלמה מעוגנת לעולם: אופק ישר תמיד, הרובוט מוטה =====
      _euler.setFromQuaternion(_robotQuat, 'YXZ');
      const robotYaw = _euler.y; // כיוון הנסיעה בלבד (בלי pitch/roll)

      // השהיית מרדף: ה-yaw של המצלמה מדביק את הרובוט בהדרגה => רואים אותו רגע מהצד בפנייה
      if (!camInit.current) {
        smoothYaw.current = robotYaw;
      } else {
        let d = robotYaw - smoothYaw.current;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        smoothYaw.current += d * (1 - Math.exp(-delta / POV3_YAW_LAG));
      }

      // מיקום: מאחורי הרובוט לפי ה-yaw המוחלק (מרחק מיידי, כיוון מושהה)
      _yawQuat.setFromEuler(_euler.set(0, smoothYaw.current, 0, 'YXZ'));
      camPosTarget.copy(easedOffset).applyQuaternion(_yawQuat).add(_robotPos);
      // כיוון: yaw מוחלק, pitch קבוע, roll=0 => אופק ישר
      camQuatTarget.setFromEuler(_euler.set(POV3_PITCH, smoothYaw.current, 0, 'YXZ'));
    } else if (activeMode === ViewMode.POV4) {
      // ===== POV4: מצלמה מותאמת אישית, מחוברת לרובוט במרחב מקומי =====
      localQuatTarget.setFromEuler(_euler.set(
        THREE.MathUtils.degToRad(pov4.pitch),
        THREE.MathUtils.degToRad(pov4.yaw),
        THREE.MathUtils.degToRad(pov4.roll),
        'YXZ'
      ));
      easedLocalQuat.slerp(localQuatTarget, k);
      // יורשת את הסיבוב המלא של הרובוט => "נשארת מעל כתף שמאל" גם בשיפוע
      camPosTarget.copy(easedOffset).applyQuaternion(_robotQuat).add(_robotPos);
      camQuatTarget.copy(_robotQuat).multiply(easedLocalQuat);
    } else {
      // ===== POV1/POV2: מצלמה מחוברת לרובוט (התנהגות מקורית) =====
      const pitch = activeMode === ViewMode.POV2 ? -0.2 : 0;
      // במצב ב' המצלמה ננעלת לכיוון הרובוט (צלב הקווים תמיד במרכז); הפאן הידני נשמר רק למצב א'
      const camYaw = steerMode === 'B' ? 0 : cameraYawRef.current;
      localQuatTarget.setFromEuler(_euler.set(pitch, camYaw, 0, 'YXZ'));
      easedLocalQuat.slerp(localQuatTarget, k);

      camPosTarget.copy(easedOffset).applyQuaternion(_robotQuat).add(_robotPos);
      camQuatTarget.copy(_robotQuat).multiply(easedLocalQuat);
    }

    // החלה: snap בפריים הראשון, אחרת מיקום מיידי + ריכוך קל בכיוון למעברי מצב
    cam.position.copy(camPosTarget);
    if (!camInit.current) {
      cam.quaternion.copy(camQuatTarget);
      camInit.current = true;
    } else {
      cam.quaternion.slerp(camQuatTarget, 12 * delta);
    }

    // ===== מיקום הצלב המעוגל: היטל אמיתי של נקודת היעד דרך המצלמה הפעילה =====
    // עובד נכון בכל ה-POV, כולל POV3 עם ההשהיה וההטיה של המצלמה.
    if (steerMode !== 'B') {
      useTelemetryStore.getState().setAimScreen(0, 0, false);
      return;
    }

    // הכיוון שאליו הצלב מצביע, בקואורדינטות העולם
    _euler.setFromQuaternion(_robotQuat, 'YXZ');
    const worldAimYaw = _euler.y + cameraYawRef.current;

    // נקודת היעד יוצאת מ*מיקום המצלמה*, בכיוון האופקי של היעד.
    // הגובה נלקח מקו הראייה של המצלמה עצמה, ולכן כשהזווית 0 -
    // הנקודה נופלת בדיוק במרכז המסך, בכל POV.
    cam.updateMatrixWorld();
    _camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);

    // כמה המצלמה מוטה כלפי מטה (רדיאנים). ההיטל האופקי מנורמל.
    const camHorizLen = Math.hypot(_camFwd.x, _camFwd.z);
    const camPitchRad = Math.atan2(_camFwd.y, camHorizLen);

    // הצלב עולה/יורד סביב קו הראייה של המצלמה, לא סביב האופק.
    const aimPitchRad = camPitchRad + cameraPitchRef.current;

    _aimPoint.set(
      cam.position.x - Math.sin(worldAimYaw) * Math.cos(aimPitchRad) * AIM_LOOKAHEAD,
      cam.position.y + Math.sin(aimPitchRad) * AIM_LOOKAHEAD + AIM_HEIGHT,
      cam.position.z - Math.cos(worldAimYaw) * Math.cos(aimPitchRad) * AIM_LOOKAHEAD
    );

    // אם היעד מאחורי המצלמה - לא מציירים
    _camToAim.copy(_aimPoint).sub(cam.position);
    if (_camToAim.dot(_camFwd) <= 0.1) {
      useTelemetryStore.getState().setAimScreen(0, 0, false);
      return;
    }

    // היטל לפיקסלים ביחס למרכז המסך
    _aimNdc.copy(_aimPoint).project(cam);
    const halfW = state.size.width / 2;
    const halfH = state.size.height / 2;
    const maxX = halfW - 40;
    const maxY = halfH - 40;
    const px = Math.max(-maxX, Math.min(maxX, _aimNdc.x * halfW));
    const py = Math.max(-maxY, Math.min(maxY, -_aimNdc.y * halfH));

    useTelemetryStore.getState().setAimScreen(px, py, true);
  });

  return (
    <>
    {/* המצלמה מחוץ לקבוצת הרובוט: כך היא לא יורשת את ה-pitch/roll שלו (קריטי ל-POV3) */}
    <PerspectiveCamera ref={cameraRef} makeDefault={hideCameras ? false : (yieldToDrone ? !droneView : true)} fov={70} near={0.1} far={1000} />
    <group ref={groupRef} visible={activeMode !== ViewMode.MAP}>
      {/* Main Base Body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.2, 1.1]} />
        <meshStandardMaterial color="#5c5a5a" roughness={0.7} metalness={0.3} />
      </mesh>
      
      {/* Articulated Tracks */}
      {/* Physical Left Track (at -X) linked to trackSpeedL (D/C keys) */}
      <group position={[-0.35, 0, 0]}>
        <ArticulatedTrack side="left" />
      </group>

      {/* Physical Right Track (at +X) linked to trackSpeedR (A/Z keys) */}
      <group position={[0.35, 0, 0]}>
        <ArticulatedTrack side="right" />
      </group>

      {/* Robotic Arm */}
      <group position={[0, 0.2, 0.2]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.2]} />
          <meshStandardMaterial color="#666" metalness={0.8} />
        </mesh>
        <group position={[0, 0.1, 0]} rotation={[-0.6, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
             <boxGeometry args={[0.1, 0.4, 0.12]} />
             <meshStandardMaterial color="#306b4b" roughness={0.6} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.4, 0]} rotation={[0, 0, Math.PI/2]}>
             <cylinderGeometry args={[0.1, 0.1, 0.2]} />
             <meshStandardMaterial color="#444" />
          </mesh>
          <group position={[0, 0.4, 0]} rotation={[1.2, 0, 0]}>
             <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
               <boxGeometry args={[0.08, 0.3, 0.08]} />
               <meshStandardMaterial color="#306b4b" roughness={0.6} />
             </mesh>
             <mesh castShadow receiveShadow position={[0, 0.3, 0]} rotation={[0, 0, Math.PI/2]}>
               <cylinderGeometry args={[0.08, 0.08, 0.15]} />
               <meshStandardMaterial color="#444" />
             </mesh>
             <mesh castShadow receiveShadow position={[0, 0.35, -0.1]}>
               <boxGeometry args={[0.2, 0.05, 0.2]} />
               <meshStandardMaterial color="#555" />
             </mesh>
             <mesh castShadow receiveShadow position={[-0.08, 0.45, -0.1]}>
               <boxGeometry args={[0.04, 0.2, 0.08]} />
               <meshStandardMaterial color="#7a958b" />
             </mesh>
             <mesh castShadow receiveShadow position={[0.08, 0.45, -0.1]}>
               <boxGeometry args={[0.04, 0.2, 0.08]} />
               <meshStandardMaterial color="#7a958b" />
             </mesh>
          </group>
        </group>
      </group>
    </group>
    <PredictiveTracks visible={showPredictive} />
    </>
  );
}

function PredictiveTracks({ visible }: { visible?: boolean }) {
  const MAX_RUNGS = 30;
  const groupRef = useRef<THREE.Group>(null);
  const rungsRef = useRef<THREE.InstancedMesh>(null);
  const viewMode = useTelemetryStore(s => s.viewMode);
  const robotBodyRef = useTelemetryStore(s => s.robotBodyRef);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // צבעים קבועים: תכלת למסלול פנוי ואדום להתראה על חסימה
  const colorCyan = useMemo(() => new THREE.Color("#02c5cf"), []);
  const colorRed = useMemo(() => new THREE.Color("#ff3b30"), []);

  const smoothK = useRef(0);
  const moveTime = useRef(0);
  const turnTime = useRef(0);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _e = useMemo(() => new THREE.Euler(), []);

  const _normal = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _rayDir = useMemo(() => { return { x: 0, y: -1, z: 0 }; }, []);

  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _worldQuat = useMemo(() => new THREE.Quaternion(), []);
  const _parentWorldQuat = useMemo(() => new THREE.Quaternion(), []);

  const _worldForward = useMemo(() => new THREE.Vector3(), []);
  const _rungRight = useMemo(() => new THREE.Vector3(), []);
  const _rungForward = useMemo(() => new THREE.Vector3(), []);
  const _rungBackward = useMemo(() => new THREE.Vector3(), []);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);

  const trackWidth = 0.8;
  const gap = 0.15;
  const startOffsetFwd = 0.9;
  const startOffsetRev = 0.5;
  const GROUND_LIFT = 0.04;

  useFrame((_, delta) => {
    if (!rungsRef.current || !groupRef.current) return;

    if (!visible) {
      rungsRef.current.count = 0;
      return;
    }

    const { rapier, world } = physicsEnv;
    if (!rapier || !world) return;

    const body = robotBodyRef.current;
    let robotX = 0, robotY = 0, robotZ = 0, robotYaw = 0;
    if (body) {
      const p = body.translation();
      const r = body.rotation();
      robotX = p.x; robotY = p.y; robotZ = p.z;
      _q.set(r.x, r.y, r.z, r.w);
      _e.setFromQuaternion(_q, 'YXZ');
      robotYaw = _e.y;
    }
    const cosY = Math.cos(robotYaw);
    const sinY = Math.sin(robotYaw);

    const vl = physicalSpeeds.left;
    const vr = physicalSpeeds.right;
    const v = (vr + vl) / 2;
    let w = (vr - vl) / trackWidth;

    if (Math.abs(w) < 0.05) w = 0;

    const speed = Math.abs(v);
    const isStopped = speed < 0.02;
    const isReverse = v < -0.02;

    if (isStopped) moveTime.current = 0;
    else moveTime.current += delta;

    let targetK = 0;
    if (!isStopped) {
      const denom = Math.sign(v) * Math.max(speed, 0.15);
      targetK = w / denom;
    }
    targetK = THREE.MathUtils.clamp(targetK, -1.2, 1.2);

    const RESPONSE_DELAY = 0.2;
    const RESPONSE_FADE = 0.15;
    const latencyGate = THREE.MathUtils.clamp((moveTime.current - RESPONSE_DELAY) / RESPONSE_FADE, 0, 1);
    const speedConfidence = THREE.MathUtils.clamp((speed - 0.1) / 0.2, 0, 1);

    // חביון לפנייה: כשמתחילים פנייה חדשה, הקו לא מתעקל מיד אלא נכנס בהדרגה.
    // turnTime סופר כמה זמן נמשכת הפנייה הנוכחית; מתאפס ברגע שחוזרים לנסוע ישר.
    const isTurning = Math.abs(w) > 0;
    if (isTurning) turnTime.current += delta;
    else turnTime.current = 0;

    const TURN_DELAY = 0.25;
    const TURN_FADE = 0.2;
    const turnGate = THREE.MathUtils.clamp((turnTime.current - TURN_DELAY) / TURN_FADE, 0, 1);

    targetK *= latencyGate * speedConfidence * turnGate;

    const smoothing = 1 - Math.pow(0.001, delta);
    smoothK.current += (targetK - smoothK.current) * smoothing;
    if (Math.abs(smoothK.current) < 0.0005) smoothK.current = 0;
    const k = smoothK.current;

    const length = isStopped ? 0.9 : 0.9 + speed * 1.2;
    let activeRungs = Math.min(MAX_RUNGS, Math.max(6, Math.floor(length / gap)));

    if (isReverse && viewMode !== ViewMode.POV3) {
      activeRungs = 0;
    }

    const direction = isReverse ? -1 : 1;
    rungsRef.current.count = MAX_RUNGS * 2;

    let leftBlocked = false;
    let rightBlocked = false;

    const lastLeftWorldPos = new THREE.Vector3();
    const lastRightWorldPos = new THREE.Vector3();

    // סינון של אובייקטים דינמיים וחיישנים
    const filterFlags = rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC;

    // אתחול גובה השרשרת בקרבת הרובוט בצורה מאובטחת
    const initChainBaseline = (isLeft: boolean) => {
      const so = isReverse ? startOffsetRev : startOffsetFwd;
      const S = (so - gap) * direction; 
      let cx = 0, cz = 0, theta = 0;
      if (Math.abs(k) > 0.0001) {
        cx = (1 / k) * (Math.cos(k * S) - 1);
        cz = -(1 / k) * Math.sin(k * S);
        theta = k * S;
      } else {
        cx = 0;
        cz = -S;
        theta = 0;
      }
      let x = 0, z = 0;
      if (isLeft) {
        x = cx - (trackWidth / 2) * Math.cos(theta);
        z = cz + (trackWidth / 2) * Math.sin(theta);
      } else {
        x = cx + (trackWidth / 2) * Math.cos(theta);
        z = cz - (trackWidth / 2) * Math.sin(theta);
      }
      const wX = robotX + (x * cosY + z * sinY);
      const wZ = robotZ + (-x * sinY + z * cosY);
      
      const startY = robotY + 2.0;
      const ray = new rapier.Ray({ x: wX, y: startY, z: wZ }, _rayDir);
      const hit = world.castRayAndGetNormal(ray, 4.0, true, filterFlags);
      
      let wY = robotY;
      if (hit) {
        const h = hit as any;
        const toi = h.timeOfImpact !== undefined ? h.timeOfImpact : h.toi;
        wY = startY - toi;
      }
      return new THREE.Vector3(wX, wY, wZ);
    };

    lastLeftWorldPos.copy(initChainBaseline(true));
    lastRightWorldPos.copy(initChainBaseline(false));

    // פונקציית מיקום והערכת חסימות
    const placeOnGround = (idx: number, localX: number, localZ: number, theta: number, isLeft: boolean) => {
      const worldX = robotX + (localX * cosY + localZ * sinY);
      const worldZ = robotZ + (-localX * sinY + localZ * cosY);

      const lastWorldPos = isLeft ? lastLeftWorldPos : lastRightWorldPos;
      const alreadyBlocked = isLeft ? leftBlocked : rightBlocked;
      
      const rayStartHeight = lastWorldPos.y + 2.0;
      const ray = new rapier.Ray({ x: worldX, y: rayStartHeight, z: worldZ }, _rayDir);
      const hit = world.castRayAndGetNormal(ray, 4.0, true, filterFlags);

      let groundY = lastWorldPos.y;
      _normal.set(0, 1, 0);
      let isHitNow = false;

      if (hit) {
        const h = hit as any;
        const toi = h.timeOfImpact !== undefined ? h.timeOfImpact : h.toi;
        groundY = rayStartHeight - toi;
        if (h.normal) _normal.set(h.normal.x, h.normal.y, h.normal.z);
        _normal.normalize();

        if (_normal.y < 0) _normal.negate();

        const isSteep = _normal.y < 0.7; 
        const isHeightJump = Math.abs(groundY - lastWorldPos.y) > 0.4;
        
        if (isSteep || isHeightJump) {
          isHitNow = true;
        }
      }

      // בדיקת רדאר אופקית לאיתור קירות בין שלבים
      const bumperHeight = 0.15;
      const dirX = worldX - lastWorldPos.x;
      const dirY = groundY - lastWorldPos.y;
      const dirZ = worldZ - lastWorldPos.z;
      const dist = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

      if (dist > 0.001 && !alreadyBlocked && !isHitNow) {
        const hRay = new rapier.Ray(
          { x: lastWorldPos.x, y: lastWorldPos.y + bumperHeight, z: lastWorldPos.z },
          { x: dirX / dist, y: dirY / dist, z: dirZ / dist }
        );
        const wallHit = world.castRay(hRay, dist, true, filterFlags);
        if (wallHit !== null) {
          isHitNow = true;
        }
      }

      if (isHitNow || alreadyBlocked) {
        if (isLeft) leftBlocked = true;
        else rightBlocked = true;
      }

      const currentBlocked = isLeft ? leftBlocked : rightBlocked;

      if (!currentBlocked) {
        lastWorldPos.set(worldX, groundY, worldZ);
      } else {
        lastWorldPos.set(worldX, lastWorldPos.y, worldZ);
        groundY = lastWorldPos.y; 
        _normal.set(0, 1, 0);
      }

      _worldPos.set(worldX, groundY + GROUND_LIFT, worldZ);
      
      _worldForward.set(-Math.sin(robotYaw + theta), 0, -Math.cos(robotYaw + theta));
      _rungRight.crossVectors(_worldForward, _normal).normalize();
      _rungForward.crossVectors(_normal, _rungRight).normalize();
      _rungBackward.copy(_rungForward).negate();

      _matrix.makeBasis(_rungRight, _normal, _rungBackward);
      _worldQuat.setFromRotationMatrix(_matrix);

      if (groupRef.current) {
        groupRef.current.worldToLocal(_worldPos);
        groupRef.current.getWorldQuaternion(_parentWorldQuat);
        _parentWorldQuat.invert();
        _worldQuat.premultiply(_parentWorldQuat);
      }

      dummy.position.copy(_worldPos);
      dummy.quaternion.copy(_worldQuat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rungsRef.current!.setMatrixAt(idx, dummy.matrix);
      
      rungsRef.current!.setColorAt(idx, currentBlocked ? colorRed : colorCyan);
    };

    for (let i = 0; i < MAX_RUNGS; i++) {
      if (i < activeRungs) {
        const so = isReverse ? startOffsetRev : startOffsetFwd;
        const S = (so + i * gap) * direction;
        let cx = 0, cz = 0, theta = 0;

        if (Math.abs(k) > 0.0001) {
          cx = (1 / k) * (Math.cos(k * S) - 1);
          cz = -(1 / k) * Math.sin(k * S);
          theta = k * S;
        } else {
          cx = 0;
          cz = -S;
          theta = 0;
        }

        const lx = cx - (trackWidth / 2) * Math.cos(theta);
        const lz = cz + (trackWidth / 2) * Math.sin(theta);
        placeOnGround(i, lx, lz, theta, true);

        const rx = cx + (trackWidth / 2) * Math.cos(theta);
        const rz = cz - (trackWidth / 2) * Math.sin(theta);
        placeOnGround(i + MAX_RUNGS, rx, rz, theta, false);
      } else {
        dummy.position.set(0, -10, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        rungsRef.current.setMatrixAt(i, dummy.matrix);
        rungsRef.current.setMatrixAt(i + MAX_RUNGS, dummy.matrix);
      }
    }
    
    rungsRef.current.instanceMatrix.needsUpdate = true;
    if (rungsRef.current.instanceColor) {
      rungsRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={rungsRef} args={[undefined, undefined, MAX_RUNGS * 2]} frustumCulled={false} renderOrder={2}>
        <boxGeometry args={[0.35, 0.01, 0.08]} />
        <meshBasicMaterial transparent opacity={0.6} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}