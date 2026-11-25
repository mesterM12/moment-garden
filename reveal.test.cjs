const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/reveal.js`, 'utf8');

function setup({ reduced = false, activate, animation } = {}) {
  const document = {};
  class Element extends EventTarget {
    children = [];
    attributes = new Map();
    append(...elements) { this.children.push(...elements); for (const el of elements) el.parent = this; }
    prepend(element) { this.children.unshift(element); element.parent = this; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
      if (this.contains(document.activeElement)) document.activeElement = document.body;
    }
    focus() { document.activeElement = this; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    querySelectorAll(selectors) { return this.children.filter(child => selectors.split(', ').includes(child.selector)); }
  }
  function element(selector) { return Object.assign(new Element(), { selector }); }
  const card = element('.postcard');
  const canvas = element('#flower');
  const status = element('#growth-status');
  const cardControls = element('.stage-controls');
  const gardenControls = element('.garden-controls');
  const linkNotice = element('#link-notice');
  const fallback = element('#render-fallback');
  const existingInert = element('#manual-share');
  existingInert.setAttribute('inert', '');
  card.append(canvas, status, cardControls, fallback);
  document.body = new Element();
  document.body.append(linkNotice, card, gardenControls, existingInert);
  document.activeElement = activate === 'notice' ? linkNotice : document.body;
  document.createElement = () => new Element();
  document.querySelectorAll = selectors => document.body.querySelectorAll(selectors);

  const window = { matchMedia: () => ({ matches: reduced }) };
  vm.runInNewContext(source, { window, document });
  const opened = [];
  const reveal = window.FlowerReveal.mount({ card, canvas, onOpen: ({ instant }) => opened.push(instant) });
  const cover = card.children[0];
  if (animation) cover.getAnimations = () => [animation];
  const opener = cover.children.at(-1);
  const click = detail => opener.dispatchEvent(Object.assign(new Event('click'), { detail }));
  return { document, card, reveal, cover, canvas, status, cardControls, gardenControls, opener, opened, click, fallback, linkNotice, existingInert };
}

test('mount seals only gift content, focuses the opener, and keeps existing inert state', () => {
  const { document, reveal, canvas, status, cardControls, gardenControls, opener, opened, click, fallback, linkNotice, existingInert } = setup();
  assert.equal(reveal.sealed, true);
  assert.equal(opener.textContent, 'Open your flowers');
  assert.equal(document.activeElement, opener);
  for (const el of [canvas, status, cardControls, gardenControls]) {
    assert.ok(el.hasAttribute('data-flower-sealed'));
    assert.ok(el.hasAttribute('inert'));
  }
  for (const el of [fallback, linkNotice]) {
    assert.ok(!el.hasAttribute('data-flower-sealed'));
    assert.ok(!el.hasAttribute('inert'));
  }
  click(0);
  assert.equal(reveal.sealed, false);
  assert.equal(document.activeElement, canvas);
  assert.deepEqual(opened, [true]);
  assert.ok(existingInert.hasAttribute('inert'));
  assert.ok(!gardenControls.hasAttribute('inert'));
});

test('pointer opens and focuses the bouquet without waiting; canceled animation cleans up', async () => {
  let cancel;
  const finished = new Promise((_, reject) => { cancel = reject; });
  const { document, card, cover, reveal, canvas, opened, click } = setup({ animation: { finished } });
  click(1);
  click(1);
  assert.equal(reveal.sealed, false);
  assert.equal(document.activeElement, canvas);
  assert.deepEqual(opened, [false]);
  assert.ok(cover.hasAttribute('inert'));
  assert.ok(cover.hasAttribute('data-open'));
  assert.ok(card.contains(cover));
  cancel(new Error('Motion preference changed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!card.contains(cover));
});

test('reduced-motion pointer activation removes the cover immediately', () => {
  const { card, cover, opened, click } = setup({ reduced: true, animation: { finished: new Promise(() => {}) } });
  click(1);
  assert.ok(!card.contains(cover));
  assert.deepEqual(opened, [true]);
});

test('fallback dismissal unseals without calling onOpen, and reports whether focus was displaced', () => {
  const { card, cover, reveal, opened, canvas } = setup();
  assert.equal(reveal.dismiss(), true);
  assert.equal(reveal.dismiss(), false);
  assert.equal(reveal.sealed, false);
  assert.ok(!canvas.hasAttribute('inert'));
  assert.ok(!card.contains(cover));
  assert.deepEqual(opened, []);
});

test('mount and fallback dismissal do not take focus from an active link notice', () => {
  const { document, reveal, linkNotice } = setup({ activate: 'notice' });
  assert.equal(document.activeElement, linkNotice);
  assert.equal(reveal.dismiss(), false);
  assert.equal(document.activeElement, linkNotice);
});
