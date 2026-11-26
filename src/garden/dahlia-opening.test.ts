// @vitest-environment node
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createBouquet } from './botany';
import { BLOOM_FOV, BLOOM_FRONT_YAW, createBloomFramer, FOCAL_HOLD_MS } from './bloom-camera';
import { BLOOM_DURATION } from './bloom-score';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { petalFields } from './petal-surface';

// Sample through the eye from the actual postcard lens. The first hit must
// generally be a floret, not the green receptacle behind the folded crown.
// A tiny natural seam is OK; the previous fold uncovered up to 13/49 rays.
test.each([
  ['1970260fd29', 3, 97], // red v3 focal, where the receptacle showed through most strongly
  ['1970260fcfb', 3, 97], // gold v3 focal
  ['1970260fcfe', 2, 140], // lavender legacy focal
] as const)('dahlia %s keeps the focal eye overlapped as the shoulders open', (token, version, florets) => {
  const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
  const bouquet = buildBouquet(createBouquet(parseInt(token, 16), version), textures);
  try {
    const { head, entry, petals, sepals } = bouquet.blooms[0];
    const { length: R, key } = entry.specimen;
    expect(key).toBe('dahlia');
    expect(petals.length).toBeLessThanOrEqual(12);
    expect(petals.reduce((sum, { mesh }) => sum + mesh.geometry.index!.count / 3, 0)).toBe(florets * 18 * 12 * 2);
    const camera = new THREE.PerspectiveCamera(BLOOM_FOV, 326 / 421);
    const lens = createBloomFramer(camera);
    bouquet.plant.rotation.y = BLOOM_FRONT_YAW;
    const blades = new Set<THREE.Object3D>(petals.map(p => p.mesh));
    const targets = [...blades, ...sepals, head.children[0]];
    const ray = new THREE.Raycaster(), direction = new THREE.Vector3();
    for (const time of [900, 1450, FOCAL_HOLD_MS, 2100, 2500, 3150]) {
      const progress = time / BLOOM_DURATION;
      pose(bouquet, progress);
      bouquet.plant.updateMatrixWorld(true);
      lens.frameBloom(bouquet, progress);
      let uncovered = 0;
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        if (x * x + z * z > 16) continue;
        direction.set(x * .032 * R, .42 * R, z * .032 * R).applyMatrix4(head.matrixWorld).sub(camera.position).normalize();
        ray.set(camera.position, direction);
        const hit = ray.intersectObjects(targets, false)[0];
        if (!hit || !blades.has(hit.object)) uncovered++;
      }
      expect(uncovered, `receptacle or daylight at ${time} ms`).toBeLessThanOrEqual(2);
    }
  } finally { disposeBouquet(bouquet); textures.petal.dispose(); textures.leaf.dispose(); }
});
