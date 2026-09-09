// File: src/store.ts
import { create } from 'zustand';
import { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export enum ViewMode {
  POV1 = 'POV 1 (Nose)',
  POV2 = 'POV 2 (Rear)',
  POV3 = 'POV 3 (Overhead)',
  POV4 = 'POV 4 (Custom)',
  OVERHEAD = 'OVERHEAD',
  MAP = 'MAP',
  SPLIT = 'SPLIT'
}

// פריסות המסך האפשריות (מנותק לגמרי מ-ViewMode של המצלמות)
export enum ScreenLayout {
  FULL_VIDEO = 'FULL_VIDEO',                 // מסך מלא — חוזי (ברירת מחדל)
  SPLIT_VIDEO_VIDEO = 'SPLIT_VIDEO_VIDEO',   // מפוצל — חוזי + חוזי
  SPLIT_VIDEO_MAP = 'SPLIT_VIDEO_MAP',       // מפוצל — מפה + חוזי
  MAP_TWO_VIDEO = 'MAP_TWO_VIDEO',           // חצי מפה + 2 רבעי חוזי
}
// מקור התמונה של חלונית חוזי: מצלמת הרובוט או מצלמת הרחפן
export type VideoSource = 'robot' | 'drone';

export interface Pov4Config {
  posX: number; posY: number; posZ: number;
  yaw: number; pitch: number; roll: number;
}

// אין ברירת מחדל "חכמה" — הכל מתחיל ב-0 (המצלמה על מרכז הרובוט)
const POV4_DEFAULT: Pov4Config = { posX: 0, posY: 0, posZ: 0, yaw: 0, pitch: 0, roll: 0 };

export type AppPhase = 'registration' | 'training' | 'session';

export interface SessionRecord {
  subjectId: string;
  subjectName: string;
  sessionNumber: number;
  sessionLabel: string;
  totalTime: string;
  seg1Time: string;
  eSeg1: number;
  seg2Time: string;
  eSeg2: number;
  narrowEntryTime: string;
  lap1Time: string;
  lap2Time: string;
  narrowExitTime: string;
}

export interface SegmentRecord {
  subjectId: string;
  subjectName: string;
  sessionNumber: number;
  segmentName: string;
  pov: string;
  symbology: string;
  steerMode: 'A' | 'B' | 'C';
  time: string;
  flips: number | string;
  // --- הגדרות POV4 ששלטו הכי הרבה זמן במקטע ---
  pov4DomPosX: string;
  pov4DomPosY: string;
  pov4DomPosZ: string;
  pov4DomYaw: string;
  pov4DomPitch: string;
  pov4DomRoll: string;
  // --- הגדרות POV4 האחרונות בסוף המקטע ---
  pov4LastPosX: string;
  pov4LastPosY: string;
  pov4LastPosZ: string;
  pov4LastYaw: string;
  pov4LastPitch: string;
  pov4LastRoll: string;
}

interface TelemetryState {
  pitch: number;
  roll: number;
  isFlipped: boolean;
  cameraYaw: number;
  cameraPitch: number;
  robotHeading: number;   // כיוון הרובוט במעלות (0-360) עבור המצפן
  droneHeading: number;   // כיוון גוף הרחפן במעלות (0-360) עבור המצפן
  pov4: Pov4Config;
  setPov4: (patch: Partial<Pov4Config>) => void;
  resetPov4: () => void;
  viewMode: ViewMode;
  robotBodyRef: { current: RapierRigidBody | null };
  trackSpeedL: number;
  trackSpeedR: number;
  setTelemetry: (pitch: number, roll: number, isFlipped: boolean) => void;
  setCameraYaw: (yaw: number) => void;
  setCameraPitch: (pitch: number) => void;
  setRobotHeading: (deg: number) => void;
  setDroneHeading: (deg: number) => void;
  // --- רחפן ---
  droneView: boolean;            // true = שליטה וצפייה דרך הרחפן; false = שליטה ברובוט
  droneManual: boolean;          // true = הטסה ידנית (ריחוף במקום); false = מעקב אוטומטי
  dronePosition: [number, number, number];
  droneGimbalYaw: number;        // מעלות — סבסוב מצלמת המטען
  droneGimbalPitch: number;      // מעלות — הטיית מצלמת המטען
  droneFov: number;
  toggleDroneView: () => void;
  toggleDroneManual: () => void;
    setDroneLink: (linked: boolean) => void;
  setDronePosition: (p: [number, number, number]) => void;
  setDroneGimbal: (yaw: number, pitch: number) => void;
  setDroneFov: (fov: number) => void;
  droneAimX: number;
  droneAimY: number;
  setDroneAim: (x: number, y: number) => void;
    droneYaw: number;
  setDroneYaw: (yaw: number) => void;
    droneLaunched: boolean;
  launchDrone: (dy?: number) => void;
  aimScreenX: number;
  aimScreenY: number;
  aimVisible: boolean;
  setAimScreen: (x: number, y: number, visible: boolean) => void;
  steerMode: 'A' | 'B' | 'C';
  setSteerMode: (m: 'A' | 'B' | 'C') => void;
  setViewMode: (mode: ViewMode) => void;
        screenLayout: ScreenLayout;
  setScreenLayout: (layout: ScreenLayout) => void;
  // מקור התמונה של כל חלונית חוזי (slot1 = ראשית, slot2 = משנית)
  videoSlot1: VideoSource;
  videoSlot2: VideoSource;
  setVideoSlot: (slot: 1 | 2, source: VideoSource) => void;
  // איזו חלונית פעילה כרגע לתפעול (הפקדים ילכו אליה). נקבע בלחיצת עכבר.
  activePane: number;
  setActivePane: (pane: number) => void;
  // מחזיר true אם החלונית הפעילה כרגע מציגה רחפן (ואז השליטה הולכת לרחפן)
  isControllingDrone: () => boolean;
    layoutMenuOpen: boolean;
  openLayoutMenu: () => void;
  closeLayoutMenu: () => void;
  layoutCursor: number;
  setLayoutCursor: (i: number) => void;
  setTrackSpeeds: (l: number, r: number) => void;
  // --- שדות תיעוד לפי מקטע ---
  segmentRecords: SegmentRecord[];
  augLayerOn: boolean;
  symLayerOn: boolean;
  setLayerFlags: (aug: boolean, sym: boolean) => void;
  _povDwell: Record<string, number>;
  _povSince: number;
  _symDwell: Record<string, number>;
  _symSince: number;
  _pov4Dwell: Record<string, number>;
  _pov4Since: number;
  _pushSegment: (segmentName: string, startTs: number | null, endTs: number | null, flips: number | null) => void;

  // --- ניהול שלבי הניסוי ---
  appPhase: AppPhase;
  menuOpen: boolean;
  subjectId: string;
  subjectName: string;
  currentSessionNumber: number | null;
  sessionComplete: boolean;
  sessionRecords: SessionRecord[];
  resetRequest: number;
  setSubjectAndStart: (id: string, name: string) => void;
  goToTraining: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  startSession: (num: number) => void;
  requestReset: () => void;
  commitSessionRecord: () => void;
  flushOpenSegment: () => void;

  // --- משתני זמני הניסוי והצ'קפוינט ---
  expStart: number | null;
  expEnd: number | null;
  seg1End: number | null;
  seg2End: number | null;
  narrowStart: number | null;
  narrowEnd: number | null;
  lap1Start: number | null;
  lap1End: number | null;
  lap2Start: number | null;
  lap2End: number | null;
  narrowExitStart: number | null;
  narrowExitEnd: number | null;
  alley1Start: number | null;
  alley1End: number | null;
  alley2Start: number | null;
  alley2End: number | null;
  hill6EndTouchCount: number;
  lastHill6EndTouch: number;

  insideTouchCount: number;
  lastInsideTouch: number;
  corridor2TouchCount: number;
  lastCorridor2Touch: number;
  corridor1TouchCount: number;
  lastCorridor1Touch: number;

  lastCheckpoint: { pos: { x: number, y: number, z: number }, rot: { x: number, y: number, z: number, w: number } } | null;
  saveCheckpoint: () => void;

  eCountSeg1: number;
  eCountSeg2: number;
  eCountNarrow: number;
  eCountLaps: number;
  recordEPress: () => void;

  // --- שערים וירטואליים בראשי הגבעות ---
  currentGateIndex: number;
  passGate: (index: number) => void;

  triggerSensor2: () => void;
  triggerSensor3: () => void;
  triggerHill6End: () => void;
  triggerBldgOutside: () => void;
  triggerBldgInside: () => void;
  triggerSensor4: () => void;
  triggerSensor5: () => void;
  downloadCSV: () => void;
}
// ממיר את מצב שתי שכבות-העל לתווית של חלופת הסימון
const symLabel = (aug: boolean, sym: boolean) =>
  aug && sym ? 'שניהם' : aug ? 'אוגמנטציה' : sym ? 'סימבולוגיה' : 'ללא';

// ממיר את מזהה ה-POV לתווית קריאה בקובץ
const povName = (v: string) =>
  v === ViewMode.POV1 ? '1 (אף)' :
  v === ViewMode.POV2 ? '2 (אחורי)' :
  v === ViewMode.POV3 ? '3 (על)' :
  v === ViewMode.POV4 ? '4 (מותאם)' : String(v);
// ערכי ברירת מחדל לאיפוס מלא של מדדי הסשן (נקרא בכל תחילת סשן חדש)
const blankTimers = {
  expStart: null, expEnd: null, seg1End: null, seg2End: null,
  narrowStart: null, narrowEnd: null,
  lap1Start: null, lap1End: null, lap2Start: null, lap2End: null,
  narrowExitStart: null, narrowExitEnd: null,
  alley1Start: null, alley1End: null,
  alley2Start: null, alley2End: null,
  hill6EndTouchCount: 0, lastHill6EndTouch: 0,
  insideTouchCount: 0, lastInsideTouch: 0,
  corridor2TouchCount: 0, lastCorridor2Touch: 0,
  corridor1TouchCount: 0, lastCorridor1Touch: 0,
  eCountSeg1: 0, eCountSeg2: 0, eCountNarrow: 0, eCountLaps: 0,
  lastCheckpoint: null,
  currentGateIndex: 0,
};

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  pitch: 0,
  roll: 0,
  isFlipped: false,
  cameraYaw: 0,
  cameraPitch: 0,
  robotHeading: 0,
  droneHeading: 0,
  viewMode: ViewMode.POV2,
  robotBodyRef: { current: null },
  trackSpeedL: 0,
  trackSpeedR: 0,
  segmentRecords: [],
  augLayerOn: false,
  symLayerOn: false,
  _povDwell: {},
  _povSince: 0,
  _symDwell: {},
  _symSince: 0,
  _pov4Dwell: {},
  _pov4Since: 0,
  setTelemetry: (pitch, roll, isFlipped) => set({ pitch, roll, isFlipped }),
  setCameraYaw: (yaw) => set({ cameraYaw: yaw }),
  setCameraPitch: (pitch) => set({ cameraPitch: pitch }),
  setRobotHeading: (deg) => set({ robotHeading: deg }),
  setDroneHeading: (deg) => set({ droneHeading: deg }),
  pov4: { ...POV4_DEFAULT },
  setPov4: (patch) => {
    const s = get();
    const now = Date.now();
    // אם היינו ב-POV4, צוברים את הזמן שעבר לתצורה הקודמת לפני שמעדכנים
    if (s.viewMode === ViewMode.POV4) {
      const key = `${s.pov4.posX},${s.pov4.posY},${s.pov4.posZ},${s.pov4.yaw},${s.pov4.pitch},${s.pov4.roll}`;
      set({
        _pov4Dwell: { ...s._pov4Dwell, [key]: (s._pov4Dwell[key] || 0) + (now - (s._pov4Since || now)) },
        _pov4Since: now,
        pov4: { ...s.pov4, ...patch },
      });
    } else {
      set({ pov4: { ...s.pov4, ...patch } });
    }
  },
  resetPov4: () => set({ pov4: { ...POV4_DEFAULT } }),
  // --- רחפן ---
  droneView: false,
  droneManual: true,
  dronePosition: [0, 7.5, 11],
  droneGimbalYaw: 0,
  droneGimbalPitch: 16,
  droneFov: 60,
  toggleDroneView: () => set(s => ({ droneView: !s.droneView })),
  // צימוד = מעקב (droneManual=false). ניתוק = ריחוף ידני (droneManual=true).
  toggleDroneManual: () => get().setDroneLink(get().droneManual), // אם ידני→לצמד; אם מצומד→לנתק
  setDroneLink: (linked) => {
    const s = get();
    if (linked) {
      // ----- הפעלת צימוד (מעקב) -----
      // מאפסים את כיוון הרחפן כך שישאף מיד להסתדר מאחורי הרובוט (מונע "עקום"/מלפנים)
      let patch: any = { droneManual: false, droneYaw: 0 };
      // בפריסות עם 2 חלוניות חוזי — מעבירים שליטה לחלונית שמציגה רובוט
      if (s.screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO) {
        patch.activePane = s.videoSlot1 === 'robot' ? 1 : 2;
      } else if (s.screenLayout === ScreenLayout.MAP_TWO_VIDEO) {
        // אזור 2 מציג slot2, אזור 3 מציג slot1
        patch.activePane = s.videoSlot2 === 'robot' ? 2 : 3;
      }
      set(patch);
    } else {
      // ----- ניתוק צימוד (חזרה לריחוף ידני) -----
      // הרחפן נשאר בדיוק איפה שהוא ובאיזו זווית שהוא — לא חוזר לשום מצב ישן.
      set({ droneManual: true });
    }
  },
  setDronePosition: (p) => set({ dronePosition: p }),
  setDroneGimbal: (yaw, pitch) =>
    set({ droneGimbalYaw: yaw, droneGimbalPitch: Math.max(-90, Math.min(90, pitch)) }),
  setDroneFov: (fov) => set({ droneFov: Math.max(20, Math.min(100, fov)) }),
  droneAimX: 0,
  droneAimY: 0,
  setDroneAim: (x, y) => set({ droneAimX: x, droneAimY: y }),
    droneYaw: 0,
  setDroneYaw: (yaw) => set({ droneYaw: yaw }),
  droneLaunched: false,
  // מעלה את הרחפן בהדרגה כל עוד לוחצים; ברגע שעולה מעל הרובוט הוא נחשב "הומרא".
  // dy = כמה לעלות בפריים הזה. התקרה נחסמת ע"י המתפעל (7.5 = ברירת המחדל).
  launchDrone: (dy = 0) => {
    const s = get();
    const [x, y, z] = s.dronePosition;
    const TARGET = 7.5;                 // תקרת גובה ההמראה (ברירת המחדל)
    const ny = Math.min(TARGET, y + dy);
    set({
      dronePosition: [x, ny, z],
      droneLaunched: s.droneLaunched || ny > y + 0.001, // נדלק ברגע שהתחיל לעלות
    });
  },

  // מיקום הצלב המעוגל על המסך, בפיקסלים ממרכז המסך.
  // מחושב ב-Robot.tsx על ידי היטל אמיתי דרך המצלמה הפעילה.
  aimScreenX: 0,
  aimScreenY: 0,
  aimVisible: false,
  setAimScreen: (x, y, visible) => {
    const s = get();
    // מעדכנים רק כשיש שינוי אמיתי, כדי לא לצייר מחדש לחינם בכל פריים
    if (s.aimVisible === visible &&
        Math.abs(s.aimScreenX - x) < 0.5 &&
        Math.abs(s.aimScreenY - y) < 0.5) return;
    set({ aimScreenX: x, aimScreenY: y, aimVisible: visible });
  },
  steerMode: 'A',
  setSteerMode: (m) => set({ steerMode: m }),
        screenLayout: ScreenLayout.FULL_VIDEO,
  setScreenLayout: (layout) => {
    const s = get();
    // כל עוד הרחפן לא המריא: פריסות עם חלונית חוזי אחת יציגו רובוט כברירת מחדל.
    // (מסך מלא → slot1;  חצי-מפה + חוזי → slot2 היא החלונית החוזי).
    if (!s.droneLaunched) {
      if (layout === ScreenLayout.FULL_VIDEO && s.videoSlot1 !== 'robot') {
        set({ screenLayout: layout, videoSlot1: 'robot', videoSlot2: 'drone', activePane: 1 });
        return;
      }
      if (layout === ScreenLayout.SPLIT_VIDEO_MAP && s.videoSlot2 !== 'robot') {
        set({ screenLayout: layout, videoSlot2: 'robot', videoSlot1: 'drone', activePane: 2 });
        return;
      }
    }
    // אחרי המראה (או פריסות אחרות): נשאר מה שהיה אחרון
    set({ screenLayout: layout });
  },
  // ברירת מחדל: שתי החלוניות מתחילות ברובוט? לא — אסור כפילות.
  // slot1 = רובוט (ברירת מחדל), slot2 = רחפן (הערך ההפוך).
  videoSlot1: 'robot',
  videoSlot2: 'drone',
  activePane: 1,
  setActivePane: (pane) => set({ activePane: pane }),
  isControllingDrone: () => {
    const s = get();
    // מסך מלא: לפי הבורר slot1
    if (s.screenLayout === ScreenLayout.FULL_VIDEO) {
      return s.videoSlot1 === 'drone';
    }
    // חצי-חצי חוזי: אזור 1 = slot1, אזור 2 = slot2
    if (s.screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO) {
      if (s.activePane === 1) return s.videoSlot1 === 'drone';
      if (s.activePane === 2) return s.videoSlot2 === 'drone';
      return false;
    }
    // מפה + חוזי: רק אזור 2 הוא חוזי (slot2)
    if (s.screenLayout === ScreenLayout.SPLIT_VIDEO_MAP) {
      if (s.activePane === 2) return s.videoSlot2 === 'drone';
      return false;
    }
    // מפה + 2 חוזי: אזור 2 מציג slot2, אזור 3 מציג slot1 (תואם ל-App)
    if (s.screenLayout === ScreenLayout.MAP_TWO_VIDEO) {
      if (s.activePane === 2) return s.videoSlot2 === 'drone';
      if (s.activePane === 3) return s.videoSlot1 === 'drone';
      return false;
    }
    return false;
  },
  setVideoSlot: (slot, source) => {
    const other: VideoSource = source === 'robot' ? 'drone' : 'robot';
    if (slot === 1) {
      // אם slot2 מציג את אותו דבר — הופכים אותו אוטומטית, כדי למנוע כפילות
      set(s => ({
        videoSlot1: source,
        videoSlot2: s.videoSlot2 === source ? other : s.videoSlot2,
      }));
    } else {
      set(s => ({
        videoSlot2: source,
        videoSlot1: s.videoSlot1 === source ? other : s.videoSlot1,
      }));
    }
  },
    layoutMenuOpen: false,
  openLayoutMenu: () => {
    // הסמן מתחיל תמיד על הפריסה הפעילה כרגע (בין אם נפתח בעכבר או ב-B4)
    const order = [ScreenLayout.FULL_VIDEO, ScreenLayout.SPLIT_VIDEO_VIDEO, ScreenLayout.SPLIT_VIDEO_MAP, ScreenLayout.MAP_TWO_VIDEO];
    const cur = order.indexOf(get().screenLayout);
    set({ layoutMenuOpen: true, menuOpen: false, layoutCursor: cur < 0 ? 0 : cur });
  },
  closeLayoutMenu: () => set({ layoutMenuOpen: false }),
  layoutCursor: 0,
  setLayoutCursor: (i: number) => set({ layoutCursor: i }),
  setViewMode: (mode) => {
    const s = get();
    const now = Date.now();
    set({
      _povDwell: { ...s._povDwell, [s.viewMode]: (s._povDwell[s.viewMode] || 0) + (now - (s._povSince || now)) },
      _povSince: now,
      viewMode: mode,
    });
  },
  setTrackSpeeds: (l, r) => set({ trackSpeedL: l, trackSpeedR: r }),
  // מדווח ל-store אילו שכבות-על פעילות כרגע (נקרא מ-LayersMenu)
  setLayerFlags: (aug, sym) => {
    const s = get();
    const now = Date.now();
    const prevKey = symLabel(s.augLayerOn, s.symLayerOn);
    set({
      _symDwell: { ...s._symDwell, [prevKey]: (s._symDwell[prevKey] || 0) + (now - (s._symSince || now)) },
      _symSince: now,
      augLayerOn: aug,
      symLayerOn: sym,
    });
  },

  // נקרא בכל סוף-מקטע: בוחר את ה-POV והסימבולוגיה ששלטו הכי הרבה זמן, ורושם שורה
  _pushSegment: (segmentName, startTs, endTs, flips) => {
    const s = get();
    const now = Date.now();
    const povD = { ...s._povDwell };
    povD[s.viewMode] = (povD[s.viewMode] || 0) + (now - (s._povSince || now));
    const symKey = symLabel(s.augLayerOn, s.symLayerOn);
    const symD = { ...s._symDwell };
    symD[symKey] = (symD[symKey] || 0) + (now - (s._symSince || now));
    const dom = (obj: Record<string, number>) =>
      Object.keys(obj).reduce((a, b) => (obj[a] >= obj[b] ? a : b));
    const povWinner = dom(povD);
    const symWinner = dom(symD);
    const time = (!startTs || !endTs) ? 'N/A' : ((endTs - startTs) / 1000).toFixed(2);

    // --- POV4: צוברים את זמן התצורה הנוכחית לפני הבחירה ---
    const pov4D = { ...s._pov4Dwell };
    if (s.viewMode === ViewMode.POV4) {
      const curKey = `${s.pov4.posX},${s.pov4.posY},${s.pov4.posZ},${s.pov4.yaw},${s.pov4.pitch},${s.pov4.roll}`;
      pov4D[curKey] = (pov4D[curKey] || 0) + (now - (s._pov4Since || now));
    }
    // התצורה ששלטה הכי הרבה זמן במקטע (אם בכלל היה POV4)
    const pov4Keys = Object.keys(pov4D);
    const domPov4 = pov4Keys.length > 0
      ? pov4Keys.reduce((a, b) => (pov4D[a] >= pov4D[b] ? a : b)).split(',')
      : ['', '', '', '', '', ''];
    // התצורה האחרונה בפועל (הערכים הנוכחיים של הסליידרים)
    const lastPov4 = s.pov4;

    const record: SegmentRecord = {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      sessionNumber: s.currentSessionNumber ?? 0,
      segmentName,
      pov: povName(povWinner),
      symbology: symWinner,
      steerMode: s.steerMode,
      time,
      flips: flips === null ? '' : flips,
      pov4DomPosX: domPov4[0], pov4DomPosY: domPov4[1], pov4DomPosZ: domPov4[2],
      pov4DomYaw: domPov4[3], pov4DomPitch: domPov4[4], pov4DomRoll: domPov4[5],
      pov4LastPosX: String(lastPov4.posX), pov4LastPosY: String(lastPov4.posY), pov4LastPosZ: String(lastPov4.posZ),
      pov4LastYaw: String(lastPov4.yaw), pov4LastPitch: String(lastPov4.pitch), pov4LastRoll: String(lastPov4.roll),
    };
    set({
      segmentRecords: [...s.segmentRecords, record],
      _povDwell: {}, _povSince: now, _symDwell: {}, _symSince: now,
      _pov4Dwell: {}, _pov4Since: now,
    });
  },

  // --- שלבי הניסוי ---
  appPhase: 'registration',
  menuOpen: false,
  subjectId: '',
  subjectName: '',
  currentSessionNumber: null,
  sessionComplete: false,
  sessionRecords: [],
  resetRequest: 0,

  setSubjectAndStart: (id, name) => {
    set({ subjectId: id, subjectName: name, appPhase: 'training', menuOpen: false, sessionComplete: false, viewMode: ViewMode.POV2, pov4: { ...POV4_DEFAULT }, steerMode: 'A', screenLayout: ScreenLayout.FULL_VIDEO, videoSlot1: 'robot', videoSlot2: 'drone', activePane: 1, droneView: false, droneLaunched: false });
    get().requestReset();
  },

  goToTraining: () => {
    set({ appPhase: 'training', menuOpen: false, sessionComplete: false, viewMode: ViewMode.POV2, steerMode: 'A', screenLayout: ScreenLayout.FULL_VIDEO, videoSlot1: 'robot', videoSlot2: 'drone', activePane: 1, droneView: false, droneLaunched: false });
    get().requestReset();
  },

  openMenu: () => set({ menuOpen: true, layoutMenuOpen: false }),
  closeMenu: () => set({ menuOpen: false }),

  startSession: (num) => {
    // לפני שמתחילים סשן חדש — שומרים את המקטע שהיה פתוח בסשן הקודם (אם היה).
    get().flushOpenSegment();
    const t = Date.now();
    set({ ...blankTimers, appPhase: 'session', currentSessionNumber: num, sessionComplete: false, menuOpen: false, viewMode: ViewMode.POV2, steerMode: 'A', screenLayout: ScreenLayout.FULL_VIDEO, videoSlot1: 'robot', videoSlot2: 'drone', activePane: 1, droneView: false, droneLaunched: false, _povDwell: {}, _povSince: t, _symDwell: {}, _symSince: t });
    get().requestReset();
  },

  requestReset: () => set(state => ({ resetRequest: state.resetRequest + 1 })),
  // סוגרת ורושמת את המקטע שפתוח כרגע (אם יש כזה) כמקטע חלקי.
  // נקראת כשעוברים לסשן חדש באמצע, וכשמורידים CSV באמצע —
  // כדי שזמן שכבר נמדד חלקית לא ילך לאיבוד.
  flushOpenSegment: () => {
    const s = get();
    if (!s.expStart || s.expEnd) return; // אין ניסוי פעיל, או שכבר הסתיים כרגיל
    const now = Date.now();

    // מזהים איזה מקטע פתוח כרגע לפי סדר ההתקדמות, וסוגרים אותו.
    if (s.narrowExitStart && !s.narrowExitEnd) {
      get()._pushSegment('פתח צר - יציאה (חלקי)', s.narrowExitStart, now, null);
    } else if (s.lap1Start && !s.lap1End) {
      get()._pushSegment('סיבוב (חלקי)', s.lap1Start, now, null);
    } else if (s.narrowStart && !s.narrowEnd) {
      get()._pushSegment('פתח צר - כניסה (חלקי)', s.narrowStart, now, get().eCountNarrow);
    } else if (s.alley1Start && !s.alley1End) {
      get()._pushSegment('מעבר בסמטה (חלקי)', s.alley1Start, now, null);
    } else if (s.expStart && !s.seg1End) {
      get()._pushSegment('גבעות (חלקי)', s.expStart, now, get().eCountSeg1);
    }

    // שורת סיכום חלקית: הזמן מתחילת הניסוי עד הרגע שבו נקטע.
    const totalRow: SegmentRecord = {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      sessionNumber: s.currentSessionNumber ?? 0,
      segmentName: 'סך הכל (חלקי)',
      pov: '',
      symbology: '',
      steerMode: '' as any,
      time: ((now - (s.expStart as number)) / 1000).toFixed(2),
      flips: '',
      pov4DomPosX: '', pov4DomPosY: '', pov4DomPosZ: '',
      pov4DomYaw: '', pov4DomPitch: '', pov4DomRoll: '',
      pov4LastPosX: '', pov4LastPosY: '', pov4LastPosZ: '',
      pov4LastYaw: '', pov4LastPitch: '', pov4LastRoll: '',
    };
    set({ segmentRecords: [...get().segmentRecords, totalRow], expEnd: now });
    console.log("Open segment flushed (partial session saved)");
  },

  // שמירת שורת סשן בזיכרון (ללא הורדה). שומר על שמות ייחודיים כדי לא לדרוס.
  commitSessionRecord: () => {
    const s = get();
    const effectiveEnd = s.expEnd || Date.now();
    const calc = (a: number | null, b: number | null) => (!a || !b) ? "N/A" : ((b - a) / 1000).toFixed(2);
    const num = s.currentSessionNumber ?? 0;
    const priorCount = s.sessionRecords.filter(r => r.sessionNumber === num).length;
    const label = priorCount === 0 ? String(num) : `${num} (${priorCount})`;

    const record: SessionRecord = {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      sessionNumber: num,
      sessionLabel: label,
      totalTime: calc(s.expStart, effectiveEnd),
      seg1Time: calc(s.expStart, s.seg1End),
      eSeg1: s.eCountSeg1,
      seg2Time: calc(s.seg1End, s.seg2End),
      eSeg2: s.eCountSeg2,
      narrowEntryTime: calc(s.narrowStart, s.narrowEnd),
      lap1Time: calc(s.lap1Start, s.lap1End),
      lap2Time: calc(s.lap2Start, s.lap2End),
      narrowExitTime: calc(s.narrowExitStart, s.narrowExitEnd),
    };

    set({ sessionRecords: [...s.sessionRecords, record] });
    console.log("Session record saved:", record);
  },

  expStart: null,
  expEnd: null,
  seg1End: null,
  seg2End: null,
  narrowStart: null,
  narrowEnd: null,
  lap1Start: null,
  lap1End: null,
  lap2Start: null,
  lap2End: null,
  narrowExitStart: null,
  narrowExitEnd: null,

  alley1Start: null,
  alley1End: null,
  alley2Start: null,
  alley2End: null,
  hill6EndTouchCount: 0,
  lastHill6EndTouch: 0,

  insideTouchCount: 0,
  lastInsideTouch: 0,
  corridor2TouchCount: 0,
  lastCorridor2Touch: 0,
  corridor1TouchCount: 0,
  lastCorridor1Touch: 0,

  lastCheckpoint: null,

  eCountSeg1: 0,
  eCountSeg2: 0,
  eCountNarrow: 0,
  eCountLaps: 0,

  // --- שערים וירטואליים: מתחילים בשער הראשון (אינדקס 0) ---
  currentGateIndex: 0,

  // נקרא כשהרובוט חוצה את השער הפעיל. מקדם את האינדקס לשער הבא בלבד.
  passGate: (index) => {
    if (get().currentGateIndex === index) {
      set({ currentGateIndex: index + 1 });
      console.log(`Gate ${index} passed. Next gate: ${index + 1}`);
    }
  },

  recordEPress: () => {
    const { expStart, seg1End, narrowStart, narrowEnd, expEnd } = get();
    if (!expStart || expEnd) return;

    if (!seg1End) {
      set(state => ({ eCountSeg1: state.eCountSeg1 + 1 }));
      console.log(`E pressed in Segment 1. Count: ${get().eCountSeg1}`);
    } else if (!narrowStart) {
      set(state => ({ eCountSeg2: state.eCountSeg2 + 1 }));
      console.log(`E pressed in Segment 2. Count: ${get().eCountSeg2}`);
    } else if (!narrowEnd) {
      set(state => ({ eCountNarrow: state.eCountNarrow + 1 }));
      console.log(`E pressed in Narrow Passage. Count: ${get().eCountNarrow}`);
    } else {
      set(state => ({ eCountLaps: state.eCountLaps + 1 }));
      console.log(`E pressed in Corridor Laps. Count: ${get().eCountLaps}`);
    }
  },

  saveCheckpoint: () => {
    const body = get().robotBodyRef.current;
    if (body) {
      const pos = body.translation();
      const rot = body.rotation();
      const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w), 'YXZ');
      const flatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0, 'YXZ'));

      set({
        lastCheckpoint: {
          pos: { x: pos.x, y: 1.5, z: pos.z },
          rot: { x: flatQuat.x, y: flatQuat.y, z: flatQuat.z, w: flatQuat.w }
        }
      });
      console.log("Checkpoint Saved!");
    }
  },

  triggerSensor2: () => {
    get().saveCheckpoint();
    if (!get().expStart) {
      console.log("Experiment & Hills Started");
      set({ expStart: Date.now() });
    }
  },

  triggerSensor3: () => {
    // נקודת מעבר בלבד: שומרת צ'קפוינט לחזרה עם E. לא מפעילה ולא עוצרת שום מדידה.
    get().saveCheckpoint();
  },

  triggerHill6End: () => {
    get().saveCheckpoint();
    // דריכה חד-פעמית: סוף מקטע הגבעות + תחילת מדידת מעבר בסמטה.
    if (get().expStart && !get().seg1End) {
      const now = Date.now();
      console.log("Hills Ended, Alley Started");
      set({ seg1End: now, alley1Start: now });
      get()._pushSegment('גבעות', get().expStart, now, get().eCountSeg1);
    }
  },

  triggerBldgOutside: () => {
    get().saveCheckpoint();
    if (!get().narrowStart) {
      // סוף מעבר בסמטה — נרשם לפני תחילת הפתח הצר
      if (get().alley1Start && !get().alley1End) {
        const now = Date.now();
        set({ alley1End: now });
        get()._pushSegment('מעבר בסמטה', get().alley1Start, now, null);
      }
      console.log("Narrow Passage (Entry) Started");
      set({ narrowStart: Date.now() });
    }
  },

  // sensor-bldg-inside = שטיח הכניסה. נדרך שלוש פעמים:
  // דריכה 1: מסיים "פתח צר - כניסה". דריכה 2: מסיים סיבוב 1 ומתחיל סיבוב 2.
  // דריכה 3 (מהירה): לא עושה כלום, רק נספרת.
  triggerBldgInside: () => {
    get().saveCheckpoint();
    // דריכה חד-פעמית: עוצרת את מדידת "פתח צר - כניסה".
    if (get().narrowStart && !get().narrowEnd) {
      const now = Date.now();
      console.log("Narrow (Entry) Ended");
      set({ narrowEnd: now });
      get()._pushSegment('פתח צר - כניסה', get().narrowStart, now, get().eCountNarrow);
    }
  },

  // sensor-4: מנהל את מקטע "סיבוב" בשתי דריכות.
  // דריכה 1 → תחילת מדידת הסיבוב. דריכה 2 (רק אחרי 3 שניות לפחות, כדי לא לסגור מיד) →
  // סוף הסיבוב + תחילת מדידת "פתח צר - יציאה".
  triggerSensor4: () => {
    const now = Date.now();
    const { corridor2TouchCount, lastCorridor2Touch } = get();
    get().saveCheckpoint();

    if (corridor2TouchCount === 0) {
      // דריכה 1: תחילת הסיבוב
      console.log("Lap Started");
      set({ lap1Start: now, corridor2TouchCount: 1, lastCorridor2Touch: now });
    } else if (corridor2TouchCount === 1) {
      // מתעלמים מדריכות שמתרחשות תוך 3 שניות מהראשונה (רעד/מעבר כפול)
      if (now - lastCorridor2Touch < 3000) return;
      // דריכה 2: סוף הסיבוב + תחילת "פתח צר - יציאה"
      console.log("Lap Ended, Narrow (Exit) Started");
      set({ lap1End: now, narrowExitStart: now, corridor2TouchCount: 2, lastCorridor2Touch: now });
      get()._pushSegment('סיבוב', get().lap1Start, now, null);
    }
  },


  // שטיח אחרון: עוצר את "פתח צר - יציאה", מסיים את הניסוי כולו,
  // רושם מקטע "סך הכל" (רק זמן כולל, שאר העמודות ריקות),
  // שומר שורת סשן בזיכרון ומדליק את כפתור "Next".
  triggerSensor5: () => {
    if (get().expStart && !get().expEnd && !get().narrowExitEnd) {
      const now = Date.now();
      const start = get().expStart;
      set({ narrowExitEnd: now, expEnd: now });
      get()._pushSegment('פתח צר - יציאה', get().narrowExitStart, now, null);

      // שורת סיכום: רק הזמן הכולל מההתחלה ועד הסוף. כל שאר העמודות ריקות.
      const s = get();
      const totalRow: SegmentRecord = {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        sessionNumber: s.currentSessionNumber ?? 0,
        segmentName: 'סך הכל',
        pov: '',
        symbology: '',
        steerMode: '' as any,
        time: ((now - (start as number)) / 1000).toFixed(2),
        flips: '',
        pov4DomPosX: '', pov4DomPosY: '', pov4DomPosZ: '',
        pov4DomYaw: '', pov4DomPitch: '', pov4DomRoll: '',
        pov4LastPosX: '', pov4LastPosY: '', pov4LastPosZ: '',
        pov4LastYaw: '', pov4LastPitch: '', pov4LastRoll: '',
      };
      set({ segmentRecords: [...get().segmentRecords, totalRow] });

      get().commitSessionRecord();
      set({ sessionComplete: true });
      console.log("Narrow (Exit) Ended, Experiment Finished");
    }
  },

  // מוריד קובץ CSV עם כל השורות שנצברו (שורה לכל סשן).
  downloadCSV: () => {
    // סוגרים ורושמים מקטע פתוח כרגע (אם יש), כדי שגם ניסוי שלא הגיע לשטיח האחרון יירד לקובץ.
    get().flushOpenSegment();
    const s = get();
    if (s.segmentRecords.length === 0) {
      alert("עדיין לא נשמרו מקטעים. יש להשלים לפחות מקטע אחד לפני ההורדה.");
      return;
    }

    const headers = [
      "מספר נבדק",
      "שם נבדק",
      "מספר הסשן",
      "מקטע",
      "POV",
      "סימבולוגיה",
      "אופן ניהוג",
      "זמן (שניות)",
      "מספר התהפכויות (לחיצה על e)",
      "POV4 שולט - X", "POV4 שולט - Y", "POV4 שולט - Z",
      "POV4 שולט - Yaw", "POV4 שולט - Pitch", "POV4 שולט - Roll",
      "POV4 אחרון - X", "POV4 אחרון - Y", "POV4 אחרון - Z",
      "POV4 אחרון - Yaw", "POV4 אחרון - Pitch", "POV4 אחרון - Roll",
    ];

    const rows = s.segmentRecords.map(r => [
      r.subjectId, r.subjectName, r.sessionNumber, r.segmentName,
      r.pov, r.symbology, r.steerMode, r.time, r.flips,
      r.pov4DomPosX, r.pov4DomPosY, r.pov4DomPosZ,
      r.pov4DomYaw, r.pov4DomPitch, r.pov4DomRoll,
      r.pov4LastPosX, r.pov4LastPosY, r.pov4LastPosZ,
      r.pov4LastYaw, r.pov4LastPitch, r.pov4LastRoll,
    ]);

    const esc = (v: any) => {
      const str = String(v ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    // BOM (\uFEFF) כדי שעברית תיפתח נכון באקסל
    const csvContent = "\uFEFF" + [headers, ...rows].map(row => row.map(esc).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `subject_${s.subjectId || 'unknown'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}));