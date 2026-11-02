import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getRarityRates, simulatePull, simulatePulls, validateGachaConfig } from '../js/modules/gacha.js';

const config = JSON.parse(await readFile(new URL('../data/gacha.json', import.meta.url), 'utf8'));
const standard = config.banners.standard;

const sequence = (...values) => {
  let index = 0;
  return () => values[index++] ?? values.at(-1);
};

test('gacha config has valid banner rates and pity rules', () => {
  assert.equal(validateGachaConfig(config), true);
  assert.throws(() => validateGachaConfig({ ...config, currencyPerPull: 0 }));
  assert.throws(() => validateGachaConfig({ currencyPerPull: 600, banners: { invalid: { ...standard, rarityRates: { 6: 0.2, 5: 0.2, 4: 0.2, 3: 0.2 } } } }));
});

test('base rates match the published table and total 100 percent', () => {
  assert.deepEqual(getRarityRates(standard, 0), { 6: 0.02, 5: 0.08, 4: 0.5, 3: 0.4 });
});

test('six-star rate increases after 50 pulls and reaches 100 percent on pull 99', () => {
  assert.equal(getRarityRates(standard, 49)[6], 0.02);
  assert.equal(getRarityRates(standard, 50)[6], 0.04);
  assert.deepEqual(getRarityRates(standard, 98), { 6: 1, 5: 0, 4: 0, 3: 0 });
});

test('the 99th pull is guaranteed after 98 misses and resets pity', () => {
  const outcome = simulatePulls({ banner: standard, count: 99, random: sequence(...Array(99).fill(0.99)) });
  assert.equal(outcome.results[98].rarity, 6);
  assert.equal(outcome.results[98].pityHit, true);
  assert.equal(outcome.pityHits, 1);
  assert.equal(outcome.pityCount, 0);
});

test('limited six-stars split evenly between featured and off-banner', () => {
  const banner = config.banners.limited;
  const featured = simulatePull({ banner, random: sequence(0.01, 0.49) });
  const offBanner = simulatePull({ banner, random: sequence(0.01, 0.5) });
  assert.deepEqual([featured.rarity, featured.featured], [6, true]);
  assert.deepEqual([offBanner.rarity, offBanner.featured], [6, false]);
});

test('ten-pull returns ten independently simulated results', () => {
  const outcome = simulatePulls({ banner: standard, count: 10, random: () => 0.99 });
  assert.equal(outcome.results.length, 10);
  assert.equal(outcome.pityCount, 10);
  assert.equal(outcome.results.every((result) => result.rarity === 3), true);
});

test('invalid pull counts and random values are rejected', () => {
  assert.throws(() => simulatePulls({ banner: standard, count: 0 }));
  assert.throws(() => simulatePull({ banner: standard, random: () => 1 }));
});

test('all gacha interface strings exist in the four supported locales', async () => {
  const messages = JSON.parse(await readFile(new URL('../data/i18n.json', import.meta.url), 'utf8'));
  const required = Object.keys(messages.ja).filter((key) => key.startsWith('gacha.') || key === 'page.gacha' || key === 'nav.gachaSimulator');
  for (const language of ['ja', 'zh-CN', 'ko', 'en']) {
    for (const key of required) assert.equal(typeof messages[language][key], 'string', `${language}.${key}`);
  }
});
