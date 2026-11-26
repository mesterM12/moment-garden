// @vitest-environment node
import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import * as THREE from 'three';
import { parseToken } from '../lib/bouquet-link';
import { createBouquet, createSpecimen, headEnvelope } from './botany';
import { build } from './extra-blooms';
import { finishPetals } from './florist-finish';
import type { Specimen } from './types';

const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
afterAll(() => material.dispose());

function head(specimen: Specimen, cut = true) {
  const group = new THREE.Group();
  const local = { ...specimen, random: () => assert.fail('Anatomy must not advance the geometry PRNG') };
  return finishPetals(local, build(local, group, material, cut), group, cut);
}

const limits = [
  ['hydrangea', 5, 18000], ['anemone', 2, 12000], ['billyButton', 3, 18000],
] as const;

for (const [key, drawCalls, triangles] of limits) {
  test(`the v3 ${key} stays inside its mature envelope and shares a few bounded morph batches`, () => {
    for (let i = 0; i < 24; i++) {
      const specimen = createSpecimen(1748091600123 + i * 7, key);
      const batches = head(specimen);
      try {
        const envelope = headEnvelope({ specimen, position: [0, 0, 0], turn: 0, scale: 1, delay: 0 });
        const axialCenter = Math.hypot(...envelope.center);
        let vertexCount = 0, triangleCount = 0;
        assert.equal(batches.length, drawCalls);
        for (const { mesh: { geometry } } of batches) {
          const pos = geometry.attributes.position;
          vertexCount += pos.count;
          triangleCount += geometry.index!.count / 3;
          for (let j = 0; j < pos.count; j++) {
            const radial = Math.hypot(pos.getX(j), pos.getZ(j));
            const axial = pos.getY(j) - axialCenter;
            assert.ok((radial / envelope.radius) ** 2 + (axial / envelope.halfHeight) ** 2 <= 1);
          }
          for (const target of [...geometry.morphAttributes.position!, ...geometry.morphAttributes.normal!]) {
            assert.equal(target.count, pos.count);
            assert.ok(target.array.every(Number.isFinite));
          }
        }
        assert.ok(vertexCount < 12000, `${vertexCount} vertices`);
        assert.ok(triangleCount < triangles, `${triangleCount} triangles`);
      } finally {
        batches.forEach(({ mesh }) => mesh.geometry.dispose());
      }
    }
  });
}

test('hydrangea cymes reach the sockets of the overlapping sepals in all three poses', () => {
  const bouquet = createBouquet(1748091600128, 3);
  const batches = head(bouquet.flowers[0].specimen);
  try {
    const [scaffold, ...rings] = batches;
    const geometry = scaffold.mesh.geometry;
    // One basal trunk, one axial fork and six lateral forks; each secondary
    // axis and pedicel share an elbow. Read the tube endpoints, not an index
    // into a duplicated copy of the modelling equations.
    const connections = [geometry.attributes.position, ...geometry.morphAttributes.position!].map(pos => {
      const sockets: THREE.Vector3[] = [];
      for (let i = 8 * 14 + 14; i < pos.count; i += 28) {
        const center = new THREE.Vector3();
        for (let j = 0; j < 6; j++) center.add(new THREE.Vector3().fromBufferAttribute(pos, i + 7 + j));
        sockets.push(center.divideScalar(6));
      }
      return sockets;
    });
    assert.ok(connections[0].length >= 23);
    let socket = 0;
    for (const { mesh, blades } of rings) {
      const shapes = [mesh.geometry.attributes.position, ...mesh.geometry.morphAttributes.position!];
      for (let i = 0; i < blades!.length; i += 4, socket++) {
        const point = blades![i].first + 4;
        for (let pose = 0; pose < shapes.length; pose++) {
          const root = new THREE.Vector3().fromBufferAttribute(shapes[pose], point);
          assert.ok(root.distanceTo(connections[pose][socket]) < .035, 'the calyx seats each sepal near its own pedicel');
        }
      }
    }
    assert.equal(socket, connections[0].length);
  } finally {
    batches.forEach(({ mesh }) => mesh.geometry.dispose());
  }
});

// [radius, upper axial reach] in each moving pose; the mature ellipsoid
// does not describe the closed anemone's vertical blade tips.
const legacyGifts = [
  ['hydrangea', '1970260fcfd', [.56, 1.04], [1.35, 1.40]],
  ['anemone', '1970260fd05', [.36, .74], [.74, .80]],
  ['billyButton', '1970260fcfc', [.22, .81], [.56, 1.07]],
] as const;

for (const [key, token, sealed, bowed] of legacyGifts) {
  test(`the unprefixed gift ${token} renders improved ${key} in its booked space`, () => {
    const gift = parseToken(token);
    assert.ok(gift);
    assert.equal(gift.version, 2);
    const plan = createBouquet(gift.timestamp, gift.version);
    const stems = plan.flowers.filter(({ specimen }) => specimen.key === key);
    assert.ok(stems.length > 0);
    for (const entry of stems) {
      const { specimen } = entry;
      const batches = head(specimen, false);
      try {
        assert.equal(batches.length, limits.find(limit => limit[0] === key)?.[1]);
        const e = headEnvelope({ ...entry, position: [0, 0, 0], scale: 1 });
        const axialCenter = Math.hypot(...e.center);
        let vertices = 0, triangles = 0;
        for (const { mesh } of batches) {
          const { geometry } = mesh;
          const [closed, bent] = geometry.morphAttributes.position ?? [];
          const pos = geometry.attributes.position;
          vertices += pos.count;
          triangles += geometry.index!.count / 3;
          // The eye is a solid mesh; it has no free blades to bow separately.
          assert.ok(closed && (bent || key === 'anemone'));
          assert.deepEqual(mesh.morphTargetInfluences, bent ? [0, 0] : [0]);
          for (let i = 0; i < pos.count; i++) {
            const r = Math.hypot(pos.getX(i), pos.getZ(i));
            assert.ok((r / e.radius) ** 2 + ((pos.getY(i) - axialCenter) / e.halfHeight) ** 2 <= 1);
            for (const [shape, [radius, height]] of [[closed, sealed], [bent ?? pos, bowed]] as const) {
              assert.ok(Math.hypot(shape.getX(i), shape.getZ(i)) < radius && shape.getY(i) < height);
            }
          }
        }
        assert.ok(vertices < 12000);
        assert.ok(triangles < limits.find(limit => limit[0] === key)![2]);
        const blades = batches.flatMap(batch => batch.blades ?? []);
        if (key === 'hydrangea') assert.equal(blades.length, 25 * 4);
        if (key === 'anemone') {
          assert.equal(blades.length, specimen.count);
          assert.ok(batches[1].mesh.geometry.attributes.position.count > 4500, 'carpels and tipped filaments are individual geometry');
        }
        if (key === 'billyButton') assert.ok(blades.length > 2.6 * specimen.count, 'the globe bears hundreds of florets');
      } finally {
        batches.forEach(({ mesh }) => mesh.geometry.dispose());
      }
    }
  });
}
