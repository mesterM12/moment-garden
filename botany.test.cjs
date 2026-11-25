const { test } = require('node:test');
const assert = require('node:assert/strict');
const { species, createSpecimen, createBouquet } = require('./botany.js');
const seed = 1748091600123;
const plain = value => JSON.parse(JSON.stringify(value));

test('timestamp reproduces an entire surprise bouquet including geometry streams', () => {
  const a = createBouquet(seed), b = createBouquet(seed);
  assert.deepEqual(plain(a), plain(b));
  a.flowers.forEach((entry, i) => {
    assert.deepEqual(Array.from({ length: 20 }, entry.specimen.random), Array.from({ length: 20 }, b.flowers[i].specimen.random));
  });
});
test('all eight species have distinct structural recipes', () => {
  assert.equal(Object.keys(species).length, 8);
  const signatures = Object.keys(species).map(key => {
    const flower = createSpecimen(seed, key);
    assert.equal(flower.key, key);
    return JSON.stringify([flower.count, flower.layers, flower.length, flower.width, flower.recipe.center, flower.recipe.leaf]);
  });
  assert.equal(new Set(signatures).size, 8);
});
test('bouquets contain 7–9 staggered flowers and at least three species', () => {
  const seen = new Set(), colors = new Set();
  for (let i = 0; i < 500; i++) {
    const bouquet = createBouquet(seed + i);
    assert.ok(bouquet.flowers.length >= 7 && bouquet.flowers.length <= 9);
    assert.ok(bouquet.kinds.length >= 3);
    const cultivars = new Map();
    bouquet.flowers.forEach(({ specimen: flower, position, scale, delay }) => {
      if (cultivars.has(flower.key)) assert.equal(flower.palette.base, cultivars.get(flower.key));
      cultivars.set(flower.key, flower.palette.base);
      seen.add(flower.key); colors.add(flower.palette.base);
      assert.ok(position.every(Number.isFinite));
      assert.ok(scale > 0.4 && scale < 0.8);
      assert.ok(delay >= 0 && delay < 0.1);
      assert.ok(1 - (flower.layers - 1) * flower.recipe.shrink > 0);
    });
  }
  assert.equal(seen.size, 8);
  assert.ok(colors.size > 1200);
});
test('species-aware colors avoid unnatural green or blue sunflowers and roses', () => {
  for (let i = 0; i < 200; i++) {
    for (const key of ['sunflower', 'rose']) {
      const flower = createSpecimen(seed + i, key);
      const hue = Number(flower.palette.base.match(/hsl\(([\d.]+)/)[1]);
      assert.ok(hue < 60 || hue > 300, `${key}: ${hue}`);
    }
  }
});
test('different moments produce different arrangements; invalid species safely falls back', () => {
  assert.notDeepEqual(plain(createBouquet(seed)), plain(createBouquet(seed + 1)));
  assert.ok(Object.hasOwn(species, createSpecimen(seed, 'unknown').key));
});
