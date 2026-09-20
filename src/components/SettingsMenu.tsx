// src/components/SettingsMenu.tsx
//
// כפתור הגדרות + תפריט לשליטה ברגישות הבקרים.
// ממוקם בפינה השמאלית-התחתונה (במקום מד הזווית העגול שהוסר),
// ומדבר באותה שפה עיצובית כמו שאר כפתורי המערכת.
//
// לכל סוג התקן פרופיל נפרד לחלוטין:
//   • PlayStation — שלט DualSense/DualShock (ברירת מחדל: אזור מת 10%, רגישות 70%)
//   • Joysticks   — ג'ויסטיקים גדולים (ברירת מחדל: אזור מת 7%, רגישות 100%)

import { useState } from 'react';
import { useTelemetryStore } from '../store';

// ברירות המחדל של כל פרופיל (לכפתור ה-Reset)
const DEFAULTS = {
  ps: { deadzone: 0.10, sensitivity: 0.70 },
  stick: { deadzone: 0.07, sensitivity: 1.0 },
};

// שורת מחוון (slider) בודדת עם כותרת וקריאת-ערך
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-2 hover:bg-white/10 rounded transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        <span className="text-xs font-mono text-blue-300 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500 cursor-pointer"
      />
    </div>
  );
}

export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [device, setDevice] = useState<'ps' | 'stick'>('ps');

  // פרופיל שלט PS
  const psDeadzone = useTelemetryStore(s => s.psDeadzone);
  const psSensitivity = useTelemetryStore(s => s.psSensitivity);
  const setPsDeadzone = useTelemetryStore(s => s.setPsDeadzone);
  const setPsSensitivity = useTelemetryStore(s => s.setPsSensitivity);

  // פרופיל ג'ויסטיקים גדולים
  const stickDeadzone = useTelemetryStore(s => s.stickDeadzone);
  const stickSensitivity = useTelemetryStore(s => s.stickSensitivity);
  const setStickDeadzone = useTelemetryStore(s => s.setStickDeadzone);
  const setStickSensitivity = useTelemetryStore(s => s.setStickSensitivity);

  // הפרופיל הפעיל לפי ה-tab הנבחר
  const cur = device === 'ps'
    ? {
        deadzone: psDeadzone, sensitivity: psSensitivity,
        setDeadzone: setPsDeadzone, setSensitivity: setPsSensitivity,
        defaults: DEFAULTS.ps,
      }
    : {
        deadzone: stickDeadzone, sensitivity: stickSensitivity,
        setDeadzone: setStickDeadzone, setSensitivity: setStickSensitivity,
        defaults: DEFAULTS.stick,
      };

  return (
    <div className="absolute bottom-4 left-4 z-50 pointer-events-auto">
      {/* התפריט — נפתח מעל הכפתור (כי הכפתור בתחתית המסך) */}
      {isOpen && (
        <div
          className="absolute bottom-12 left-0 w-64 bg-black/80 text-white rounded-lg shadow-xl backdrop-blur-md select-none overflow-hidden"
          dir="ltr"
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 border-b border-white/20 pb-2">
              <p className="text-sm font-medium">Controller Sensitivity</p>
              <button
                onClick={() => {
                  cur.setDeadzone(cur.defaults.deadzone);
                  cur.setSensitivity(cur.defaults.sensitivity);
                }}
                className="text-[11px] text-gray-400 hover:text-white transition-colors underline underline-offset-2"
              >
                Reset
              </button>
            </div>

            {/* בורר התקן — כל פרופיל נפרד לחלוטין */}
            <div className="flex gap-1.5 mb-3">
              {([
                { key: 'ps', label: 'PlayStation' },
                { key: 'stick', label: 'Joysticks' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDevice(key)}
                  className={`flex-1 px-2.5 py-1 border rounded-md text-xs transition-colors ${
                    device === key
                      ? 'bg-white text-black font-bold border-white'
                      : 'border-white/30 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <SliderRow
                label="Dead Zone"
                value={cur.deadzone}
                min={0}
                max={0.4}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={cur.setDeadzone}
              />

              <SliderRow
                label="Sensitivity"
                value={cur.sensitivity}
                min={0.2}
                max={2.0}
                step={0.05}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={cur.setSensitivity}
              />
            </div>
          </div>
        </div>
      )}

      {/* הכפתור — אותו סגנון של שאר כפתורי הצד (שכבות / מבט-על) */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-10 h-10 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center overflow-hidden"
        title="הגדרות — רגישות בקרים"
      >
        {/* אייקון גלגל-שיניים בקו דק (בסגנון Lucide) — תואם לקווים העדינים של שאר האייקונים */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
}
