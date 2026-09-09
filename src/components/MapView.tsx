// src/components/MapView.tsx
// מצלמת מפה אורתוגרפית קבועה: מבט-על אמיתי דו-ממדי.
// גובה לא משפיע על מיקום (אין פרספקטיבה), אז הרחפן לא "זז" כשעולה/יורד.
import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

export function MapView() {
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();

  // מרכז השטח וגודל האזור שרואים במפה.
  const CENTER_X = 0;
  const CENTER_Z = -75;   // מרכז בין הזינוק (z=+7) לבניין (z=-160)
  const HALF_SPAN = 100;  // חצי-רוחב האזור הנראה (מטרים). גדול יותר = רואים שטח רחב יותר.

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    // יחס הרוחב-גובה של החלון, כדי שהמפה לא תימתח
    const aspect = size.width / size.height;
    cam.left = -HALF_SPAN * aspect;
    cam.right = HALF_SPAN * aspect;
    cam.top = HALF_SPAN;
    cam.bottom = -HALF_SPAN;
    cam.position.set(CENTER_X, 100, CENTER_Z); // גובה קבוע — לא משנה באורתוגרפית
    cam.up.set(0, 0, -1);                       // "צפון" (z שלילי) כלפי מעלה
    cam.lookAt(CENTER_X, 0, CENTER_Z);
    cam.updateProjectionMatrix();
  }, [size]);

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      near={0.1}
      far={1000}
    />
  );
}