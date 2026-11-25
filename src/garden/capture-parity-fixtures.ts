// Maintenance-only capture, never run by tests. From the repository root:
// node src/garden/capture-parity-fixtures.ts
// Requires a runtime whose legacy envelopes match ALL original hashes. This
// deliberately cannot bless changed migrated outputs or different Math results.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import type * as Botany from './botany';

const revision = 'caa6d876f755c9ce920fab03217c1cadfae87133';
const context = vm.createContext({});
context.window = context;
for (const name of ['botany-varieties', 'botany']) {
  const source = execFileSync('git', ['show', `${revision}:${name}.js`], { encoding: 'utf8' });
  vm.runInContext(source, context, { filename: `${revision}/${name}.js` });
}
// Only the VM boundary needs an assertion; no migrated implementation is run.
const legacy = context as unknown as { Botany: typeof Botany };
const golden: typeof import('./golden-fixtures.json') = JSON.parse(
  readFileSync(new URL('./golden-fixtures.json', import.meta.url), 'utf8'),
);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plans = golden.plans.map(({ timestamp, version, envelopes: expected }) => {
  const bouquet = legacy.Botany.createBouquet(timestamp, version as 1 | 2);
  const envelopes = bouquet.flowers.map(legacy.Botany.headEnvelope);
  assert.equal(digest(envelopes), expected, `legacy envelopes ${version}/${timestamp}`);
  return { timestamp, version, envelopes };
});
writeFileSync(new URL('./parity-envelopes.json', import.meta.url), `${JSON.stringify({ revision, plans }, null, 2)}\n`);
console.log(`Verified ${plans.length} legacy envelopes against unchanged original hashes.`);
