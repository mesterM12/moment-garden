// @vitest-environment node
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as BouquetLink from './bouquet-link';
import { createBouquet } from '../garden/botany';

const site = 'https://example.com/moment-garden/';
const timestamp = 1748091600123;
const hexTimestamp = '1970260fcfb';

test('a share URL round-trips the bouquet plan and per-stem geometry streams', () => {
  const url = BouquetLink.create(site, timestamp);
  assert.equal(url, `${site}?bouquet=${hexTimestamp}`);
  const incoming = BouquetLink.read(new URL(url).search);
  assert.deepEqual(incoming, { status: 'valid', timestamp });

  const sender = createBouquet(timestamp);
  assert.equal(incoming.status, 'valid');
  if (incoming.status !== 'valid') assert.fail('Expected a valid bouquet link');
  const recipient = createBouquet(incoming.timestamp);
  assert.equal(JSON.stringify(sender), JSON.stringify(recipient));
  sender.flowers.forEach((entry, i) => {
    assert.deepEqual(Array.from({ length: 20 }, entry.specimen.random), Array.from({ length: 20 }, recipient.flowers[i].specimen.random));
  });
});

test('share URLs retain the deployed host and exact path only', () => {
  assert.equal(BouquetLink.create(`${site}index.html?bouquet=63&track=123#garden`, timestamp), `${site}index.html?bouquet=${hexTimestamp}`);
  assert.equal(BouquetLink.create('http://localhost:8000/', timestamp), `http://localhost:8000/?bouquet=${hexTimestamp}`);
  assert.equal(BouquetLink.create('https://user:secret@example.com/moment-garden/', timestamp), `${site}?bouquet=${hexTimestamp}`);
  assert.equal(BouquetLink.create('file:///garden/index.html', timestamp), null);
  assert.equal(BouquetLink.create('data:text/html,garden', timestamp), null);
});

test('a fresh bouquet removes only the bouquet parameter from the page URL', () => {
  assert.equal(BouquetLink.withoutBouquet(`${site}?bouquet=63&x=1&bouquet=66#garden`), `${site}?x=1#garden`);
  assert.equal(BouquetLink.withoutBouquet(`${site}?bouquet=63`), site);
  assert.equal(BouquetLink.withoutBouquet(`${site}?x=a%20b#garden`), `${site}?x=a%20b#garden`);
});

test('the URL contract distinguishes a fresh visit from an invalid link', () => {
  for (const search of ['', '?other=1', '?Bouquet=63']) {
    assert.deepEqual(BouquetLink.read(search), { status: 'absent' });
  }
  for (const value of ['', '00', '063', '%2B63', '-63', '0x63', 'g', 'A', '63%0A', '63+64', '1eb208c2dc0001', 'ffffffffffffff']) {
    assert.deepEqual(BouquetLink.read(`?bouquet=${value}`), { status: 'invalid' }, value);
  }
  assert.deepEqual(BouquetLink.read('?bouquet=63&bouquet=64'), { status: 'invalid' });
  assert.deepEqual(BouquetLink.read('?bouquet=100'), { status: 'valid', timestamp: 256 });
});

test('seeds must be nonnegative whole timestamps within the Date range', () => {
  const max = 8640000000000000;
  for (const value of [0, max]) {
    const address = BouquetLink.create(site, value);
    assert.ok(address);
    assert.deepEqual(BouquetLink.read(new URL(address).search), { status: 'valid', timestamp: value });
    assert.doesNotThrow(() => new Date(value).toISOString());
  }
  for (const value of [-1, max + 1, NaN, Infinity, 1.5, '99', undefined]) {
    // @ts-expect-error Invalid types intentionally test the public runtime boundary.
    assert.equal(BouquetLink.create(site, value), null);
  }
});
