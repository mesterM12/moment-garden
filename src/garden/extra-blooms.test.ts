// @vitest-environment node
import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import * as THREE from 'three';
import * as varieties from './botany-varieties';
import * as ExtraBlooms from './extra-blooms';
import { createSpecimen } from './botany';
import type { ExtraSpeciesKey, PetalPattern, Specimen } from './types';

const isExtraSpecies = (key: string): key is ExtraSpeciesKey => Object.hasOwn(varieties.species, key);
const keys = Object.keys(varieties.species).filter(isExtraSpecies);
const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
afterAll(() => material.dispose());

function specimen(key: ExtraSpeciesKey, phase: number, end: 0 | 1): Specimen {
  const recipe = varieties.species[key];
  const size = end ? 1.06 : 0.94;
  return {
    ...createSpecimen(0, key),
    key, recipe, rotation: phase, length: recipe.length * size, width: recipe.width * size,
    count: recipe.count[end], layers: recipe.layers[end],
    palette: { name: 'Test cultivar', base: '#ad5b8e', tip: '#df9dc5', root: '#773f60', fleck: '#5a2b54' },
    random() { assert.fail('Building a head should not advance the specimen PRNG'); },
  };
}

test('all additional recipes have custom meshes and valid pigment ranges', () => {
  assert.deepEqual(Object.keys(varieties.pigmentRanges), keys);
  assert.equal(keys.length, 7);
  for (const key of keys) {
    assert.equal(ExtraBlooms.has(key), true, key);
    assert.equal(varieties.species[key].center, 'hidden', `${key} paints its own center`);
    for (const [low, high] of varieties.pigmentRanges[key]) assert.ok(low >= 0 && high >= low && high <= 370, key);
  }
  const head = new THREE.Group();
  for (const key of ['rose', 'unknown', 'constructor', '__proto__']) {
    assert.equal(ExtraBlooms.has(key), false, key);
    // @ts-expect-error Unknown/prototype keys are intentional runtime-boundary probes.
    assert.equal(ExtraBlooms.build({ key }, head, material).length, 0);
  }
  assert.equal(head.children.length, 0);
});

for (const key of keys) {
  test(`${key} produces bounded, finite morph batches throughout the seeded size range`, () => {
    for (let sample = 0; sample < 10; sample++) {
      const head = new THREE.Group();
      const entries = ExtraBlooms.build(specimen(key, sample * Math.PI / 5, sample === 0 ? 0 : 1), head, material);
      assert.ok(entries.length >= 1 && entries.length <= 7, 'petals are merged into a few draw calls');
      assert.equal(entries.length, head.children.length);
      let vertices = 0;
      let maxRadius = 0;
      for (const { mesh, layer, offset } of entries) {
        assert.equal(mesh.parent, head);
        assert.equal(mesh.material, material);
        assert.ok(Number.isInteger(layer) && layer >= 0 && layer <= 6);
        assert.ok(offset >= 0 && offset <= 0.04);
        assert.deepEqual(mesh.morphTargetInfluences, [0]);
        const { position, normal, color, uv } = mesh.geometry.attributes;
        const closedPosition = mesh.geometry.morphAttributes.position[0];
        const closedNormal = mesh.geometry.morphAttributes.normal[0];
        vertices += position.count;
        for (const attribute of [position, normal, color, uv, closedPosition, closedNormal]) {
          assert.equal(attribute.count, position.count);
          assert.ok(attribute.array.every(Number.isFinite));
        }
        assert.ok(mesh.geometry.index);
        assert.ok(mesh.geometry.index.array.every(index => index < position.count));
        for (let i = 0; i < position.count; i++) {
          const open = Math.hypot(position.getX(i), position.getZ(i));
          const shut = Math.hypot(closedPosition.getX(i), closedPosition.getZ(i));
          maxRadius = Math.max(maxRadius, open);
          assert.ok(open <= 1.6 && shut <= 1.6, 'both ends of the tween fit the radius envelope');
        }
        mesh.geometry.dispose();
      }
      assert.ok(vertices < 12000, `baked ${vertices} vertices`);
      assert.ok(maxRadius >= 0.4);
    }
  });
}

test('picotee uses the palette to tint rims without changing petal positions', () => {
  const picoteeKinds: ExtraSpeciesKey[] = ['ranunculus', 'calla', 'orchid', 'iris'];
  for (const key of picoteeKinds) {
    const sample = specimen(key, 0.38, 1);
    const render = (pattern: PetalPattern) => ExtraBlooms.build({ ...sample, pattern }, new THREE.Group(), material)[0].mesh.geometry;
    const plain = render('gradient'), rimmed = render('picotee');
    assert.deepEqual(plain.attributes.position.array, rimmed.attributes.position.array, key);
    assert.notDeepEqual(plain.attributes.color.array, rimmed.attributes.color.array, key);
    plain.dispose();
    rimmed.dispose();
  }
});

test('building the same specimen again produces identical surfaces and colors', () => {
  for (const key of keys) {
    const sample = specimen(key, 0.38, 1);
    const build = () => ExtraBlooms.build(sample, new THREE.Group(), material).map(({ mesh }) => mesh.geometry);
    const first = build(), second = build();
    for (let i = 0; i < first.length; i++) {
      const a = first[i], b = second[i];
      assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
      assert.deepEqual(a.attributes.color.array, b.attributes.color.array);
      assert.deepEqual(a.morphAttributes.position[0].array, b.morphAttributes.position[0].array);
      a.dispose();
      b.dispose();
    }
  }
});
