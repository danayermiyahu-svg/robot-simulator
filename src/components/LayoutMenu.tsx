// src/components/LayoutMenu.tsx
import { Video, Map as MapIcon } from 'lucide-react';
import { useTelemetryStore, ScreenLayout } from '../store';

// תא בודד בתוך הדיאגרמה: מלבן עם אייקון חוזי או מפה בפנים
function Cell({ kind }: { kind: 'video' | 'map' }) {
  return (
    <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center rounded-[4px] bg-white/20">
      {kind === 'video'
        ? <Video size={16} className="text-white/90" />
        : <MapIcon size={16} className="text-white/90" />}
    </div>
  );
}

// הדיאגרמה שמייצגת כל פריסה: מסגרת אחת שמחולקת לתאים
function LayoutIcon({ layout }: { layout: ScreenLayout }) {
  const frame = 'w-20 h-14 p-[4px] flex gap-[4px]';
  switch (layout) {
    case ScreenLayout.FULL_VIDEO:
      return <div className={frame}><Cell kind="video" /></div>;
    case ScreenLayout.SPLIT_VIDEO_VIDEO:
      return <div className={frame}><Cell kind="video" /><Cell kind="video" /></div>;
    case ScreenLayout.SPLIT_VIDEO_MAP:
      return <div className={frame}><Cell kind="video" /><Cell kind="map" /></div>;
    case ScreenLayout.MAP_TWO_VIDEO:
      return (
        <div className={frame}>
          <div className="flex-1 flex flex-col gap-[4px]">
            <Cell kind="video" />
            <Cell kind="video" />
          </div>
          <Cell kind="map" />
        </div>
      );
    default:
      return <div className={frame}><Cell kind="video" /></div>;
  }
}

// סדר ההופעה של הדיאגרמות בתפריט
const LAYOUTS: ScreenLayout[] = [
  ScreenLayout.FULL_VIDEO,
  ScreenLayout.SPLIT_VIDEO_VIDEO,
  ScreenLayout.SPLIT_VIDEO_MAP,
  ScreenLayout.MAP_TWO_VIDEO,
];

export function LayoutMenu() {
  const isOpen = useTelemetryStore(s => s.layoutMenuOpen);
  const openLayoutMenu = useTelemetryStore(s => s.openLayoutMenu);
  const closeLayoutMenu = useTelemetryStore(s => s.closeLayoutMenu);
  const screenLayout = useTelemetryStore(s => s.screenLayout);
  const setScreenLayout = useTelemetryStore(s => s.setScreenLayout);
    const layoutMenuOpen = useTelemetryStore(s => s.layoutMenuOpen);
  const layoutCursor = useTelemetryStore(s => s.layoutCursor);

  return (
    <div className="absolute bottom-[70px] right-6 z-50 pointer-events-auto">
      <button
        onClick={() => (isOpen ? closeLayoutMenu() : openLayoutMenu())}
        className="w-10 h-10 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center overflow-hidden"
        title="פריסת מסך"
      >
        <img src={`${import.meta.env.BASE_URL}Layout.png`} alt="Layout Menu" className="w-7 h-7 object-contain" />
      </button>

      {isOpen && (
        <div className="absolute bottom-12 right-0 w-max max-w-[90vw] bg-black/80 rounded-lg shadow-xl backdrop-blur-md select-none p-3">
          <div className="grid grid-cols-2 gap-3">
            {LAYOUTS.map((layout) => {
              const selected = screenLayout === layout;
              // כשהתפריט פתוח מציגים רק את הסמן התכלת (לאן מכוונים);
              // הכחול "פעיל" מוצג רק כשמדפדפים בעכבר בלי שהסמן זז — אחרת נוצרים שני סימונים.
              const onCursor = layoutMenuOpen && LAYOUTS[layoutCursor] === layout;
              return (
                <button
                  key={layout}
                  onClick={() => { setScreenLayout(layout); closeLayoutMenu(); }}
                  className={`rounded-lg p-1.5 border-2 transition-colors ${
                    onCursor
                      ? 'border-cyan-400 bg-cyan-400/20'
                      : (selected && !layoutMenuOpen)
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-transparent bg-white/5 hover:bg-white/15'
                  }`}
                  title={layout}
                >
                  <LayoutIcon layout={layout} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}