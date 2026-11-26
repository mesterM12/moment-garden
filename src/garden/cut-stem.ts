import * as THREE from 'three';
import { ease } from './bloom-score';
import type { Specimen } from './types';

const segments = 40, sides = 7;

export function cutStemMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .79 });
}

/** The routed centreline remains authoritative, including after a clearance reroute. */
export function cutStemGeometry(curve: THREE.CatmullRomCurve3, specimen: Specimen) {
  const { key, greenHue, rotation } = specimen;
  const radius = key === 'sunflower' ? .033 : key === 'tulip' ? .027
    : key === 'poppy' || key === 'cosmos' || key === 'daisy' ? .0195 : .024;
  const skin = new THREE.Color(`hsl(${greenHue - 13}, 33%, 32%)`);
  const fiber = new THREE.Color(`hsl(${greenHue - 19}, 30%, 47%)`);
  const pith = new THREE.Color(`hsl(${greenHue - 32}, 29%, 66%)`);
  const tint = new THREE.Color();
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const frames = curve.computeFrenetFrames(segments, false);
  const normal = new THREE.Vector3(), point = new THREE.Vector3(), end = new THREE.Vector3();
  const vertex = (p: THREE.Vector3, color: THREE.Color) => {
    positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b);
  };
  function ring(row: number, r: number, extension: number, pigment?: THREE.Color) {
    const i = Math.min(segments, row);
    const center = curve.getPointAt(i / segments).addScaledVector(frames.tangents[i], extension);
    for (let j = 0; j <= sides; j++) {
      const a = (j % sides) * 2 * Math.PI / sides;
      const ribs = Math.cos(3 * a + rotation);
      normal.copy(frames.normals[i]).multiplyScalar(-Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      end.copy(center).addScaledVector(normal, r * (1 + .055 * ribs));
      // A slight bevel to the florist's cut, with a different color inside.
      if (!row) end.addScaledVector(frames.tangents[0], r * .31 * Math.cos(a + rotation));
      vertex(end, pigment ?? tint.copy(skin).lerp(fiber, .10 + .07 * ribs + .05 * Math.sin(a - rotation)));
    }
  }
  function join(a: number, b: number) {
    for (let j = 0; j < sides; j++) indices.push(a + j, b + j, a + j + 1, b + j, b + j + 1, a + j + 1);
  }

  // Keep the 41 centreline rings in order for pose/clearance sampling. The
  // last three rings continue into the head so the green neck has no open end.
  for (let k = 0; k <= segments + 2; k++) {
    const t = Math.min(k / segments, 1);
    const neck = ease((t - .94) / .06);
    const r = radius * (1 - .26 * t) + neck * .006;
    ring(k, r * (k === 41 ? 1.14 : k === 42 ? .47 : 1), k === 41 ? .037 : k === 42 ? .074 : 0);
    if (k) join((k - 1) * (sides + 1), k * (sides + 1));
  }
  const top = positions.length / 3;
  vertex(curve.getPoint(1).addScaledVector(frames.tangents[segments], .079), skin);
  for (let j = 0; j < sides; j++) indices.push(42 * (sides + 1) + j, top, 42 * (sides + 1) + j + 1);
  // Duplicate the cut rim for a sharp edge rather than averaging cap normals
  // into the smooth sides. Light pith inside the narrow darker fibrous rim.
  const cut = positions.length / 3;
  ring(0, radius, 0, fiber);
  const core = positions.length / 3;
  ring(0, radius * .71, 0, pith);
  const center = positions.length / 3;
  vertex(curve.getPoint(0), pith);
  for (let j = 0; j < sides; j++) {
    indices.push(cut + j, cut + j + 1, core + j, core + j, cut + j + 1, core + j + 1, core + j, core + j + 1, center);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Smooth the duplicate longitudinal seam, but not the bevelled cut face.
  const normals = geometry.getAttribute('normal');
  for (let k = 0; k <= segments + 2; k++) {
    const i = k * (sides + 1);
    normal.fromBufferAttribute(normals, i).add(point.fromBufferAttribute(normals, i + sides)).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
    normals.setXYZ(i + sides, normal.x, normal.y, normal.z);
  }
  return geometry;
}
