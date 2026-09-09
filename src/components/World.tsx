// File: src/components/World.tsx
import { Sky, Environment, useTexture, useGLTF, Clone, Html } from '@react-three/drei';
import { DesertVillage } from './Village';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTelemetryStore } from '../store';

function SwayingTree({ treeModel, x, z, scale, rotationY, visualsOnly }: any) {
  const treeRef = useRef<THREE.Group>(null);
  const randomWindOffset = useRef(Math.random() * 100);

  useFrame((state) => {
    if (!treeRef.current) return;
    const t = state.clock.elapsedTime + randomWindOffset.current;
    const swayX = Math.sin(t * 0.5) * 0.01; 
    const swayZ = Math.cos(t * 0.4) * 0.01;
    treeRef.current.rotation.x = swayX;
    treeRef.current.rotation.z = swayZ;
  });

  const visual = (
    <group scale={scale} rotation={[0, rotationY, 0]}>
      <group ref={treeRef}>
        <Clone object={treeModel.scene} castShadow receiveShadow />
      </group>
    </group>
  );

  if (visualsOnly) {
    return <group position={[x, 0, z]}>{visual}</group>;
  }

  return (
    <RigidBody type="fixed" colliders="cuboid" position={[x, 0, z]}>
      {visual}
    </RigidBody>
  );
}

// רכיב שיוצר משטח ויזואלי + חיישן פיזיקלי
function GroundSensor({ position, size, label, onCross, visualsOnly, rotationY = 0 }: { 
  position: [number, number, number], 
  size: [number, number], 
  label?: string,
  onCross: () => void,
  visualsOnly?: boolean,
  rotationY?: number
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#d1d1d1'; 
      ctx.fillRect(0, 0, 512, 64);
      const cellSize = 32;
      for (let x = 0; x < 512; x += cellSize) {
        for (let y = 0; y < 64; y += cellSize) {
          if ((x / cellSize + y / cellSize) % 2 === 0) {
            ctx.fillStyle = '#000000'; 
          } else {
            ctx.fillStyle = '#ffffff'; 
          }
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={size} />
        {/* הוספנו כאן offset כדי שהשטיח ירונדר תמיד מעל רצפת הבניין */}
        <meshStandardMaterial 
          map={texture} 
          transparent={true} 
          opacity={0.6} 
          polygonOffset={true} 
          polygonOffsetFactor={-3} 
          polygonOffsetUnits={-3} 
        />
      </mesh>
      {!visualsOnly && (
        <CuboidCollider args={[size[0]/2, 1, size[1]/2]} position={[0, 1, 0]} sensor={true} onIntersectionEnter={onCross} />
      )}
    </group>
  );
}

// רכיב שיוצר שער וירטואלי מעבר בראש כל גבעה
function VirtualGate({ 
  index, 
  position,
  rotationY = 0,
  visualsOnly = false
}: { 
  index: number; 
  position: [number, number, number]; 
  rotationY?: number;
  visualsOnly?: boolean;
}) {
  const currentGateIndex = useTelemetryStore((s) => s.currentGateIndex);
  const passGate = useTelemetryStore((s) => s.passGate);
  const isBlocked = currentGateIndex < index;
  const isActive = currentGateIndex === index;
  const isPassed = currentGateIndex > index;

  // Twice the width of robot (2.0m) and 3x height of robot (1.8m)
  const width = 2.0;
  const height = 1.8;
  // Color selection
  let color = "#a855f7"; // default purple
  let emissive = "#a855f7";
  if (isPassed) {
    color = "#22c55e"; // green
    emissive = "#22c55e";
  }

  // Handle sensor crossing
  const handleCross = () => {
    if (isActive) {
      passGate(index);
    }
  };

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Left Pole */}
      <mesh position={[-width / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, height, 12]} />
        <meshStandardMaterial 
          color={color} 
          emissive={emissive} 
          emissiveIntensity={isActive ? 2.5 : isPassed ? 1.5 : 0.8}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Right Pole */}
      <mesh position={[width / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, height, 12]} />
        <meshStandardMaterial 
          color={color} 
          emissive={emissive} 
          emissiveIntensity={isActive ? 2.5 : isPassed ? 1.5 : 0.8}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Top Banner/Crossbar */}
      <mesh position={[0, height, 0]} castShadow>
        <boxGeometry args={[width, 0.04, 0.04]} />
        <meshStandardMaterial 
          color={color} 
          emissive={emissive} 
          emissiveIntensity={isActive ? 2.5 : isPassed ? 1.5 : 0.8}
        />
      </mesh>

      {/* Virtual Barrier / Energy Curtain */}
      {!isPassed && (
        <mesh position={[0, height / 2, 0]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial 
            color="#a855f7"
            transparent={true}
            opacity={isBlocked ? 0.45 : 0.12}
            emissive="#a855f7"
            emissiveIntensity={isBlocked ? 1.2 : 0.3}
            side={THREE.DoubleSide}
            wireframe={isBlocked}
          />
        </mesh>
      )}

      {/* Glowing base ring indicator */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[width / 2 - 0.1, width / 2, 32]} />
        <meshBasicMaterial 
          color={color} 
          transparent={true} 
          opacity={isActive ? 0.8 : isPassed ? 0.3 : 0.2} 
          side={THREE.DoubleSide} 
        />
      </mesh>

      {/* Physics representation — השער אף פעם לא חוסם, רק חיישן שמזהה מעבר */}
      {!visualsOnly && (
        <CuboidCollider 
          args={[width / 2, height / 2, 0.2]} 
          position={[0, height / 2, 0]} 
          sensor={true} 
          onIntersectionEnter={handleCross}
        />
      )}
    </group>
  );
}

export function World({ visualsOnly = false, practice = false, showHillOverlay = true, showCompass = true }: { visualsOnly?: boolean, practice?: boolean, showHillOverlay?: boolean, showCompass?: boolean }) {
  const triggerSensor2 = useTelemetryStore(s => s.triggerSensor2);
  const triggerSensor3 = useTelemetryStore(s => s.triggerSensor3);
  const triggerHill6End = useTelemetryStore(s => s.triggerHill6End);
  const triggerBldgOutside = useTelemetryStore(s => s.triggerBldgOutside);
  const triggerBldgInside = useTelemetryStore(s => s.triggerBldgInside);
  const triggerSensor4 = useTelemetryStore(s => s.triggerSensor4);
  const triggerSensor5 = useTelemetryStore(s => s.triggerSensor5);
  const obstacles = useMemo(() => {
    // ===== מסך אימון: מסלול סללום קונוסים מוצקים עם סימון מסלול =====
    if (practice) {
      const elements: any[] = [];

      // קונוס בודד: חרוט כתום + פס לבן + בסיס שחור. מוצק - הרובוט מתנגש בו.
      const cone = (key: string, x: number, z: number) => {
        const visual = (
          <>
            <mesh castShadow position={[0, 0.4, 0]}>
              <coneGeometry args={[0.32, 0.8, 20]} />
              <meshStandardMaterial color="#ff6a00" roughness={0.5} metalness={0.1} />
            </mesh>
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.25, 0.28, 0.1, 20]} />
              <meshStandardMaterial color="#ffffff" roughness={0.6} />
            </mesh>
            <mesh receiveShadow position={[0, 0.02, 0]}>
              <boxGeometry args={[0.6, 0.04, 0.6]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
          </>
        );

        if (visualsOnly) {
          return <group key={key} position={[x, 0, z]}>{visual}</group>;
        }
        return (
          <RigidBody key={key} type="fixed" colliders={false} position={[x, 0, z]}>
            {visual}
            <CuboidCollider args={[0.3, 0.4, 0.3]} position={[0, 0.4, 0]} />
          </RigidBody>
        );
      };

      // סללום אמיתי: טור שמאלי (x=-1.6) וטור ימני (x=1.6) לסירוגין.
      // הרובוט (רוחב ~0.9) חייב להתפתל ביניהם. z יורד = קדימה.
      const conePositions: [number, number][] = [
        [-0.7, 1], [0.7, -3], [-0.7, -7], [0.7, -11], [-0.7, -15], [0.7, -19],
      ];
      conePositions.forEach(([x, z], i) => elements.push(cone(`practice-cone-${i}`, x, z)));

      // נקודות המסלול: עוברות בצד הנגדי של כל קונוס כדי לאלץ פנייה.
      // קונוס בשמאל => המסלול עובר ימינה ממנו, ולהיפך.
      const waypoints = [
        [0, 5], [0.9, 1], [-0.9, -3], [0.9, -7], [-0.9, -11], [0.9, -15], [-0.9, -19], [0, -23],
      ].map(([x, z]) => new THREE.Vector3(x, 0.03, z));

      // שובל נקודות תכלת מעוקל לאורך המסלול המתפתל
      const curve = new THREE.CatmullRomCurve3(waypoints);
      const dots = curve.getPoints(120);
      for (let i = 0; i < dots.length; i += 2) {
        const p = dots[i];
        elements.push(
          <mesh key={`practice-dot-${i}`} position={[p.x, 0.03, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.1, 16]} />
            <meshBasicMaterial color="#02c5cf" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        );
      }

      // טבעת התחלה ירוקה וטבעת סיום כתומה
      elements.push(
        <mesh key="practice-start" position={[0, 0.03, 5]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.65, 32]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      );
      elements.push(
        <mesh key="practice-finish" position={[0, 0.03, -25]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.65, 32]} />
          <meshBasicMaterial color="#ff6a00" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      );

      return elements;
    }

    const elements = [];

    const wrap = (key: string, pos: [number, number, number], children: any, type: any = "fixed", colliders: any = "trimesh", rot: [number, number, number] = [0, 0, 0]) => {
      if (visualsOnly) return <group key={key} position={pos} rotation={rot}>{children}</group>;
      return <RigidBody key={key} type={type} colliders={colliders} position={pos} rotation={rot}>{children}</RigidBody>;
    };

    const hillMaterial = (
      <meshStandardMaterial 
        color="#9c8a68" flatShading={false} roughness={0.9} metalness={0.0}
        polygonOffset={true} polygonOffsetFactor={1} polygonOffsetUnits={1} side={THREE.DoubleSide}
      />
    );

    type HillOptions = {
      subdivisions?: number;
      roughness?: number;
      seed?: number;
      gentleEntryLength?: number;
      gentleEntryAngleDeg?: number;
      terraceStrength?: number;
    };

    // מידות משוערות של הרובוט לפי המודל הקיים:
    // גוף הרובוט הוא באורך 1.1, ולכן רצועת כניסה של 1.76 היא מעל פי 1.5 מהאורך.
    const ROBOT_LENGTH = 1.1;
    const DEFAULT_GENTLE_ENTRY_LENGTH = ROBOT_LENGTH * 1.6;
    const DEFAULT_GENTLE_ENTRY_ANGLE = 5;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = clamp01((x - edge0) / (edge1 - edge0));
      return t * t * (3 - 2 * t);
    };

    // רעש דטרמיניסטי: יוצר גבשושיות זהות בכל טעינה, ולא אקראיות כל פעם מחדש.
    const deterministicNoise = (x: number, z: number, seed: number) => {
      const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
      return (n - Math.floor(n)) * 2 - 1;
    };

    const distanceToSegmentXZ = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
      const px = p.x;
      const pz = p.z;
      const ax = a.x;
      const az = a.z;
      const bx = b.x;
      const bz = b.z;

      const abx = bx - ax;
      const abz = bz - az;
      const apx = px - ax;
      const apz = pz - az;

      const abLenSq = abx * abx + abz * abz;
      if (abLenSq === 0) {
        const dx = px - ax;
        const dz = pz - az;
        return Math.sqrt(dx * dx + dz * dz);
      }

      const t = clamp01((apx * abx + apz * abz) / abLenSq);
      const cx = ax + abx * t;
      const cz = az + abz * t;

      const dx = px - cx;
      const dz = pz - cz;
      return Math.sqrt(dx * dx + dz * dz);
    };

    const sculptHillPoint = (
      point: THREE.Vector3,
      baseRing: THREE.Vector3[],
      options: Required<HillOptions>
    ) => {
      const p = point.clone();

      // נקודות שנמצאות ממש על הקרקע נשארות על הקרקע.
      if (p.y > 0.001) {
        const heightWeight = smoothstep(0.05, 2.5, p.y);

        // קימוט עדין: שתי תדירויות כדי לשבור משטח חלק בלי ליצור סלעים חדים.
        const lowFreq = deterministicNoise(p.x * 0.55, p.z * 0.55, options.seed);
        const highFreq = deterministicNoise(p.x * 1.7, p.z * 1.7, options.seed + 19);
        const wrinkle = (lowFreq * 0.7 + highFreq * 0.3) * options.roughness * heightWeight;

        // טרסות רכות: מוסיפות הרבה מקטעים קטנים שחלקם מתונים יותר מהשיפוע המקורי.
        const terraceStep = 0.45;
        const baseStep = Math.floor(p.y / terraceStep) * terraceStep;
        const localStep = (p.y - baseStep) / terraceStep;
        const easedStep = smoothstep(0.18, 1.0, localStep);
        const terracedY = baseStep + easedStep * terraceStep;

        p.y = THREE.MathUtils.lerp(p.y, terracedY, options.terraceStrength * heightWeight);
        p.y = Math.max(0, p.y + wrinkle);
      }

      // רצועת כניסה מתונה ליד בסיס הגבעה.
      // בתוך הרצועה הזו הגובה מוגבל כך שהשיפוע יהיה עד 5 מעלות.
      let minDistanceToBase = Infinity;

      for (let i = 0; i < baseRing.length; i++) {
        const a = baseRing[i];
        const b = baseRing[(i + 1) % baseRing.length];
        minDistanceToBase = Math.min(minDistanceToBase, distanceToSegmentXZ(p, a, b));
      }

      if (minDistanceToBase < options.gentleEntryLength) {
        const maxAllowedY =
          Math.tan(THREE.MathUtils.degToRad(options.gentleEntryAngleDeg)) * minDistanceToBase;

        p.y = Math.min(p.y, maxAllowedY);
      }

      return p;
    };

    // =========================================================
    // פונקציית "מפעל הגבעות" - גרסה משודרגת
    // מקבלת נקודות בסיסיות, מפצלת את המשולשים, מקמטת מעט את השטח,
    // ומייצרת שכבת צבע לפי שיפוע.
    // =========================================================
    const createHill = (vertices: Float32Array, centerZ: number, options: HillOptions = {}) => {
      const hillOptions: Required<HillOptions> = {
        subdivisions: options.subdivisions ?? 5,
        roughness: options.roughness ?? 0.14,
        seed: options.seed ?? 1,
        gentleEntryLength: options.gentleEntryLength ?? DEFAULT_GENTLE_ENTRY_LENGTH,
        gentleEntryAngleDeg: options.gentleEntryAngleDeg ?? DEFAULT_GENTLE_ENTRY_ANGLE,
        terraceStrength: options.terraceStrength ?? 0.28,
      };

      // subdivisions=5 נותן בערך 18 נקודות חדשות לכל משולש מקורי.
      // כדי להישאר בדרישה של 2–20 נקודות חדשות, לא מומלץ להעלות מעל 5.
      hillOptions.subdivisions = Math.max(2, Math.min(5, hillOptions.subdivisions));

      const indices = [
        0, 8, 9,   0, 9, 1,   1, 9, 10,  1, 10, 2,   2, 10, 11, 2, 11, 3,
        3, 11, 12, 3, 12, 4,  4, 12, 13, 4, 13, 5,   5, 13, 14, 5, 14, 6,
        6, 14, 15, 6, 15, 7,  7, 15, 8,  7, 8, 0,
        0, 1, 2,  0, 2, 3,  0, 3, 4,  0, 4, 5,  0, 5, 6,  0, 6, 7,
        8, 10, 9,  8, 11, 10,  8, 12, 11,  8, 13, 12,  8, 14, 13,  8, 15, 14
      ];

      const baseRing: THREE.Vector3[] = [];
      const numVertices = vertices.length / 3;
      const vertexAngleSums = new Float32Array(numVertices);
      const vertexAngleCounts = new Int32Array(numVertices);

      // Calculate the original slope angle of all triangles in the hill
      for (let tIdx = 0; tIdx < indices.length; tIdx += 3) {
        const idxA = indices[tIdx];
        const idxB = indices[tIdx + 1];
        const idxC = indices[tIdx + 2];

        const a = new THREE.Vector3(vertices[idxA * 3], vertices[idxA * 3 + 1], vertices[idxA * 3 + 2]);
        const b = new THREE.Vector3(vertices[idxB * 3], vertices[idxB * 3 + 1], vertices[idxB * 3 + 2]);
        const c = new THREE.Vector3(vertices[idxC * 3], vertices[idxC * 3 + 1], vertices[idxC * 3 + 2]);

        const ab = new THREE.Vector3().subVectors(b, a);
        const ac = new THREE.Vector3().subVectors(c, a);
        const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
        if (normal.y < 0) normal.negate();

        const horizontalNorm = Math.sqrt(normal.x * normal.x + normal.z * normal.z);
        const slope = normal.y > 0.0001 ? (horizontalNorm / normal.y) : 0;
        const angleRad = Math.atan(slope);
        const angleDeg = THREE.MathUtils.radToDeg(angleRad);

        vertexAngleSums[idxA] += angleDeg;
        vertexAngleCounts[idxA]++;

        vertexAngleSums[idxB] += angleDeg;
        vertexAngleCounts[idxB]++;

        vertexAngleSums[idxC] += angleDeg;
        vertexAngleCounts[idxC]++;
      }

      const stretchedVertices = new Float32Array(vertices.length);
      for (let j = 0; j < numVertices; j++) {
        const avgAngle = vertexAngleCounts[j] > 0 ? (vertexAngleSums[j] / vertexAngleCounts[j]) : 0;
        
        // Scale factor F to achieve the target slope reduction:
        // - New slope = 0.8 * Old slope (F = 1.25) if angle <= 35
        // - New slope = 0.5 * Old slope (F = 2.0) if angle > 35
        // We use a smoothstep transition between 33 and 37 degrees to prevent any disjointed tearing or sharp creases in the mesh.
        let F = 1.25;
        if (avgAngle <= 33) {
          F = 1.25;
        } else if (avgAngle >= 37) {
          F = 2.0;
        } else {
          const t = (avgAngle - 33) / 4;
          F = 1.25 + 0.75 * (t * t * (3 - 2 * t));
        }

        stretchedVertices[j * 3] = vertices[j * 3] * F;
        stretchedVertices[j * 3 + 1] = vertices[j * 3 + 1] * 0.85; // Height scaled to 85%
        stretchedVertices[j * 3 + 2] = vertices[j * 3 + 2] * F;
      }

      for (let i = 8; i < 16; i++) {
        baseRing.push(new THREE.Vector3(stretchedVertices[i * 3], stretchedVertices[i * 3 + 1], stretchedVertices[i * 3 + 2]));
      }

      const originalGeo = new THREE.BufferGeometry();
      originalGeo.setAttribute('position', new THREE.BufferAttribute(stretchedVertices, 3));
      originalGeo.setIndex(indices);

      const nonIndexedOriginal = originalGeo.toNonIndexed();
      const originalPos = nonIndexedOriginal.getAttribute('position');
      const newPositions: number[] = [];

      const pushVertex = (p: THREE.Vector3) => {
        newPositions.push(p.x, p.y, p.z);
      };

      const pushTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
        pushVertex(a);
        pushVertex(b);
        pushVertex(c);
      };

      const makePointOnTriangle = (
        a: THREE.Vector3,
        b: THREE.Vector3,
        c: THREE.Vector3,
        u: number,
        v: number
      ) => {
        const w = 1 - u - v;

        const p = new THREE.Vector3(
          a.x * w + b.x * u + c.x * v,
          a.y * w + b.y * u + c.y * v,
          a.z * w + b.z * u + c.z * v
        );

        return sculptHillPoint(p, baseRing, hillOptions);
      };

      for (let i = 0; i < originalPos.count; i += 3) {
        const a = new THREE.Vector3(originalPos.getX(i), originalPos.getY(i), originalPos.getZ(i));
        const b = new THREE.Vector3(originalPos.getX(i + 1), originalPos.getY(i + 1), originalPos.getZ(i + 1));
        const c = new THREE.Vector3(originalPos.getX(i + 2), originalPos.getY(i + 2), originalPos.getZ(i + 2));

        const n = hillOptions.subdivisions;
        const grid: THREE.Vector3[][] = [];

        for (let row = 0; row <= n; row++) {
          grid[row] = [];

          for (let col = 0; col <= n - row; col++) {
            const u = row / n;
            const v = col / n;
            grid[row][col] = makePointOnTriangle(a, b, c, u, v);
          }
        }

        for (let row = 0; row < n; row++) {
          for (let col = 0; col < n - row; col++) {
            const p0 = grid[row][col];
            const p1 = grid[row + 1][col];
            const p2 = grid[row][col + 1];

            pushTriangle(p0, p1, p2);

            if (col < n - row - 1) {
              const p3 = grid[row + 1][col + 1];
              pushTriangle(p1, p3, p2);
            }
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      geo.computeVertexNormals();

      const posAttr = geo.getAttribute('position');
      const overlayPositions: number[] = [];
      const overlayColors: number[] = [];

      const colorLightOrange = new THREE.Color("#f2a635");
      const colorDarkOrange  = new THREE.Color("#de6502");
      const colorRed         = new THREE.Color("#d32f2f");

      const upVector = new THREE.Vector3(0, 1, 0);
      const centerOfHill = new THREE.Vector3(0, 1.4 * 0.85, centerZ);
      const offset = 0.05;

      // רדיוס השקלול: כל פאה תיצבע לפי ממוצע הזוויות של כל הפאות שמרכזן
      // נמצא עד חצי מטר ממרכזה. ככה גבשושית בודדת תלולה לא צובעת כתם אדום
      // אם כל סביבתה מתונה.
      const SMOOTH_RADIUS = 0.35;
      const SMOOTH_RADIUS_SQ = SMOOTH_RADIUS * SMOOTH_RADIUS;

      // שלב 1: מעבר ראשון - מחשבים לכל פאה את מרכזה ואת הזווית הגולמית שלה,
      // ושומרים אותם במערכים כדי שנוכל לשקלל בשלב הבא.
      const numFaces = posAttr.count / 3;
      const faceCenters: THREE.Vector3[] = [];
      const faceAnglesRaw: number[] = [];

      const _triangle = new THREE.Triangle();
      const _faceNormal = new THREE.Vector3();

      for (let i = 0; i < posAttr.count; i += 3) {
        _triangle.set(
          new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)),
          new THREE.Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)),
          new THREE.Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2))
        );

        _triangle.getNormal(_faceNormal);

        const triCenter = new THREE.Vector3()
          .addVectors(_triangle.a, _triangle.b)
          .add(_triangle.c)
          .divideScalar(3);

        const outwardDir = triCenter.clone().sub(centerOfHill);
        if (_faceNormal.dot(outwardDir) < 0) _faceNormal.negate();

        let angleDeg = THREE.MathUtils.radToDeg(_faceNormal.angleTo(upVector));
        if (angleDeg > 90) angleDeg = 180 - angleDeg;

        faceCenters.push(triCenter);
        faceAnglesRaw.push(angleDeg);
      }

      // שלב 2: מעבר שני - לכל פאה מחשבים ממוצע משוקלל של הזוויות בסביבתה.
      // הצבע נקבע לפי הממוצע הזה ולא לפי הזווית הבודדת של הפאה.
      for (let f = 0; f < numFaces; f++) {
        const center = faceCenters[f];

        let angleSum = 0;
        let weightCount = 0;

        for (let g = 0; g < numFaces; g++) {
          const dx = center.x - faceCenters[g].x;
          const dz = center.z - faceCenters[g].z;
          const distSq = dx * dx + dz * dz;

          if (distSq <= SMOOTH_RADIUS_SQ) {
            angleSum += faceAnglesRaw[g];
            weightCount++;
          }
        }

        const smoothedAngle = weightCount > 0 ? angleSum / weightCount : faceAnglesRaw[f];

        if (smoothedAngle >= 5) {
          let faceColor = colorRed;

          if (smoothedAngle < 15) faceColor = colorLightOrange;
          else if (smoothedAngle <= 30) faceColor = colorDarkOrange;

          const i = f * 3;
          for (let j = 0; j < 3; j++) {
            const vIndex = i + j;

            overlayPositions.push(
              posAttr.getX(vIndex),
              posAttr.getY(vIndex) + offset,
              posAttr.getZ(vIndex)
            );

            overlayColors.push(faceColor.r, faceColor.g, faceColor.b);
          }
        }
      }
      const overlayGeo = new THREE.BufferGeometry();
      overlayGeo.setAttribute('position', new THREE.Float32BufferAttribute(overlayPositions, 3));
      overlayGeo.setAttribute('color', new THREE.Float32BufferAttribute(overlayColors, 3));
      return { baseGeo: geo, overlayGeo: overlayGeo };
    };

    // =========================================================
    // --- גבעה 1 הוסרה מהמסלול (הגבעה הסימטרית הרחבה ב-z=-20) ---
    // =========================================================

    // =========================================================
    // --- גבעה 2: צוק במרכז + מרפסת עוקפת מימין ---
    // =========================================================
    const v2 = new Float32Array([
      -1.0, 3.5, -2.0,     4.0, 1.5, -2.0,     6.0, 1.5,  0.0,     4.0, 1.5,  4.0,  
      -1.0, 3.5,  2.0,    -3.0, 3.5,  2.0,    -4.0, 3.5,  0.0,    -3.0, 3.5, -2.0,  
      -1.0, 0.0, -8.0,     8.0, 0.0, -8.0,    14.0, 0.0,  0.0,    10.0, 0.0, 13.0,  
      -1.0, 0.0,  5.0,    -8.0, 0.0,  6.0,   -12.0, 0.0,  0.0,    -8.0, 0.0, -8.0   
    ]);
    const hill2 = createHill(v2, 2.5, { seed: 22, roughness: 0.15, subdivisions: 5 });
    
    elements.push(
      wrap("complex-hill-2", [0, -0.4, -35], 
        <mesh castShadow receiveShadow geometry={hill2.baseGeo}>{hillMaterial}</mesh>, "fixed", "trimesh"
      )
    );
    if (showHillOverlay) elements.push(<SlopeOverlay key="hill-2-overlay" geometry={hill2.overlayGeo} position={[0, -0.4, -35]} />);

    const geo4 = new THREE.CylinderGeometry(0.25, 1.0, 1, 8);
    const geo5 = new THREE.CylinderGeometry(0.2, 1.0, 1, 8);
    const geo6 = new THREE.CylinderGeometry(0.3, 1.0, 1, 8);

    // --- גבעה 4: פסגה לא מרכזית ---
    const v4 = new Float32Array([
      // פסגה — אותו footprint כמו קודם, אבל גבוהה בכ־30%
      0.00, 4.68, -3.00,    2.12, 4.68, -2.12,   3.00, 4.68, 0.00,   2.12, 4.68, 2.12,
      0.00, 4.68, 3.00,    -2.12, 4.68, 2.12,   -3.00, 4.68, 0.00,  -2.12, 4.68, -2.12,
      // בסיס — מורחב כדי שהעלייה לפסגה תהיה יותר מדורגת ולא תהפוך לצוק
      0.00, 0.00, -14.85,   8.11, 0.00, -10.50,   11.48, 0.00, 0.00,   8.11, 0.00, 10.50,
      0.00, 0.00, 14.85,  -16.23, 0.00, 10.50,  -22.95, 0.00, 0.00,  -16.23, 0.00, -10.50
    ]);
    const hill4 = createHill(v4, 0, { seed: 44, roughness: 0.12, subdivisions: 5, gentleEntryLength: 2.2 });
    elements.push(
      wrap("complex-hill-4", [0, -0.4, -72], 
        <mesh castShadow receiveShadow geometry={hill4.baseGeo}>{hillMaterial}</mesh>, "fixed", "trimesh"
      )
    );
    if (showHillOverlay) elements.push(<SlopeOverlay key="hill-4-overlay" geometry={hill4.overlayGeo} position={[0, -0.4, -72]} />);
    // --- גבעה 5: גבעה-על-גבעה ---
    // שינוי ממוקד:
    // א. בסיס הגבעה העליונה הוכנס פנימה כדי שלא יחרוג מעבר למפלס התחתון.
    // ב. הצד הצפוני של המפלס התחתון הורחב משמעותית כדי לרכך את המפגש עם האדמה.
    //
    // הבהרת כיוון:
    // הצד הצפוני = הצד שקרוב לבניין ורחוק מ-hill4
    // בקואורדינטות של הגבעה זה אומר z שלילי יותר.
    const v5base = new Float32Array([
      // טבעת עליונה / מפלס ראשון — נשארת כמו שהייתה
      0.00, 2.00, -6.00,   4.24, 2.00, -4.24,   6.00, 2.00, 0.00,   4.24, 2.00, 4.24,
      0.00, 2.00, 6.00,   -4.24, 2.00, 4.24,   -6.00, 2.00, 0.00,  -4.24, 2.00, -4.24,
      // טבעת בסיס תחתונה
      // הצד הצפוני הורחב מאוד:
      // צפון:        z=-12.25 -> z=-20.00
      // צפון-מזרח:  6.02,-8.67 -> 9.60,-15.20
      // מזרח:       x=10.00 -> x=14.00
      // מערב:       x=-10.00 -> x=-14.00
      // צפון-מערב: -6.02,-8.67 -> -9.60,-15.20
      //
      // הדרום נשאר כמו שהיה כדי לא לשנות את החיבור מכיוון hill4.
      0.00, 0.00, -22.00,   9.60, 0.00, -15.20,   14.00, 0.00, 0.00,   5.66, 0.00, 7.78,
      0.00, 0.00, 11.00,   -5.66, 0.00, 7.78,   -14.00, 0.00, 0.00,  -9.60, 0.00, -15.20
    ]);
    const hill5base = createHill(v5base, 0, { seed: 55, roughness: 0.14, subdivisions: 5 });
    elements.push(
      wrap("complex-hill-5-base", [0, -0.4, -91], 
        <mesh castShadow receiveShadow geometry={hill5base.baseGeo}>{hillMaterial}</mesh>, "fixed", "trimesh"
      )
    );
    if (showHillOverlay) elements.push(<SlopeOverlay key="hill-5-base-overlay" geometry={hill5base.overlayGeo} position={[0, -0.4, -91]} />);
    const v5top = new Float32Array([
      // פסגה עליונה — נשארת בדיוק כמו אצלך
      0.00, 1.45, -1.50,   1.06, 1.00, -1.06,   1.50, 1.45, 0.00,   1.06, 1.45, 1.06,
      0.00, 1.45, 1.50,   -1.06, 1.45, 1.06,   -1.50, 1.45, 0.00,  -1.06, 1.45, -1.06,
      // בסיס הגבעה העליונה
      // הבסיס הוכנס פנימה כדי לא לחרוג מעבר לשיפוע/פלטפורמה של המפלס התחתון.
      // במקום בסיס רחב מדי כמו 6.13/6.20, הוא יושב עכשיו בתוך טבעת המפלס הראשון.
      //
      // צפון:        z=-6.20 -> z=-5.40
      // צפון-מזרח:  5.04,-4.60 -> 3.82,-3.82
      // מזרח:       x=6.13 -> x=5.40
      // דרום-מזרח:  נשמר בתוך המפלס, 3.82,3.82
      // דרום:        z=5.50 -> z=5.40
      // דרום-מערב:  נשמר בתוך המפלס, -3.82,3.82
      // מערב:        x=-6.13 -> x=-5.40
      // צפון-מערב:  -5.04,-4.60 -> -3.82,-3.82
      0.00, 0.00, -5.40,   3.82, 0.00, -3.82,   5.40, 0.00, 0.00,   3.82, 0.00, 3.82,
      0.00, 0.00, 5.40,   -3.82, 0.00, 3.82,   -5.40, 0.00, 0.00,  -3.82, 0.00, -3.82
    ]);
    const hill5top = createHill(v5top, 0, { seed: 56, roughness: 0.10, subdivisions: 5, gentleEntryLength: 1.8 });
    elements.push(
      wrap("complex-hill-5-top", [0, 1.275, -91], 
        <mesh castShadow receiveShadow geometry={hill5top.baseGeo}>{hillMaterial}</mesh>, "fixed", "trimesh"
      )
    );
    if (showHillOverlay) elements.push(<SlopeOverlay key="hill-5-top-overlay" geometry={hill5top.overlayGeo} position={[0, 1.275, -91]} />);

    // =========================================================
    // הבניין
    // =========================================================
    const concreteColor = "#a89e8f"; 
    const floorColor = "#bdb3a3";    
    const wallH = 8;            
    
    // כמה להזיז את כל מתחם הבניין (קירות + כל השטיחים) אחורה לכיוון -Z.
    // קבוע יחיד לכוונון: הגדלה = יותר אחורה. שינוי כאן מזיז את כל מה שעובר ב-transformBldgPos יחד.
    const BLDG_BACK_SHIFT = 28;

    const transformBldgPos = (pos: [number, number, number]): [number, number, number] => {
      const dx = pos[0];
      const dz = pos[2] - (-130); 
      const rx = dz;
      const rz = -dx;
      // שימי לב: השארתי פה את ה-180- שלך. אל תשני אותו אם המרחק הזה טוב לך!
      return [rx - 40, pos[1], rz - 130 - BLDG_BACK_SHIFT]; 
    };
    
    const bldgRot: [number, number, number] = [0, -Math.PI / 2, 0];

    // הרצפה קוצרה לאורך 30, והורחבה מעט כדי להתאים לקיר החדש
    elements.push(wrap("bldg-floor", transformBldgPos([-1.25, -0.06, -125]), <mesh receiveShadow><boxGeometry args={[5.5, 0.1, 30]} /><meshStandardMaterial color={floorColor} polygonOffset={true} polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>, "fixed", "cuboid", bldgRot));
    
    // עדכון: רוחב המשקוף (הפתח) הוגדל ל-1.8, ואורך הקיר המרכזי קוצר ל-28.2 בהתאמה, עם חישוב מרכזים חדש
    elements.push(wrap("wall-left-main", transformBldgPos([-4, 4, -124.1]), <mesh castShadow receiveShadow><boxGeometry args={[0.4, wallH, 28.2]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    elements.push(wrap("wall-left-top-exit", transformBldgPos([-4, 5.5, -139.1]), <mesh castShadow receiveShadow><boxGeometry args={[0.4, 5, 1.8]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    // קיר אחורי הוזז פנימה (הבניין נגמר עכשיו ב-140- במקום 150-)
    elements.push(wrap("wall-back", transformBldgPos([-1.25, 4, -140]), <mesh castShadow receiveShadow><boxGeometry args={[5.5, wallH, 0.4]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    // חזית הבניין - עודכנה למלא את הפתח בדיוק עד לקיר הימני החדש
    elements.push(wrap("facade-top-left", transformBldgPos([-3.0, 5.5, -110]), <mesh castShadow receiveShadow><boxGeometry args={[1.6, 5, 0.4]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    
    // הקיר האמצעי - הורחב במעט ל-3.2 שמאלה (הצד הימני שלו נעול כדי לא להרוס את המלכודת)
    elements.push(wrap("facade-center-solid", transformBldgPos([-0.85, 4, -110]), <mesh castShadow receiveShadow><boxGeometry args={[2.7, wallH, 0.4]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    
    // המשקוף המזויף - הותאם לרוחב החדש של 1.0 בדיוק
    elements.push(wrap("facade-fake-top", transformBldgPos([0.9, 5.5, -110]), <mesh castShadow receiveShadow><boxGeometry args={[0.8, 5, 0.4]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    
    // הקיר הפנימי המפריד - קוצר לאורך 25 יחידות
    elements.push(wrap("divider-wall", transformBldgPos([-1.5, 4, -122.5]), <mesh castShadow receiveShadow><boxGeometry args={[0.4, wallH, 25]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));
    
    // שינוי 2: הקיר הימני החיצוני מאוחד כעת לקיר אחד שלם, ארוך וסגור לחלוטין באורך 30 (ללא שום פתח יציאה)
    elements.push(wrap("wall-right-solid", transformBldgPos([1.5, 4, -125]), <mesh castShadow receiveShadow><boxGeometry args={[0.4, wallH, 30]} /><meshStandardMaterial color={concreteColor} /></mesh>, "fixed", "cuboid", bldgRot));

    // =========================================================
    // שטיחי המדידה (Checkpoints)
    // =========================================================
    
    // 1. מקטע 1: תחילת הגבעות הראשונות - מתחיל ניסוי
    // הוזז מ-3- ל-3.5 כי הזנב הקדמי של גבעה 1 נמתח קדימה עד z=+1.25; השטיח עכשיו ממש לפניה.
    elements.push(<GroundSensor key="sensor-2" position={[0, 0, 3.5]} size={[15, 1.4]} onCross={() => triggerSensor2()} visualsOnly={visualsOnly} />);
    
    // 2. סוף מקטע 1: ירידה מגבעה 3
    elements.push(<GroundSensor key="sensor-3" position={[0, 0, -49]} size={[15, 1.4]} onCross={() => triggerSensor3()} visualsOnly={visualsOnly} />);
    
    // 3. סוף מקטע 2: אחרי גבעה 6
    // הוזז מ-110- ל-121- כי גבעה 5 נמתחה אחורה עד z=-118.5; השטיח עכשיו אחריה, לפני הבניין.
    elements.push(<GroundSensor key="sensor-hill-6-end" position={[0, 0, -118]} size={[15, 1.4]} onCross={() => triggerHill6End()} visualsOnly={visualsOnly} />);

    // 4. הגעה לבניין (מבחוץ)
    elements.push(<GroundSensor key="sensor-bldg-outside" position={transformBldgPos([-3.0, 0, -106])} size={[13, 1.4]} rotationY={-Math.PI / 2} onCross={() => triggerBldgOutside()} visualsOnly={visualsOnly} />);

    // 5. כניסה למבנה (מבפנים) - נשאר במיקומו המקורי
    elements.push(<GroundSensor key="sensor-bldg-inside" position={transformBldgPos([-2.8, 0, -113])} size={[2.1, 0.8]} rotationY={-Math.PI / 2} onCross={() => triggerBldgInside()} visualsOnly={visualsOnly} />);

    // שטיח הסיבוב (ימני) - נדרך פעמיים: דריכה 1 מתחילה מדידת סיבוב, דריכה 2 מסיימת אותו
    elements.push(
      <GroundSensor 
        key="sensor-4" 
        position={transformBldgPos([0.1, 0.01, -134])} 
        size={[2.8, 0.6]} 
        rotationY={-Math.PI / 2} 
        onCross={() => triggerSensor4()} 
        visualsOnly={visualsOnly} 
      />
    );
    
    // 7. יציאה מהבניין - הוזז פיזית אל מחוץ לקיר החיצוני השמאלי (`5.5-` במערכת הצירים) כדי לקלוט את הרובוט ברגע שהוא עובר בפתח החדש
    elements.push(<GroundSensor key="sensor-5" position={transformBldgPos([-5.5, 0, -139])} size={[8, 1]} rotationY={0} onCross={() => triggerSensor5()} visualsOnly={visualsOnly} />);

    // שערים וירטואליים בראשי הגבעות (גבעה 1 הוסרה; המספור מתחיל מ-0 בגבעה הבאה)
    elements.push(
      <VirtualGate key="gate-0" index={0} position={[-2.4, 2.575, -35]} visualsOnly={visualsOnly} />,
      <VirtualGate key="gate-1" index={1} position={[0, 3.578, -72]} visualsOnly={visualsOnly} />,
      <VirtualGate key="gate-2" index={2} position={[0, 2.5075, -91]} visualsOnly={visualsOnly} />
    );
    
    return elements;
  }, [visualsOnly, showHillOverlay, practice]);

  const treeModel = useGLTF(`${import.meta.env.BASE_URL}tree.glb`);

  const trees = useMemo(() => {
    const elements = [];

    // פונקציית הגרלה מקובעת
    let currentSeed = 42; // גרעין ההגרלה. 
    const seededRandom = () => {
      let x = Math.sin(currentSeed++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 0; i++) {
      // החלפנו את Math.random() בפונקציה המקובעת שלנו
      const x = (seededRandom() - 0.5) * 450; 
      const z = (seededRandom() - 0.5) * 450; 
      
      // אזור ה"אל תשים עצים כאן" נשאר כפי שהיה
      if (x > -35 && x < 35 && z < 20 && z > -160) continue;

      const scale = 1 + seededRandom() * 1.5; 
      const rotationY = seededRandom() * Math.PI * 2; 

      elements.push(
        <SwayingTree 
          key={`tree-${i}`}
          treeModel={treeModel}
          x={x}
          z={z}
          scale={scale}
          rotationY={rotationY}
          visualsOnly={visualsOnly}
        />
      );
    }

    return elements;
  }, [visualsOnly, treeModel]);

  const base = import.meta.env.BASE_URL;
  const [kurkarTex, grassTex, noiseTex] = useTexture([
    `${base}kurkar.jpg`, 
    `${base}grass.jpg`, 
    `${base}noise.jpg`
  ]);
  
  [kurkarTex, grassTex, noiseTex].forEach(tex => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  });

  kurkarTex.repeat.set(150, 150);
  grassTex.repeat.set(150, 150);
  noiseTex.repeat.set(6, 6); 

  const ground = (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial map={kurkarTex} color="#e6d8b8" roughness={1} metalness={0.05} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial
          alphaMap={noiseTex}
          transparent={true}
          opacity={0.55}
          roughness={1}
          depthWrite={false}
          polygonOffset={true}
          polygonOffsetFactor={-1}
          color="#8f8168"
        />
      </mesh>
    </group>
  );

  const boundaries = (
    <group>
      <mesh receiveShadow castShadow position={[0, 2.5, -250]}><boxGeometry args={[500, 5, 2]} /><meshStandardMaterial color="#222" opacity={0.5} transparent /></mesh>
      <mesh receiveShadow castShadow position={[0, 2.5, 250]}><boxGeometry args={[500, 5, 2]} /><meshStandardMaterial color="#222" opacity={0.5} transparent /></mesh>
      <mesh receiveShadow castShadow position={[250, 2.5, 0]}><boxGeometry args={[2, 5, 500]} /><meshStandardMaterial color="#222" opacity={0.5} transparent /></mesh>
      <mesh receiveShadow castShadow position={[-250, 2.5, 0]}><boxGeometry args={[2, 5, 500]} /><meshStandardMaterial color="#222" opacity={0.5} transparent /></mesh>
    </group>
  );

  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <Environment preset="sunset" />
      <ambientLight intensity={0.3} />
      <directionalLight castShadow position={[10, 20, 10]} intensity={1.5} shadow-bias={-0.0005} shadow-mapSize={[2048, 2048]} shadow-camera-left={-250} shadow-camera-right={250} shadow-camera-top={250} shadow-camera-bottom={-250} />
      
      {visualsOnly ? (
        <>
          {ground}
          {boundaries}
          {trees}
        </>
      ) : (
        <>
          <RigidBody type="fixed" friction={1}>{ground}</RigidBody>
          <RigidBody type="fixed" position={[0, 2.5, -250]}><mesh visible={false}><boxGeometry args={[500, 5, 2]} /></mesh></RigidBody>
          <RigidBody type="fixed" position={[0, 2.5, 250]}><mesh visible={false}><boxGeometry args={[500, 5, 2]} /></mesh></RigidBody>
          <RigidBody type="fixed" position={[250, 2.5, 0]}><mesh visible={false}><boxGeometry args={[2, 5, 500]} /></mesh></RigidBody>
          <RigidBody type="fixed" position={[-250, 2.5, 0]}><mesh visible={false}><boxGeometry args={[2, 5, 500]} /></mesh></RigidBody>
          {boundaries}
        </>
      )}

      {!practice && <DesertVillage visualsOnly={visualsOnly} />}
      {obstacles}
      {!visualsOnly && <CompassHUD />}
    </>
  );
}

function SlopeOverlay({ geometry, position }) {
  const fillMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const wireMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  const hillWorldPos = useMemo(() => new THREE.Vector3(position[0], position[1], position[2]), [position]);
  const cameraWorldPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    if (!groupRef.current || !fillMaterialRef.current || !wireMaterialRef.current) return;

    camera.getWorldPosition(cameraWorldPos);
    
    const distance = cameraWorldPos.distanceTo(hillWorldPos);

    const maxDistance = 50; 
    const minDistance = 15; 

    let alpha = 1.0 - ((distance - minDistance) / (maxDistance - minDistance));
    alpha = THREE.MathUtils.clamp(alpha, 0, 1); 

    fillMaterialRef.current.opacity = alpha * 0.6; 
    wireMaterialRef.current.opacity = alpha * 1.0; 

    const isVisible = alpha > 0.01;
    fillMaterialRef.current.visible = isVisible;
    wireMaterialRef.current.visible = isVisible;
  });

  return (
    <group position={position} ref={groupRef}>
      <mesh geometry={geometry}>
        <meshBasicMaterial 
          ref={fillMaterialRef} 
          vertexColors={true} 
          transparent={true} 
          side={THREE.DoubleSide} 
          depthWrite={false} 
        />
      </mesh>
      
      <mesh geometry={geometry}>
        <meshBasicMaterial 
          ref={wireMaterialRef} 
          vertexColors={true} 
          wireframe={true} 
          transparent={true} 
          side={THREE.DoubleSide} 
          depthWrite={false} 
        />
      </mesh>
    </group>
  );
}

function CompassHUD() {
  const stripRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);
  const robotBodyRef = useTelemetryStore((s) => s.robotBodyRef);

  const textStroke = {
    textShadow: `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000`
  };

  useFrame(() => {
    if (!robotBodyRef.current) return;
    const rot = robotBodyRef.current.rotation();
    const quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);

    let angle = Math.atan2(direction.x, -direction.z);
    let degrees = (angle * 180) / Math.PI;
    degrees = (degrees + 360) % 360;

    // שומרים ל-store כדי שהמצפן ב-HTML (בכל חלונית) יוכל לקרוא
    useTelemetryStore.getState().setRobotHeading(degrees);

    if (numberRef.current) {
      numberRef.current.innerText = Math.round(degrees).toString().padStart(3, '0');
    }

    if (stripRef.current) {
      const offset = degrees * 6;
      stripRef.current.style.transform = `translateX(${-offset}px)`;
    }
  });

  return (
    <Html
      calculatePosition={() => [0, 0]} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        display: 'none',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <div style={{
        marginTop: '2px', 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '360px'
      }}>
        <div ref={numberRef} style={{
          fontSize: '15px', 
          fontWeight: 'bold',
          color: 'white',
          fontFamily: 'monospace',
          ...textStroke
        }}>000</div>

        <div style={{
          width: '1.5px',
          height: '35px',
          backgroundColor: 'white',
          boxShadow: '1px 1px 0px black',
          zIndex: 10
        }} />

        <div style={{
          width: '100%',
          height: '30px',
          overflow: 'hidden',
          position: 'relative',
          marginTop: '-25px' 
        }}>
          <div ref={stripRef} style={{
            position: 'absolute',
            top: '5px',
            left: '50%',
            width: '0',
            height: '100%',
            willChange: 'transform'
          }}>
            {renderTicks}
          </div>
        </div>
      </div>
    </Html>
  );
}

const renderTicks = (() => {
  const ticks = [];
  const stroke = { textShadow: `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000` };
  for (let i = -180; i <= 540; i += 5) { 
    const isMajor = i % 30 === 0; 
    const deg = ((i % 360) + 360) % 360;
    let label = "";
    if (deg === 0) label = "N";
    else if (deg === 90) label = "E";
    else if (deg === 180) label = "S";
    else if (deg === 270) label = "W";
    else if (isMajor) label = (deg / 10).toString().padStart(2, '0');

    ticks.push(
      <div key={i} style={{
        position: 'absolute',
        left: `${i * 6}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '30px',
        transform: 'translateX(-50%)',
        color: 'white',
        ...stroke
      }}>
        {label && <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{label}</span>}
        <div style={{ width: '1px', height: isMajor ? '15px' : '7px', backgroundColor: 'white', boxShadow: '0.5px 0.5px 0px black' }} />
      </div>
    );
  }
  return ticks;
})();