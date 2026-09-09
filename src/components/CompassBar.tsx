// src/components/CompassBar.tsx
import { useTelemetryStore } from '../store';

// מצפן HTML שיושב בראש חלונית. מקבל source — רובוט או רחפן —
// וקורא את הכיוון המתאים מה-store.
export function CompassBar({ source = 'robot' }: { source?: 'robot' | 'drone' }) {
  const robotHeading = useTelemetryStore(s => s.robotHeading);
  const droneHeading = useTelemetryStore(s => s.droneHeading);
  const heading = source === 'drone' ? droneHeading : robotHeading;

  const textStroke = {
    textShadow: `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000`,
  };

  const offset = heading * 6;

  return (
    <div
      className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{ width: '360px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'white', fontFamily: 'monospace', ...textStroke }}>
        {Math.round(heading).toString().padStart(3, '0')}
      </div>

      <div style={{ width: '1.5px', height: '35px', backgroundColor: 'white', boxShadow: '1px 1px 0px black', zIndex: 10 }} />

      <div style={{ width: '100%', height: '30px', overflow: 'hidden', position: 'relative', marginTop: '-25px' }}>
        <div style={{ position: 'absolute', top: '5px', left: '50%', width: 0, height: '100%', transform: `translateX(${-offset}px)`, willChange: 'transform' }}>
          {renderTicks}
        </div>
      </div>
    </div>
  );
}

const renderTicks = (() => {
  const ticks = [];
  const stroke = { textShadow: `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000` };
  for (let i = -180; i <= 540; i += 5) {
    const isMajor = i % 30 === 0;
    const deg = ((i % 360) + 360) % 360;
    let label = '';
    if (deg === 0) label = 'N';
    else if (deg === 90) label = 'E';
    else if (deg === 180) label = 'S';
    else if (deg === 270) label = 'W';
    else if (isMajor) label = (deg / 10).toString().padStart(2, '0');

    ticks.push(
      <div key={i} style={{
        position: 'absolute', left: `${i * 6}px`, display: 'flex', flexDirection: 'column',
        alignItems: 'center', width: '30px', transform: 'translateX(-50%)', color: 'white', ...stroke,
      }}>
        {label && <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{label}</span>}
        <div style={{ width: '1px', height: isMajor ? '15px' : '7px', backgroundColor: 'white', boxShadow: '0.5px 0.5px 0px black' }} />
      </div>
    );
  }
  return ticks;
})();