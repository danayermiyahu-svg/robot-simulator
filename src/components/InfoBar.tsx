// File: src/components/InfoBar.tsx
import { useEffect, useState } from 'react';
import { useTelemetryStore, ViewMode } from '../store';
import { useGamepads } from '../hooks/useGamepads';
import { Pov4Panel } from './Pov4Panel';
import { CompassBar } from './CompassBar';

export function InfoBar({ 
  showHorizon = true, 
  showCompass = true, 
  showAttitude = true,
  showCenterAttitude = true,
  scale = 1,
  source = 'robot'
}: { 
  showHorizon?: boolean; 
  showCompass?: boolean; 
  showAttitude?: boolean;
  showCenterAttitude?: boolean;
  scale?: number;
  source?: 'robot' | 'drone';
}) {
  const pitch = useTelemetryStore(s => s.pitch);
  const roll = useTelemetryStore(s => s.roll);
  const cameraYaw = useTelemetryStore(s => s.cameraYaw);
  const cameraPitch = useTelemetryStore(s => s.cameraPitch);
  const aimScreenX = useTelemetryStore(s => s.aimScreenX);
  const aimScreenY = useTelemetryStore(s => s.aimScreenY);
  const aimVisible = useTelemetryStore(s => s.aimVisible);
    const droneAimX = useTelemetryStore(s => s.droneAimX);
  const droneAimY = useTelemetryStore(s => s.droneAimY);
    const droneManual = useTelemetryStore(s => s.droneManual);
      const steerModeForAim = useTelemetryStore(s => s.steerMode);
  const viewMode = useTelemetryStore(s => s.viewMode);
  const steerMode = useTelemetryStore(s => s.steerMode);
  const setViewMode = useTelemetryStore(s => s.setViewMode);
  const gamepads = useGamepads();
  const [manualPanelOpen, setManualPanelOpen] = useState(true);
    const [povMenuOpen, setPovMenuOpen] = useState(false);

  // --- קביעת גובה קו האופק לפי סוג המצלמה הפעילה ---
  let horizonOffset = -135; 
  
  if (viewMode === ViewMode.POV1) {
    horizonOffset = 0;  
  } else if (viewMode === ViewMode.POV2) {
    horizonOffset = -100; 
  } else if (viewMode === ViewMode.POV3) {
    horizonOffset = -135; 
  }


  // === נעילה לפי מצב התצוגה ===
  // POV3 = נעולים לעולם: הצלב והפסים זזים, הנקודות והקשתות קפואות.
  // POV1/POV2 = נעולים לרובוט: הצלב והפסים קפואים, הנקודות והקשתות זזות.
  const worldLocked = viewMode === ViewMode.POV3;
  const attitudeWorldLocked = viewMode !== ViewMode.POV4;
  const pitchShift = worldLocked ? 0 : pitch * 4;
  const rollArcRot = worldLocked ? 0 : ((viewMode === ViewMode.POV1 || viewMode === ViewMode.POV2) ? -roll : roll);
  const robotGroupTransform = worldLocked
    ? `translateY(${-pitch * 5}px) rotate(${roll}deg)`
    : 'none';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') setViewMode(ViewMode.POV1);
      if (e.key === '2') setViewMode(ViewMode.POV2);
      if (e.key === '3') setViewMode(ViewMode.POV3);
      if (e.key === '4') setViewMode(ViewMode.POV4);
      // רחפן: N = מעקב↔ידני. (G בוטל — השליטה נקבעת בלחיצה על חלונית)
      if (e.key === 'n' || e.key === 'N') useTelemetryStore.getState().toggleDroneManual();
      
      if (e.key === '9') {
        useTelemetryStore.getState().downloadCSV();
      }

      // Tab — מחזר בין מצבי הניהוג A→B→C
      if (e.key === 'Tab') {
        e.preventDefault(); // מבטל את מעבר הפוקוס הרגיל של Tab
        const cur = useTelemetryStore.getState().steerMode;
        const next = cur === 'A' ? 'B' : cur === 'B' ? 'C' : 'A';
        useTelemetryStore.getState().setSteerMode(next);
        console.log("Mode Switched (keyboard) to:", next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewMode]);

  // צבע קווי הגבול לפי קרבה ל-30 מעלות (אזהרה מתחילה ב-20 מעלות)
  const topLimitColor = pitch > 15 ? '#ff3b30' : '#ffffff';
  const bottomLimitColor = pitch < -15 ? '#ff3b30' : '#ffffff';
  const thinBlackOutline = '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {showCompass && <CompassBar source={source} />}
      {/* כפתור POV מצומצם שנפתח לתפריט + פאנל POV4 — רק לרובוט */}
      {source === 'robot' && (
      <div className="absolute top-10 right-2 z-[60] flex flex-col gap-1.5 pointer-events-auto w-fit items-end">
        {/* הכפתור — כתוב עליו רק POV, ממוקם מתחת לשורת הרובוט/הרחפן */}
        <button
          onClick={() => setPovMenuOpen(o => !o)}
          className="px-3 py-1 bg-black/70 border border-white/30 backdrop-blur-md text-white font-sans font-bold text-xs rounded-lg shadow-xl hover:bg-black/90 transition-colors"
          title="Select POV"
        >
          POV
        </button>

        {/* התפריט — נפתח מתחת לכפתור רק בלחיצה, עם שוליים צרים */}
        {povMenuOpen && (
          <div className="bg-black/70 border border-white/30 backdrop-blur-md text-white font-sans p-1.5 text-xs rounded-lg shadow-xl">
            <div className="flex gap-1.5">
              {[
                { mode: ViewMode.POV1, label: 'Front' },
                { mode: ViewMode.POV2, label: 'Back' },
                { mode: ViewMode.POV3, label: '3rd Person' },
                { mode: ViewMode.POV4, label: 'Manual' },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode === ViewMode.POV4) {
                      if (viewMode === ViewMode.POV4) {
                        setManualPanelOpen(o => !o);   // כבר ב-Manual → פתיחה/סגירה של הפאנל
                      } else {
                        useTelemetryStore.getState().setViewMode(ViewMode.POV4);
                        setManualPanelOpen(true);       // מעבר ל-Manual → הפאנל נפתח
                      }
                    } else {
                      useTelemetryStore.getState().setViewMode(mode);
                    }
                  }}
                  className={`px-2.5 py-1 border rounded-md transition-colors ${viewMode === mode ? 'bg-white text-black font-bold border-white' : 'border-white/30 text-white/60 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewMode === ViewMode.POV4 && manualPanelOpen && <Pov4Panel />}
      </div>
      )}

      {/* --- הסמן המרכזי (קבוצת הרובוט): צלב + 2 פסים בצד --- */}
      {/* קפוא ב-POV1/2, נשען ב-POV3 לפי robotGroupTransform */}
      {true && (
        <div
          className="absolute top-1/2 left-1/2 pointer-events-none opacity-80 z-40"
          style={{
            transform: robotGroupTransform,
            transformOrigin: 'center',
            transition: 'transform 0.05s linear'
          }}
        >
          {/* ארבע זרועות הצלב */}
          <div className="absolute bottom-1 left-[-1.75px] w-[3.5px] h-6 bg-white border border-black/80"></div>
          <div className="absolute top-1 left-[-1.75px] w-[3.5px] h-6 bg-white border border-black/80"></div>
          <div className="absolute right-1 top-[-1.75px] w-6 h-[3.5px] bg-white border border-black/80"></div>
          <div className="absolute left-1 top-[-1.75px] w-6 h-[3.5px] bg-white border border-black/80"></div>
        </div>
      )}

      {/* --- הצלב המעוגל (יעד המצלמה) - מופיע רק במצב ניהוג ב', וזז לפי כיוון המצלמה --- */}
      {/* --- הצלב המעוגל (יעד הרובוט) - מיקומו מחושב בהיטל אמיתי ב-Robot.tsx --- */}
      {steerMode === 'B' && aimVisible && source === 'robot' && (
        <div
          className="absolute top-1/2 left-1/2 pointer-events-none opacity-90 z-40"
          style={{
            transform: `translate(-50%, -50%) translateX(${aimScreenX}px) translateY(${aimScreenY}px) rotate(45deg)`,
            transition: 'transform 0.03s linear'
          }}
        >
          <svg width="60" height="60" viewBox="-30 -30 60 60" style={{ overflow: 'visible' }}>
            <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
              <path d="M -6 -14 A 16 16 0 0 1 6 -14" />
              <path d="M -6 14 A 16 16 0 0 0 6 14" />
              <path d="M -14 -6 A 16 16 0 0 0 -14 6" />
              <path d="M 14 -6 A 16 16 0 0 1 14 6" />
            </g>
          </svg>
        </div>
      )}
      {/* --- הצלב המעוגל של הרחפן: מוזז ע"י AXIS 9 --- */}
      {source === 'drone' && droneManual && steerModeForAim !== 'A' && (
        <div
          className="absolute top-1/2 left-1/2 pointer-events-none opacity-90 z-40"
          style={{
            transform: `translate(-50%, -50%) translateX(${droneAimX}px) translateY(${droneAimY}px) rotate(45deg)`,
            transition: 'transform 0.03s linear'
          }}
        >
          <svg width="60" height="60" viewBox="-30 -30 60 60" style={{ overflow: 'visible' }}>
            <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
              <path d="M -6 -14 A 16 16 0 0 1 6 -14" />
              <path d="M -6 14 A 16 16 0 0 0 6 14" />
              <path d="M -14 -6 A 16 16 0 0 0 -14 6" />
              <path d="M 14 -6 A 16 16 0 0 1 14 6" />
            </g>
          </svg>
        </div>
      )}
      {/* --- מחוון Pitch ו-Roll סביב צלב המצלמה --- */}
      {showCenterAttitude && (
        <>
        {/* נקודת אמצע קבועה — תמיד במרכז המסך, עוגן ייחוס לאפס. מוצג גם לרחפן. */}
        <div
          className="absolute top-1/2 left-1/2 pointer-events-none z-40 rounded-full bg-white border border-black/80"
          style={{
            width: '8px',
            height: '8px',
            transform: 'translate(-50%, -50%)',
            filter: 'drop-shadow(0 0 0.7px rgba(0,0,0,0.6))'
          }}
        ></div>
        {source === 'robot' && (<>
          {/* שכבה קבועה: סולם Pitch נע בתוך חלון (ללא מספרים) */}
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none z-40"
            style={{
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 0.7px rgba(0,0,0,0.6))'
            }}
          >
            <svg width="420" height="420" viewBox="-210 -210 420 420" style={{ overflow: 'visible' }}>
              {/* === נקודות ה-Pitch === נעות ב-POV1/2 (pitchShift), קפואות ב-POV3 */}
              <g style={{ transform: `translateY(${pitchShift}px)`, transition: 'transform 0.05s linear' }}>
                {[10, 20, 30].flatMap((A) =>
                  [1, -1].map((sign) => {
                    const y = sign * -A * 4;
                    const isLimit = A === 30;
                    const limitWarn =
                      isLimit && ((sign === 1 && pitch >= 15) || (sign === -1 && pitch <= -15));
                    const fill = isLimit ? (limitWarn ? '#ff3b30' : '#e8e8ea') : '#b6babf';
                    const r = isLimit ? (limitWarn ? 6 : 5) : 3;
                    return (
                      <circle key={`${A}-${sign}`} cx="0" cy={y} r={r} fill={fill} stroke="#000000" strokeWidth="0.5" />
                    );
                  })
                )}
              </g>
            </svg>
          </div>
      
          {/* שכבה שמסתובבת עם ה-Roll: הקשתות + שנתות הסקאלה ביחד (מקובעות לקשתות בכל המצבים) */}
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none z-40"
            style={{
              transform: `translate(-50%, -50%) translateY(${worldLocked ? -Math.sign(pitch) * Math.max(0, Math.abs(pitch * 5) - 40) : 0}px) rotate(${rollArcRot}deg)`,
              transition: 'transform 0.05s linear',
              filter: 'drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 0.7px rgba(0,0,0,0.6))'
            }}
          >
            <svg width="420" height="420" viewBox="-210 -210 420 420" style={{ overflow: 'visible' }}>
              <g stroke="#b6babf" fill="none" strokeWidth="2.6" strokeLinecap="round" opacity="1">
                {/* קשת ימין - רדיוס 180, מכסה את כל טווח ה-±30° (מחוץ לסקאלה) */}
                <path d="M 155.9 -90 A 180 180 0 0 1 155.9 90" />
                {/* קשת שמאל - רדיוס 180, מכסה את כל טווח ה-±30° (מחוץ לסקאלה) */}
                <path d="M -155.9 -90 A 180 180 0 0 0 -155.9 90" />
              </g>

              {/* === שנתות סרגל ה-Roll === הועברו לכאן כדי להיות מקובעות לקשתות: יושבות על הקשת (רדיוס 180) ונמשכות פנימה. */}
              {[1, -1].flatMap((side) =>
                [-30, -20, -10, 0, 10, 20, 30].map((b) => {
                  const rad = (b * Math.PI) / 180;
                  const c = Math.cos(rad);
                  const s = Math.sin(rad);
                  const isLimit = Math.abs(b) === 30;
                  const isZero = b === 0;
                  const isShortLine = Math.abs(b) === 10 || Math.abs(b) === 20;
                  const len = isLimit ? 16 : isZero ? 14 : isShortLine ? 4 : 9;
                  const sw = isLimit ? 1.7 : isZero ? 1.4 : 1.3;
                  const isWarningRange = Math.abs(roll) >= 15;
                  const baseDiagonal = (roll > 0 && b < 0) || (roll < 0 && b > 0);
                  const isCorrectDiagonal = worldLocked ? !baseDiagonal : ((viewMode === ViewMode.POV1 || viewMode === ViewMode.POV2) ? !baseDiagonal : baseDiagonal);
                  const lineStroke = isLimit && isWarningRange && isCorrectDiagonal ? '#ff3b30' : '#b6babf';
                  const ox = side * 180 * c;        // קצה חיצוני - יושב על הקשת
                  const oy = side * 180 * s;
                  const ix = side * (180 - len) * c; // קצה פנימי - נמשך פנימה לפי אורך השנת
                  const iy = side * (180 - len) * s;
                  return (
                    <line key={`${side}-${b}`} x1={ix} y1={iy} x2={ox} y2={oy} stroke={lineStroke} strokeWidth={sw} strokeLinecap="round" />
                  );
                })
              )}
            </svg>
          </div>
      
          {/* שני קווים אפורים (כמו הסקאלה) מצידי הצלב - קצרים, כמעט נוגעים בשנתות (עד 160). נעים עם הצלב. */}
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none z-40"
            style={{
              transform: `translate(-50%, -50%) ${worldLocked ? `translateY(${-pitch * 5}px) rotate(${roll}deg)` : ''}`.trim(),
              transition: 'transform 0.05s linear',
              filter: 'drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 0.7px rgba(0,0,0,0.6))'
            }}
          >
            <svg width="420" height="420" viewBox="-210 -210 420 420" style={{ overflow: 'visible' }}>
              <g stroke="#b6babf" fill="none" strokeWidth="2.6" strokeLinecap="round">
                <line x1="52" y1="0" x2="160" y2="0" />
                <line x1="-52" y1="0" x2="-160" y2="0" />
              </g>
            </svg>
          </div>
        </>)}
        </>
      )}

      {/* --- קו אופק דינמי על גבי המסך — לא לרחפן --- */}
      {showHorizon && source === 'robot' && (
        <div 
          className="absolute top-1/2 left-1/2 pointer-events-none opacity-80 z-30"
          style={{ 
            transform: `translateY(calc(${horizonOffset}px + ${pitch * 8}px)) rotate(${-roll}deg)`,
            transition: 'transform 0.05s linear'
          }}
        >
          <div className="absolute right-16 top-[-1.75px] w-[220px] h-[3.5px] bg-white border border-black/80" style={{ maskImage: 'linear-gradient(to left, black 10%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to left, black 10%, transparent 100%)' }}></div>
          <div className="absolute left-16 top-[-1.75px] w-[220px] h-[3.5px] bg-white border border-black/80" style={{ maskImage: 'linear-gradient(to right, black 10%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 10%, transparent 100%)' }}></div>
          <div className="absolute right-16 top-[-1.75px] w-[15px] h-[3.5px] bg-white border border-black/80 origin-right rotate-[-135deg]"></div>
          <div className="absolute left-16 top-[-1.75px] w-[15px] h-[3.5px] bg-white border border-black/80 origin-left rotate-[135deg]"></div>
        </div>
      )}

      {/* --- מחוון Pitch ו-Roll עגול (מד נטייה) — לא מוצג לרחפן --- */}
      {showAttitude && source === 'robot' && (
        <div className="absolute bottom-6 left-6 w-28 h-28 rounded-full border-2 border-white/40 bg-black/30 overflow-hidden z-50 pointer-events-none shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md">
          
          {/* קונטיינר מסתובב בהתאם לגלגול (Roll) */}
          <div 
            className="absolute inset-0"
            style={{ transform: `rotate(${attitudeWorldLocked ? 0 : roll}deg)`, transition: 'transform 0.05s linear' }}
          >
            {/* קונטיינר זז למעלה ולמטה בהתאם לעלרוד (Pitch) */}
            <div 
              className="absolute w-full"
              style={{ 
                height: '400%', 
                top: '-150%', 
                transform: `translateY(${attitudeWorldLocked ? 0 : pitch * 1.5}px)`,
                transition: 'transform 0.05s linear' 
              }}
            >
              {/* שמיים */}
              <div className="w-full h-1/2 bg-blue-500/70 border-b-[1.5px] border-white/80"></div>
              {/* אדמה */}
              <div className="w-full h-1/2 bg-[#8B5A2B]/70"></div>
              
              {/* סולם Pitch */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="w-12 h-[1.5px] bg-white/60 mb-5"></div>
                <div className="w-7 h-[1.5px] bg-white/60 mb-5"></div>
                
                <div className="w-7 h-[1.5px] bg-white/60 mt-5"></div>
                <div className="w-12 h-[1.5px] bg-white/60 mt-5"></div>
              </div>
            </div>
          </div>

          {/* צללית פנימית */}
          <div className="absolute inset-0 rounded-full border-[3.5px] border-black/20 pointer-events-none shadow-inner"></div>

          {/* סמל הרובוט - מעובה ומוגדל בצבע לבן */}
          <div 
            className="absolute top-1/2 left-1/2 w-16 flex items-center justify-between z-10"
            style={{
              transform: `translate(-50%, -50%) ${attitudeWorldLocked ? `translateY(${-pitch * 1.5}px) rotate(${roll}deg)` : ''}`.trim(),
              transition: 'transform 0.05s linear'
            }}
          >
            <div className="w-6 h-[3.5px] bg-white border border-black/80"></div>
            <div className="w-2 h-2 rounded-full bg-white border border-black/80"></div>
            <div className="w-6 h-[3.5px] bg-white border border-black/80"></div>
          </div>

          {/* טקסט הנתונים המספריים - מוסתר כרגע בהערה */}
          {/* <div className="absolute bottom-2 left-0 w-full text-center text-white font-mono text-[10px] font-bold z-10 tracking-wider" style={{ textShadow: thinBlackOutline }}>
            P:{pitch}° R:{roll}°
          </div>
          */}
        </div>
      )}


    </div>
  );
}