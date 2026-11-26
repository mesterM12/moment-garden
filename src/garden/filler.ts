import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ease } from './bloom-score';
import type { ExpandedBouquetPlan } from './types';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function paint(geometry: THREE.BufferGeometry, tint: THREE.Color) {
  const color = new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3);
  for (let i = 0; i < color.count; i++) color.setXYZ(i, tint.r, tint.g, tint.b);
  geometry.setAttribute('color', color);
  geometry.deleteAttribute('uv');
  return geometry;
}

// Rounded juvenile eucalyptus leaves. The midrib is folded toward the light;
// the two halves never lie in a single plane, even when viewed edge-on.
function silverLeaf(root: THREE.Vector3, tip: THREE.Vector3, breadth: number, tilt: number, young: number) {
  const axis = tip.clone().sub(root);
  const cross = axis.clone().cross(v(0, 0, 1)).normalize().applyAxisAngle(axis.clone().normalize(), tilt);
  const normal = cross.clone().cross(axis).normalize();
  const positions: number[] = [], pigments: number[] = [], indices: number[] = [];
  const dark = new THREE.Color('#4a6d60'), pale = new THREE.Color('#a0b39a');
  for (let row = 0; row <= 10; row++) {
    const t = row / 10, width = Math.sin(Math.PI * t) ** .62 * breadth;
    for (let col = 0; col < 5; col++) {
      const s = (col - 2) / 2;
      const p = root.clone().addScaledVector(axis, t).addScaledVector(cross, width * s)
        .addScaledVector(normal, width * (.27 - .65 * Math.abs(s)) + Math.sin(t * 2.9) * .05);
      positions.push(p.x, p.y, p.z);
      const c = dark.clone().lerp(pale, .21 + .27 * t + .22 * young + (col === 2 ? .16 : col * .02));
      pigments.push(c.r, c.g, c.b);
      if (row < 10 && col < 4) { const i = row * 5 + col; indices.push(i, i + 1, i + 5, i + 1, i + 6, i + 5); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(pigments, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

// Rest geometry is the actual keepsake. Bake two alternate poses once: the
// tucked spray and the slight recoil as the paper lets go of its far end.
type LeafFold = { root: THREE.Vector3; axis: THREE.Vector3; midrib: THREE.Vector3; lift: number; roll: number };
const zAxis = v(0, 0, 1), xAxis = v(1, 0, 0);
function creaseSpray(geometry: THREE.BufferGeometry, height: number, side: number, leaf?: LeafFold) {
  const rest = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const tucked = rest.clone(), released = rest.clone();
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < rest.count; i++) {
    p.fromBufferAttribute(rest, i);
    if (leaf) {
      const along = Math.floor(i / 5) / 10;
      p.sub(leaf.root).applyAxisAngle(leaf.midrib, leaf.roll * along)
        .applyAxisAngle(leaf.axis, leaf.lift * (.78 + .30 * along)).add(leaf.root);
    }
    const arc = ease(p.y / height);
    q.copy(p).applyAxisAngle(zAxis, side * .49 * arc).applyAxisAngle(xAxis, -.52 * arc);
    tucked.setXYZ(i, q.x, q.y - .17 * arc, q.z);
    p.fromBufferAttribute(rest, i);
    if (leaf) {
      // The twig springs first. Its disks still show their narrow edges at
      // recoil, then turn their silver faces out as the twig comes to rest.
      const along = Math.floor(i / 5) / 10;
      p.sub(leaf.root).applyAxisAngle(leaf.midrib, leaf.roll * .78 * along)
        .applyAxisAngle(leaf.axis, leaf.lift * .39).add(leaf.root);
    }
    const tip = ease((p.y / height - .19) / .81);
    q.copy(p).applyAxisAngle(zAxis, -side * .075 * tip);
    released.setXYZ(i, q.x, q.y, q.z - .085 * tip);
  }
  const poseNormals = [tucked, released].map(position => {
    geometry.setAttribute('position', position);
    geometry.deleteAttribute('normal'); geometry.computeVertexNormals();
    return geometry.getAttribute('normal');
  });
  geometry.setAttribute('position', rest); geometry.setAttribute('normal', normals);
  geometry.morphAttributes.position = [tucked, released];
  geometry.morphAttributes.normal = poseNormals;
}

export function buildFiller(plan: ExpandedBouquetPlan) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .85 });
  const stem = new THREE.Color('#6b7958');
  const phase = plan.flowers[0].specimen.rotation;
  const mirror = Math.cos(phase) < 0 ? -1 : 1;
  const sprays: { weights: number[]; start: number }[] = [];
  // Two leafy cuts and two branching sprays sit in gaps behind the flower heads.
  // Use the plan's immutable measurements, never the specimen's live RNG.
  const tips = plan.sprays ?? [[-1, 3.84, 1.91], [1, 2.82, 2.24], [1, 4.35, 1.48], [-1, 2.87, 2.17]].map(([side, height, outside], i) =>
    [side * mirror * (outside + .12 * Math.cos(phase - i)), height + .25 * Math.sin(phase + i * 1.77), -.5 - .22 * i]);
  for (const [index, [x, tall, z]] of tips.entries()) {
    const sign = Math.sign(x) || 1;
    const end = v(x, tall, z);
    const origin = v(0, 0, 0);
    const curve = new THREE.QuadraticBezierCurve3(origin, v(end.x * .22, tall * .57, -.75), end);
    const parts: THREE.BufferGeometry[] = [paint(new THREE.TubeGeometry(curve, 18, .014, 5, false), stem)];
    const leafFolds = new Map<number, LeafFold>();
    if (index < 2) {
      for (let i = 0; i < 7; i++) {
        const t = .32 + .102 * i;
        for (const flank of [-1, 1]) {
          const a = curve.getPoint(t + (flank < 0 ? .019 : 0));
          const size = .64 - t * .29, angle = .56 * Math.sin(i + phase);
          const b = a.clone().add(v(flank * size * Math.cos(angle), size * (.38 + .25 * i / 7), size * Math.sin(angle) * flank));
          const blade = silverLeaf(a, b, size * (.32 + .06 * Math.cos(i)), flank * (.71 + angle), t);
          const midrib = b.clone().sub(a).normalize();
          leafFolds.set(parts.length, { root: a, midrib, axis: midrib.clone().cross(v(0, 1, 0)).normalize(),
            lift: 1.04 + .20 * t, roll: flank * (1.21 - .30 * t) });
          parts.push(blade);
        }
      }
    } else {
      // Tiny branched seed heads add a finer scale between large, saturated corollas.
      for (let i = 0; i < 8; i++) {
        const a = curve.getPoint(.39 + i * .082), flank = i % 2 ? -1 : 1;
        const b = a.clone().add(v(flank * (.31 + .19 * Math.sin(i + phase)), .23 + .1 * Math.cos(i), .14 * Math.sin(i * 2)));
        parts.push(paint(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, .009, 4, false), stem));
        for (let j = 0; j < 3; j++) {
          const angle = phase + 2.4 * j + i;
          const tip = b.clone().add(v(Math.cos(angle) * .13, .11 + .08 * j, Math.sin(angle) * .14));
          parts.push(paint(new THREE.TubeGeometry(new THREE.LineCurve3(b, tip), 1, .006, 4, false), stem));
          const floret = new THREE.SphereGeometry(.046 + .008 * j, 7, 5);
          floret.scale(1, .82, .9); floret.translate(tip.x, tip.y, tip.z);
          parts.push(paint(floret, new THREE.Color(j ? '#e4d2ac' : '#c4b28b')));
        }
      }
    }
    parts.forEach((part, i) => creaseSpray(part, tall, sign, leafFolds.get(i)));
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    for (const g of parts) g.dispose();
    mesh.position.set(.05 * sign, -1.9, -.06);
    group.add(mesh); sprays.push({ weights: mesh.morphTargetInfluences!, start: (plan.version === 3 ? [.27, .31, .37, .33] : [.10, .22, .17, .29])[index] });
  }
  function pose(progress: number) {
    for (const { weights, start } of sprays) {
      const release = ease((progress - start) / .47);
      weights[0] = 1 - release;
      weights[1] = release * (1 - ease((progress - start - .43) / .26));
    }
  }
  pose(0);
  return { group, pose };
}
