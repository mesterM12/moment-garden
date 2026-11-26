import assert from 'node:assert/strict';
import * as THREE from 'three';
import { test } from 'vitest';
import { createBouquet, createSpecimen } from './botany';
import { cutStemGeometry, cutStemMaterial } from './cut-stem';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { foliageMaterial, StemLeaf } from './foliage';
import { flexAt } from './bloom-score';
import { petalFields } from './petal-surface';
import type { SpeciesKey } from './types';

function specimen(key: SpeciesKey) {
  return { ...createSpecimen(1748091600123, key), random: () => { throw Error('Foliage drew from shared RNG'); } };
}

function components(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position'), index = geometry.index!;
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const u = index.getX(i), v = index.getX(i + 1), w = index.getX(i + 2);
    a.fromBufferAttribute(position, u); b.fromBufferAttribute(position, v); c.fromBufferAttribute(position, w);
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, 'No collapsed triangle at blade root or tip');
    parent[find(v)] = find(u); parent[find(w)] = find(u);
  }
  return new Set(parent.map((_, i) => find(i))).size;
}

const forms: [SpeciesKey, number][] = [
  ['rose', 10], ['cosmos', 34], ['tulip', 1], ['sunflower', 2], ['dahlia', 6], ['poppy', 2], ['iris', 2],
];
test.each(forms)('%s packs its foliage parts into one deterministic mesh', (key, parts) => {
  const material = foliageMaterial(key);
  const make = () => new StemLeaf(specimen(key), [.41, .61, .53, .72], -.19, .9, material, new THREE.Vector3());
  const a = make(), b = make();
  const g = (a.children[0] as THREE.Mesh).geometry, other = (b.children[0] as THREE.Mesh).geometry;
  try {
    assert.equal(a.children.length, 1);
    assert.equal(components(g), parts);
    assert.ok(g.index!.count / 3 < 1008, 'No more leaf triangles than the old blade');
    assert.deepEqual(g.getAttribute('position').array, other.getAttribute('position').array);
    const tissue = g.getAttribute('leafTissue');
    assert.deepEqual(tissue.array, other.getAttribute('leafTissue').array);
    assert.equal(tissue.count, g.getAttribute('position').count);
    assert.ok(Array.from(tissue.array).every(Number.isFinite));
    assert.equal(Array.from({ length: tissue.count }, (_, i) => tissue.getZ(i)).includes(-1), key !== 'tulip');
    // The entire upper/reverse lamina shares one consistent coordinate field;
    // stalk triangles opt out instead of interpolating in from the leaf base.
    for (let i = 0; i < g.index!.count; i += 3) {
      const a = g.index!.getX(i), b = g.index!.getX(i + 1), c = g.index!.getX(i + 2);
      assert.equal(tissue.getZ(a), tissue.getZ(b));
      assert.equal(tissue.getZ(a), tissue.getZ(c));
    }
  } finally { g.dispose(); other.dispose(); material.dispose(); }
});

test('a tulip clasp follows the posed stem tangent and centre at its socket', () => {
  const material = foliageMaterial('tulip'), bend = new THREE.Vector3(-.3, -.45, .18);
  const leaf = new StemLeaf(specimen('tulip'), [.3, .5, .7, .8], 0, 1, material, bend);
  const g = (leaf.children[0] as THREE.Mesh).geometry;
  try {
    const curve = new THREE.CatmullRomCurve3([[.05, -3, 0], [.05, -1.9, 0], [.48, 0, .19], [1.2, 2, .6]].map(p => new THREE.Vector3(...p)));
    const t = .57, tension = .8;
    leaf.socket(curve, t); leaf.orient(.44, tension);
    assert.ok(leaf.position.distanceTo(curve.getPoint(t)) < 1e-10);
    const moved = (t: number) => {
      const p = curve.getPoint(t);
      return p.addScaledVector(bend, tension * flexAt(p.y, 2));
    };
    const tangent = moved(t + 1e-5).sub(moved(t - 1e-5)).normalize();
    assert.ok(tangent.angleTo(new THREE.Vector3(0, 1, 0).applyQuaternion(leaf.quaternion)) < 1e-5);
  } finally { g.dispose(); material.dispose(); }
});

test('a flower stem follows its route and shows a capped cut face from below', () => {
  const curve = new THREE.CatmullRomCurve3([[0, -3, 0], [0, -1.9, 0], [.5, .3, .28], [.75, 2.5, .2]].map(p => new THREE.Vector3(...p)));
  const geometry = cutStemGeometry(curve, specimen('sunflower')), material = cutStemMaterial();
  try {
    const position = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
    const tissue = geometry.getAttribute('stemTissue'), normal = geometry.getAttribute('normal');
    const stride = Array.from({ length: tissue.count }, (_, i) => i).find(i => tissue.getX(i) === 1)! + 1;
    const sides = stride - 1;
    assert.ok(geometry.index!.count / 3 < 750, 'Keep the tube, bevel and cap within the stem budget');
    for (let i = 0; i <= 40; i++) {
      const center = new THREE.Vector3();
      for (let j = 0; j < sides; j++) center.add(new THREE.Vector3().fromBufferAttribute(position, i * stride + j));
      assert.ok(center.multiplyScalar(1 / sides).distanceTo(curve.getPointAt(i / 40)) < 1e-6);
      const a = new THREE.Vector3().fromBufferAttribute(normal, i * stride);
      const b = new THREE.Vector3().fromBufferAttribute(normal, i * stride + sides);
      assert.deepEqual(a, b, 'Longitudinal seam normals agree');
    }
    const end = curve.getPoint(0), direction = curve.getTangent(0);
    const mesh = new THREE.Mesh(geometry, material);
    const ray = new THREE.Raycaster(end.clone().addScaledVector(direction, -.2).add(new THREE.Vector3(.002, 0, 0)), direction, 0, .24);
    assert.ok(ray.intersectObject(mesh).length > 0, 'Bottom is closed with outward-facing polygons');
    const cap = Array.from({ length: tissue.count }, (_, i) => i).find(i => tissue.getZ(i) === 1)!;
    const outward = new THREE.Vector3().fromBufferAttribute(normal, cap);
    assert.ok(outward.dot(direction) < -.90, 'The pith faces out of the stem');
    assert.ok(outward.dot(new THREE.Vector3().fromBufferAttribute(normal, cap - stride)) < .95, 'Cut and chamfer have distinct normals');
    for (let i = cap; i < position.count; i++) {
      const planeOrigin = new THREE.Vector3().fromBufferAttribute(position, cap);
      assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(position, i).sub(planeOrigin).dot(outward)) < 1e-6);
    }
    assert.ok(colors.getX(colors.count - 1) > colors.getX(cap) * 2, 'Pith is lighter than the rim');
    assert.ok(position.getY(43 * stride) > curve.getPoint(1).y, 'Neck extends past the head socket');
  } finally { geometry.dispose(); material.dispose(); }
});

test('foliage keeps the seeded per-leaf RNG budget and stays on the flexing route', () => {
  for (const seed of [1748091600125, 1748091600126]) {
    const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
    const base = createBouquet(seed, 3);
    const counts = (leafCount: number) => {
      const plan = createBouquet(seed, 3), draws = plan.flowers.map(() => 0);
      plan.flowers.forEach((entry, i) => {
        const random = entry.specimen.random;
        entry.specimen.random = () => { draws[i]++; return random(); };
        entry.leafCount = leafCount;
      });
      const b = buildBouquet(plan, textures);
      try {
        for (const beat of [0, .27, .58, 1]) {
          pose(b, beat);
          for (const { stem, curve, leaves, bendX, drop, bendZ, top } of b.blooms) {
            assert.equal(stem.geometry.morphAttributes.position!.length, 1);
            const rest = stem.geometry.getAttribute('normal'), [folded] = stem.geometry.morphAttributes.normal!;
            const [foldedPositions] = stem.geometry.morphAttributes.position!;
            const open = stem.geometry.getAttribute('position');
            const direction = new THREE.Vector3(bendX, drop, bendZ);
            const a = new THREE.Vector3(), n = new THREE.Vector3(), delta = new THREE.Vector3();
            assert.equal(folded.count, rest.count);
            for (let i = 0; i < folded.count; i++) {
              a.fromBufferAttribute(open, i);
              n.fromBufferAttribute(rest, i);
              const d = direction.clone().multiplyScalar(flexAt(a.y, top.y));
              assert.ok(delta.fromBufferAttribute(foldedPositions, i).distanceTo(a.clone().add(d)) < 4e-7);
              if (a.y <= -1.9 || a.y >= top.y) {
                assert.ok(delta.fromBufferAttribute(folded, i).distanceTo(n) < 1e-7);
              } else {
                // Numerically push a tangent through the same bend; the folded
                // normal must stay perpendicular to that live surface.
                const tangent = new THREE.Vector3(-n.y, n.x, 0).normalize();
                const next = a.clone().addScaledVector(tangent, 1e-5);
                next.addScaledVector(direction, flexAt(next.y, top.y)).sub(a.add(d));
                assert.ok(Math.abs(delta.fromBufferAttribute(folded, i).dot(next.normalize())) < 1e-5);
              }
            }
            for (const leaf of leaves.filter(leaf => leaf.visible)) {
              const p = curve.getPoint(leaf.userData.stemPosition);
              const w = flexAt(p.y, top.y) * stem.morphTargetInfluences![0];
              p.addScaledVector(new THREE.Vector3(bendX, drop, bendZ), w);
              assert.ok(leaf.position.distanceTo(p) < 1e-10);
            }
          }
        }
      } finally { disposeBouquet(b); }
      return draws;
    };
    try {
      const one = counts(1), two = counts(2);
      assert.deepEqual(two.map((n, i) => n - one[i]), base.flowers.map(({ specimen }) => specimen.recipe.leaf === 'strap' ? 4 : 5));
    } finally { textures.petal.dispose(); textures.leaf.dispose(); }
  }
});
