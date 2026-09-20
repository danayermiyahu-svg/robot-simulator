// src/App.tsx

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { View } from '@react-three/drei';
import { Robot, RobotVisuals } from './components/Robot';
import { World } from './components/World';
import { InfoBar } from './components/InfoBar';
import { LayersMenu } from './components/LayersMenu';
import { LayoutMenu } from './components/LayoutMenu';
import { SettingsMenu } from './components/SettingsMenu';
import { ExperimentUI } from './components/ExperimentUI';
import { DroneControls, DroneVisuals } from './components/Drone';
import { VideoSourcePicker } from './components/VideoSourcePicker';
import { MapLabels } from './components/MapLabels';
import { MapView } from './components/MapView';
import { useTelemetryStore, ViewMode, ScreenLayout } from './store';

// כיסוי שחור לחלונית חוזי שמוגדרת לרחפן אך הרחפן עדיין לא המריא (אין לו חוזי)
function DroneOffCover({ slot }: { slot: 1 | 2 }) {
  const source = useTelemetryStore(s => (slot === 1 ? s.videoSlot1 : s.videoSlot2));
  const launched = useTelemetryStore(s => s.droneLaunched);
  if (source !== 'drone' || launched) return null;
  return (
    <div className="absolute inset-0 z-[65] bg-black pointer-events-none flex items-center justify-center">
      <span className="text-white/40 font-sans text-xs">Drone offline</span>
    </div>
  );
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const view1Ref = useRef<HTMLDivElement>(null);
  const view2Ref = useRef<HTMLDivElement>(null);
  const view3Ref = useRef<HTMLDivElement>(null);
  const viewMode = useTelemetryStore(s => s.viewMode);
  const appPhase = useTelemetryStore(s => s.appPhase);
  const currentSessionNumber = useTelemetryStore(s => s.currentSessionNumber);
  const resetRequest = useTelemetryStore(s => s.resetRequest);
  const steerMode = useTelemetryStore(s => s.steerMode);
  const droneView = useTelemetryStore(s => s.droneView);
    const screenLayout = useTelemetryStore(s => s.screenLayout);
  const videoSlot1 = useTelemetryStore(s => s.videoSlot1);
  const videoSlot2 = useTelemetryStore(s => s.videoSlot2);
    const droneLaunched = useTelemetryStore(s => s.droneLaunched);
  const activePane = useTelemetryStore(s => s.activePane);
  const setActivePane = useTelemetryStore(s => s.setActivePane);

  // practice = שטח אימון נקי (כל מה שאינו סשן). sym = סימבוליקה/מדידה (רק בסשן).
  const practice = appPhase !== 'session';
  const sym = appPhase === 'session';

  const [layers, setLayers] = useState({
    augmentation: true,
    symbology: true,
    horizon: true,
    compass: true,
    path: false,
    centerAttitude: true,
    predictive: true,
    hillOverlay: false,
  });

  // ================= חלונית מבט-על (Picture in Picture) =================
  // pipBoxRef  – המסגרת החיצונית שאותה גוררים ומשנים בגודל
  // pipOpen    – האם החלונית פתוחה (נפתחת/נסגרת ב-Command+P / Ctrl+P)
  // pipPosRef  – מיקום החלונית (נשמר ב-ref; משתנה ישירות בזמן גרירה, בלי רינדור מחדש)
  // pipSizeRef – גודל החלונית (נשמר ב-ref; משתנה ישירות בזמן שינוי גודל)
  const pipBoxRef = useRef<HTMLDivElement>(null);
  const [pipOpen, setPipOpen] = useState(false);
  const [pipCanvasKey, setPipCanvasKey] = useState(0); // בכל שינוי שלו – מבט-העל מצויר מחדש לפי הגודל הנוכחי
  const pipPosRef = useRef({ x: 24, y: 96 });
  const pipSizeRef = useRef({ w: 260, h: 200 });
  const pipDrag = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const pipResize = useRef({
    active: false, dir: '',
    startX: 0, startY: 0, startLeft: 0, startTop: 0, startW: 0, startH: 0,
  });

  // פתיחה/סגירה של החלונית ב-Command+P (מק) או Ctrl+P (ווינדוס)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); // מבטל את חלון ההדפסה של הדפדפן
        setPipOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // גרירה ושינוי-גודל — הכל דרך שינוי ישיר של ה-style, בלי setState,
  // כדי שהחלונית תישאר חלקה ולא תתרנדר מחדש באמצע.
  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) => {
      const box = pipBoxRef.current;
      if (!box) return;

      // --- גרירה (הזזה) ---
      if (pipDrag.current.dragging) {
        const x = e.clientX - pipDrag.current.offsetX;
        const y = e.clientY - pipDrag.current.offsetY;
        pipPosRef.current = { x, y };
        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        return;
      }

      // --- שינוי גודל ---
      if (pipResize.current.active) {
        const r = pipResize.current;
        const dx = e.clientX - r.startX;
        const dy = e.clientY - r.startY;
        let left = r.startLeft, top = r.startTop, w = r.startW, h = r.startH;
        const MIN_W = 260, MIN_H = 200; // גודל מינימלי של החלונית

        if (r.dir.includes('e')) w = r.startW + dx;
        if (r.dir.includes('s')) h = r.startH + dy;
        if (r.dir.includes('w')) { w = r.startW - dx; left = r.startLeft + dx; }
        if (r.dir.includes('n')) { h = r.startH - dy; top = r.startTop + dy; }

        const MAX_W = 520, MAX_H = 400; // גודל מקסימלי של החלונית — אפשר לשנות את המספרים
        if (w < MIN_W) { if (r.dir.includes('w')) left -= (MIN_W - w); w = MIN_W; }
        if (h < MIN_H) { if (r.dir.includes('n')) top -= (MIN_H - h); h = MIN_H; }
        if (w > MAX_W) { if (r.dir.includes('w')) left -= (MAX_W - w); w = MAX_W; }
        if (h > MAX_H) { if (r.dir.includes('n')) top -= (MAX_H - h); h = MAX_H; }

        pipPosRef.current = { x: left, y: top };
        pipSizeRef.current = { w, h };
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${w}px`;
        box.style.height = `${h}px`;
      }
    };
    const onUp = () => {
      pipDrag.current.dragging = false;
      if (pipResize.current.active) {
        pipResize.current.active = false;
        setPipCanvasKey(k => k + 1); // סיימנו לשנות גודל → מציירים מחדש את מבט-העל לפי הגודל החדש
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // מתחילים גרירה (לחיצה על פס הכותרת)
  const startPipDrag = (e: React.MouseEvent) => {
    pipDrag.current.dragging = true;
    pipDrag.current.offsetX = e.clientX - pipPosRef.current.x;
    pipDrag.current.offsetY = e.clientY - pipPosRef.current.y;
    e.preventDefault();
  };

  // מתחילים שינוי-גודל (לחיצה על אחת מהידיות בגבולות). dir = כיוון: n/s/e/w וצירופים.
  const startPipResize = (dir: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = pipResize.current;
    r.active = true;
    r.dir = dir;
    r.startX = e.clientX;
    r.startY = e.clientY;
    r.startLeft = pipPosRef.current.x;
    r.startTop = pipPosRef.current.y;
    r.startW = pipSizeRef.current.w;
    r.startH = pipSizeRef.current.h;
  };

  // רשימת הידיות: 4 שוליים + 4 פינות, כל אחת עם המיקום והסמן המתאים
  const pipHandles = [
    { dir: 'n',  cls: 'top-0 left-0 right-0 h-1 cursor-ns-resize' },
    { dir: 's',  cls: 'bottom-0 left-0 right-0 h-1 cursor-ns-resize' },
    { dir: 'e',  cls: 'top-0 bottom-0 right-0 w-1 cursor-ew-resize' },
    { dir: 'w',  cls: 'top-0 bottom-0 left-0 w-1 cursor-ew-resize' },
    { dir: 'ne', cls: 'top-0 right-0 w-3 h-3 cursor-nesw-resize' },
    { dir: 'nw', cls: 'top-0 left-0 w-3 h-3 cursor-nwse-resize' },
    { dir: 'se', cls: 'bottom-0 right-0 w-3 h-3 cursor-nwse-resize' },
    { dir: 'sw', cls: 'bottom-0 left-0 w-3 h-3 cursor-nesw-resize' },
  ];

  useEffect(() => {
    if (viewMode === ViewMode.POV1) {
      setLayers(prev => ({ ...prev, horizon: false }));
    } else {
      setLayers(prev => ({ ...prev, horizon: false }));
    }
  }, [viewMode]);
    // ===== מאזין כפתורי גיימפאד: B1=החלפת שליטה, B3=POV, B4=תפריט לייאאוט, B10-13=דפדוף =====
  useEffect(() => {
    // סדר 4 הלייאאוטים לצורך דפדוף עם B11/B13 (ימין/שמאל)
    const LAYOUT_ORDER = [
      ScreenLayout.FULL_VIDEO,
      ScreenLayout.SPLIT_VIDEO_VIDEO,
      ScreenLayout.SPLIT_VIDEO_MAP,
      ScreenLayout.MAP_TWO_VIDEO,
    ];
    // סדר 3 ה-POV לצורך מחזור עם B3 (POV4 לא נכלל — נבחר רק בעכבר)
    const POV_CYCLE = [ViewMode.POV1, ViewMode.POV2, ViewMode.POV3];

    // זיכרון מצב-קודם לכל כפתור, כדי לפעול רק ברגע הלחיצה (לא בכל פריים שהוא מוחזק)
    const prev: Record<string, boolean> = {};
    let raf = 0;

    const isPs = (p: Gamepad | null) => !!p && /dualsense|dualshock|wireless controller|054c|sony/i.test(p.id);

    // כפתור לחוץ באחד ממכשירי ה-Thrustmaster (לא הגה, לא שלט PS)
    const anyPressed = (idx: number) => {
      const pads = (navigator.getGamepads?.() || []);
      for (const p of pads) {
        if (!p) continue;
        if (/g920|logitech|racing wheel/i.test(p.id)) continue; // הגה
        if (isPs(p)) continue;                                   // שלט PS מטופל בנפרד
        if (p.buttons[idx]?.pressed) return true;
      }
      return false;
    };

    // כפתור לחוץ בשלט PS בלבד
    const psPressed = (idx: number) => {
      const pads = (navigator.getGamepads?.() || []);
      for (const p of pads) {
        if (isPs(p) && p!.buttons[idx]?.pressed) return true;
      }
      return false;
    };
    const psJustPressed = (key: string, idx: number) => {
      const now = psPressed(idx);
      const fired = now && !prev[key];
      prev[key] = now;
      return fired;
    };
    // לחיצה חדה: true רק בפריים שבו הכפתור עבר מ"משוחרר" ל"לחוץ"
    const justPressed = (key: string, idx: number) => {
      const now = anyPressed(idx);
      const fired = now && !prev[key];
      prev[key] = now;
      return fired;
    };

    const loop = () => {
      const st = useTelemetryStore.getState();

      // --- B1: פריסות עם 2 חוזי → מעביר שליטה; פריסות עם חוזי אחד → מחליף את תוכן החלונית ---
      if (justPressed('b1', 1)) {
        const layout = st.screenLayout;
        if (layout === ScreenLayout.SPLIT_VIDEO_VIDEO) {
          // חצי-חצי חוזי: מעבירים שליטה בין 1 ל-2
          st.setActivePane(st.activePane === 1 ? 2 : 1);
        } else if (layout === ScreenLayout.MAP_TWO_VIDEO) {
          // חצי מפה + 2 רבעים: מעבירים שליטה בין 2 ל-3
          st.setActivePane(st.activePane === 2 ? 3 : 2);
        } else if (layout === ScreenLayout.FULL_VIDEO) {
          // מסך מלא: מחליפים את תוכן החלונית לכלי האחר
          st.setVideoSlot(1, st.videoSlot1 === 'drone' ? 'robot' : 'drone');
        } else if (layout === ScreenLayout.SPLIT_VIDEO_MAP) {
          // חצי מפה + חוזי (חלונית החוזי היא slot2): מחליפים את תוכנה לכלי האחר
          st.setVideoSlot(2, st.videoSlot2 === 'drone' ? 'robot' : 'drone');
        }
      }

      // --- B3: מחזור בין POV1→POV2→POV3 (POV4 לא נכלל) ---
      if (justPressed('b3', 3)) {
        const cur = st.viewMode;
        const i = POV_CYCLE.indexOf(cur);
        const next = POV_CYCLE[(i + 1) % POV_CYCLE.length]; // אם היינו ב-POV4, i=-1 → נעבור ל-POV1
        st.setViewMode(next);
      }

      // --- B4: פותח את התפריט (סמן מתחיל על הפריסה הנוכחית); אם פתוח — בוחר וסוגר ---
      if (justPressed('b4', 4)) {
        if (st.layoutMenuOpen) {
          st.setScreenLayout(LAYOUT_ORDER[st.layoutCursor]); // מחיל את מה שהסמן עומד עליו
          st.closeLayoutMenu();
        } else {
          const cur = LAYOUT_ORDER.indexOf(st.screenLayout);
          st.setLayoutCursor(cur < 0 ? 0 : cur);             // הסמן מתחיל על הנוכחי
          st.openLayoutMenu();
        }
      }

      // --- B10/12/11/13: מזיזים רק את הסמן בתפריט (לא משנים את המסך) ---
      if (st.layoutMenuOpen) {
        // התפריט מסודר כרשת 2x2:  0 1 / 2 3
        //  B11 ימינה, B13 שמאלה, B12 למטה, B10 למעלה
        let c = st.layoutCursor;
        if (justPressed('b11', 11)) c = c % 2 === 0 ? c + 1 : c;        // ימינה בתוך השורה
        if (justPressed('b13', 13)) c = c % 2 === 1 ? c - 1 : c;        // שמאלה בתוך השורה
        if (justPressed('b12', 12)) c = c < 2 ? c + 2 : c;             // שורה למטה
        if (justPressed('b10', 10)) c = c >= 2 ? c - 2 : c;            // שורה למעלה
        if (c !== st.layoutCursor) st.setLayoutCursor(c);
      } else {
        prev['b10'] = anyPressed(10); prev['b11'] = anyPressed(11);
        prev['b12'] = anyPressed(12); prev['b13'] = anyPressed(13);
      }
      // ===== כפתורי השלט PS — פעילים רק כששלט PS מחובר וגם מצב הניהוג 'A' =====
      // B9=תפריט לייאאוט (פתיחה/בחירה+סגירה). כשהתפריט פתוח: משולש/עיגול/ריבוע/איקס = חצים.
      // כשהתפריט סגור: B3=שיגור, B1=POV, B0=מעקב, B2=החלפת חלונית.
      const psActive = st.steerMode === 'A' && (navigator.getGamepads?.() || []).some(isPs);

      if (psActive) {
        // B9 — פותח/בוחר+סוגר את תפריט הלייאאוט
        if (psJustPressed('psLayout', 9)) {
          if (st.layoutMenuOpen) { st.setScreenLayout(LAYOUT_ORDER[st.layoutCursor]); st.closeLayoutMenu(); }
          else { const cur = LAYOUT_ORDER.indexOf(st.screenLayout); st.setLayoutCursor(cur < 0 ? 0 : cur); st.openLayoutMenu(); }
        }

        if (st.layoutMenuOpen) {
          // תפריט פתוח: רשת 2x2 (0 1 / 2 3). עיגול(1)=ימין, ריבוע(2)=שמאל, איקס(0)=מטה, משולש(3)=מעלה
          let c = st.layoutCursor;
          if (psJustPressed('psRight', 1)) c = c % 2 === 0 ? c + 1 : c;
          if (psJustPressed('psLeft', 2))  c = c % 2 === 1 ? c - 1 : c;
          if (psJustPressed('psDown', 0))  c = c < 2 ? c + 2 : c;
          if (psJustPressed('psUp', 3))    c = c >= 2 ? c - 2 : c;
          if (c !== st.layoutCursor) st.setLayoutCursor(c);
          // בזמן שהתפריט פתוח — "בולעים" את התפקידים הסגורים כדי שלא יזלגו בסגירה
          prev['psTri'] = psPressed(3); prev['psCir'] = psPressed(1);
          prev['psX'] = psPressed(0);   prev['psSq'] = psPressed(2);
        } else {
          // תפריט סגור: התפקידים האמיתיים
          // משולש — לא מבצע המראה יותר. ההמראה עברה לחץ העליון (מטופל ב-Robot.tsx).
          if (psJustPressed('psCir', 1)) {                                     // עיגול — POV
            const i = POV_CYCLE.indexOf(st.viewMode);
            st.setViewMode(POV_CYCLE[(i + 1) % POV_CYCLE.length]);
          }
          if (psJustPressed('psX', 0)) st.toggleDroneManual();                // איקס — מעקב/ריחוף
          if (psJustPressed('psSq', 2)) {                                      // ריבוע — החלפת חוזי
            const layout = st.screenLayout;
            if (layout === ScreenLayout.SPLIT_VIDEO_VIDEO) st.setActivePane(st.activePane === 1 ? 2 : 1);
            else if (layout === ScreenLayout.MAP_TWO_VIDEO) st.setActivePane(st.activePane === 2 ? 3 : 2);
            else if (layout === ScreenLayout.FULL_VIDEO) st.setVideoSlot(1, st.videoSlot1 === 'drone' ? 'robot' : 'drone');
            else if (layout === ScreenLayout.SPLIT_VIDEO_MAP) st.setVideoSlot(2, st.videoSlot2 === 'drone' ? 'robot' : 'drone');
          }
          // בזמן שהתפריט סגור — "בולעים" את תפקידי-החצים כדי שלא יזלגו בפתיחה
          prev['psRight'] = psPressed(1); prev['psLeft'] = psPressed(2);
          prev['psDown']  = psPressed(0); prev['psUp']   = psPressed(3);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
    // ברירת מחדל של השכבות לפי מספר הסשן:
  // סשן 1 — גם אוגמנטציה וגם סימבולוגיה דלוקות.
  // סשן 2 והלאה — רק סימבולוגיה דלוקה (אוגמנטציה כבויה).
  // בכל מקרה אפשר להדליק/לכבות ידנית מתפריט השכבות אחרי תחילת הסשן.
  useEffect(() => {
    if (appPhase !== 'session' || currentSessionNumber == null) return;
    const augOn = currentSessionNumber === 1;
    setLayers(prev => ({
      ...prev,
      augmentation: augOn,
      predictive: augOn,
      hillOverlay: augOn,
      symbology: true,
      compass: true,
      path: true,
      centerAttitude: true,
      horizon: false,
    }));
  }, [appPhase, currentSessionNumber, resetRequest]);

  return (
    <div ref={containerRef} className="w-full h-screen bg-black relative overflow-hidden select-none">
      <div className="absolute inset-0 flex flex-row gap-[2px] p-[2px] z-[5] pointer-events-none">
        {screenLayout === ScreenLayout.MAP_TWO_VIDEO ? (
          // 2 רבעי חוזי (שמאל, זה מעל זה) + חצי מפה (ימין)
          <>
            <div className="flex-1 h-full flex flex-col gap-[2px]">
              <div
                ref={view2Ref}
                onMouseDown={() => setActivePane(2)}
                className={`flex-1 w-full relative pointer-events-auto rounded-sm overflow-hidden border-3 transition-colors ${activePane === 2 ? 'border-green-400' : 'border-transparent'}`}
              >
                <VideoSourcePicker slot={2} />
                                <DroneOffCover slot={2} />
                {sym && (
                  <InfoBar source={videoSlot2} showHorizon={layers.horizon} showCompass={layers.compass} showCenterAttitude={layers.centerAttitude} scale={0.42} />
                )}
              </div>
              <div
                ref={view3Ref}
                onMouseDown={() => setActivePane(3)}
                className={`flex-1 w-full relative pointer-events-auto rounded-sm overflow-hidden border-3 transition-colors ${activePane === 3 ? 'border-green-400' : 'border-transparent'}`}
              >
                <VideoSourcePicker slot={1} />
                                <DroneOffCover slot={1} />
                {sym && (
                  <InfoBar source={videoSlot1} showHorizon={layers.horizon} showCompass={layers.compass} showCenterAttitude={layers.centerAttitude} scale={0.42} />
                )}
              </div>
            </div>
            <div ref={view1Ref} className="flex-1 h-full relative rounded-sm overflow-hidden" />
          </>
        ) : screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO ? (
          <>
            <div
              ref={view1Ref}
              onMouseDown={() => setActivePane(1)}
              className={`flex-1 h-full relative pointer-events-auto rounded-sm overflow-hidden border-3 transition-colors ${activePane === 1 ? 'border-green-400' : 'border-transparent'}`}
            >
              <VideoSourcePicker slot={1} />
                            <DroneOffCover slot={1} />
              {sym && (
                <InfoBar source={videoSlot1} showHorizon={layers.horizon} showCompass={layers.compass} showCenterAttitude={layers.centerAttitude} scale={0.6} />
              )}
            </div>
            <div
              ref={view2Ref}
              onMouseDown={() => setActivePane(2)}
              className={`flex-1 h-full relative pointer-events-auto rounded-sm overflow-hidden border-3 transition-colors ${activePane === 2 ? 'border-green-400' : 'border-transparent'}`}
            >
              <VideoSourcePicker slot={2} />
                            <DroneOffCover slot={2} />
              {sym && (
                <InfoBar source={videoSlot2} showHorizon={layers.horizon} showCompass={layers.compass} showCenterAttitude={layers.centerAttitude} scale={0.6} />
              )}
            </div>
          </>
                ) : screenLayout === ScreenLayout.SPLIT_VIDEO_MAP ? (
          <>
            <div
              ref={view2Ref}
              onMouseDown={() => setActivePane(2)}
              className={`flex-1 h-full relative pointer-events-auto rounded-sm overflow-hidden border-3 transition-colors ${activePane === 2 ? 'border-green-400' : 'border-transparent'}`}
            >
              <VideoSourcePicker slot={2} />
                            <DroneOffCover slot={2} />
              {sym && (
                <InfoBar source={videoSlot2} showHorizon={layers.horizon} showCompass={layers.compass} showCenterAttitude={layers.centerAttitude} scale={0.6} />
              )}
            </div>
            <div ref={view1Ref} className="flex-1 h-full relative rounded-sm overflow-hidden" />
          </>
        ) : (
          <div ref={view1Ref} className="w-full h-full relative pointer-events-auto">
            <VideoSourcePicker slot={1} />
                        <DroneOffCover slot={1} />
            {sym && (
              <InfoBar source={videoSlot1} showHorizon={layers.horizon} showCompass={layers.compass} showCenterAttitude={layers.centerAttitude} scale={1} />
            )}
            {/* מסך אימון + מצב ניהוג B + מסך מלא: רק שני הצלבים (המרכזי + המעוגל), בלי סימבולוגיה נוספת */}
            {!sym && steerMode === 'B' && videoSlot1 === 'robot' && (
              <InfoBar source="robot" showHorizon={false} showCompass={false} showCenterAttitude={false} scale={1} />
            )}
          </div>
        )}
      </div>

      <Canvas shadows eventSource={containerRef} className="pointer-events-none">
        <Physics>
          <World practice={practice} showHillOverlay={layers.hillOverlay} showCompass={sym && layers.symbology && layers.compass} />
          <Robot hideVisuals={true} />
        </Physics>

        <DroneControls />

                      {/* ===== אזור 1 (view1) ===== */}
        <View track={view1Ref}>
          <World visualsOnly={true} practice={practice} showHillOverlay={layers.hillOverlay} />
          {screenLayout === ScreenLayout.SPLIT_VIDEO_MAP || screenLayout === ScreenLayout.MAP_TWO_VIDEO ? (
            // אזור 1 = מפה
            <>
              <RobotVisuals mode={ViewMode.MAP} sync={true} />
              <MapLabels />
            </>
          ) : screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO ? (
            // פריסה מפוצלת חוזי+חוזי: אזור 1 לפי הבורר של slot1
            videoSlot1 === 'drone' ? (
              <>
                <RobotVisuals mode={ViewMode.OVERHEAD} sync={true} hideCameras={true} showPredictive={sym && layers.predictive} />
                <DroneVisuals camera={true} forceActive={true} />
              </>
            ) : (
              <>
                <RobotVisuals sync={true} showPredictive={sym && layers.predictive} hideCameras={false} />
                <DroneVisuals camera={false} />
              </>
            )
          ) : (
            // פריסת מסך-מלא: לפי הבורר של slot1
            videoSlot1 === 'drone' ? (
              <>
                <RobotVisuals sync={true} hideCameras={true} showPredictive={sym && layers.predictive} />
                <DroneVisuals camera={true} forceActive={true} />
              </>
            ) : (
              <>
                <RobotVisuals sync={true} showPredictive={sym && layers.predictive} hideCameras={false} />
                <DroneVisuals camera={false} />
              </>
            )
          )}
        </View>

        {/* ===== אזור 2 (view2) ===== */}
        {(screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO || screenLayout === ScreenLayout.SPLIT_VIDEO_MAP || screenLayout === ScreenLayout.MAP_TWO_VIDEO) && (
          <View track={view2Ref}>
            <World visualsOnly={true} practice={practice} showHillOverlay={layers.hillOverlay} />
            {videoSlot2 === 'drone' ? (
              <>
                <RobotVisuals mode={ViewMode.OVERHEAD} sync={true} hideCameras={true} showPredictive={sym && layers.predictive} />
                <DroneVisuals camera={true} forceActive={true} />
              </>
              ) : (
                <>
                  <RobotVisuals sync={true} showPredictive={sym && layers.predictive} />
                  <DroneVisuals camera={false} />
                </>
              )}
          </View>
        )}

        {/* ===== אזור 3 (view3) — רק בפריסת מפה + 2 חוזי ===== */}
        {screenLayout === ScreenLayout.MAP_TWO_VIDEO && (
          <View track={view3Ref}>
            <World visualsOnly={true} practice={practice} showHillOverlay={layers.hillOverlay} />
            {videoSlot1 === 'drone' ? (
              <>
                <RobotVisuals mode={ViewMode.OVERHEAD} sync={true} hideCameras={true} showPredictive={sym && layers.predictive} />
                <DroneVisuals camera={true} forceActive={true} />
              </>
            ) : (
              <>
                <RobotVisuals sync={true} showPredictive={sym && layers.predictive} />
                <DroneVisuals camera={false} />
              </>
            )}
          </View>
        )}
      </Canvas>

      {/* ה-InfoBar עבר לתוך כל חלונית חוזי (ראי הפריסה למעלה). */}

      {(appPhase === 'training' || appPhase === 'session') && <LayersMenu layers={layers} setLayers={setLayers} />}
            {(appPhase === 'training' || appPhase === 'session') && <LayoutMenu />}
      {(appPhase === 'training' || appPhase === 'session') && <SettingsMenu />}
      {/* כפתור מבט-על (PiP) — מתחת לכפתור השכבות, אותו גודל וסגנון */}
      {(appPhase === 'training' || appPhase === 'session') && (
        <button
          onClick={() => setPipOpen(o => !o)}
          className="absolute top-16 left-4 z-50 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center overflow-hidden pointer-events-auto w-10 h-10"
          title="מבט-על (Picture in Picture)"
        >
          {/* אייקון PiP מצויר: מסגרת גדולה + חלון קטן בפינה עליונה-שמאלית */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="15" rx="2" stroke="white" strokeWidth="1.4" opacity="0.9" />
            <rect x="5" y="6" width="7" height="6" rx="1" fill="white" opacity="0.9" />
          </svg>
        </button>
      )}
      {/* כפתור מצב ניהוג — לחיצה מחליפה A→B→C */}
      {(appPhase === 'training' || appPhase === 'session') && (
        <button
          onClick={() => {
            const cur = useTelemetryStore.getState().steerMode;
            const next = cur === 'A' ? 'B' : cur === 'B' ? 'C' : 'A';
            useTelemetryStore.getState().setSteerMode(next);
          }}
          className="absolute top-28 left-4 z-50 w-10 h-10 flex items-center justify-center pointer-events-auto rounded-full border border-white/25 bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title={`מצב ניהוג: ${steerMode} · לחיצה להחלפה`}
        >
          <span className="text-white/80 font-sans text-xs font-bold tabular-nums">
            {steerMode}
          </span>
        </button>
      )}

      {/* ================= חלונית מבט-העל ================= */}
      {/* קנבס עצמאי משלה — מנותק מהמסך הראשי, ולכן לא הופך שקוף מעל גבעות */}
      {pipOpen && (
        <div
          ref={pipBoxRef}
          className="absolute z-[80] pointer-events-auto rounded-lg overflow-hidden shadow-2xl border border-white/30 bg-black flex flex-col"
          style={{
            left: `${pipPosRef.current.x}px`,
            top: `${pipPosRef.current.y}px`,
            width: `${pipSizeRef.current.w}px`,
            height: `${pipSizeRef.current.h}px`,
          }}
        >
          {/* אזור התמונה: גרירה על כל השטח, קנבס תלת-מימד עצמאי, ✕ צף בפינה */}
          <div
            onMouseDown={startPipDrag}
            className="flex-1 relative bg-black cursor-move"
          >
            <Canvas key={pipCanvasKey} className="w-full h-full">
              <Suspense fallback={null}>
                <World visualsOnly={true} practice={practice} showHillOverlay={layers.hillOverlay} />
                <RobotVisuals mode={ViewMode.OVERHEAD} sync={true} />
              </Suspense>
            </Canvas>

            {/* כפתור סגירה צף בפינה עליונה-ימנית */}
            <button
              onClick={() => setPipOpen(false)}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-1 right-1 z-[82] w-5 h-5 flex items-center justify-center rounded bg-black/50 hover:bg-black/80 text-white/80 hover:text-white text-xs leading-none pointer-events-auto transition-colors"
              title="סגור"
            >
              ✕
            </button>
          </div>

          {/* ידיות שינוי-הגודל בכל הגבולות והפינות */}
          {pipHandles.map(h => (
            <div
              key={h.dir}
              onMouseDown={startPipResize(h.dir)}
              className={`absolute z-[81] ${h.cls}`}
            />
          ))}
        </div>
      )}

      <ExperimentUI />
    </div>
  );
}