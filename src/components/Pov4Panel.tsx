// src/components/Pov4Panel.tsx
import { useState, useEffect } from 'react';
import { useTelemetryStore, Pov4Config } from '../store';

// כל סליידר: מפתח ב-store, תווית, טווח וצעד. ה-min של Y הוא 0 => חסימת "מתחת לאדמה".
const SLIDERS: { key: keyof Pov4Config; label: string; min: number; max: number; step: number }[] = [
  { key: 'posX',  label: 'Position X (Right/Left)',    min: -10,  max: 10,  step: 0.1 },
  { key: 'posY',  label: 'Position Y (Up/Down)',       min: 0,    max: 15,  step: 0.1 },
  { key: 'posZ',  label: 'Position Z (Forward/Back)',  min: -10,  max: 15,  step: 0.1 },
  { key: 'yaw',   label: 'Yaw',                        min: -180, max: 180, step: 1 },
  { key: 'pitch', label: 'Pitch',                      min: -90,  max: 90,  step: 1 },
  { key: 'roll',  label: 'Roll',                       min: -180, max: 180, step: 1 },
];

// שדה מספר שאפשר להקליד בו ישירות. שומר טקסט מקומי בזמן ההקלדה,
// ומעדכן את הערך האמיתי רק כשמסיימים (יציאה מהשדה או לחיצת Enter).
function ValueInput({
  value, min, max, step, onCommit,
}: { value: number; min: number; max: number; step: number; onCommit: (v: number) => void }) {
  const fmt = (v: number) => v.toFixed(step < 1 ? 1 : 0);
  const [text, setText] = useState(fmt(value));

  // אם הערך השתנה מבחוץ (הזזת סליידר / איפוס) — מסנכרנים את הטקסט בשדה
  useEffect(() => { setText(fmt(value)); }, [value]);

  const commit = (raw: string) => {
    let v = parseFloat(raw);
    if (isNaN(v)) { setText(fmt(value)); return; }  // קלט לא חוקי — חוזרים לערך הקודם
    if (v < min) v = min;
    if (v > max) v = max;
    onCommit(v);
    setText(fmt(v));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="w-14 text-center bg-black/40 border border-white/20 rounded text-white/90 tabular-nums outline-none focus:border-white/60 px-1 py-0.5"
      dir="ltr"
    />
  );
}

export function Pov4Panel() {
  const pov4 = useTelemetryStore(s => s.pov4);
  const setPov4 = useTelemetryStore(s => s.setPov4);
  const resetPov4 = useTelemetryStore(s => s.resetPov4);

  return (
    <div className="bg-black/70 border border-white/30 backdrop-blur-md text-white font-sans text-xs rounded-lg shadow-xl w-60 pointer-events-auto" dir="ltr">


      <div className="p-3 flex flex-col gap-2.5">
        {SLIDERS.map(({ key, label, min, max, step }) => {
          // המיקום היחסי (באחוזים) של האפס לאורך הסליידר — שם יופיע קו סימון האפס
          const zeroPercent = Math.max(0, Math.min(100, ((0 - min) / (max - min)) * 100));
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-white/70">{label}</span>
                <ValueInput
                  value={pov4[key]}
                  min={min} max={max} step={step}
                  onCommit={(v) => setPov4({ [key]: v } as Partial<Pov4Config>)}
                />
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={min} max={max} step={step}
                  value={pov4[key]}
                  onChange={(e) => setPov4({ [key]: parseFloat(e.target.value) } as Partial<Pov4Config>)}
                  className="w-full accent-blue-500 cursor-pointer"
                  dir="ltr"
                />
                {/* קו סימון האפס */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${zeroPercent}%`, width: '1px', height: '16px', background: 'rgba(255,255,255,0.55)' }}
                />
              </div>
            </div>
          );
        })}

        <button
          onClick={resetPov4}
          className="mt-1 px-4 py-1.5 border border-white/30 rounded text-white/80 hover:bg-white/10 transition-colors self-center"
        >
          Reset
        </button>
      </div>
    </div>
  );
}