const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const legacyBotany = require('../../botany.js');
const legacyVarieties = require('../../botany-varieties.js');

// These timestamp boundaries and representative bouquets cover all 15 species.
const timestamps = [
  0, 1, 0xffffffff, 0x100000000, 0x100000001,
  1_748_091_600_123, 1_748_091_600_126, 1_748_091_600_127,
  1_748_091_600_130, 1_748_091_600_137, 1_748_091_600_341,
  8_640_000_000_000_000,
];

function planWithGeometry({ flowers, ...plan }) {
  return {
    ...plan,
    flowers: flowers.map(({ specimen: { random, ...specimen }, ...stem }) => ({
      ...stem,
      specimen,
      geometryRandom: Array.from({ length: 20 }, random),
    })),
  };
}

test('default v2 bouquets retain their plans, head envelopes, and stem geometry streams', async () => {
  const { default: botany } = await import('./botany.js');
  const { default: varieties } = await import('./botany-varieties.js');
  assert.deepEqual(botany.species, legacyBotany.species);
  assert.deepEqual(varieties.species, legacyVarieties.species);
  assert.deepEqual(varieties.pigmentRanges, legacyVarieties.pigmentRanges);

  const covered = new Set();
  for (const timestamp of timestamps) {
    const expected = legacyBotany.createBouquet(timestamp);
    const actual = botany.createBouquet(timestamp);
    assert.equal(actual.version, 2, `default version at timestamp ${timestamp}`);
    assert.deepEqual(planWithGeometry(actual), planWithGeometry(expected), `plan at timestamp ${timestamp}`);
    assert.deepEqual(actual.flowers.map(botany.headEnvelope), expected.flowers.map(legacyBotany.headEnvelope),
      `head envelopes at timestamp ${timestamp}`);
    for (const key of actual.kinds) covered.add(key);
  }
  assert.deepEqual(covered, new Set(Object.keys(legacyBotany.species)));
});

test('an explicit v1 bouquet keeps the legacy plan and stem geometry streams', async () => {
  const { default: { createBouquet } } = await import('./botany.js');
  for (const timestamp of timestamps) {
    assert.deepEqual(planWithGeometry(createBouquet(timestamp, 1)),
      planWithGeometry(legacyBotany.createBouquet(timestamp, 1)), `v1 plan at timestamp ${timestamp}`);
  }
});

function legacyMeshBuilders(THREE) {
  // Inject the same Three.js implementation that the ES modules import so the test
  // isolates the ported botanical code, not changes between Three.js builds.
  const window = { THREE };
  for (const filename of ['extra-blooms.js', 'petal-meshes.js']) {
    runInNewContext(readFileSync(resolve(__dirname, '../..', filename), 'utf8'), { window }, { filename });
  }
  return window;
}

function attributeSnapshot({ array, itemSize, normalized }) {
  return { array, itemSize, normalized };
}

function meshSnapshot(THREE, build, specimen) {
  const head = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const materials = new Set([material]);
  try {
    const entries = build(specimen, head, material);
    return {
      // Array.from normalizes arrays returned by the old scripts' VM realm.
      entries: Array.from(entries, ({ mesh, layer, offset, shell }) => ({
        child: head.children.indexOf(mesh), layer, offset, shell,
      })),
      children: head.children.map(mesh => {
        const { index, attributes, morphAttributes, morphTargetsRelative } = mesh.geometry;
        materials.add(mesh.material);
        return {
          position: mesh.position.toArray(),
          quaternion: mesh.quaternion.toArray(),
          scale: mesh.scale.toArray(),
          material: mesh.material === material ? 'shared' : {
            color: mesh.material.color.toArray(),
            roughness: mesh.material.roughness,
          },
          index: index && attributeSnapshot(index),
          attributes: Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, attributeSnapshot(value)])),
          morphAttributes: Object.fromEntries(Object.entries(morphAttributes)
            .map(([key, values]) => [key, Array.from(values, attributeSnapshot)])),
          morphTargetsRelative,
          morphTargetInfluences: mesh.morphTargetInfluences,
        };
      }),
    };
  } finally {
    for (const mesh of head.children) mesh.geometry.dispose();
    for (const used of materials) used.dispose();
  }
}

test('custom petal builders retain mesh batches, vertex buffers, and bloom morphs', async () => {
  const [THREE, { default: extraBlooms }, { default: petalMeshes }] = await Promise.all([
    import('three'), import('./extra-blooms.js'), import('./petal-meshes.js'),
  ]);
  const { ExtraBlooms, PetalMeshes } = legacyMeshBuilders(THREE);
  const dedicated = ['rose', 'tulip', 'dahlia'];
  const covered = new Set();
  const sampled = new Set();
  for (const timestamp of timestamps) {
    for (const { specimen } of legacyBotany.createBouquet(timestamp).flowers) {
      const { key, pattern } = specimen;
      const extra = ExtraBlooms.has(key);
      assert.equal(extraBlooms.has(key), extra, key);
      const sample = `${key}/${pattern}`;
      if (sampled.has(sample) || (!extra && !dedicated.includes(key))) continue;

      const original = extra ? ExtraBlooms.build : PetalMeshes.build;
      const migrated = extra ? extraBlooms.build : petalMeshes.build;
      const input = { ...specimen, random: () => assert.fail(`${sample} should not consume geometry randomness`) };
      assert.deepEqual(meshSnapshot(THREE, migrated, input), meshSnapshot(THREE, original, input),
        `${sample} mesh at timestamp ${timestamp}`);
      sampled.add(sample);
      covered.add(key);
    }
  }
  assert.deepEqual(covered, new Set([...Object.keys(legacyVarieties.species), ...dedicated]));
});
