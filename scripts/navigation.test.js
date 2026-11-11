import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeNavigationMenu } from '../js/modules/navigation.js';

class FakeElement {
  constructor(children = []) {
    this.children = children;
    this.listeners = new Map();
    this.open = false;
    this.focused = false;
    this.scrolledIntoView = false;
    this.scrollIntoView = () => { this.scrolledIntoView = true; };
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  dispatch(type, event = {}) {
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }

  querySelectorAll(selector) {
    return selector === '.nav-category' ? this.children : [];
  }

  querySelector(selector) {
    if (selector === 'summary') return this.summary;
    if (selector === '[aria-current="page"]') return this.currentLink ?? null;
    return null;
  }

  contains(target) {
    return target === this || this.children.some((child) => child.contains(target));
  }
}

function makeNavigation() {
  const summary = new FakeElement();
  summary.focus = () => { summary.focused = true; };
  const currentLink = new FakeElement();
  const first = new FakeElement();
  const second = new FakeElement();
  first.summary = summary;
  first.currentLink = currentLink;
  second.summary = new FakeElement();
  second.currentLink = currentLink;
  const nav = new FakeElement([first, second]);
  const document = new FakeElement();
  initializeNavigationMenu(nav, document);
  return { first, second, currentLink, document, summary };
}

test('closes a category when one of its links is clicked', () => {
  const { first } = makeNavigation();
  first.open = true;
  first.dispatch('click', { target: { closest: () => ({}) } });
  assert.equal(first.open, false);
});

test('closes open categories after an outside click', () => {
  const { first, second, document } = makeNavigation();
  first.open = true;
  second.open = true;
  document.dispatch('click', { target: new FakeElement() });
  assert.equal(first.open, false);
  assert.equal(second.open, false);
});

test('Escape closes the menu and returns focus to its summary', () => {
  const { first, summary, document } = makeNavigation();
  first.open = true;
  document.dispatch('keydown', { key: 'Escape' });
  assert.equal(first.open, false);
  assert.equal(summary.focused, true);
});

test('only one category remains open and its active link is made reachable', () => {
  const { first, second, currentLink } = makeNavigation();
  first.open = true;
  first.dispatch('toggle');
  second.open = true;
  second.dispatch('toggle');
  assert.equal(first.open, false);
  assert.equal(second.open, true);
  assert.equal(currentLink.scrolledIntoView, true);
});
