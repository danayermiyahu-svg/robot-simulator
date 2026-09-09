// src/components/VideoSourcePicker.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTelemetryStore, VideoSource, ScreenLayout } from '../store';

export function VideoSourcePicker({ slot }: { slot: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const videoSlot1 = useTelemetryStore(s => s.videoSlot1);
  const videoSlot2 = useTelemetryStore(s => s.videoSlot2);
  const setVideoSlot = useTelemetryStore(s => s.setVideoSlot);
  const screenLayout = useTelemetryStore(s => s.screenLayout);
  const activePane = useTelemetryStore(s => s.activePane);
  const linked = useTelemetryStore(s => !s.droneManual); // מעקב = קישור פעיל

  const current: VideoSource = slot === 1 ? videoSlot1 : videoSlot2;
  const label = current === 'drone' ? 'Drone' : 'Robot';

  const choose = (source: VideoSource) => { setVideoSlot(slot, source); setOpen(false); };
  const other: VideoSource = current === 'robot' ? 'drone' : 'robot';
  const otherLabel = other === 'drone' ? 'Drone' : 'Robot';

  // אייקון הקישור מוצג בכל פריסה שבה יש חלונית חוזי (מסך מלא + מפוצלות)
  const showLink =
    screenLayout === ScreenLayout.FULL_VIDEO ||
    screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO ||
    screenLayout === ScreenLayout.SPLIT_VIDEO_MAP ||
    screenLayout === ScreenLayout.MAP_TWO_VIDEO;

  // איזו pane מציגה את ה-slot הזה → נקודה ירוקה כשהיא הפעילה
  let paneForSlot = 1;
  if (screenLayout === ScreenLayout.MAP_TWO_VIDEO) paneForSlot = slot === 2 ? 2 : 3;
  else if (screenLayout === ScreenLayout.SPLIT_VIDEO_MAP) paneForSlot = 2;
  else if (screenLayout === ScreenLayout.SPLIT_VIDEO_VIDEO) paneForSlot = slot;
  const showDot = screenLayout !== ScreenLayout.FULL_VIDEO && activePane === paneForSlot;

  return (
    <div className="absolute top-2 right-2 z-[70] pointer-events-auto flex items-start gap-1" dir="ltr">
      {/* אייקון קישור — נצבע תכלת כשהרחפן במצב מעקב */}
      {showLink && (
        <button
          onClick={() => useTelemetryStore.getState().toggleDroneManual()}
          className={`w-7 h-7 flex items-center justify-center rounded-full backdrop-blur-md shadow-lg transition-colors ${
            linked
              ? 'bg-[#38bdf8] border border-white'
              : 'bg-black/70 border border-white/30 hover:bg-black/90'
          }`}
          title={linked ? 'קישור פעיל — לחצי לניתוק' : 'הפעלת קישור (מעקב רובוט)'}
        >
          <div style={{
            width: 16, height: 16,
            backgroundColor: 'rgba(255,255,255,0.95)',
            WebkitMaskImage: 'url(/link_icon.png)', maskImage: 'url(/link_icon.png)',
            WebkitMaskSize: 'contain', maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center', maskPosition: 'center',
          }} />
        </button>
      )}

      {/* בורר Robot/Drone */}
      <div className="w-20 rounded-md bg-black/70 border border-white/30 backdrop-blur-md shadow-lg overflow-hidden">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-2.5 py-1 text-white text-xs font-semibold hover:bg-white/10 transition-colors"
          title="Select camera"
        >
          <span className="flex items-center gap-1.5">
            {showDot && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
            {label}
          </span>
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <button
            onClick={() => choose(other)}
            className="w-full text-left px-2.5 py-1 text-xs text-white/80 hover:bg-white/10 transition-colors border-t border-white/20"
          >
            {otherLabel}
          </button>
        )}
      </div>
    </div>
  );
}