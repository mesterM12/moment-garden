import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ease } from './bloom-score';
import { ROSE_GUARDS } from './garden-rose';
import { handAttribute, petalHand } from './petal-hand';
import { foldCluster, foldShell } from './petal-fold';
import type { MorphPetal, Specimen } from './types';

// The cultivar builders remain the source of truth for the seeded cut and its
// closed form. This last modelling pass works on their owned render buffers;
// it doesn't draw from the geometry RNG, add lights, or run during animation.
export function finishPetals(specimen: Specimen, petals: MorphPetal[], head: THREE.Group, cut = false): MorphPetal[] {
  const { key, rotation, length } = specimen;
  const dense = key === 'dahlia' || key === 'ranunculus';
  const tulip = key === 'tulip';
  const shade = new THREE.Color(specimen.palette.root);
  const tint = new THREE.Color();
  for (let j = 0; j < petals.length; j++) {
    const { mesh, layer } = petals[j];
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), color = g.getAttribute('color');
    const phase = rotation + j * 2.39996;
    const blades = petals[j].blades ?? [{ first: 0, end: pos.count, voice: 0 }];
    const mark = handAttribute(g);
    for (const { first, end, voice, anchor } of blades) {
      if (!anchor) mark(first, end, petalHand(specimen.timestamp, j, voice));
    }
    if (key === 'rose') continue; // The rose owns its pigment and both folded targets.
    const turn = (petalHand(specimen.timestamp, j, 0) >>> 16) / 32767.5 - 1;
    for (let i = 0; !tulip && i < pos.count; i++) {
      const t = uv.getY(i), s = 2 * uv.getX(i) - 1;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const shoulder = Math.sin(Math.PI * t);
      // Long, slightly wandering furrows; not horizontal bands around a cup.
      const rib = Math.cos(s * 8 + .67 * Math.sin(phase + t * 3));
      const crease = rib * rib * rib * rib;
      const lip = ease((t - .67) / .33);
      if (key === 'calla' && !cut && i < blades[0].end) {
        // The folded spathe has one high tail and a lower, reflexed apron.
        // Their asymmetry reads even when the surface veins are subpixel.
        const a = Math.atan2(x, z), apex = Math.max(0, -Math.cos(a)) ** 3;
        const pleat = .028 * shoulder * Math.cos(4.3 * a + 1.7 * t + turn);
        const flare = pleat + lip * (.056 + .079 * apex + .017 * turn);
        pos.setXYZ(i, x + length * (Math.sin(a) * flare + .06 * apex * lip * turn),
          y + length * lip * (.12 * apex - .032 * (1 - apex) + .025 * Math.sin(3 * a + turn)),
          z + length * Math.cos(a) * flare);
      } else if (dense) {
        const radial = Math.hypot(x, z) || 1;
        const roll = .009 * shoulder * rib + .015 * lip * Math.sin(s * 3 + phase);
        // Raised asymmetric lips and a little reflex at the margin. Inner
        // whorls stay protected; the guards receive the deepest turn.
        const relief = roll * length / (1 + layer * .33);
        pos.setXYZ(i, x + x / radial * relief,
          y + length * lip * .018 * Math.sin(s * 4.5 + phase), z + z / radial * relief);
      }
      const root = (1 - ease(t / .64)) * (.05 + .10 * crease);
      tint.fromBufferAttribute(color, i).lerp(shade, root)
        .multiplyScalar(.95 + .042 * shoulder + .039 * lip + .028 * rib * shoulder + .025 * Math.sin(phase));
      color.setXYZ(i, tint.r, tint.g, tint.b);
    }
    if (dense || key === 'calla') g.computeVertexNormals();
    if (key === 'hydrangea' || key === 'billyButton') {
      foldCluster(g, specimen, blades);
      mesh.updateMorphTargets();
    } else if (blades.length) {
      foldShell(g, specimen, layer, phase, blades);
      mesh.updateMorphTargets();
    }
    // The modelling pass needed the original UVs. Now mark only the solid
    // details (including attached beard grains) as outside the petal field.
    if (petals[j].blades) {
      let next = 0;
      for (const span of blades) {
        for (let i = next; i < span.first; i++) uv.setXY(i, -1, -1);
        if (span.anchor) for (let i = span.first; i < span.end; i++) uv.setXY(i, -1, -1);
        next = span.end;
      }
      for (let i = next; i < uv.count; i++) uv.setXY(i, -1, -1);
    }
  }
  // Keep rose guards individually timed. Join the smaller folds (and dense
  // dahlia florets) into staggered draws rather than submitting every sheet.
  if (key !== 'dahlia' && key !== 'rose') return petals;
  const groups = new Map<number, MorphPetal[]>();
  const solo = key === 'rose' ? ROSE_GUARDS : 0;
  for (let i = solo; i < petals.length; i++) {
    const petal = petals[i];
    const cohort = petal.layer * 3 + i % 3;
    if (!groups.has(cohort)) groups.set(cohort, []);
    groups.get(cohort)!.push(petal);
  }
  return [...petals.slice(0, solo), ...Array.from(groups.values(), ring => {
    const { layer, mesh: first } = ring[0];
    const geometry = mergeGeometries(ring.map(p => p.mesh.geometry));
    const mesh = new THREE.Mesh(geometry, first.material);
    head.add(mesh);
    for (const p of ring) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); }
    return { mesh, layer, offset: 0 };
  })];
}

// A satin strip can turn on its edge and show a reverse; toruses and flat
// rectangles cannot. Sweep each length around its individual tied fold.
function strip(group: THREE.Group, path: number[][], width: number, material: THREE.Material, loop: boolean) {
  const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p)));
  const pos: number[] = [], indices: number[] = [];
  const across = new THREE.Vector3(), front = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= 22; i++) {
    const t = i / 22, pt = curve.getPoint(t), tangent = curve.getTangent(t);
    const spread = width * (.46 + .54 * ease(t * 4)) * (loop ? 1 - .45 * ease((t - .75) / .25) : 1);
    across.crossVectors(tangent, front).normalize().applyAxisAngle(tangent, .3 + (loop ? 1.17 : .71) * Math.sin(Math.PI * t));
    for (const s of [-1, 0, 1]) {
      const q = pt.clone().addScaledVector(across, s * spread);
      q.z += (1 - s * s) * spread * .24;
      if (!loop && i === 22 && s === 0) q.addScaledVector(tangent, -.065); // swallowtail cut
      pos.push(q.x, q.y, q.z);
    }
    if (i < 22) for (let k = 0; k < 2; k++) {
      const a = i * 3 + k; indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(indices); g.computeVertexNormals();
  group.add(new THREE.Mesh(g, material));
}

export function tieBouquet(group: THREE.Group, style: 'bow' | 'twine' | 'wrap', color: string) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: style === 'bow' ? .57 : .87, side: THREE.DoubleSide });
  // A folded paper cuff flares around the stems; an overlapping front corner
  // leaves a visible diagonal seam, with no extra texture or transparency.
  if (style === 'wrap') {
    const p: number[] = [], c: number[] = [], idx: number[] = [];
    const kraft = new THREE.Color('#dbb891');
    for (let i = 0; i <= 28; i++) {
      const u = i / 28, a = u * Math.PI * 2.26 - .8, fold = i % 4 === 0 ? .92 : 1;
      for (const [r, y] of [[.14, -.40], [.18, .01], [.37, .40 + .33 * Math.cos(a + 2.58) + .27 * u]]) {
        const radius = r * fold + u * .035;
        p.push(radius * Math.sin(a), y, radius * Math.cos(a));
        const v = .85 + .13 * u + (i % 4) * .023; c.push(kraft.r * v, kraft.g * v, kraft.b * v);
      }
      if (i < 28) for (let k = 0; k < 2; k++) { const n = i * 3 + k; idx.push(n, n + 1, n + 3, n + 1, n + 4, n + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, side: THREE.DoubleSide })));
  }
  if (style !== 'bow') {
    // One continuous spiral, then two asymmetric hanging ends.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 54; i++) { const t = i / 54, a = t * 6 * Math.PI;
      const r = style === 'wrap' ? .207 : .163;
      pts.push(new THREE.Vector3(r * Math.sin(a), -.06 + .15 * t + .026 * Math.sin(a), r * Math.cos(a)));
    }
    const cord = (pts: THREE.Vector3[], segments: number) => group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segments, .022, 6, false), material));
    cord(pts, 64);
    for (const s of [-1, 1]) cord([[0, .04, .18], [s * .14, -.02, .24], [s * .23, -.21, .20], [s * .35, -.30 + s * .08, .16]].map(p => new THREE.Vector3(...p)), 14);
    return;
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.165, .155, .16, 20), material);
  band.rotation.z = -.14; group.add(band);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
  knot.scale.set(.115, .098, .085); knot.position.z = .145; group.add(knot);
  for (const s of [-1, 1]) {
    const h = s < 0 ? .21 : .14;
    strip(group, [[0,0,.16],[s*.24,h,.19],[s*.46,h*.85,.14],[s*.38,.01,.10],[s*.06,-.015,.14]], .063, material, true);
    strip(group, [[s*.03,-.02,.17],[s*.14,-.18,.20],[s*.13,-.40,.23],[s*.28,-.66+s*.08,.18]], .077, material, false);
  }
}
