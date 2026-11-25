const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const THREE = require('./vendor/three.min.js');
const varieties = require('./botany-varieties.js');

const window = { THREE };
for (const script of ['botany-varieties.js', 'extra-blooms.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, script), 'utf8'), { window }, { filename: script });
}
const { ExtraBlooms } = window;
const keys = Object.keys(varieties.species);
const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });

function specimen(key, phase, end) {
  const recipe = varieties.species[key];
  const size = end ? 1.06 : 0.94;
  return {
    key, recipe, rotation: phase, length: recipe.length * size, width: recipe.width * size,
    count: recipe.count[end], layers: recipe.layers[end],
    palette: { base: '#ad5b8e', tip: '#df9dc5', root: '#773f60', fleck: '#5a2b54' },
    random() { assert.fail('Building a head should not advance the specimen PRNG'); },
  };
}

test('additional recipes work in the browser and CommonJS; all have custom meshes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(window.BotanyVarieties)), varieties);
  assert.deepEqual(Object.keys(varieties.pigmentRanges), keys);
  assert.equal(keys.length, 7);
  for (const key of keys) {
    assert.equal(ExtraBlooms.has(key), true, key);
    assert.equal(varieties.species[key].center, 'hidden', `${key} paints its own center`);
    for (const [low, high] of varieties.pigmentRanges[key]) assert.ok(low >= 0 && high >= low && high <= 370, key);
  }
  const head = new THREE.Group();
  for (const key of ['rose', 'unknown', 'constructor', '__proto__']) {
    assert.equal(ExtraBlooms.has(key), false, key);
    assert.equal(ExtraBlooms.build({ key }, head, material).length, 0);
  }
  assert.equal(head.children.length, 0);
});

for (const key of keys) {
  test(`${key} produces bounded, finite morph batches throughout the seeded size range`, () => {
    for (let sample = 0; sample < 10; sample++) {
      const head = new THREE.Group();
      const entries = ExtraBlooms.build(specimen(key, sample * Math.PI / 5, sample === 0 ? 0 : 1), head, material);
      assert.ok(entries.length >= 1 && entries.length <= 7, 'petals are merged into a few draw calls');
      assert.equal(entries.length, head.children.length);
      let vertices = 0;
      let maxRadius = 0;
      for (const { mesh, layer, offset, shell } of entries) {
        assert.equal(mesh.parent, head);
        assert.equal(mesh.material, material);
        assert.equal(shell, true);
        assert.ok(Number.isInteger(layer) && layer >= 0 && layer <= 6);
        assert.ok(offset >= 0 && offset <= 0.04);
        assert.deepEqual(mesh.morphTargetInfluences, [0]);
        const { position, normal, color, uv } = mesh.geometry.attributes;
        const closedPosition = mesh.geometry.morphAttributes.position[0];
        const closedNormal = mesh.geometry.morphAttributes.normal[0];
        vertices += position.count;
        for (const attribute of [position, normal, color, uv, closedPosition, closedNormal]) {
          assert.equal(attribute.count, position.count);
          assert.ok(attribute.array.every(Number.isFinite));
        }
        assert.ok(mesh.geometry.index.array.every(index => index < position.count));
        for (let i = 0; i < position.count; i++) {
          const open = Math.hypot(position.getX(i), position.getZ(i));
          const shut = Math.hypot(closedPosition.getX(i), closedPosition.getZ(i));
          maxRadius = Math.max(maxRadius, open);
          assert.ok(open <= 1.6 && shut <= 1.6, 'both ends of the tween fit the radius envelope');
        }
        mesh.geometry.dispose();
      }
      assert.ok(vertices < 12000, `baked ${vertices} vertices`);
      assert.ok(maxRadius >= 0.4);
    }
  });
}

test('picotee uses the palette to tint rims without changing petal positions', () => {
  for (const key of ['ranunculus', 'calla', 'orchid', 'iris']) {
    const sample = specimen(key, 0.38, 1);
    const render = pattern => ExtraBlooms.build({ ...sample, pattern }, new THREE.Group(), material)[0].mesh.geometry;
    const plain = render('gradient'), rimmed = render('picotee');
    assert.deepEqual(plain.attributes.position.array, rimmed.attributes.position.array, key);
    assert.notDeepEqual(plain.attributes.color.array, rimmed.attributes.color.array, key);
    plain.dispose();
    rimmed.dispose();
  }
});

test('building the same specimen again produces identical surfaces and colors', () => {
  for (const key of keys) {
    const sample = specimen(key, 0.38, 1);
    const build = () => ExtraBlooms.build(sample, new THREE.Group(), material).map(({ mesh }) => mesh.geometry);
    const first = build(), second = build();
    for (let i = 0; i < first.length; i++) {
      const a = first[i], b = second[i];
      assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
      assert.deepEqual(a.attributes.color.array, b.attributes.color.array);
      assert.deepEqual(a.morphAttributes.position[0].array, b.morphAttributes.position[0].array);
      a.dispose();
      b.dispose();
    }
  }
});
