// src/components/MapLabels.tsx
import { useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useTelemetryStore } from '../store';

// אייקון בודד שצף מעל נקודה במפה. משתמש ב-sprite (תמיד פונה למצלמה),
// ולכן נשאר בתוך חלונית המפה ולא "בורח" לחלונית אחרת.
function FloatingIcon({ getPos, getRot, url, size = 0.04 }: {
  getPos: () => { x: number; y: number; z: number } | null;
  getRot?: () => number;  // כיוון ברדיאנים; אם קיים — הטקסטורה תסתובב
  url: string;
  size?: number;
}) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const texture = useLoader(THREE.TextureLoader, url);

  useFrame(() => {
    if (!spriteRef.current) return;
    const p = getPos();
    if (p) {
      spriteRef.current.visible = true;
      spriteRef.current.position.set(p.x, p.y, p.z);
      if (getRot) {
        const mat = spriteRef.current.material as THREE.SpriteMaterial;
        mat.rotation = getRot();
      }
    } else {
      spriteRef.current.visible = false;
    }
  });

  return (
    <sprite ref={spriteRef} scale={[size, size, size]}>
      <spriteMaterial map={texture} depthTest={false} depthWrite={false} transparent sizeAttenuation={false} />
    </sprite>
  );
}

// ===== גדלי האייקונים במפה — כווני כל אחד בנפרד =====
const ROBOT_ICON_SIZE = 0.11;  // גודל אייקון הרובוט
const DRONE_ICON_SIZE = 0.04;  // גודל אייקון הרחפן
const DRONE_TRI_SIZE  = 3;     // גודל המשולש שמחובר לרחפן (יחסית לאייקון)
// ====================================================

// קבוצה שצפה מעל נקודה במפה: תמונת הרחפן + משולש תכלת, מחוברים יחד.
// הקבוצה כולה מסתובבת לפי getRot (זווית ברדיאנים) — כך האייקון והמשולש
// תמיד מתואמים ונעים יחד, בדיוק כמו קבוצה אחת.
function FloatingGroup({ getPos, getRot, url, size = DRONE_ICON_SIZE, triSize = DRONE_TRI_SIZE }: {
  getPos: () => { x: number; y: number; z: number } | null;
  getRot: () => number;
  url: string;
  size?: number;
  triSize?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useLoader(THREE.TextureLoader, url);

  useFrame(() => {
    if (!groupRef.current) return;
    const p = getPos();
    if (p) {
      groupRef.current.visible = true;
      groupRef.current.position.set(p.x, p.y, p.z);
      // הקבוצה שוכבת על המפה (מישור XZ) ומסתובבת לפי כיוון הרחפן.
      groupRef.current.rotation.set(-Math.PI / 2, 0, getRot());
    } else {
      groupRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef}>
      {/* תמונת הרחפן — שטוחה על המפה */}
      <mesh>
        <planeGeometry args={[size * 100, size * 100]} />
        <meshBasicMaterial map={texture} depthTest={false} depthWrite={false} transparent />
      </mesh>
      {/* משולש תכלת שמצביע "קדימה" של הקבוצה (למעלה במסך לפני שמסובבים) */}
      <mesh position={[0, size * 100 * 0.9, 0]}>
        <coneGeometry args={[triSize * 0.35, triSize, 3]} />
        <meshBasicMaterial color="#189FB5" depthTest={false} depthWrite={false} transparent />
      </mesh>
    </group>
  );
}


// שני האייקונים: רובוט ורחפן.
export function MapLabels() {
  const robotBodyRef = useTelemetryStore(s => s.robotBodyRef);

  return (
    <>
      <FloatingIcon
        url="/Mini_Robot_Top.png"
        size={ROBOT_ICON_SIZE}
        getPos={() => {
          const b = robotBodyRef.current;
          if (!b) return null;
          const p = b.translation();
          return { x: p.x, y: 5, z: p.z };
        }}
        getRot={() => {
          const b = robotBodyRef.current;
          if (!b) return 0;
          const q = b.rotation();
          const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
          return -Math.atan2(dir.x, -dir.z);
        }}
      />
      <FloatingGroup
        url="/Drone.png"
        size={DRONE_ICON_SIZE}
        getPos={() => {
          const st = useTelemetryStore.getState();
          if (!st.droneLaunched) return null;   // טרם המריא → אין סימן במפה
          const d = st.dronePosition;
          return { x: d[0], y: 5, z: d[2] };
        }}
        getRot={() => {
          // כיוון גוף הרחפן (רדיאנים), נשמר ב-store כל פריים.
          return useTelemetryStore.getState().droneYaw;
        }}
      />

    </>
  );
}