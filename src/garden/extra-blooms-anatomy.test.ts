// @vitest-environment node
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createBouquet, createSpecimen } from './botany';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { build } from './extra-blooms';
import { finishPetals } from './florist-finish';
import { petalFields } from './petal-surface';
import type { BladeSpan } from './petal-fold';
import type { MorphPetal } from './types';

type Attribute = THREE.BufferGeometry['attributes'][string];
const point = (attr: Attribute, i: number) => new THREE.Vector3().fromBufferAttribute(attr, i);
const radius = (attr: Attribute, i: number) => Math.hypot(attr.getX(i), attr.getZ(i));
const height = (attr: Attribute, first: number, end: number) => {
  const values = Array.from({ length: end - first }, (_, i) => attr.getY(first + i));
  return { min: Math.min(...values), max: Math.max(...values) };
};

function withHead(key: 'orchid' | 'iris' | 'calla', cut: boolean, check: (entries: MorphPetal[], length: number) => void) {
  const specimen = { ...createSpecimen(42, key), random() { throw new Error('Anatomy must not draw another seed'); } };
  const head = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const entries = finishPetals(specimen, build(specimen, head, material, cut), head, cut);
  try { check(entries, specimen.length); }
  finally { entries.forEach(({ mesh }) => mesh.geometry.dispose()); material.dispose(); }
}

const totalVertices = (entries: MorphPetal[]) => entries.reduce((n, { mesh }) => n + mesh.geometry.attributes.position.count, 0);

test('orchid opens its two broad wings from a wrapped bud behind a three-lobed lip and raised column', () => {
  withHead('orchid', true, (entries, R) => {
    const [sepals, wings, lip] = entries;
    expect(entries).toHaveLength(3);
    expect(totalVertices(entries)).toBeLessThanOrEqual(2125);
    expect(sepals.blades).toHaveLength(3);
    expect(wings.blades).toHaveLength(2);
    expect(lip.blades!.filter(b => !b.anchor)).toHaveLength(3);
    expect(lip.blades!.filter(b => b.anchor)).toHaveLength(2);
    const g = wings.mesh.geometry, open = g.attributes.position, closed = g.morphAttributes.position![0];
    for (const { first, end } of wings.blades!) {
      expect(radius(open, end - 9)).toBeGreaterThan(.94 * R);
      expect(radius(closed, end - 9)).toBeLessThan(.05 * R);
      expect(closed.getY(end - 9)).toBeGreaterThan(.62 * R);
      expect(point(open, first)).toEqual(point(closed, first));
    }
    const l = lip.mesh.geometry, pos = l.attributes.position;
    const apron = lip.blades![0];
    const endRow = apron.end - 15, notch = point(pos, endRow + 7);
    expect(notch.length()).toBeLessThan(point(pos, endRow + 4).length());
    expect(notch.length()).toBeLessThan(point(pos, endRow + 10).length());
    const column = lip.blades!.at(-1)!.end;
    expect(l.getAttribute('uv').getX(column)).toBe(-1);
    expect(height(pos, column, pos.count).max).toBeGreaterThan(height(pos, apron.first, apron.end).max + .03 * R);
  });
});

// Bilinear sample of the parent grid in the beard's (t, s) coordinates: its
// root should stay near this point in all three targets, not float as a bead.
function fallAnchor(position: Attribute, blade: BladeSpan, t: number, s: number) {
  const row = Math.floor(t * 24), col = Math.floor((s + 1) * 10);
  const i = blade.first + row * 21 + col;
  const u = (s + 1) * 10 - col, v = t * 24 - row;
  return point(position, i).lerp(point(position, i + 1), u)
    .lerp(point(position, i + 21).lerp(point(position, i + 22), u), v);
}

test('three bearded iris falls and three standards keep their different silhouettes and attached beards', () => {
  withHead('iris', true, (entries, R) => {
    expect(entries).toHaveLength(2);
    expect(totalVertices(entries)).toBeLessThanOrEqual(4599);
    const [falls, standards] = entries;
    const fall = falls.blades!.filter(b => !b.anchor);
    expect(fall).toHaveLength(3);
    expect(standards.blades).toHaveLength(3);
    const g = falls.mesh.geometry, { position, color } = g.attributes;
    for (const blade of fall) {
      const hairs = falls.blades!.filter(b => b.anchor && b.voice === blade.voice);
      expect(hairs).toHaveLength(15);
      expect(height(position, blade.first, blade.end).min).toBeLessThan(-.30 * R);
      const haft = blade.first + 6 * 21 + 10;
      const signal = point(color, haft), margin = point(color, haft + 9);
      expect(signal.x - signal.z).toBeGreaterThan(margin.x - margin.z + .09);
      for (const hair of hairs) for (const p of [position, ...g.morphAttributes.position!]) {
        const anchor = fallAnchor(p, blade, ...hair.anchor!);
        expect(point(p, hair.end - 1).distanceTo(anchor)).toBeLessThan(.066 * R);
      }
    }
    for (const { first, end } of standards.blades!) {
      expect(height(standards.mesh.geometry.attributes.position, first, end).max).toBeGreaterThan(.74 * R);
    }
  });
});

test.each([false, true])('calla cut=%s rolls one sheet around a stationary, relief-textured spadix', cut => {
  withHead('calla', cut, (entries, R) => {
    expect(entries).toHaveLength(1);
    expect(totalVertices(entries)).toBeLessThanOrEqual(cut ? 2787 : 2200);
    const [{ mesh, blades }] = entries;
    expect(blades).toHaveLength(1);
    const g = mesh.geometry, span = blades![0];
    const open = g.attributes.position, [closed, mid] = g.morphAttributes.position!;
    const lip = span.end - (cut ? 59 : 55);
    const tip = height(open, span.end, open.count).max;
    expect(height(open, lip, span.end).min).toBeLessThan(tip - .10 * R);
    expect(height(open, lip, span.end).max).toBeGreaterThan(tip + .32 * R);
    expect(height(closed, lip, span.end).min).toBeGreaterThan(tip + .09 * R);
    expect(radius(closed, span.end - 1)).toBeLessThan(.14 * radius(open, span.end - 1));
    const advance = (i: number) => (radius(mid, i) - radius(closed, i)) / (radius(open, i) - radius(closed, i));
    expect(advance(span.end - 1) - advance(lip)).toBeGreaterThan(.30);
    for (let i = span.end; i < open.count; i++) {
      expect(point(closed, i)).toEqual(point(open, i));
      expect(point(mid, i)).toEqual(point(open, i));
    }
    // The centre of the spadix can lean; measure across opposing vertices
    // to distinguish real radial relief from an offset or painted pattern.
    const across = cut ? 24 : 20, row = open.count - 13 * (across + 1);
    const diameters = Array.from({ length: across / 2 }, (_, i) => point(open, row + i).distanceTo(point(open, row + i + across / 2)));
    expect(Math.max(...diameters) - Math.min(...diameters)).toBeGreaterThan(.015 * R);
  });
});

test('the iris fall clears its own stem outside the attachment on v3-1970260fd06', () => {
  const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
  const bouquet = buildBouquet(createBouquet(0x1970260fd06, 3), textures);
  try {
    const iris = bouquet.blooms[0], stem = iris.stem, ray = new THREE.Raycaster();
    expect(iris.entry.specimen.key).toBe('iris');
    for (const p of [0, .27, .43, .58, .73, 1]) {
      pose(bouquet, p);
      bouquet.plant.updateMatrixWorld(true);
      const prev = new THREE.Vector3(), next = new THREE.Vector3(), sample = new THREE.Vector3();
      for (let k = 0; k <= 40; k++) {
        next.set(0, 0, 0);
        for (let r = 0; r < 7; r++) next.add(stem.getVertexPosition(k * 8 + r, sample));
        next.multiplyScalar(1 / 7).applyMatrix4(stem.matrixWorld);
        if (k) {
          ray.far = next.distanceTo(prev);
          ray.set(prev, sample.subVectors(next, prev).normalize());
          const hits = ray.intersectObjects(iris.petals.map(({ mesh }) => mesh));
          // The receptacle covers the stem socket, a deliberate final-ring overlap.
          expect(hits.filter(hit => k !== 40 || hit.uv?.x !== -1)).toHaveLength(0);
        }
        prev.copy(next);
      }
    }
  } finally { disposeBouquet(bouquet); textures.petal.dispose(); textures.leaf.dispose(); }
});
