// @vitest-environment node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import * as botany from './botany';
import golden from './golden-fixtures.json';
import fixture from './parity-envelopes.json';
import { assertEnvelopesEqual } from './parity-compare';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseline = fixture.plans.find(({ timestamp, version }) => timestamp === 0 && version === 2)!;

test('accepts the exact one-ULP envelope difference reported by Linux CI', () => {
  const actual = structuredClone(baseline.envelopes);
  assert.equal(actual[7].axis[0], 0.09506609761545569);
  actual[7].axis[0] = 0.09506609761545567; // immediately adjacent IEEE-754 double
  assert.equal(digest(actual), '0f031c44e53019d2dc7333d0548c9cb7b2f68e5e63afbc9dd3bbd56a5f2f0105');
  assert.notEqual(digest(actual), golden.plans[1].envelopes); // original test goes red
  assertEnvelopesEqual(actual, baseline.envelopes, 'v2 envelopes at 0');
});

test('frozen numeric envelope fixtures match every original hash and fixture identity', () => {
  assert.equal(fixture.plans.length, golden.plans.length);
  fixture.plans.forEach(({ timestamp, version, envelopes }, i) => {
    assert.equal(timestamp, golden.plans[i].timestamp);
    assert.equal(version, golden.plans[i].version);
    assert.equal(digest(envelopes), golden.plans[i].envelopes);
  });
});

test('rejects real placement, recipe/profile, axis and shape regressions', () => {
  const bouquet = botany.createBouquet(0, 2);
  const position = structuredClone(bouquet.flowers[0].position);
  position[0] += 1e-6;
  const moved = [{ ...bouquet.flowers[0], position }, ...bouquet.flowers.slice(1)];
  assert.throws(() => assertEnvelopesEqual(moved.map(botany.headEnvelope), baseline.envelopes, 'position'), /position/);
  const changed = { ...bouquet.flowers[0], specimen: {
    ...bouquet.flowers[0].specimen,
    recipe: { ...bouquet.flowers[0].specimen.recipe, tilt: bouquet.flowers[0].specimen.recipe.tilt + 1e-6 },
  } };
  assert.throws(() => assertEnvelopesEqual([changed, ...bouquet.flowers.slice(1)].map(botany.headEnvelope), baseline.envelopes, 'recipe'), /recipe/);
  for (const mutate of [
    (v: typeof baseline.envelopes) => { v[0].radius += 1e-6; },
    (v: typeof baseline.envelopes) => { v[0].halfHeight += 1e-6; },
    (v: typeof baseline.envelopes) => { v[0].axis[0] += 1e-6; },
    (v: typeof baseline.envelopes) => { v[0].center[0] = NaN; },
    (v: typeof baseline.envelopes) => { v[0].axis[0] = Infinity; },
    (v: typeof baseline.envelopes) => { v[0].axis.pop(); },
    (v: typeof baseline.envelopes) => { v.pop(); },
    (v: typeof baseline.envelopes) => { v.reverse(); },
  ]) {
    const actual = structuredClone(baseline.envelopes);
    mutate(actual);
    assert.throws(() => assertEnvelopesEqual(actual, baseline.envelopes, 'regression'));
  }
});
