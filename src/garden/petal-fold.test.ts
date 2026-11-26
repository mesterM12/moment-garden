// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { foldBlade } from './petal-fold';
import { bladeBatches } from './blade-batches';
import { bloomStart, foldWeights, hingePeak, leadingGuard, petalOpening } from './bloom-score';
import { createSpecimen } from './botany';
import { finishPetals } from './florist-finish';
import * as extras from './extra-blooms';

const strip = () => {
  const g = new THREE.BufferGeometry();
  const points = [], uv = [], index = [];
  for (let j = 0; j <= 20; j++) for (let k = 0; k < 5; k++) {
    const a = j * 5 + k;
    points.push((k / 4 - .5) * .28, 0, j / 20); uv.push(k / 4, j / 20);
    if (k < 4 && j < 20) index.push(a, a + 5, a + 1, a + 5, a + 6, a + 1);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index); g.computeVertexNormals(); return g;
};
const vector = (a: THREE.BufferGeometry['attributes'][string], i: number) => new THREE.Vector3().fromBufferAttribute(a, i);

describe.each(['lily', 'poppy', 'sunflower'] as const)('%s blade', key => {
  test('the socket stays put, the base rolls down before the rim, and midrib length survives each pose', () => {
    const g = strip(); foldBlade(g, key, -.08, 1.62);
    expect(g.morphAttributes.position).toHaveLength(2);
    const [sealed, bowed] = g.morphAttributes.position;
    const tangent = (i: number) => vector(bowed, i + 5).sub(vector(bowed, i));
    expect(tangent(2).z).toBeGreaterThan(tangent(2).y);
    expect(tangent(97).y).toBeGreaterThan(tangent(97).z);
    for (const shape of [sealed, bowed]) {
      expect(vector(shape, 2).length()).toBe(0);
      let length = 0;
      for (let j = 0; j < 20; j++) length += vector(shape, j * 5 + 7).distanceTo(vector(shape, j * 5 + 2));
      expect(length).toBeCloseTo(1, 6);
    }
    expect(g.morphAttributes.normal.every(a => a.array.every(Number.isFinite))).toBe(true);
    g.dispose();
  });
});

test('three large sunflower whorls share at most fifteen draws, including closed and bowed targets', () => {
  const head = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
  const batches = bladeBatches('sunflower', head, mat);
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 31; i++)
    batches.add(strip(), i, layer, i / 31 * Math.PI * 2, layer * .02, .5, .1, .01);
  const entries = batches.finish();
  expect(entries).toHaveLength(15);
  for (const { mesh } of entries) {
    expect(mesh.morphTargetInfluences).toEqual([0, 0]);
    expect(mesh.geometry.morphAttributes.position.every(a => a.count === mesh.geometry.attributes.position.count)).toBe(true);
    mesh.geometry.dispose();
  }
  mat.dispose();
});

test('cluster sockets rise with their scaffold before the independently cupped florets spread', () => {
  const specimen = createSpecimen(42, 'hydrangea'), head = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
  const batches = finishPetals(specimen, extras.build(specimen, head, mat), head);
  const [branch, outer] = batches;
  expect(branch.mesh.geometry.morphAttributes.position[1].array).toEqual(branch.mesh.geometry.attributes.position.array);
  const g = outer.mesh.geometry, bent = g.morphAttributes.position[1];
  const blade = outer.blades![0];
  expect(vector(bent, blade.first)).toEqual(vector(g.attributes.position, blade.first));
  expect(vector(bent, blade.end - 1).distanceTo(vector(g.attributes.position, blade.end - 1))).toBeGreaterThan(.07);
  batches.forEach(p => p.mesh.geometry.dispose()); mat.dispose();
});

test('a visible outer guard parts first without picking a tube or a ray from a composite head', () => {
  for (const phase of [0, 1.1, 2.8, 4.4, 6.23]) {
    for (const [key, n] of [['rose', 8], ['tulip', 3], ['lily', 3], ['poppy', 5]] as const) {
      const chosen = leadingGuard(key, phase, n);
      expect(chosen).toBeGreaterThanOrEqual(0);
      expect(chosen).toBeLessThan(n);
      expect(Math.cos(phase + chosen * 2 * Math.PI / n - .95)).toBeGreaterThan(.49);
    }
  }
  expect(leadingGuard('sunflower', .2, 28)).toBe(-1);
});

test('an accent answers a focal flower and the last reflex resolves into exactly the instant pose', () => {
  const weights = [0, 0];
  const sample = (p: number, index: number, key: 'lily' | 'poppy') => {
    const start = bloomStart(index, .05);
    foldWeights(weights, petalOpening((p - start) / (1 - start), .04), hingePeak(key));
    return weights.slice();
  };
  expect(sample(.3, 6, 'poppy')).toEqual([1, 0]);
  expect(sample(.3, 0, 'lily')[0]).toBeLessThan(.55);
  const half = sample(.5, 0, 'lily');
  expect(half[1]).toBeGreaterThan(.6);
  expect(sample(.92, 6, 'poppy')[1]).toBeLessThan(0);
  expect(sample(1, 6, 'poppy')).toEqual([0, 0]);
  expect(sample(0, 0, 'lily')).toEqual([1, 0]);
  expect(sample(.5, 0, 'lily')).toEqual(half);
});
