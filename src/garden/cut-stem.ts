import * as THREE from 'three';
import { ease, flexAt } from './bloom-score';
import { shadeCutStem } from './foliage-shader';
import type { Specimen } from './types';

const segments = 40, sides = 8, stride = sides + 1;

export function cutStemMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .69 });
  material.onBeforeCompile = shadeCutStem;
  material.customProgramCacheKey = () => 'foliage/cut-1';
  return material;
}

/** The routed centreline remains authoritative, including after a clearance reroute. */
export function cutStemGeometry(curve: THREE.CatmullRomCurve3, specimen: Specimen) {
  const { key, greenHue, rotation } = specimen;
  const radius = key === 'sunflower' ? .033 : key === 'tulip' ? .027
    : key === 'poppy' || key === 'cosmos' || key === 'daisy' ? .0195 : .024;
  const waxy = key === 'tulip' || key === 'iris' || key === 'lily' || key === 'orchid' || key === 'calla';
  const skin = new THREE.Color(`hsl(${greenHue + (waxy ? 6 : -12)}, ${waxy ? 24 : 34}%, 32%)`);
  const fiber = new THREE.Color(`hsl(${greenHue - 17}, 28%, 46%)`);
  const cambium = new THREE.Color(`hsl(${greenHue - 21}, 40%, 57%)`);
  const pith = new THREE.Color(waxy ? '#d0d8a3' : '#dbd3a5');
  const tint = new THREE.Color();
  const positions: number[] = [], colors: number[] = [], tissue: number[] = [], indices: number[] = [];
  const frames = curve.computeFrenetFrames(segments, false);
  const point = new THREE.Vector3();
  const vertex = (p: THREE.Vector3, color: THREE.Color, u: number, v: number, kind: number) => {
    positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); tissue.push(u, v, kind);
  };
  function ring(row: number, r: number, extension: number, pigment?: THREE.Color, cap = false) {
    const i = Math.min(segments, row);
    const center = curve.getPointAt(i / segments).addScaledVector(frames.tangents[i], extension);
    const t = i / segments;
    for (let j = 0; j <= sides; j++) {
      const a = (j % sides) * 2 * Math.PI / sides;
      const ribs = Math.cos(3 * a + rotation + t * .38);
      const rr = r * (1 + (waxy ? .021 : .044) * ribs);
      const u = rr * Math.cos(a), v = rr * Math.sin(a);
      point.copy(center).addScaledVector(frames.normals[i], -u).addScaledVector(frames.binormals[i], v);
      // All cut rings lie on the same oblique plane, offset only for the chamfer.
      if (!row) point.addScaledVector(frames.tangents[0], .38 * rr * Math.cos(a + rotation));
      tint.copy(pigment ?? skin);
      if (!pigment) tint.lerp(fiber, .11 + .085 * ribs + .05 * Math.sin(a - rotation + 3 * t));
      tint.multiplyScalar(1 + (cap ? .032 : .042) * Math.sin(5 * a + 9 * t + rotation));
      vertex(point, tint, cap ? u / radius : j / sides, cap ? v / radius : t, cap ? 1 : 0);
    }
  }
  function join(a: number, b: number) {
    for (let j = 0; j < sides; j++) indices.push(a + j, b + j, a + j + 1, b + j, b + j + 1, a + j + 1);
  }

  // Keep the 41 centreline rings in order for pose/clearance sampling. The
  // top two extra rings continue into the head so the green neck has no open end.
  for (let k = 0; k <= segments + 2; k++) {
    const t = Math.min(k / segments, 1);
    const r = radius * (1 - .26 * t) + ease((t - .94) / .06) * .006;
    ring(k, r * (k === 41 ? 1.14 : k === 42 ? .47 : 1), k === 41 ? .037 : k === 42 ? .074 : 0);
    if (k) join((k - 1) * stride, k * stride);
  }
  const top = positions.length / 3;
  vertex(curve.getPoint(1).addScaledVector(frames.tangents[segments], .079), skin, .5, 1, 0);
  for (let j = 0; j < sides; j++) indices.push(42 * stride + j, top, 42 * stride + j + 1);

  const bevel = positions.length / 3;
  ring(0, radius * .89, -radius * .14, fiber);
  join(bevel, 0);
  // The chamfer shares the tube's normals, but the actual cut does not. The
  // thin green cambium grades into a cream, matte pith on the cut plane.
  const cut = positions.length / 3;
  ring(0, radius * .89, -radius * .14, fiber, true);
  ring(0, radius * .76, -radius * .14, cambium, true);
  ring(0, radius * .61, -radius * .14, pith, true);
  join(cut + stride, cut);
  join(cut + 2 * stride, cut + stride);
  const center = positions.length / 3;
  vertex(curve.getPoint(0).addScaledVector(frames.tangents[0], -radius * .14), pith, 0, 0, 1);
  for (let j = 0; j < sides; j++) indices.push(cut + 2 * stride + j, cut + 2 * stride + j + 1, center);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('stemTissue', new THREE.Float32BufferAttribute(tissue, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Smooth the duplicate longitudinal seam, but not across the cut plane.
  const normals = geometry.getAttribute('normal');
  const end = new THREE.Vector3();
  for (let k = 0; k <= segments + 3; k++) {
    const i = k === segments + 3 ? bevel : k * stride;
    point.fromBufferAttribute(normals, i).add(end.fromBufferAttribute(normals, i + sides)).normalize();
    normals.setXYZ(i, point.x, point.y, point.z);
    normals.setXYZ(i + sides, point.x, point.y, point.z);
  }
  return geometry;
}

/** Bake the same smooth bend into the positions and their matching normal target. */
export function flexCutStem(geometry: THREE.BufferGeometry, bend: THREE.Vector3, tipY: number) {
  const rest = geometry.getAttribute('position'), folded = rest.clone();
  const normals = geometry.getAttribute('normal'), foldedNormals = normals.clone();
  const height = tipY + 1.9;
  const normal = new THREE.Vector3();
  for (let i = 0; i < folded.count; i++) {
    const y = rest.getY(i), weight = flexAt(y, tipY);
    folded.setXYZ(i, rest.getX(i) + bend.x * weight, y + bend.y * weight, rest.getZ(i) + bend.z * weight);
    const h = THREE.MathUtils.clamp((y + 1.9) / height, 0, 1);
    const slope = 6 * h * (1 - h) / height;
    // Inverse transpose of I + slope * (bend ⊗ up), the bend's Jacobian.
    normal.fromBufferAttribute(normals, i);
    normal.y -= slope * normal.dot(bend) / (1 + slope * bend.y);
    normal.normalize();
    foldedNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.morphAttributes.position = [folded];
  geometry.morphAttributes.normal = [foldedNormals];
}
