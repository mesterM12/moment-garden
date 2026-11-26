import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveShader } from '@vgpu/wgsl/runtime';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { init, effect, target } from 'vgpu/node';

const entry = fileURLToPath(new URL('./petal.wgsl', import.meta.url));
const out = new URL('../../src/garden/petal-field.generated.json', import.meta.url);
const width = 64, height = 96;
const digest = data => createHash('sha256').update(data).digest('hex');
const resolved = await resolveShader({ entry, validate: 'require' });
const gpu = await init();
try {
  const errors = [], fields = {}, seen = new Set();
  gpu.onError(error => errors.push(error.message));
  // RG8 is linear, filterable, renderable and has unpadded two-byte readback in v0.6.0.
  const surface = target(gpu, { size: [width, height], format: 'rg8unorm' });
  const paint = effect(gpu, prepareShader(resolved, entry), { label: 'petal-tissues', set: { spec: { family: 0 } } });
  await paint.compile(surface);
  for (const [family, name] of ['wax', 'satin', 'velvet', 'paper'].entries()) {
    paint.set({ spec: { family } });
    paint.draw(surface);
    const rg = await surface.color.read({ mipLevel: 0, region: 'all' });
    await gpu.settled();
    assert.deepEqual(errors, []);
    assert.equal(rg.length, width * height * 2);
    const range = [[255, 0], [255, 0]];
    let basal = 0, distal = 0;
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 2; c++) {
        range[c][0] = Math.min(range[c][0], rg[2 * i + c]);
        range[c][1] = Math.max(range[c][1], rg[2 * i + c]);
      }
      if (i < width) basal += rg[2 * i + 1];
      if (i >= width * (height - 1)) distal += rg[2 * i + 1];
    }
    const hash = digest(rg);
    assert.ok(!seen.has(hash), 'Material selector must change the native draw'); seen.add(hash);
    assert.ok(range.every(([lo, hi]) => hi - lo > 65 && hi < 255 && lo > 0), `${name} lacks unclipped relief/pigment`);
    assert.ok((basal - distal) / width > 70, `${name} is missing socket density`);
    fields[name] = Buffer.from(rg).toString('base64');
    console.log({ name, range, meanSocket: basal / width, meanTip: distal / width, field: hash });
  }
  const json = JSON.stringify({ source: digest(await readFile(entry)), width, height, fields }, null, 2) + '\n';
  if (process.argv.includes('--check')) assert.ok(await readFile(out, 'utf8') === json, 'Fields differ; inspect before regenerating');
  else await writeFile(out, json);
  console.log({ adapter: gpu.adapter });
} finally {
  gpu.dispose();
}
