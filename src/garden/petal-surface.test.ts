// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { expect, test, vi } from 'vitest';
import { createSpecimen } from './botany';
import { finishPetals } from './florist-finish';
import * as extra from './extra-blooms';
import { petalFields, petalSurface } from './petal-surface';
import { petalHand } from './petal-hand';
import field from './petal-field.generated.json';

test('four linear, socket-first fields share by tissue, never across mip chains', () => {
  const source = readFileSync(new URL('../../tools/petal-bake/petal.wgsl', import.meta.url));
  expect(createHash('sha256').update(source).digest('hex')).toBe(field.source);
  const bank = petalFields(2);
  const seen = new Set<string>();
  const disposed = vi.fn();
  for (const key of ['calla', 'tulip', 'rose', 'cosmos'] as const) {
    const mat = petalSurface(createSpecimen(5, key), bank), tex = bank.forSpecies(key);
    const rg = tex.image.data!;
    expect(rg.length).toBe(2 * field.width * field.height);
    seen.add(createHash('sha256').update(rg).digest('hex'));
    expect(tex.format).toBe(THREE.RGFormat);
    expect(tex.flipY).toBe(false);
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.generateMipmaps).toBe(true);
    expect(mat.bumpMap).toBe(tex);
    tex.addEventListener('dispose', disposed);
    let socket = 0, tip = 0;
    for (let x = 0; x < field.width; x++) {
      socket += rg[2 * x + 1];
      tip += rg[2 * (field.width * (field.height - 1) + x) + 1];
    }
    expect((socket - tip) / field.width).toBeGreaterThan(70);
    mat.dispose();
  }
  expect(seen.size).toBe(4);
  expect(bank.forSpecies('orchid')).toBe(bank.forSpecies('calla'));
  bank.dispose(); bank.dispose();
  expect(disposed).toHaveBeenCalledTimes(4);
});

test('stem/whorl/blade identity selects reproducible pigment without consuming the recipe RNG', () => {
  const words = (stamp: number) => Array.from({ length: 31 }, (_, i) => petalHand(stamp, 1, i));
  expect(new Set(words(42)).size).toBe(31);
  expect(words(42)).toEqual(words(42));
  expect(words(42)).not.toEqual(words(42 + 2 ** 32));
  const s = { ...createSpecimen(42, 'ranunculus'), random: () => { throw Error('advanced recipe RNG'); } };
  const head = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
  const petals = finishPetals(s, extra.build(s, head, mat), head);
  const ring = petals[1];
  const attr = ring.mesh.geometry.attributes.petalHand;
  for (const { first, end, voice } of ring.blades!) {
    const word = petalHand(42, 1, voice);
    for (const i of [first, end - 1]) expect([attr.array[i * 2], attr.array[i * 2 + 1]]).toEqual([word & 255, word >>> 8 & 255]);
  }
  petals.forEach(p => p.mesh.geometry.dispose()); mat.dispose();
});

test('a spadix sharing its spathe draw does not receive the blade texture', () => {
  const head = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
  const s = createSpecimen(42, 'calla');
  const [flower] = finishPetals(s, extra.build(s, head, mat), head);
  const g = flower.mesh.geometry, uv = g.attributes.uv;
  expect(uv.getY(flower.blades![0].end - 1)).toBe(1);
  expect(uv.getY(uv.count - 1)).toBe(-1);
  g.dispose(); mat.dispose();
});
