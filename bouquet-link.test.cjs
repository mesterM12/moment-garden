const { test } = require('node:test');
const assert = require('node:assert/strict');
const BouquetLink = require('./bouquet-link.js');
const { createBouquet } = require('./botany.js');

const site = 'https://example.com/moment-garden/';
const timestamp = 1748091600123;

test('a v1 URL round-trips the bouquet plan and per-stem geometry streams', () => {
  const url = BouquetLink.create(site, timestamp);
  assert.equal(url, `${site}?bouquet=1.${timestamp}`);
  const incoming = BouquetLink.read(new URL(url).search);
  assert.deepEqual(incoming, { status: 'valid', timestamp });

  const sender = createBouquet(timestamp);
  const recipient = createBouquet(incoming.timestamp);
  assert.equal(JSON.stringify(sender), JSON.stringify(recipient));
  sender.flowers.forEach((entry, i) => {
    assert.deepEqual(Array.from({ length: 20 }, entry.specimen.random), Array.from({ length: 20 }, recipient.flowers[i].specimen.random));
  });
});

test('share URLs retain the deployed host and exact path, but not stale seed, tracking or fragment', () => {
  assert.equal(BouquetLink.create(`${site}index.html?bouquet=2.99&track=123#garden`, timestamp), `${site}index.html?bouquet=1.${timestamp}`);
  assert.equal(BouquetLink.create('http://localhost:8000/', timestamp), `http://localhost:8000/?bouquet=1.${timestamp}`);
  assert.equal(BouquetLink.create('https://user:secret@example.com/moment-garden/', timestamp), `${site}?bouquet=1.${timestamp}`);
  assert.equal(BouquetLink.create('file:///garden/index.html', timestamp), null);
  assert.equal(BouquetLink.create('data:text/html,garden', timestamp), null);
});

test('a fresh bouquet removes only the bouquet parameter from the page URL', () => {
  assert.equal(BouquetLink.withoutBouquet(`${site}?bouquet=1.99&x=1&bouquet=2.66#garden`), `${site}?x=1#garden`);
  assert.equal(BouquetLink.withoutBouquet(`${site}?bouquet=1.99`), site);
  assert.equal(BouquetLink.withoutBouquet(`${site}?x=a%20b#garden`), `${site}?x=a%20b#garden`);
});

test('the URL contract distinguishes a fresh visit, invalid URLs and unrecognized versions', () => {
  for (const search of ['', '?other=1', '?Bouquet=1.99']) {
    assert.deepEqual(BouquetLink.read(search), { status: 'absent' });
  }
  for (const value of ['', '1', '1.', '.42', '1.+3', '1.-3', '1.001', '1.4e2', '1.2.3', '1.99%0A', '01.99', '1.%', '1.8640000000000001', '1.9007199254740992', '1.<img>']) {
    assert.deepEqual(BouquetLink.read(`?bouquet=${value}`), { status: 'invalid' }, value);
  }
  for (const version of [0, 2, 999999]) {
    assert.deepEqual(BouquetLink.read(`?bouquet=${version}.99`), { status: 'unsupported' });
  }
  assert.deepEqual(BouquetLink.read('?bouquet=1.99&bouquet=1.99'), { status: 'invalid' });
});

test('seeds must be nonnegative whole timestamps within the Date range', () => {
  const max = 8640000000000000;
  for (const value of [0, max]) {
    assert.deepEqual(BouquetLink.read(new URL(BouquetLink.create(site, value)).search), { status: 'valid', timestamp: value });
    assert.doesNotThrow(() => new Date(value).toISOString());
  }
  for (const value of [-1, max + 1, NaN, Infinity, 1.5, '99', undefined]) {
    assert.equal(BouquetLink.create(site, value), null);
  }
});
