import assert from 'node:assert/strict';
import type { HeadEnvelope } from './types';

// Envelopes are scene-unit doubles (~1–10). A 1e-12 absolute + relative
// tolerance permits accumulated libm last-bit drift, but remains many orders
// below a meaningful stem displacement, rotation, or flower profile change.
export function assertEnvelopesEqual(actual: HeadEnvelope[], expected: HeadEnvelope[], label: string): void {
  assert.equal(actual.length, expected.length, `${label}: envelope count`);
  const close = (a: number, b: number, path: string) => {
    assert.ok(Number.isFinite(a) && Number.isFinite(b)
      && Math.abs(a - b) <= 1e-12 + 1e-12 * Math.max(Math.abs(a), Math.abs(b)),
    `${label}${path}: ${a} != ${b}`);
  };
  expected.forEach((envelope, i) => {
    assert.deepEqual(Object.keys(actual[i]), Object.keys(envelope), `${label}[${i}]: envelope keys/order`);
    for (const key of ['center', 'axis'] as const) {
      assert.equal(actual[i][key].length, envelope[key].length, `${label}[${i}].${key}: dimensions`);
      envelope[key].forEach((value, j) => close(actual[i][key][j], value, `[${i}].${key}[${j}]`));
    }
    for (const key of ['radius', 'halfHeight'] as const) close(actual[i][key], envelope[key], `[${i}].${key}`);
  });
}
