import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveShader } from '@vgpu/wgsl/runtime';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { init, effect, target } from 'vgpu/node';
import { decodePetalBytes, petalBytePredictor } from '../../src/garden/petal-field-codec.ts';

const entry = fileURLToPath(new URL('./petal.wgsl', import.meta.url));
const out = new URL('../../src/garden/petal-field.generated.json', import.meta.url);
const width = 128, height = 128;
const digest = data => createHash('sha256').update(data).digest('hex');
const resolved = await resolveShader({ entry, validate: 'require' });
const gpu = await init();
try {
  const errors = [], fields = {}, seen = new Set();
  gpu.onError(error => errors.push(error.message));
  const surface = target(gpu, { size: [width, height], format: 'rgba8unorm' });
  const paint = effect(gpu, prepareShader(resolved, entry), { label: 'petal-tissues', set: { spec: { family: 0 } } });
  await paint.compile(surface);
  for (const [family, name] of ['wax', 'satin', 'velvet', 'paper'].entries()) {
    paint.set({ spec: { family } });
    paint.draw(surface);
    const rgba = await surface.color.read({ mipLevel: 0, region: 'all' });
    await gpu.settled();
    assert.deepEqual(errors, []);
    assert.equal(rgba.length, width * height * 4);
    const stats = Array.from({ length: 4 }, () => ({ lo: 255, hi: 0, sum: 0 }));
    let basal = 0, distal = 0;
    for (let i = 0; i < width * height; i++) {
      for (const [c, stat] of stats.entries()) {
        const value = rgba[4 * i + c];
        stat.lo = Math.min(stat.lo, value);
        stat.hi = Math.max(stat.hi, value);
        stat.sum += value;
      }
      if (i < width) basal += rgba[4 * i + 2];
      if (i >= width * (height - 1)) distal += rgba[4 * i + 2];
    }
    const hash = digest(rgba);
    assert.ok(!seen.has(hash), 'Material selector must change the native draw'); seen.add(hash);
    assert.ok(stats.every(({ lo, hi }) => hi - lo > 20 && hi < 255 && lo > 0),
      `${name} lacks unclipped tissue channels: ${stats.map(({ lo, hi }) => [lo, hi])}`);
    assert.ok(stats.slice(0, 2).every(({sum}) => Math.abs(sum / (width * height) - 128) < 3), `${name} tilts at lowest mip`);
    assert.ok((basal - distal) / width > 65, `${name} is missing socket pigment`);
    const residual = rgba.map((value, i) => value - petalBytePredictor(rgba, i, 4 * width));
    fields[name] = Buffer.from(residual).toString('base64');
    assert.deepEqual(decodePetalBytes(fields[name], width), rgba);
    console.log({ name, channels: stats.map(({lo, hi, sum}) => [lo, hi, sum / (width * height)]),
      meanSocket: basal / width, meanTip: distal / width, field: hash });
  }
  const json = JSON.stringify({ source: digest(await readFile(entry)), width, height, fields }, null, 2) + '\n';
  if (process.argv.includes('--check')) assert.ok(await readFile(out, 'utf8') === json, 'Fields differ; inspect before regenerating');
  else await writeFile(out, json);
  console.log({ adapter: gpu.adapter });
} finally {
  gpu.dispose();
}
