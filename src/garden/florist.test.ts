// @vitest-environment node
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createBouquet, headEnvelope, species } from './botany';
import type { HeadEnvelope } from './types';

const first = 1748091600123;
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const extent = (h: HeadEnvelope, n: number[]) => Math.sqrt(h.radius ** 2 + (h.halfHeight ** 2 - h.radius ** 2) * dot(h.axis, n) ** 2);
const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

test('florist links repeat every placement and blade stream, independently of the legacy recipe', () => {
  function snapshot(timestamp: number) {
    const plan = createBouquet(timestamp, 3);
    return JSON.stringify([plan, plan.flowers.map(f => Array.from({ length: 20 }, f.specimen.random))]);
  }
  for (const seed of [0, first, first + 1, 2 ** 32, 8.64e15]) {
    assert.equal(snapshot(seed), snapshot(seed));
    assert.notEqual(JSON.stringify(createBouquet(seed, 3)), JSON.stringify(createBouquet(seed, 2)));
  }
});

test('v3 leaves the binding clear, fits the card, and separates mature heads including the safe cut', () => {
  const kinds = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const seed = i < 600 ? first + i : Math.floor((i - 600) / 399 * 8.64e15);
    const { flowers } = createBouquet(seed, 3), hulls = flowers.map(headEnvelope);
    flowers.forEach(f => kinds.add(f.specimen.key));
    assert.ok(flowers.length >= 7 && flowers.length <= 10);
    hulls.forEach((a, j) => {
      assert.ok(Math.abs(a.center[0]) + extent(a, [1, 0, 0]) <= 2.5);
      assert.ok(a.center[1] + extent(a, [0, 1, 0]) <= 3.35);
      assert.ok(a.center[1] - extent(a, [0, 1, 0]) >= -1.63);
      if (j) assert.ok(hulls[0].radius > a.radius * 1.38, `focal hierarchy at ${seed}`);
      for (const b of hulls.slice(0, j)) {
        const d = a.center.map((v, k) => v - b.center[k]), length = Math.hypot(...d);
        const gap = Math.max(...[d.map(v => v / length), a.axis, b.axis].map(n => Math.abs(dot(d, n)) - extent(a, n) - extent(b, n)));
        assert.ok(gap > .05499, `separating plane at ${seed}`);
      }
    });
  }
  assert.deepEqual(kinds, new Set(Object.keys(species)));
});

test('the uncurated 60-card sample spans narrow/wide, depth, focal position and asymmetry without color', () => {
  const ratios: number[] = [], centers: number[] = [], foci: number[] = [], kinds = new Set<string>(), counts = new Set<number>();
  for (let i = 0; i < 60; i++) {
    const { flowers } = createBouquet(first + i, 3), heads = flowers.map(headEnvelope);
    const xs = heads.map(h => h.center[0]), ys = heads.map(h => h.center[1]);
    ratios.push(span(xs) / span(ys)); centers.push(xs.reduce((a, b) => a + b) / xs.length); foci.push(xs[0]);
    assert.ok(span(heads.map(h => h.center[2])) > 1);
    for (const { specimen } of flowers) kinds.add(specimen.key);
    counts.add(flowers.length);
  }
  assert.ok(Math.min(...ratios) < .65 && Math.max(...ratios) > 2.5);
  assert.ok(span(centers) > 1.25 && span(foci) > 2);
  assert.ok(kinds.size >= 12);
  assert.deepEqual(counts, new Set([7, 8, 9, 10]));
});
