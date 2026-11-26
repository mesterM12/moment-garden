// @vitest-environment node
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { test } from 'vitest';
import { createBouquet, headEnvelope } from './botany';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { petalFields } from './petal-surface';

// These four pairs crossed real triangles during opening, despite separate
// final head envelopes. Raycast the moving tube centreline, not its projected
// silhouette. Natural overlap in a front or back view is not a collision.
test.each([[28, 4, 5], [3, 3, 4], [4, 6, 1], [51, 6, 7]])(
  'opening cut %i routes stem %i outside flower %i', (seed, i, j) => {
    const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
    const b = buildBouquet(createBouquet(1748091600123 + seed, 3), textures);
    try {
      const stem = b.blooms[i], ray = new THREE.Raycaster(), next = new THREE.Vector3(), prev = new THREE.Vector3();
      const targets = b.blooms[j].petals.map(p => p.mesh);
      for (const progress of [0, .27, .43, .58, .73, 1]) {
        pose(b, progress); b.plant.updateMatrixWorld(true);
        // TubeGeometry duplicates its seam: the mean of its seven distinct
        // ring vertices is its actual posed centre, including the stem morph.
        for (let k = 0; k <= 40; k++) {
          next.set(0, 0, 0);
          for (let r = 0; r < 7; r++) next.add(stem.stem.getVertexPosition(k * 8 + r, new THREE.Vector3()));
          next.multiplyScalar(1 / 7);
          if (k) {
            ray.far = next.distanceTo(prev);
            ray.set(prev, new THREE.Vector3().subVectors(next, prev).normalize());
            assert.equal(ray.intersectObjects(targets, false).length, 0, `stem pierced petal at ${progress}`);
          }
          prev.copy(next);
        }
      }
    } finally { disposeBouquet(b); textures.petal.dispose(); textures.leaf.dispose(); }
  });

// Includes the guards of the lavender tulip that exceeded the booked radius.
test.each([1, 7, 28, 46])('finished cut %i fits its mature head profiles after rotation', seed => {
  const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
  const b = buildBouquet(createBouquet(1748091600123 + seed, 3), textures);
  try {
    pose(b, 1); b.plant.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    for (const { entry, petals } of b.blooms) {
      const e = headEnvelope(entry), center = new THREE.Vector3(...e.center), axis = new THREE.Vector3(...e.axis);
      let max = 0;
      for (const { mesh } of petals) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).sub(center);
        const axialSq = point.dot(axis) ** 2;
        max = Math.max(max, (point.lengthSq() - axialSq) / e.radius ** 2 + axialSq / e.halfHeight ** 2);
      }
      assert.ok(max <= 1, `${entry.specimen.key} out of envelope: ${max}`);
    }
  } finally { disposeBouquet(b); textures.petal.dispose(); textures.leaf.dispose(); }
});
