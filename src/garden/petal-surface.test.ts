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

test('four linear, socket-first fields share by tissue and converge to a flat slope at distant mips', () => {
  const source = readFileSync(new URL('../../tools/petal-bake/petal.wgsl', import.meta.url));
  expect(createHash('sha256').update(source).digest('hex')).toBe(field.source);
  const bank = petalFields(2);
  const seen = new Set<string>();
  const disposed = vi.fn();
  for (const key of ['calla', 'tulip', 'rose', 'cosmos'] as const) {
    const mat = petalSurface(createSpecimen(5, key), bank), tex = bank.forSpecies(key);
    const rgba = tex.image.data!;
    expect(rgba.length).toBe(4 * field.width * field.height);
    expect(rgba.length).toBeLessThanOrEqual(64 * 1024);
    seen.add(createHash('sha256').update(rgba).digest('hex'));
    expect(tex.format).toBe(THREE.RGBAFormat);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
    expect(tex.flipY).toBe(false);
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.generateMipmaps).toBe(true);
    expect(mat.bumpMap).toBe(tex);
    tex.addEventListener('dispose', disposed);
    let socket = 0, tip = 0, u = 0, v = 0;
    const area = field.width * field.height;
    for (let x = 0; x < field.width; x++) {
      socket += rgba[4 * x + 2];
      tip += rgba[4 * (field.width * (field.height - 1) + x) + 2];
    }
    for (let i = 0; i < area; i++) {
      u += rgba[4 * i];
      v += rgba[4 * i + 1];
    }
    expect((socket - tip) / field.width).toBeGreaterThan(65);
    expect(Math.abs(u / area - 128)).toBeLessThan(1);
    expect(Math.abs(v / area - 128)).toBeLessThan(1);
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
