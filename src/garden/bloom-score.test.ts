import { expect, test } from 'vitest';
import { bloomStart, flexAt, petalOpening, petalPace, petalWave, stemTension } from './bloom-score';
import { CloseView } from './close-view';

test('stem releases from the binding, passes rest once, and arrives exactly', () => {
  expect(flexAt(-3, 2)).toBe(0);
  expect(flexAt(-1.9, 2)).toBe(0);
  expect(flexAt(2, 2)).toBe(1);
  expect(stemTension(0)).toBe(1);
  expect(stemTension(.62)).toBeLessThan(0);
  expect(stemTension(1)).toBeCloseTo(0, 12);
});

test('each cultivar starts on a bud, overlaps its petals, and finishes by the end', () => {
  expect(bloomStart(0, .09)).toBe(0);
  expect(bloomStart(3, .09)).toBeGreaterThan(bloomStart(1, .09));
  for (const key of ['tulip', 'lily', 'hydrangea', 'ranunculus', 'dahlia', 'iris'] as const) {
    const offsets = Array.from({ length: 7 }, (_, i) => petalWave(key, i, i, 2.43));
    expect(new Set(offsets).size).toBe(7);
    for (const start of offsets) {
      expect(petalOpening(0, start)).toBe(0);
      expect(petalOpening(1, start)).toBe(1);
      expect(petalOpening(.5, start)).toBeLessThan(petalOpening(.75, start));
    }
  }
});

test('overlapping whorls have different arrivals, while cluster scaffolds stay synchronized', () => {
  const opening = (time: number, layer: number) => Math.min(1,
    petalOpening(time, petalWave('tulip', layer, layer + 1, 2.4)) * petalPace('tulip', layer, layer + 1, 2.4));
  expect(opening(.85, 0)).toBe(1);
  expect(opening(.85, 1)).toBeLessThan(.9);
  expect(opening(.85, 1)).toBeGreaterThan(.5);
  expect(opening(1, 1)).toBe(1);
  expect(petalPace('hydrangea', 0, 0, 2)).toBe(petalPace('hydrangea', 3, 3, 2));
});

test('reversing the close view preserves its live position and stops at its endpoint', () => {
  const view = new CloseView();
  expect(view.set(true, 10, false)).toBe(true);
  view.step(180);
  expect(view.amount).toBeCloseTo(.5);
  expect(view.set(false, 180, false)).toBe(true);
  expect(view.amount).toBeCloseTo(.5);
  view.step(370);
  expect(view.amount).toBe(0);
  expect(view.moving).toBe(false);
  expect(view.set(false, 380, false)).toBe(false);
});

test('reduced motion can finish an active lens move without a second selection change', () => {
  const view = new CloseView();
  view.set(true, 20, false);
  expect(view.set(true, 40, true)).toBe(false);
  expect(view.amount).toBe(1);
  expect(view.moving).toBe(false);
});
