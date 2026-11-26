import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ease } from './bloom-score';
import { handAttribute, petalHand } from './petal-hand';
import { foldCluster, foldShell } from './petal-fold';
import type { MorphPetal, Specimen } from './types';

// Six spoon-shaped tepals: three outer guards open away from the three
// longer inner sails. Rounded tips and a changing radius along the exposed
// edge break the old continuous cup, especially from the presentation front.
function tulipTepal(specimen: Specimen, j: number, mesh: MorphPetal['mesh'], cut: boolean) {
  const inner = j >= 3, R = specimen.length;
  const axis = specimen.rotation + j % 3 * Math.PI * 2 / 3 + (inner ? Math.PI / 3 : 0);
  const hand = petalHand(specimen.timestamp, j, 0);
  const variation = (hand >>> 16) / 32767.5 - 1;
  const base = new THREE.Color(specimen.palette.base), tip = new THREE.Color(specimen.palette.tip);
  const root = new THREE.Color(specimen.palette.root), ivory = new THREE.Color('#fff0c8');
  const tint = new THREE.Color(), g = mesh.geometry;
  const pos = g.getAttribute('position'), col = g.getAttribute('color'), uv = g.getAttribute('uv');
  const closed = g.morphAttributes.position?.[0], normals = g.morphAttributes.normal;
  if (!closed || !normals?.[0]) throw new Error('Tulip tepals require an authored closed pose.');
  for (let i = 0; i < pos.count; i++) {
    const s = uv.getX(i) * 2 - 1, t = uv.getY(i), lip = ease((t - .6) / .4);
    const arch = t - .22 * s * s * lip;
    // A tulip is spooned along its rib. The broad guards turn away at the
    // rim while the taller inner sails hold their concave silhouette.
    const rib = Math.exp(-((s * 4.1 - .18 * t) ** 2));
    const margin = Math.abs(s) ** 3;
    const radial = .045 + (inner ? .46 : .56) * Math.sin(Math.PI * arch * .73)
      + (inner ? -.033 : .13 + .055 * variation) * lip - .034 * s * s * lip
      + (.045 * rib - .058 * margin) * Math.sin(Math.PI * t)
      + lip * (.056 * Math.sin(4.4 * s + variation) - .075 * (1 - s * s) * (inner ? 1 : -.5));
    const span = (.12 + .98 * Math.sin(Math.PI * t * .82) ** .78) * (inner ? .90 : 1);
    const theta = axis + s * span + (inner ? .19 : .12) * t + variation * .065 * lip;
    // The reflexed guards previously flared outside the tulip socket's
    // clearance profile. Keep the rim spooned in the dressed cut.
    const girth = R * (cut ? .82 : 1);
    const x = girth * Math.sin(theta) * radial, z = girth * Math.cos(theta) * radial;
    const y = R * (((inner ? 1.09 : .87) + .075 * variation) * (arch ** 1.09)
      + lip * (.037 * s - .044 * margin + .018 * Math.sin(5.2 * s + variation)));
    pos.setXYZ(i, x, y, z);
    const budRadius = R * (.042 + .19 * Math.sin(Math.PI * t * .93) + .017 * (inner ? 0 : 1));
    closed.setXYZ(i, Math.sin(theta) * budRadius, R * arch * (inner ? 1.01 : .97), Math.cos(theta) * budRadius);
    // Silky pigment collects along one overlapping margin; the other catches
    // a translucent cream wash. Individual petals are not striped metal.
    const edge = ease((Math.abs(s) - .70) / .30);
    const blush = .08 + (inner ? .025 : .115) + .065 * variation;
    tint.copy(root).lerp(base, .40 + .6 * ease(t / .66))
      .lerp(tip, .08 + .40 * t + blush + .07 * Math.sin(s * 4 + t))
      .lerp(ivory, blush * (.33 + .67 * t) + .10 * lip + edge * .13 * t);
    // A single feather of basal pigment follows the rib up the cup.
    tint.lerp(root, (.18 + .08 * variation) * rib * (1 - ease((t - .23) / .70)));
    tint.lerp(base, .12 * (1 - Math.abs(s)) * Math.sin(t * Math.PI));
    if (s < 0) tint.lerp(root, edge * .18 * Math.sin(t * Math.PI));
    col.setXYZ(i, tint.r, tint.g, tint.b);
  }
  g.computeVertexNormals();
  const openNormal = g.getAttribute('normal');
  g.setAttribute('position', closed); g.deleteAttribute('normal'); g.computeVertexNormals();
  normals[0] = g.getAttribute('normal');
  g.setAttribute('position', pos); g.setAttribute('normal', openNormal);
}


// The cultivar builders remain the source of truth for the seeded cut and its
// closed form. This last modelling pass works on their owned render buffers;
// it doesn't draw from the geometry RNG, add lights, or run during animation.
export function finishPetals(specimen: Specimen, petals: MorphPetal[], head: THREE.Group, cut = false): MorphPetal[] {
  const { key, rotation, length } = specimen;
  const dense = key === 'dahlia' || key === 'ranunculus' || key === 'rose';
  const tulip = key === 'tulip';
  const shade = new THREE.Color(specimen.palette.root);
  const tint = new THREE.Color();
  for (let j = 0; j < petals.length; j++) {
    const { mesh, layer } = petals[j];
    if (tulip) tulipTepal(specimen, j, mesh, cut);
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), color = g.getAttribute('color');
    const phase = rotation + j * 2.39996;
    const blades = petals[j].blades ?? [{ first: 0, end: pos.count, voice: 0 }];
    const mark = handAttribute(g);
    for (const { first, end, voice, anchor } of blades) {
      if (!anchor) mark(first, end, petalHand(specimen.timestamp, j, voice));
    }
    const turn = (petalHand(specimen.timestamp, j, 0) >>> 16) / 32767.5 - 1;
    for (let i = 0; !tulip && i < pos.count; i++) {
      const t = uv.getY(i), s = 2 * uv.getX(i) - 1;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const shoulder = Math.sin(Math.PI * t);
      // Long, slightly wandering furrows; not horizontal bands around a cup.
      const rib = Math.cos(s * 8 + .67 * Math.sin(phase + t * 3));
      const crease = rib * rib * rib * rib;
      const lip = ease((t - .67) / .33);
      if (key === 'rose') {
        // Overlapping guards turn up into a scalloped bowl. The centre
        // stays wound: its taller, narrower shoulders show more than a lip.
        const radius = Math.hypot(x, z), cap = 1 - s * s;
        const r = radius * (1 - .07 * s * s * t + .035 * turn * t);
        const a = Math.atan2(x, z) + t * t * (.26 + .05 * turn + .064 * layer) + .083 * s * t;
        const fold = (.21 + .04 * turn) * cap * t * t + .075 * shoulder * s * s
          + .075 * s * t - lip * (.087 + .062 * Math.cos(4.1 * s + turn)) * cap;
        pos.setXYZ(i, r * Math.sin(a), y + length * fold / (1 + .34 * layer), r * Math.cos(a));
      } else if (key === 'calla' && !cut && i < blades[0].end) {
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
      if (key === 'rose') {
        // The trailing flank tucks under its neighbour. Warm occlusion on
        // the inner whorls keeps cream roses readable against cream paper.
        const tuck = ease((s - .27) / .73) * t * .26 + (1 - t) ** 2 * .19;
        tint.lerp(shade, tuck).multiplyScalar(1 - tuck * .44 - layer * .031 * (1 - lip));
      }
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
  // Dense dahlias used to submit a separate draw for every floret. Retain their
  // layer order and split each ring into three overlapping opening cohorts.
  if (key !== 'dahlia') return petals;
  const rings = new Map<number, MorphPetal[]>();
  petals.forEach((petal, i) => {
    const cohort = petal.layer * 3 + i % 3;
    if (!rings.has(cohort)) rings.set(cohort, []);
    rings.get(cohort)!.push(petal);
  });
  return Array.from(rings.values(), ring => {
    const { layer, mesh: first } = ring[0];
    const geometry = mergeGeometries(ring.map(p => p.mesh.geometry));
    const mesh = new THREE.Mesh(geometry, first.material);
    head.add(mesh);
    for (const p of ring) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); }
    return { mesh, layer, offset: 0 };
  });
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
