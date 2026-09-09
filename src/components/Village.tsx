// File: src/components/Village.tsx
import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useGLTF, Clone } from '@react-three/drei';

// ==========================================
// שיידר גלובלי שמייצר טיח ובטון תעשייתי (מעודן למניעת ריצוד)
// ==========================================
const noiseGLSL = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float smoothNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float fbm(vec3 x) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    // ירדנו מ-4 ל-3 שכבות כדי להפחית פרטים זעירים שמרצדים מרחוק
    for (int i = 0; i < 3; ++i) { 
      v += a * smoothNoise(x);
      x = x * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }
`;

const injectDirtShader = (shader: any) => {
  shader.vertexShader = shader.vertexShader.replace(
    'void main() {',
    `varying vec3 vLocalPos;\nvoid main() {`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>\n  vLocalPos = position;`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    'void main() {',
    `varying vec3 vLocalPos;\n${noiseGLSL}\nvoid main() {
    float cloudDirt = smoothNoise(vLocalPos * 1.5); 
    
    // הורדנו צפיפות ל-6.0 כדי שהגרגירים יהיו מעט גדולים ורכים יותר
    float plasterGrit = fbm(vLocalPos * 6.0); 
    `
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_begin>',
    `
    #include <normal_fragment_begin>
    vec3 gritGrad = vec3(dFdx(plasterGrit), dFdy(plasterGrit), 0.0);
    // החלשנו את עומק השקעים מ-0.9 ל-0.65 לקבלת שבירת אור עדינה יותר
    normal = normalize(normal - gritGrad * 0.65);
    `
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `
    #include <roughnessmap_fragment>
    roughnessFactor = clamp(roughnessFactor + cloudDirt * 0.3 + plasterGrit * 0.2, 0.0, 1.0);
    `
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `
    #include <color_fragment>
    // נותנים קצת יותר משקל לכתמים הרכים לעומת החספוס
    float finalVisualDirt = (cloudDirt * 0.6) + (plasterGrit * 0.4);
    // עידון הצבע: 88% צבע מקורי ורק 12% לכלוך (במקום 15%)
    diffuseColor.rgb *= (0.88 + 0.12 * finalVisualDirt);
    `
  );
};
import { QuadraticBezierLine } from '@react-three/drei';

/* ---------- פלטת חומרים ---------- */
const PLASTER = ['#cfc6b4', '#c2b9a6', '#b8ae9a', '#d4ccbb', '#b0a48c', '#c8b596', '#a99e88', '#b98c66'];
const SKIRT = '#6f6853';
const STRUCT = '#a89e8f';
const DARK = '#2b2620';
const REBAR = '#6e6a63';
const RUBBLE = '#8b8377';
const RUBBLE2 = '#7c7468';
const SCORCH = '#3a352d';
const EARTH = '#9d8d6f';
const WOOD = '#7a5f3c';
const METAL = '#8a8f92';
const WIRE = '#1f1c18';
const TANK = ['#39362f', '#b9bcbe', '#8c6a4a'];
const PALM_FROND = '#6f7d45';
const PALM_TRUNK = '#8a7350';
const SHRUB = '#a89a6a';

/* ---------- אזורים אסורים: גבעות + 3 מ׳, רצועת מרכז, בניין קיים ---------- */
/* הבניין הוזז אחורה ב-16 מ׳ (BLDG_BACK_SHIFT: 12->28), לכן תיבת החסימה שלו הוסטה בהתאם ל-z. */
const HILL_KEEPOUT = [
  { x: 0, z: -20, rx: 20.5, rz: 16.0 },
  { x: 0, z: -35, rx: 20.5, rz: 16.0 },
  { x: -7, z: -72, rx: 24.5, rz: 21.6 },
  { x: 0, z: -98, rx: 20.5, rz: 23.6 },
];
function blocked(x: number, z: number) {
  for (const h of HILL_KEEPOUT) {
    const dx = (x - h.x) / h.rx, dz = (z - h.z) / h.rz;
    if (dx * dx + dz * dz < 1) return true;
  }
  if (Math.abs(x) < 22 && z < 12 && z > -125) return true; // מרכז
  if (x > -52 && x < -18 && z < -150 && z > -180) return true; // בניין היעד (במיקומו החדש)
  return false;
}

/* ---------- הנתיב המתפתל אל הבניין ---------- */
/* נקודות מרכז ה-S (world x,z) מסוף הגבעות עד כניסת הבניין. */
const PATH: [number, number][] = [
  [0, -126],
  [6, -133],
  [3, -140],
  [-8, -147],
  [-15, -153],
];
/* רוחב חצי-נתיב בכל נקודה: 2.75 = ~5.5 מ׳, ובאמצע מצטמצם ל-1.25 = ~2.5 מ׳ (סמטה). */
const PATH_HALF = [2.75, 2.75, 1.1, 2.6, 2.75];

/* מרחק מהנקודה הקרובה ביותר על ציר הנתיב, ומהו חצי-הרוחב שם */
function pathClearance(x: number, z: number) {
  let best = Infinity, halfAt = 2.75;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, pz = az + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) { best = dist; halfAt = PATH_HALF[i] + t * (PATH_HALF[i + 1] - PATH_HALF[i]); }
  }
  return { dist: best, half: halfAt };
}
/* חוסם כל דבר שנופל בתוך הנתיב (עם מרווח קטן). */
function onPath(x: number, z: number, margin = 0.4) {
  const { dist, half } = pathClearance(x, z);
  return dist < half + margin;
}

/* ---------- עוזרים ליצירת צורות ---------- */
type V3 = [number, number, number];
const box = (k: string, a: V3, p: V3, c: string, ro = 1, cast = false, rot: V3 = [0, 0, 0]) => (
  <mesh key={k} position={p} rotation={rot} castShadow={cast}>
    <boxGeometry args={a} />
    <meshStandardMaterial 
      color={c} 
      roughness={ro} 
      flatShading 
      onBeforeCompile={injectDirtShader}
      customProgramCacheKey={() => 'dirty_concrete_shader'}
    />
  </mesh>
);
const cyl = (k: string, r1: number, r2: number, h: number, seg: number, p: V3, c: string, ro = 1, cast = false, rot: V3 = [0, 0, 0], metal = 0) => (
  <mesh key={k} position={p} rotation={rot} castShadow={cast}>
    <cylinderGeometry args={[r1, r2, h, seg]} />
    <meshStandardMaterial color={c} roughness={ro} metalness={metal} />
  </mesh>
);

/* ---------- בית ---------- */
function houseGroup(w: number, d: number, h: number, color: string, condition: string, rnd: () => number) {
  const p: any[] = [];
  let n = 0;
  const key = () => 'm' + n++;

  p.push(box(key(), [w, h, d], [0, h / 2, 0], color, 0.96, true));
  p.push(box(key(), [w + 0.12, 0.5, d + 0.12], [0, 0.25, 0], SKIRT, 1));

  for (let i = 0; i < 2; i++) {
    if (rnd() < 0.6) p.push(box(key(), [0.25, h * 0.5, 0.02], [(rnd() - 0.5) * w * 0.7, h * 0.45, d / 2 + 0.02], SCORCH, 1));
  }

  const floors = Math.max(1, Math.round(h / 2.6));
  const floorH = h / floors;
  const faces: { axis: 'z' | 'x'; sign: number; span: number }[] = [
    { axis: 'z', sign: 1, span: w }, { axis: 'z', sign: -1, span: w },
    { axis: 'x', sign: 1, span: d }, { axis: 'x', sign: -1, span: d },
  ];
  for (const f of faces) {
    const cols = Math.max(1, Math.floor(f.span / 1.5));
    for (let fl = 0; fl < floors; fl++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.18) continue;
        const along = (c - (cols - 1) / 2) * (f.span / cols);
        const y = fl * floorH + floorH * 0.58;
        const isDoor = fl === 0 && c === Math.floor(cols / 2) && f.axis === 'z' && f.sign === 1;
        const ww = isDoor ? 0.85 : 0.62, wh = isDoor ? floorH * 0.62 : floorH * 0.42;
        const yy = isDoor ? wh / 2 + 0.02 : y;
        const pos: V3 = f.axis === 'z' ? [along, yy, f.sign * (d / 2 - 0.16)] : [f.sign * (w / 2 - 0.16), yy, along];
        const sz: V3 = f.axis === 'z' ? [ww, wh, 0.1] : [0.1, wh, ww];
        p.push(<mesh key={key()} position={pos}><boxGeometry args={sz} /><meshStandardMaterial color={DARK} roughness={1} /></mesh>);
        const lp: V3 = f.axis === 'z' ? [along, yy + wh / 2 + 0.06, f.sign * (d / 2 + 0.01)] : [f.sign * (w / 2 + 0.01), yy + wh / 2 + 0.06, along];
        const ls: V3 = f.axis === 'z' ? [ww + 0.18, 0.12, 0.06] : [0.06, 0.12, ww + 0.18];
        p.push(box(key(), ls, lp, STRUCT, 1));
        if (!isDoor && rnd() < 0.25) {
          const shp: V3 = f.axis === 'z' ? [along, y, f.sign * (d / 2 + 0.06)] : [f.sign * (w / 2 + 0.06), y, along];
          const shs: V3 = f.axis === 'z' ? [ww, wh, 0.04] : [0.04, wh, ww];
          p.push(box(key(), shs, shp, rnd() < 0.5 ? '#6b7b6a' : '#8a6b4a', 1));
        }
      }
    }
  }

  if (condition === 'intact') {
    p.push(box(key(), [w, 0.4, 0.16], [0, h + 0.2, d / 2 - 0.08], STRUCT, 1, true));
    p.push(box(key(), [w, 0.4, 0.16], [0, h + 0.2, -d / 2 + 0.08], STRUCT, 1, true));
    p.push(box(key(), [0.16, 0.4, d], [w / 2 - 0.08, h + 0.2, 0], STRUCT, 1, true));
    p.push(box(key(), [0.16, 0.4, d], [-w / 2 + 0.08, h + 0.2, 0], STRUCT, 1, true));
    if (h > 4.2 && rnd() < 0.5) {
      const sw = w * 0.55, sd = d * 0.55, sh = 2.2;
      p.push(box(key(), [sw, sh, sd], [w * 0.12, h + sh / 2, -d * 0.1], color, 0.96, true));
    }
    const ry = h + 0.45;
    if (rnd() < 0.8) { const t = TANK[Math.floor(rnd() * 3)]; p.push(cyl(key(), 0.42, 0.42, 0.8, 12, [w * 0.2, ry + 0.4, d * 0.15], t, 0.8, true)); p.push(box(key(), [0.9, 0.1, 0.9], [w * 0.2, ry, d * 0.15], STRUCT, 1)); }
    if (rnd() < 0.6) p.push(box(key(), [0.7, 0.5, 0.5], [-w * 0.25, ry + 0.25, -d * 0.2], METAL, 0.6, true));
    if (rnd() < 0.5) { p.push(cyl(key(), 0.02, 0.02, 0.6, 6, [-w * 0.3, ry + 0.3, d * 0.25], METAL, 0.5, false, [0, 0, 0], 0.5)); p.push(cyl(key(), 0.35, 0.35, 0.06, 10, [-w * 0.3, ry + 0.6, d * 0.25], '#d8d4cc', 0.4, false, [0.9, 0, 0.3])); }
    if (rnd() < 0.5) p.push(cyl(key(), 0.015, 0.015, 1.3, 5, [w * 0.35, ry + 0.65, -d * 0.3], METAL, 0.5, false, [0, 0, 0], 0.5));
  } else if (condition === 'unfinished') {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
      p.push(cyl(key(), 0.022, 0.022, 1.0, 6, [sx * (w / 2 - 0.15), h + 0.5, sz * (d / 2 - 0.15)], REBAR, 0.6, false, [0, 0, 0], 0.6));
    p.push(box(key(), [w * 0.6, 0.18, d * 0.7], [-w * 0.12, h + 0.09, 0], STRUCT, 1, true));
    if (rnd() < 0.6) p.push(box(key(), [0.1, 0.1, 1.6], [w * 0.3, h + 0.15, 0], WOOD, 1, false, [0.3, 0, 0]));
    p.push(cyl(key(), 0.9, 0.0, 0.5, 8, [w * 0.5 + 0.4, 0.25, d * 0.4], EARTH, 1, true));
  } else {
    p.push(box(key(), [w * 0.7, 0.14, d * 0.6], [w * 0.15, h * 0.7, d * 0.3], color, 1, true, [0.4, 0.2, 0.1]));
    for (let i = 0; i < 5; i++) {
      const rs = 0.3 + rnd() * 0.5;
      p.push(box(key(), [rs, rs * 0.7, rs], [(rnd() - 0.3) * w, rs * 0.35, d * 0.5 + rnd() * 1.2], rnd() < 0.5 ? RUBBLE : RUBBLE2, 1, true, [rnd(), rnd() * 3, rnd()]));
    }
    p.push(box(key(), [w * 0.5, h * 0.6, 0.05], [w * 0.2, h * 0.35, d / 2 + 0.03], SCORCH, 1));
    p.push(box(key(), [0.12, 0.12, 1.4], [-w * 0.2, h * 0.55, d * 0.5], REBAR, 0.7, false, [0.5, 0, 0.3]));
  }
  return <group>{p}</group>;
}

/* ---------- קיר חצר ---------- */
function wallNode(len: number, rnd: () => number) {
  const p: any[] = [];
  let n = 0;
  const seg = Math.max(2, Math.floor(len / 1.2));
  const gap = rnd() < 0.5 ? Math.floor(rnd() * seg) : -1;
  for (let i = 0; i < seg; i++) {
    const x = (i - (seg - 1) / 2) * (len / seg);
    if (i === gap) continue;
    const hh = 1.5 + rnd() * 0.5;
    p.push(box('w' + n++, [len / seg + 0.02, hh, 0.28], [x, hh / 2, 0], i % 3 === 0 ? STRUCT : PLASTER[2], 1, true));
    if (i % 2 === 0) p.push(box('p' + n++, [0.34, hh + 0.25, 0.34], [x - len / seg / 2, (hh + 0.25) / 2, 0], STRUCT, 1, true));
  }
  return <group>{p}</group>;
}

/* ---------- אביזרים ---------- */
const barrel = (k: string, c = '#7a4a3a') => <group key={k}>{cyl('b', 0.3, 0.3, 0.9, 12, [0, 0.45, 0], c, 0.6, true, [0, 0, 0], 0.4)}{cyl('r1', 0.31, 0.31, 0.05, 12, [0, 0.65, 0], '#5a3a2e', 0.6)}{cyl('r2', 0.31, 0.31, 0.05, 12, [0, 0.25, 0], '#5a3a2e', 0.6)}</group>;
const barrelTipped = (k: string, c = '#6a5a3a') => <group key={k} rotation={[Math.PI / 2, 0, 0]}>{cyl('b', 0.3, 0.3, 0.9, 12, [0, 0, 0], c, 0.6, true, [0, 0, 0], 0.4)}</group>;
const jersey = (k: string) => <mesh key={k} castShadow position={[0, 0.5, 0]}><boxGeometry args={[1.6, 1.0, 0.6]} /><meshStandardMaterial color={STRUCT} roughness={1} flatShading /></mesh>;
const sandbags = (k: string, rnd: () => number) => { const p: any[] = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) p.push(box('s' + r + c, [0.5, 0.22, 0.35], [(c - (2 - r) / 2) * 0.52 + (r % 2) * 0.2, 0.11 + r * 0.22, 0], r % 2 ? '#8f8261' : '#9c8f6e', 1, true)); return <group key={k}>{p}</group>; };
const pole = (k: string) => (
  <group key={k}>
    {/* עמוד מרכזי גבוה וכהה יותר */}
    {cyl('pl', 0.11, 0.15, 6.5, 8, [0, 3.25, 0], '#4a3b2c', 0.9, true)}
    
    {/* קורות עץ אופקיות */}
    {box('cr1', [1.8, 0.12, 0.12], [0, 5.8, 0], '#4a3b2c', 1, true)}
    {box('cr2', [1.2, 0.12, 0.12], [0, 5.2, 0], '#4a3b2c', 1, true)}
    
    {/* מבודדי חרסינה (Insulators) */}
    {cyl('ins1', 0.04, 0.05, 0.2, 6, [-0.8, 5.9, 0], '#e0e0e0', 0.4, true)}
    {cyl('ins2', 0.04, 0.05, 0.2, 6, [0.8, 5.9, 0], '#e0e0e0', 0.4, true)}
    {cyl('ins3', 0.04, 0.05, 0.2, 6, [0, 5.9, 0], '#e0e0e0', 0.4, true)}
    {cyl('ins4', 0.04, 0.05, 0.2, 6, [-0.5, 5.3, 0], '#e0e0e0', 0.4, true)}
    {cyl('ins5', 0.04, 0.05, 0.2, 6, [0.5, 5.3, 0], '#e0e0e0', 0.4, true)}

    {/* קופסת שנאי (Transformer) ותפס מתכת */}
    {cyl('trans', 0.25, 0.25, 0.7, 10, [0.25, 4.2, 0], '#595f63', 0.6, true, [0, 0, 0], 0.8)}
    {box('trans-conn', [0.15, 0.05, 0.05], [0.1, 4.2, 0], '#3a3d40', 1, true)}
  </group>
);
const rubblePile = (k: string, rnd: () => number, big = 1) => { const p: any[] = []; const cnt = 3 + Math.floor(rnd() * 4 * big); for (let i = 0; i < cnt; i++) { const s = (0.25 + rnd() * 0.5) * big; p.push(box('r' + i, [s, s * 0.7, s], [(rnd() - 0.5) * 1.6 * big, s * 0.35, (rnd() - 0.5) * 1.6 * big], rnd() < 0.5 ? RUBBLE : RUBBLE2, 1, true, [rnd(), rnd() * 3, rnd()])); } return <group key={k}>{p}</group>; };
const trash = (k: string, rnd: () => number) => { const p: any[] = []; const cols = ['#7a4a3a', '#4a5a3a', '#8a7350', '#6b6b64', '#94433a']; const cnt = 3 + Math.floor(rnd() * 4); for (let i = 0; i < cnt; i++) { const s = 0.12 + rnd() * 0.22; p.push(box('t' + i, [s, s * 0.8, s * 1.2], [(rnd() - 0.5) * 1.5, s * 0.4, (rnd() - 0.5) * 1.5], cols[Math.floor(rnd() * cols.length)], 1, true, [rnd() * 2, rnd() * 3, rnd() * 2])); } return <group key={k}>{p}</group>; };
const palm = (k: string, rnd: () => number) => { const p: any[] = [cyl('t', 0.09, 0.15, 3.0, 7, [0, 1.5, 0], PALM_TRUNK, 1, true)]; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; p.push(box('f' + i, [1.7, 0.05, 0.3], [Math.cos(a) * 0.6, 3.05 - 0.15, Math.sin(a) * 0.6], PALM_FROND, 1, false, [0.5, -a, 0])); } return <group key={k}>{p}</group>; };
const shrub = (k: string, rnd: () => number) => { const p: any[] = []; for (let i = 0; i < 4; i++) p.push(<mesh key={'c' + i} castShadow position={[(rnd() - 0.5) * 0.4, 0.25, (rnd() - 0.5) * 0.4]}><coneGeometry args={[0.16, 0.55, 5]} /><meshStandardMaterial color={SHRUB} roughness={1} flatShading /></mesh>); return <group key={k}>{p}</group>; };

/* ---------- צריח + מגדל מים (רקע) ---------- */
const minaret = (k: string) => <group key={k}>{cyl('base', 1.1, 1.1, 2, 4, [0, 1, 0], PLASTER[3], 1, true, [0, Math.PI / 4, 0])}{cyl('sh', 0.7, 0.8, 10, 8, [0, 7, 0], PLASTER[3], 1, true)}{cyl('bal', 1.0, 1.0, 0.6, 8, [0, 11, 0], STRUCT, 1, true)}{cyl('sh2', 0.55, 0.6, 3, 8, [0, 13, 0], PLASTER[3], 1, true)}<mesh position={[0, 15.2, 0]} castShadow><sphereGeometry args={[0.75, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={'#c8b596'} roughness={0.8} /></mesh>{cyl('sp', 0.03, 0.03, 1, 6, [0, 16, 0], METAL, 0.4, false, [0, 0, 0], 0.6)}</group>;
const watertower = (k: string) => <group key={k}>{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map((s, i) => cyl('l' + i, 0.12, 0.12, 8, 6, [s[0] * 1.3, 4, s[1] * 1.3], METAL, 0.5, true, [0, 0, 0], 0.5))}{cyl('tk', 2.2, 2.2, 3, 14, [0, 9.5, 0], '#9aa0a2', 0.6, true)}{cyl('cap', 0, 2.2, 1.2, 14, [0, 11.6, 0], '#8a9092', 0.6, true)}</group>;

/* ---------- חוטי חשמל בין שני עמודים (קווים חלקים מרובים) ---------- */
function wire(key: string, a: [number, number], b: [number, number], topY = 5.9) {
  const [ax, az] = a, [bx, bz] = b;
  const sag = 1.2; // עומק הבטן של החוט
  
  // חישוב נקודת האמצע של העקומה עבור אפקט הכבידה
  const midX = (ax + bx) / 2;
  const midZ = (az + bz) / 2;
  const midY = topY - sag;

  // יוצרים 3 חוטים שיימתחו בדיוק בין 3 המבודדים העליונים שהוספנו
  return (
    <group key={key}>
      <QuadraticBezierLine start={[ax - 0.8, topY, az]} end={[bx - 0.8, topY, bz]} mid={[midX - 0.8, midY, midZ]} color={WIRE} lineWidth={1.5} transparent opacity={0.8} />
      <QuadraticBezierLine start={[ax + 0.8, topY, az]} end={[bx + 0.8, topY, bz]} mid={[midX + 0.8, midY, midZ]} color={WIRE} lineWidth={1.5} transparent opacity={0.8} />
      <QuadraticBezierLine start={[ax, topY, az]} end={[bx, topY, bz]} mid={[midX, midY, midZ]} color={WIRE} lineWidth={1.5} transparent opacity={0.8} />
    </group>
  );
}

/* ---------- wrapper עם/בלי פיזיקה ---------- */
function solid(key: string, x: number, z: number, rot: number, col: V3 | null, colY: number, vo: boolean, node: any) {
  if (vo) return <group key={key} position={[x, 0, z]} rotation={[0, rot, 0]}>{node}</group>;
  return (
    <RigidBody key={key} type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, rot, 0]}>
      {node}
      {col && <CuboidCollider args={col} position={[0, colY, 0]} />}
    </RigidBody>
  );
}

/* ================= הכפר ================= */
const DENSITY = 1.4;

export function DesertVillage({ visualsOnly = false }: { visualsOnly?: boolean }) {
  const elements = useMemo(() => {
    const out: any[] = [];
    let seed = 20240610;
    const rnd = () => { const s = Math.sin(seed++) * 43758.5453; return s - Math.floor(s); };
    const range = (a: number, b: number) => a + rnd() * (b - a);
    const rotP = (lx: number, lz: number, a: number): [number, number] => [lx * Math.cos(a) - lz * Math.sin(a), lx * Math.sin(a) + lz * Math.cos(a)];
    let uid = 0;

    // בדיקה משולבת: לא בגבעות/מרכז/בניין, ולא על הנתיב
    const free = (x: number, z: number) => !blocked(x, z) && !onPath(x, z);

    /* ---------- אשכולות הכפר הכלליים ---------- */
    const clusterCount = Math.round(18 * DENSITY);
    for (let ci = 0; ci < clusterCount; ci++) {
      let ax = 0, az = 0, ok = false;
      for (let t = 0; t < 60 && !ok; t++) {
        const side = rnd() < 0.5 ? -1 : 1;
        ax = side * range(27, rnd() < 0.65 ? 74 : 108);
        az = range(14, -180);
        if (free(ax, az)) ok = true;
      }
      if (!ok) continue;
      const baseRot = range(0, Math.PI * 2);
      const rows = 2 + Math.floor(rnd() * 3), cols = 2 + Math.floor(rnd() * 3);
      const cellX = 4.9, cellZ = 4.9;
      const padR = rotP(0, 0, baseRot);
      out.push(
        <group key={'pad' + ci} position={[ax + padR[0], 0.02, az + padR[1]]} rotation={[0, baseRot, 0]}>
          <mesh>
            <boxGeometry args={[cols * cellX + 1.5, 0.04, rows * cellZ + 1.5]} />
            <meshStandardMaterial
              color={EARTH}
              roughness={1}
              polygonOffset={true}
              polygonOffsetFactor={2}
              polygonOffsetUnits={2}
            />
          </mesh>
        </group>
      );
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd() < 0.12) continue;
          const lx = (c - (cols - 1) / 2) * cellX + range(-0.5, 0.5);
          const lz = (r - (rows - 1) / 2) * cellZ + range(-0.5, 0.5);
          const [ox, oz] = rotP(lx, lz, baseRot);
          const x = ax + ox, z = az + oz;
          if (!free(x, z)) continue;
          const rr = rnd();
          const cond = rr < 0.74 ? 'intact' : rr < 0.9 ? 'unfinished' : 'broken';
          const w = range(2.8, 4.3), d = range(2.8, 4.3);
          const h = cond === 'broken' ? range(1.8, 2.8) : (rnd() < 0.28 ? range(4.6, 6.6) : range(2.6, 3.8));
          const color = PLASTER[Math.floor(rnd() * PLASTER.length)];
          const rot = baseRot + range(-0.1, 0.1);
          out.push(solid('h' + uid++, x, z, rot, [w / 2, h / 2, d / 2], h / 2, visualsOnly, houseGroup(w, d, h, color, cond, rnd)));
        }
      }
      if (rnd() < 0.7) {
        const edgeLz = (rows / 2) * cellZ + 0.8;
        const [wx, wz] = rotP(0, edgeLz, baseRot);
        const x = ax + wx, z = az + wz, len = cols * cellX;
        if (free(x, z)) out.push(solid('cw' + ci, x, z, baseRot, [len / 2, 0.9, 0.16], 0.9, visualsOnly, wallNode(len, rnd)));
      }
      const props = 1 + Math.floor(rnd() * 3);
      for (let pi = 0; pi < props; pi++) {
        const [px, pz] = rotP(range(-cols * cellX / 2, cols * cellX / 2), (rows / 2) * cellZ + range(1, 3), baseRot);
        const x = ax + px, z = az + pz;
        if (!free(x, z)) continue;
        const k = rnd(), key = 'pr' + uid++;
        if (k < 0.25) out.push(solid(key, x, z, range(0, 6), [0.3, 0.45, 0.3], 0.45, visualsOnly, barrel('b', rnd() < 0.5 ? '#7a4a3a' : '#4a5a3a')));
        else if (k < 0.45) out.push(solid(key, x, z, range(0, 6), [0.8, 0.5, 0.3], 0.5, visualsOnly, jersey('j')));
        else if (k < 0.62) out.push(solid(key, x, z, range(0, 6), null, 0, visualsOnly, sandbags('sb', rnd)));
        else if (k < 0.8) out.push(<group key={key} position={[x, 0, z]}>{rubblePile('rp', rnd)}</group>);
        else out.push(solid(key, x, z, range(0, 6), [0.12, 2.75, 0.12], 2.75, visualsOnly, pole('po')));
      }
    }

    /* ---------- אשכול פרוזדור-הכניסה: חזית רחוב מסודרת (בלי חפיפה) + סמטה ---------- */
    const ALLEY: [number, number] = [3, -140];
    const SUB = 80;
    const samples: { cx: number; cz: number; nx: number; nz: number; half: number }[] = [];
    for (let s = 0; s <= SUB; s++) {
      const tt = (s / SUB) * (PATH.length - 1);
      const seg = Math.min(PATH.length - 2, Math.floor(tt));
      const ft = tt - seg;
      const [ax, az] = PATH[seg], [bx, bz] = PATH[seg + 1];
      const cx = ax + (bx - ax) * ft, cz = az + (bz - az) * ft;
      const half = PATH_HALF[seg] + ft * (PATH_HALF[seg + 1] - PATH_HALF[seg]);
      let nx = -(bz - az), nz = (bx - ax); const nl = Math.hypot(nx, nz) || 1;
      samples.push({ cx, cz, nx: nx / nl, nz: nz / nl, half });
    }
    const facadePoles: [number, number][] = [];
    for (const side of [1, -1]) {
      let lastX = 999, lastZ = 999, sinceLast = 0;
      for (let s = 0; s < samples.length; s++) {
        const sm = samples[s];
        const w = range(4.0, 6.2), d = range(4.0, 6.2);
        const h = rnd() < 0.4 ? range(5.0, 6.8) : range(3.2, 4.4);
        const off = sm.half + 0.5 + d / 2;
        const x = sm.cx + side * sm.nx * off, z = sm.cz + side * sm.nz * off;
        const minGap = w * 0.72 + 0.6; // מרווח מינימלי בין בתים באותו צד — מונע ערימות בפניות
        if (Math.hypot(x - lastX, z - lastZ) < minGap) continue;
        if (blocked(x, z) || onPath(x, z, -0.2)) continue;
        const rr = rnd();
        const cond = rr < 0.82 ? 'intact' : rr < 0.94 ? 'unfinished' : 'broken';
        const rot = Math.atan2(side * sm.nx, side * sm.nz) + range(-0.06, 0.06);
        out.push(solid('fh' + uid++, x, z, rot, [w / 2, h / 2, d / 2], h / 2, visualsOnly, houseGroup(w, d, h, PLASTER[Math.floor(rnd() * PLASTER.length)], cond, rnd)));
        lastX = x; lastZ = z;
        if (side === 1 && (++sinceLast % 3 === 0)) {
          const px = sm.cx + side * sm.nx * (sm.half + 0.5), pz = sm.cz + side * sm.nz * (sm.half + 0.5);
          if (!onPath(px, pz, -0.1) && !blocked(px, pz)) { out.push(solid('fpole' + uid++, px, pz, 0, [0.12, 2.75, 0.12], 2.75, visualsOnly, pole('po'))); facadePoles.push([px, pz]); }
        }
      }
    }
    // בתי "שער" מובטחים משני צידי הסמטה הצרה
    {
      const [ax2, az2] = PATH[1], [bx2, bz2] = PATH[3];
      let nx = -(bz2 - az2), nz = (bx2 - ax2); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      for (const side of [1, -1]) {
        const w = range(4.2, 5.4), d = range(4.2, 5.4), h = range(3.0, 4.2);
        const off = 1.1 + 0.4 + d / 2;
        const x = ALLEY[0] + side * nx * off, z = ALLEY[1] + side * nz * off;
        const rr = rnd();
        const cond = rr < 0.9 ? 'intact' : 'unfinished';
        const rot = Math.atan2(side * nx, side * nz) + range(-0.05, 0.05);
        out.push(solid('fg' + uid++, x, z, rot, [w / 2, h / 2, d / 2], h / 2, visualsOnly, houseGroup(w, d, h, PLASTER[Math.floor(rnd() * PLASTER.length)], cond, rnd)));
      }
    }
    for (let i = 0; i < facadePoles.length - 1; i++) {
      if (Math.hypot(facadePoles[i][0] - facadePoles[i + 1][0], facadePoles[i][1] - facadePoles[i + 1][1]) < 14)
        out.push(wire('fw' + i, facadePoles[i], facadePoles[i + 1], 5.9)); // הותאם לגובה המבודדים החדשים
    }

    /* ---------- זבל ובלאי לאורך הנתיב (בשוליים בלבד) ---------- */
    let litter = 0, la = 0;
    while (litter < Math.round(26 * DENSITY) && la < 3000) {
      la++;
      const t = rnd() * (PATH.length - 1);
      const seg = Math.min(PATH.length - 2, Math.floor(t));
      const ft = t - seg;
      const [ax, az] = PATH[seg], [bx, bz] = PATH[seg + 1];
      const cx = ax + (bx - ax) * ft, cz = az + (bz - az) * ft;
      const half = PATH_HALF[seg] + ft * (PATH_HALF[seg + 1] - PATH_HALF[seg]);
      let nx = -(bz - az), nz = (bx - ax); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const sgn = rnd() < 0.5 ? 1 : -1;
      const off = half - range(0.1, 0.5); // ממש בשוליים, לא באמצע
      const x = cx + sgn * nx * off, z = cz + sgn * nz * off;
      if (Math.hypot(x - 3, z + 140) < 5) continue; // בלי זבל סביב הסמטה הצרה — שתישאר עבירה
      if (blocked(x, z)) continue;
      const k = rnd(), key = 'lt' + uid++;
      if (k < 0.4) out.push(<group key={key} position={[x, 0, z]}>{trash(key, rnd)}</group>);
      else if (k < 0.7) out.push(<group key={key} position={[x, 0, z]}>{rubblePile(key, rnd, 0.9)}</group>);
      else if (k < 0.88) out.push(solid(key, x, z, range(0, 6), [0.3, 0.45, 0.3], 0.45, visualsOnly, barrelTipped('b', rnd() < 0.5 ? '#6a5a3a' : '#7a4a3a')));
      else out.push(solid(key, x, z, range(0, 6), null, 0, visualsOnly, sandbags('sb', rnd)));
      litter++;
    }

    /* ---------- בתים בודדים בפאתי הכפר ---------- */
    const singles = Math.round(26 * DENSITY);
    let sp = 0, sa = 0;
    while (sp < singles && sa < 3000) {
      sa++;
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * range(26, 118), z = range(20, -190);
      if (!free(x, z)) continue;
      const rr = rnd();
      const cond = rr < 0.66 ? 'intact' : rr < 0.86 ? 'unfinished' : 'broken';
      const w = range(2.8, 4.4), d = range(2.8, 4.4);
      const h = cond === 'broken' ? range(1.8, 2.6) : (rnd() < 0.25 ? range(4.6, 6.4) : range(2.6, 3.6));
      out.push(solid('sh' + uid++, x, z, range(0, 6), [w / 2, h / 2, d / 2], h / 2, visualsOnly, houseGroup(w, d, h, PLASTER[Math.floor(rnd() * PLASTER.length)], cond, rnd)));
      sp++;
    }

    /* ---------- צמחייה ופסולת כללית ---------- */
    let vg = 0, vgA = 0;
    while (vg < Math.round(34 * DENSITY) && vgA < 4000) {
      vgA++;
      const x = range(-125, 125), z = range(28, -195);
      if (!free(x, z)) continue;
      const k = rnd(), key = 'v' + uid++;
      if (k < 0.34) out.push(<group key={key} position={[x, 0, z]}>{palm(key, rnd)}</group>);
      else if (k < 0.7) out.push(<group key={key} position={[x, 0, z]}>{shrub(key, rnd)}</group>);
      else out.push(<group key={key} position={[x, 0, z]}>{rubblePile(key, rnd)}</group>);
      vg++;
    }

    /* ---------- נקודות ציון ברקע ---------- */
    for (let li = 0; li < 2; li++) {
      let ok = false, x = 0, z = 0;
      for (let t = 0; t < 40 && !ok; t++) { const side = rnd() < 0.5 ? -1 : 1; x = side * range(55, 115); z = range(-40, -185); if (free(x, z)) ok = true; }
      if (ok) out.push(solid('lm' + li, x, z, range(0, 6), li === 0 ? [1.1, 8, 1.1] : [2.2, 6, 2.2], li === 0 ? 8 : 6, visualsOnly, li === 0 ? minaret('mn') : watertower('wt')));
    }

        /* ---------- מבנה נוסף שהוספתי ידנית ---------- */
    {
      const bW = 4;      // רוחב המבנה (מטרים)
      const bD = 4;      // עומק המבנה (מטרים)
      const bH = 3.5;    // גובה המבנה (מטרים)
      const bX = -17.7;  // מיקום X לפי המפה
      const bZ = -135.6; // מיקום Z לפי המפה
      const bRot = 0;    // סיבוב המבנה (0 = בלי סיבוב)
      out.push(
        solid('custom-building-1', bX, bZ, bRot, [bW / 2, bH / 2, bD / 2], bH / 2, visualsOnly,
          houseGroup(bW, bD, bH, PLASTER[2], 'intact', rnd))
      );
    }

    /* ---------- הדמות עם משגר הכתף ---------- */
    out.push(<RocketMan key="rocket-man" />);

    /* ---------- הדחליל (מטרת הטעיה) ---------- */
    out.push(<Scarecrow key="scarecrow" />);

    return out;
  }, [visualsOnly]);

  return <>{elements}</>;
}

/* ---------- קומפוננטת הדמות עם המשגר ---------- */
function RocketMan() {
  const model = useGLTF('/manwithrocket.glb');

  // ===== ערכי כוונון — שני אלה תשני עד שהדמות תשב מושלם =====
  const POS: [number, number, number] = [-49.1, 1.3, -103.4]; // מיקום: X, גובה(Y), Z
  const SCALE = 1.5;                                          // גודל: הגדילי/הקטיני עד שמתאים
  const ROT_Y = 1.57;                                       // סיבוב סביב הציר האנכי (רדיאנים)                                          // סיבוב סביב הציר האנכי (רדיאנים)
  // =========================================================

  return (
    <group position={POS} rotation={[0, ROT_Y, 0]} scale={SCALE}>
      <Clone object={model.scene} castShadow receiveShadow />
    </group>
  );
}

/* ---------- קומפוננטת הדחליל (מטרת הטעיה) ---------- */
function Scarecrow() {
  const model = useGLTF('/scarecrow.glb');

  // ===== ערכי כוונון — שני אלה עד שהדחליל יישב מושלם =====
  const POS: [number, number, number] = [-46.5, 1.3, -83.9]; // מיקום: X, גובה(Y), Z
  const SCALE = 1.5;                                         // גודל: הגדילי/הקטיני עד שמתאים
  const ROT_Y = 0;                                          // סיבוב סביב הציר האנכי (רדיאנים)
  // =======================================================

  return (
    <group position={POS} rotation={[0, ROT_Y, 0]} scale={SCALE}>
      <Clone object={model.scene} castShadow receiveShadow />
    </group>
  );
}