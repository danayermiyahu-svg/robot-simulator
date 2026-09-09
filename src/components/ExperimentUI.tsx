// File: src/components/ExperimentUI.tsx
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useTelemetryStore } from '../store';

export function ExperimentUI() {
  const appPhase = useTelemetryStore(s => s.appPhase);
  const menuOpen = useTelemetryStore(s => s.menuOpen);
  const sessionComplete = useTelemetryStore(s => s.sessionComplete);
  const setSubjectAndStart = useTelemetryStore(s => s.setSubjectAndStart);
  const openMenu = useTelemetryStore(s => s.openMenu);
  const closeMenu = useTelemetryStore(s => s.closeMenu);
  const goToTraining = useTelemetryStore(s => s.goToTraining);
  const startSession = useTelemetryStore(s => s.startSession);
  const downloadCSV = useTelemetryStore(s => s.downloadCSV);
  const sessionRecords = useTelemetryStore(s => s.sessionRecords);

  const [idInput, setIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');

  // ===== מסך רישום נבדק (כרטיס ממורכז) =====
  if (appPhase === 'registration') {
    return (
      <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
        <div className="bg-black/70 border border-white/20 rounded-xl p-8 w-96 font-sans text-white shadow-2xl" dir="ltr">

          <label className="block text-sm text-white/80 mb-1">Full Name</label>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            className="w-full mb-6 px-3 py-2 bg-black/50 border border-white/30 rounded text-white outline-none focus:border-white/60"
          />

          <label className="block text-sm text-white/80 mb-1">Subject Number</label>
          <input
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            className="w-full mb-4 px-3 py-2 bg-black/50 border border-white/30 rounded text-white outline-none focus:border-white/60"
          />

          <button
            onClick={() => { if (idInput.trim()) setSubjectAndStart(idInput.trim(), nameInput.trim()); }}
            disabled={!idInput.trim()}
            className="w-full py-2 rounded bg-white text-black font-bold disabled:bg-white/30 disabled:text-white/50 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ===== לוח כפתורים בפינה ימנית-תחתונה =====
  return (
    <div className="absolute bottom-6 right-6 z-[100] pointer-events-auto font-sans" dir="ltr">
      {(appPhase === 'training' || appPhase === 'session') && (
        <>
          {/* הכפתור — מוצג תמיד */}
          <button
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-black/70 border border-white/30 text-white hover:bg-black/90 transition-colors backdrop-blur-md shadow-xl"
            title="Menu"
          >
            {sessionComplete ? <span className="text-sm font-bold">Next ›</span> : <Menu size={18} />}
          </button>

          {/* התפריט — מופיע לצד הכפתור רק כשהוא פתוח */}
          {menuOpen && (
            <div className="absolute bottom-0 right-12 bg-black/80 border border-white/20 rounded-lg p-2 w-40 text-white shadow-xl backdrop-blur-md">
              <div className="flex flex-col gap-2">
                <button onClick={() => goToTraining()} className="w-full py-1 rounded border border-white/30 hover:bg-white/10 transition-colors text-xs">
                  Training
                </button>
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => startSession(n)} className="w-full py-1 rounded border border-white/30 hover:bg-white/10 transition-colors text-xs">
                    Session {n}
                  </button>
                ))}
                <button onClick={() => downloadCSV()} className="w-full py-1 mt-1 rounded bg-white text-black font-bold hover:bg-white/80 transition-colors text-xs">
                  Finish &amp; Download ({sessionRecords.length})
                </button>

              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}