// @vitest-environment node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import * as THREE from 'three';
import * as botany from './botany';
import * as varieties from './botany-varieties';
import * as extraBlooms from './extra-blooms';
import * as petalMeshes from './petal-meshes';
import golden from './golden-fixtures.json';
import type { BouquetPlan, MorphPetal, Specimen } from './types';
import envelopes from './parity-envelopes.json';
import { assertEnvelopesEqual } from './parity-compare';

// Recipe, plan and RNG hashes come from the pre-migration root implementation.
// Mesh hashes separately pin the intentionally revised flower sculpts; sphere
// axes are canonicalized below. Tests never regenerate either set of fixtures.
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function planWithGeometry({ flowers, ...plan }: BouquetPlan) {
  return {
    ...plan,
    flowers: flowers.map(({ specimen: { random, ...specimen }, ...stem }) => ({
      ...stem, specimen, geometryRandom: Array.from({ length: 20 }, random),
    })),
  };
}

test('all recipes retain their pre-migration values and insertion order', () => {
  assert.equal(digest([botany.species, varieties.species, varieties.pigmentRanges]), golden.recipes);
});

test('v1/v2 plans and RNG retain exact golden hashes; derived envelopes retain numeric parity', () => {
  assert.equal(envelopes.plans.length, golden.plans.length);
  const covered = new Set<string>();
  for (const [index, { timestamp, version, plan }] of golden.plans.entries()) {
    const bouquet = botany.createBouquet(timestamp, version);
    assert.equal(digest(planWithGeometry(bouquet)), plan, `v${version} plan at ${timestamp}`);
    assertEnvelopesEqual(bouquet.flowers.map(botany.headEnvelope), envelopes.plans[index].envelopes, `v${version} envelopes at ${timestamp}`);
    bouquet.kinds.forEach(key => covered.add(key));
  }
  assert.deepEqual(covered, new Set(Object.keys(botany.species)));
});

function attributeSnapshot({ array, itemSize, normalized }: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, sphereAxis = false) {
  // Three.js r187 computes sphere poles as exact zero rather than sin(π).
  // Canonicalize only this round-off in the built-in sphere's positions and
  // normals. Custom petal buffers and all other attributes stay bit-exact.
  return { array: sphereAxis ? array.map(value => Math.abs(value) < 1e-15 ? 0 : value) : array, itemSize, normalized };
}

type Builder = (specimen: Specimen, head: THREE.Group, material: THREE.Material) => MorphPetal[];
function meshSnapshot(build: Builder, specimen: Specimen) {
  const head = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const materials = new Set<THREE.Material>([material]);
  const geometries = new Set<THREE.BufferGeometry>();
  try {
    const entries = build(specimen, head, material);
    return {
      entries: entries.map(({ mesh, layer, offset }) => ({ child: head.children.indexOf(mesh), layer, offset })),
      children: head.children.map(object => {
        assert.ok(object instanceof THREE.Mesh);
        assert.ok(!Array.isArray(object.material));
        assert.ok(object.material instanceof THREE.MeshStandardMaterial || object.material === material);
        const geometry: THREE.BufferGeometry = object.geometry;
        const { index, attributes, morphAttributes, morphTargetsRelative } = geometry;
        geometries.add(geometry);
        materials.add(object.material);
        return {
          position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(),
          material: object.material === material ? 'shared' : {
            color: object.material.color.toArray(), roughness: object.material.roughness,
          },
          index: index && attributeSnapshot(index),
          attributes: Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key,
            attributeSnapshot(value, geometry instanceof THREE.SphereGeometry && (key === 'position' || key === 'normal')),
          ])),
          morphAttributes: Object.fromEntries(Object.entries(morphAttributes)
            .map(([key, values]) => [key, values.map(value => attributeSnapshot(value))])),
          morphTargetsRelative, morphTargetInfluences: object.morphTargetInfluences,
        };
      }),
    };
  } finally {
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(used => used.dispose());
  }
}

test('custom petal batches, vertex buffers, colors, and bloom morphs retain golden hashes', () => {
  const covered = new Set<string>();
  for (const { timestamp, key, pattern, digest: expected } of golden.meshes) {
    const entry = botany.createBouquet(timestamp).flowers.find(({ specimen }) => specimen.key === key && specimen.pattern === pattern);
    assert.ok(entry, `${key}/${pattern} fixture specimen at ${timestamp}`);
    const specimen: Specimen = {
      ...entry.specimen,
      random: () => assert.fail(`${key}/${pattern} must not consume geometry randomness`),
    };
    const build = extraBlooms.has(key) ? extraBlooms.build : petalMeshes.build;
    assert.equal(digest(meshSnapshot(build, specimen)), expected, `${key}/${pattern} mesh at ${timestamp}`);
    covered.add(key);
  }
  assert.deepEqual(covered, new Set([...Object.keys(varieties.species), 'rose', 'tulip', 'dahlia']));
});
