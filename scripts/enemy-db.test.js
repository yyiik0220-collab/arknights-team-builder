import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateEnemyDamage,
  calculateRequiredAttack,
  filterAndSortEnemies,
  getStageEnemyInfo,
  validateEnemyData
} from '../js/modules/enemy-db.js';

const enemyData = JSON.parse(readFileSync(new URL('../data/enemies.json', import.meta.url), 'utf8'));
const stageData = JSON.parse(readFileSync(new URL('../data/stages.json', import.meta.url), 'utf8'));
const translations = JSON.parse(readFileSync(new URL('../data/i18n.json', import.meta.url), 'utf8'));

test('enemy records have verified structure, source links, and valid stage references', () => {
  assert.equal(validateEnemyData(enemyData), true);
  const stageIds = new Set(stageData.stages.map((stage) => stage.id));
  for (const enemy of enemyData.enemies) {
    assert.ok(enemy.sourceUrl.startsWith('https://arknights.wiki.gg/wiki/'), enemy.id);
    assert.ok(enemy.stageIds.every((stageId) => stageIds.has(stageId)), enemy.id);
  }
  assert.equal(stageData.stages.length, 43);
});

test('filters by localized name, type, direct stage appearance, and explicit stage tag', () => {
  assert.deepEqual(filterAndSortEnemies(enemyData.enemies, { query: 'パトリオット' }).map((enemy) => enemy.id), ['patriot']);
  assert.ok(filterAndSortEnemies(enemyData.enemies, { type: 'elite' }).every((enemy) => enemy.type === 'elite'));
  assert.deepEqual(filterAndSortEnemies(enemyData.enemies, { stageId: 'main-07-18' }).map((enemy) => enemy.id), ['patriot']);
  assert.deepEqual(filterAndSortEnemies(enemyData.enemies, { stageId: 'episode-05', stageTags: ['enemy.mephisto'] }).map((enemy) => enemy.id), ['mephisto']);
});

test('sorts numeric stats in both directions without mutating the enemy data', () => {
  const original = structuredClone(enemyData.enemies);
  const ascending = filterAndSortEnemies(enemyData.enemies, { sort: 'hp' });
  const descending = filterAndSortEnemies(enemyData.enemies, { sort: 'hp', direction: 'desc' });
  assert.ok(ascending.every((enemy, index) => index === 0 || ascending[index - 1].stats.hp <= enemy.stats.hp));
  assert.ok(descending.every((enemy, index) => index === 0 || descending[index - 1].stats.hp >= enemy.stats.hp));
  assert.deepEqual(enemyData.enemies, original);
});

test('damage estimates apply physical DEF, Arts RES, True damage, and minimum damage', () => {
  const enemy = enemyData.enemies.find((entry) => entry.id === 'defense-crusher-leader');
  assert.equal(calculateEnemyDamage({ enemy, attack: 3000, damageType: 'physical' }).damagePerHit, 1000);
  assert.equal(calculateEnemyDamage({ enemy, attack: 1000, damageType: 'physical' }).damagePerHit, 50);
  const artsEnemy = { stats: { hp: 1000, def: 0, res: 60 } };
  assert.equal(calculateEnemyDamage({ enemy: artsEnemy, attack: 1000, damageType: 'arts' }).damagePerHit, 400);
  assert.equal(calculateEnemyDamage({ enemy: artsEnemy, attack: 1000, damageType: 'true' }).damagePerHit, 1000);
  assert.equal(calculateEnemyDamage({ enemy, attack: 3000, damageType: 'physical', hits: 20 }).defeatedWithinHits, true);
  assert.equal(calculateEnemyDamage({ enemy, attack: 3000, damageType: 'physical', hits: 19 }).defeatedWithinHits, false);
});

test('inverts physical and Arts defense calculations to the minimum whole-number ATK', () => {
  const physicalEnemy = { stats: { hp: 1000, def: 500, res: 0 } };
  const artsEnemy = { stats: { hp: 1000, def: 0, res: 60 } };
  assert.equal(calculateRequiredAttack({ enemy: physicalEnemy, damageType: 'physical', hits: 1 }), 1500);
  assert.equal(calculateRequiredAttack({ enemy: artsEnemy, damageType: 'arts', hits: 1 }), 2500);
  assert.equal(calculateRequiredAttack({ enemy: physicalEnemy, damageType: 'true', hits: 2 }), 500);
});

test('stage lookup distinguishes individually confirmed enemies from stage tags', () => {
  const stage = stageData.stages.find((entry) => entry.id === 'main-07-18');
  const info = getStageEnemyInfo(stage, enemyData.enemies);
  assert.deepEqual(info.exactEnemies.map((enemy) => enemy.id), ['patriot']);
  assert.ok(info.tags.includes('enemy.patriot'));
  assert.deepEqual(getStageEnemyInfo(null, enemyData.enemies), { exactEnemies: [], tags: [] });
});

test('enemy interface translations exist for all four supported languages', () => {
  const keys = ['nav.enemyDb', 'page.enemyDb', 'enemyDb.title', 'enemyDb.description', 'enemyDb.type.normal', 'enemyDb.type.elite', 'enemyDb.type.boss', 'enemyDb.sort.hp', 'enemyDb.stageDataNote', 'enemyDb.damageTitle', 'enemyDb.damageType.physical', 'enemyDb.requiredAttack', 'enemyDb.sourceLink'];
  for (const language of ['ja', 'zh-CN', 'ko', 'en']) {
    for (const key of keys) assert.ok(translations[language]?.[key], `${language}.${key} should exist`);
  }
});
