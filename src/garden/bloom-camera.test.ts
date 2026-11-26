// @vitest-environment node
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createBouquet } from './botany';
import { BLOOM_FOV, FOCAL_HOLD_MS, PULLBACK_END_MS, bloomPullback, createBloomFramer } from './bloom-camera';
import { BLOOM_DURATION } from './bloom-score';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { petalFields } from './petal-surface';

const fixtures = [
  [1748091600129, 3, 'rose'], [1748091600124, 3, 'calla'], [1748091600169, 3, 'dahlia'],
  [1748091600128, 3, 'hydrangea'], [1748091600132, 3, 'tulip'], [1748091600133, 3, 'ranunculus'],
  [1748091600134, 3, 'iris'], [1748091600142, 3, 'orchid'], [1748091600214, 3, 'sunflower'],
  [1748091600123, 2, 'tulip'], [1748091600127, 2, 'rose'],
] as const;

function withBouquet(seed: number, version: 2 | 3, fn: (bouquet: ReturnType<typeof buildBouquet>) => void) {
  const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
  const b = buildBouquet(createBouquet(seed, version), textures);
  try { fn(b); }
  finally { disposeBouquet(b); textures.petal.dispose(); textures.leaf.dispose(); }
}

test('the 6.5s shot holds for 1.8s and has one gently eased 3s pullback', () => {
  expect(BLOOM_DURATION).toBe(6500);
  expect(bloomPullback(0)).toBe(0);
  expect(bloomPullback(FOCAL_HOLD_MS / BLOOM_DURATION)).toBe(0);
  expect(bloomPullback(3300 / BLOOM_DURATION)).toBeCloseTo(.5);
  expect(bloomPullback(PULLBACK_END_MS / BLOOM_DURATION)).toBe(1);
  expect(bloomPullback(1)).toBe(1);
  expect(bloomPullback(.001 + FOCAL_HOLD_MS / BLOOM_DURATION)).toBeLessThan(.0001);
  expect(bloomPullback(PULLBACK_END_MS / BLOOM_DURATION - .001)).toBeGreaterThan(.9999);
});

test.each(fixtures)('seed %i v%i: the whole focal head fits during the hold and the final shot is the full frame', (seed, version, species) => {
  withBouquet(seed, version, b => {
    expect(b.blooms[0].entry.specimen.key).toBe(species);
    b.plant.rotation.y = -.1;
    const camera = new THREE.PerspectiveCamera(BLOOM_FOV, .63, .1, 60);
    const framer = createBloomFramer(camera);
    const point = new THREE.Vector3();
    framer.frameBloom(b, 0);
    const opening = camera.position.clone(), direction = camera.quaternion.clone();
    for (const ms of [0, 300, 610, 900, 1210, 1510, FOCAL_HOLD_MS]) {
      const p = ms / BLOOM_DURATION;
      pose(b, p); b.plant.updateMatrixWorld(true);
      framer.frameBloom(b, p); camera.updateMatrixWorld();
      expect(camera.position.distanceTo(opening)).toBe(0);
      let bound = 0;
      for (const { mesh } of b.blooms[0].petals) for (let i = 0; i < mesh.geometry.attributes.position.count; i += 3) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).project(camera);
        bound = Math.max(bound, Math.abs(point.x), Math.abs(point.y));
      }
      expect(bound).toBeLessThan(.96);
    }
    framer.frameBloom(b, 3300 / BLOOM_DURATION);
    expect(camera.quaternion.angleTo(direction)).toBeLessThan(1e-6);
    const midway = camera.position.clone();
    framer.frameBloom(b, PULLBACK_END_MS / BLOOM_DURATION);
    const end = camera.position.clone();
    expect(end.distanceTo(opening)).toBeGreaterThan(1);
    expect(midway.distanceTo(end)).toBeCloseTo(midway.distanceTo(opening), 8);
    framer.frameBloom(b, 1);
    expect(camera.position.distanceTo(end)).toBe(0);
    framer.frameFull(b);
    expect(camera.position.distanceTo(end)).toBe(0);
    camera.aspect = .25; camera.updateProjectionMatrix();
    framer.frameBloom(b, .2);
    expect(camera.position.distanceTo(opening)).toBeGreaterThan(.001);
  });
});

test('freezing a live shot hands off the exact camera; dragging turns about the same held anchor', () => {
  withBouquet(1748091600129, 3, b => {
    b.plant.rotation.y = -.1;
    const camera = new THREE.PerspectiveCamera(BLOOM_FOV, 1.35, .1, 60);
    const framer = createBloomFramer(camera);
    const p = 3200 / BLOOM_DURATION;
    framer.frameBloom(b, p);
    const before = camera.position.clone();
    const held = framer.holdBloom(b, p);
    framer.frameView(b, 1, held);
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-10);
    b.plant.rotation.y += .9;
    framer.frameView(b, 1, held);
    const subject = held.anchor.clone().applyEuler(b.plant.rotation);
    expect(camera.position.distanceTo(subject)).toBeCloseTo(held.distance, 10);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(.05);
  });
});
