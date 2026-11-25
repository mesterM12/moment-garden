// @vitest-environment node
import { test } from 'vitest';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { species, createSpecimen, createBouquet, headEnvelope } from './botany';
import type { HeadEnvelope, SpeciesKey, Specimen } from './types';
const seed = 1748091600123;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const originalKinds: SpeciesKey[] = ['daisy', 'sunflower', 'poppy', 'tulip', 'rose', 'dahlia', 'lily', 'cosmos'];
const newKinds: SpeciesKey[] = ['ranunculus', 'calla', 'orchid', 'iris', 'hydrangea', 'anemone', 'billyButton'];
const withGeometry = <T extends { flowers: { specimen: Specimen }[] }>(bouquet: T): [T, number[][]] =>
  [bouquet, bouquet.flowers.map(({ specimen }) => Array.from({ length: 20 }, specimen.random))];

test('v1 plans and geometry streams match a deep snapshot made before the expansion', () => {
  const timestamps = [...Array.from({ length: 32 }, (_, i) => seed + i), 0, 1, 4294967295, 4294967296, 4294967297, 8640000000000000];
  const snapshot = timestamps.map(timestamp => withGeometry(createBouquet(timestamp, 1)));
  const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  assert.equal(digest, '20de6b5eec8f15ee11c47ac7f229dd6955924b03caf399565b89305159e7d983');
});

test('the default v2 plan repeats for the same timestamp, including independent geometry streams', () => {
  const a = withGeometry(createBouquet(seed)), b = withGeometry(createBouquet(seed, 2));
  assert.equal(a[0].version, 2);
  assert.deepEqual(plain(a), plain(b));
  assert.equal(new Set(a[1].map(stream => JSON.stringify(stream))).size, a[0].flowers.length);
  assert.notDeepEqual(plain(a[0]), plain(createBouquet(seed + 1)));
  assert.notDeepEqual(plain(a[0]), plain(createBouquet(seed, 1)));
  for (const version of [0, 3, '1', '2', null, true, 1.5, NaN, Infinity]) {
    // @ts-expect-error Deliberately exercise invalid input at the runtime boundary.
    assert.throws(() => createBouquet(seed, version), RangeError);
  }
});

test('all fifteen species have distinct structural recipes', () => {
  const keys = [...originalKinds, ...newKinds];
  assert.deepEqual(Object.keys(species).sort(), keys.sort());
  const signatures = keys.map(key => {
    const flower = createSpecimen(seed, key);
    assert.equal(flower.key, key);
    return JSON.stringify([flower.count, flower.layers, flower.length, flower.width, flower.recipe.center, flower.recipe.leaf]);
  });
  assert.equal(new Set(signatures).size, keys.length);
  assert.ok(Object.hasOwn(species, createSpecimen(seed, 'unknown').key));
});

test('v2 spans 7–10 stems, all fifteen species and all 35 silhouette & palette combinations', () => {
  const kinds = new Set<SpeciesKey>(), counts = new Set<number>(), combinations = new Set<string>(), plantings = new Set<string>(), ties = new Set<string>(), names = new Set<string>();
  for (let i = 0; i < 1600; i++) {
    const bouquet = createBouquet(seed + i);
    assert.ok(bouquet.flowers.length >= 7 && bouquet.flowers.length <= 10);
    assert.ok(bouquet.kinds.length === (bouquet.flowers.length >= 9 ? 4 : 3));
    combinations.add(`${bouquet.arrangement.id}/${bouquet.palette.id}`);
    plantings.add(bouquet.kinds.join(','));
    counts.add(bouquet.flowers.length);
    names.add(bouquet.name);
    ties.add(bouquet.tie.style);
    assert.match(bouquet.tie.color, /^#[0-9a-f]{6}$/);
    assert.ok(bouquet.arrangement.label && bouquet.palette.label);
    const cultivars = new Map<SpeciesKey, [Specimen['palette'], Specimen['pattern']]>();
    bouquet.flowers.forEach(({ specimen: flower, delay, leafCount, leafScale, tiltOffset }) => {
      if (cultivars.has(flower.key)) assert.deepEqual([flower.palette, flower.pattern], cultivars.get(flower.key));
      cultivars.set(flower.key, [flower.palette, flower.pattern]);
      kinds.add(flower.key);
      assert.ok(delay >= 0 && delay < 0.1);
      assert.ok(leafCount !== undefined && Number.isInteger(leafCount) && leafCount >= 1 && leafCount <= 3);
      assert.ok(leafScale !== undefined && leafScale > .39 && leafScale < .68);
      assert.ok(tiltOffset !== undefined && Math.abs(tiltOffset) < .09);
      assert.ok(1 - (flower.layers - 1) * flower.recipe.shrink > 0);
    });
    assert.deepEqual(bouquet.kinds, [...cultivars.keys()]);
  }
  assert.deepEqual(kinds, new Set(Object.keys(species)));
  assert.deepEqual(counts, new Set([7, 8, 9, 10]));
  assert.deepEqual(ties, new Set(['bow', 'wrap', 'twine']));
  assert.equal(combinations.size, 35);
  assert.equal(names.size, 21);
  assert.ok(plantings.size > 200);
});

test('v2 mature envelopes fit the frame, have a physical gap, and keep visible centers', () => {
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const support = ({ radius, halfHeight, axis }: HeadEnvelope, direction: readonly number[]) => {
    const along = dot(axis, direction);
    return Math.hypot(halfHeight * along, radius * Math.sqrt(Math.max(0, 1 - along * along)));
  };
  const timestamps = [
    ...Array.from({ length: 900 }, (_, i) => seed + i),
    ...Array.from({ length: 901 }, (_, i) => Math.floor(i * 8640000000000000 / 900)),
    4294967295, 4294967296, 4294967297,
  ];
  for (const timestamp of timestamps) {
    const { flowers } = createBouquet(timestamp);
    const envelopes = flowers.map(headEnvelope);
    envelopes.forEach((envelope, i) => {
      const { axis, center: [x, y], radius, halfHeight } = envelope;
      const { specimen, position, scale } = flowers[i];
      assert.ok(position.every(Number.isFinite) && Math.abs(position[2]) <= 1.13);
      assert.ok(scale >= (i < 2 ? .29 : .12) && scale <= .68, `${specimen.key} scale at ${timestamp}`);
      assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9 && radius > 0 && halfHeight > 0);
      const width = support(envelope, [1, 0, 0]), height = support(envelope, [0, 1, 0]);
      assert.ok(Math.abs(x) + width <= 2.50001, `${specimen.key} x at ${timestamp}`);
      assert.ok(y + height <= 3.35001, `${specimen.key} top at ${timestamp}`);
      assert.ok(y - height >= -1.63001, `${specimen.key} is above the tie at ${timestamp}`);
      for (const [j, other] of envelopes.slice(0, i).entries()) {
        const delta = envelope.center.map((coord, k) => coord - other.center[k]);
        const length = Math.hypot(...delta);
        const normals = [delta.map(coord => coord / length), axis, other.axis];
        const gap = Math.max(...normals.map(n => Math.abs(dot(delta, n)) - support(envelope, n) - support(other, n)));
        assert.ok(gap >= .05499, `3D gap ${gap} between stems ${i} and ${j} at ${timestamp}`);
        const frontDelta = [delta[0] + .10 * delta[2], delta[1] - .15 * delta[2], 0];
        const frontGap = Math.hypot(...frontDelta);
        const direction = frontDelta.map(coord => coord / frontGap);
        assert.ok(frontGap >= .72 * Math.max(support(envelope, direction), support(other, direction)) + .06,
          `projected center clearance between stems ${i} and ${j} at ${timestamp}`);
      }
    });
  }
});

test('species-aware colors avoid unnatural green or blue roses and sunflowers', () => {
  function assertNaturalColor(flower: Specimen) {
    if (!['sunflower', 'rose', 'billyButton'].includes(flower.key)) return;
    const match = flower.palette.base.match(/hsl\(([\d.]+)/);
    assert.ok(match);
    const hue = Number(match[1]);
    assert.ok(hue < 60 || hue > 300, `${flower.key}: ${hue}`);
    if (flower.key === 'billyButton') assert.ok(hue >= 39 && hue <= 53);
  }
  for (let i = 0; i < 200; i++) {
    for (const key of ['sunflower', 'rose']) assertNaturalColor(createSpecimen(seed + i, key));
    for (const { specimen } of createBouquet(seed + i).flowers) assertNaturalColor(specimen);
  }
});
