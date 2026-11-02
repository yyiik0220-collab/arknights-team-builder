import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildRoadmapPriorities, normalizeRoadmapRoster } from '../js/modules/roadmap.js';

const operatorsData = JSON.parse(readFileSync(new URL('../data/operators.json', import.meta.url), 'utf8'));
const materialsData = JSON.parse(readFileSync(new URL('../data/materials.json', import.meta.url), 'utf8'));
const stagesData = JSON.parse(readFileSync(new URL('../data/stages.json', import.meta.url), 'utf8'));
const translations = JSON.parse(readFileSync(new URL('../data/i18n.json', import.meta.url), 'utf8'));
const scoringData = JSON.parse(readFileSync(new URL('../data/scoring-config.json', import.meta.url), 'utf8'));

const scoring = {
  roleTags: {
    anti_air: { label: 'Anti-Air' },
    defense: { label: 'Defense' },
    healing: { label: 'Healing' }
  }
};

const operators = [
  {
    id: 'airguard',
    name: 'Airguard',
    nameI18n: { ja: 'Airguard', en: 'Airguard' },
    rarity: 6,
    tags: ['anti_air'],
    enemyCounters: ['flying'],
    mechanicTags: [],
    materials: { promotion: [{ phase: 1, items: [{ itemId: 'chip', quantity: 2 }] }, { phase: 2, items: [{ itemId: 'dualchip', quantity: 4 }] }] }
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    nameI18n: { ja: 'Bulwark', en: 'Bulwark' },
    rarity: 6,
    tags: ['defense'],
    enemyCounters: [],
    mechanicTags: [],
    materials: { promotion: [{ phase: 1, items: [{ itemId: 'chip', quantity: 3 }] }, { phase: 2, items: [{ itemId: 'dualchip', quantity: 4 }] }] }
  },
  {
    id: 'medic',
    name: 'Medic',
    nameI18n: { ja: 'Medic', en: 'Medic' },
    rarity: 3,
    tags: ['healing'],
    enemyCounters: [],
    mechanicTags: [],
    materials: { promotion: [{ phase: 1, items: [{ itemId: 'chip', quantity: 1 }] }] }
  }
];

const materials = [
  { id: 'chip', name: 'Chip', unitCost: 8, nameI18n: { en: 'Chip', ja: 'チップ' } },
  { id: 'dualchip', name: 'Dualchip', unitCost: 16, nameI18n: { en: 'Dualchip', ja: 'ダブルチップ' } }
];

const stages = [
  { id: 'main-01', category: 'main', order: 1, name: 'First', nameI18n: { en: 'First', ja: '第一' }, requiredRoles: ['anti_air'], enemies: ['enemy.flying'], mechanics: [], phases: [] },
  { id: 'main-02', category: 'main', order: 2, name: 'Second', nameI18n: { en: 'Second', ja: '第二' }, requiredRoles: ['defense'], enemies: [], mechanics: [], phases: [] },
  { id: 'event-01', category: 'event', order: 1, name: 'Event', nameI18n: { en: 'Event', ja: 'イベント' }, requiredRoles: ['healing'], enemies: [], mechanics: [], phases: [] }
];

function calculate(roster, options = {}) {
  return buildRoadmapPriorities({ operators, roster, stages, materials, scoring, ...options });
}

test('uses the next uncleared main stage to recommend stage-fit promotions', () => {
  const result = calculate([
    { operatorId: 'airguard', promotionPhase: 1, level: 80 },
    { operatorId: 'bulwark', promotionPhase: 1, level: 80 }
  ], { clearedStageIds: ['main-01'] });
  assert.equal(result.nextStage.id, 'main-02');
  assert.equal(result.priorities[0].operatorId, 'bulwark');
  assert.equal(result.priorities[0].nextStageFit.roles[0], 'defense');
  assert.equal(result.priorities[0].cost.lmd, 180000);
});

test('estimates phase-one LMD and material quantities from operator and material data', () => {
  const result = calculate([{ operatorId: 'airguard', promotionPhase: 0, level: 50 }]);
  const candidate = result.priorities.find((entry) => entry.operatorId === 'airguard');
  assert.equal(candidate.cost.lmd, 30000);
  assert.deepEqual(candidate.cost.items.map(({ itemId, quantity }) => ({ itemId, quantity })), [{ itemId: 'chip', quantity: 2 }]);
  assert.equal(candidate.cost.materialWeight, 16);
  assert.equal(candidate.currentLevelCap, 50);
  assert.equal(candidate.currentLevel, 50);
});

test('uses enemy counters and phase-recommended role weights for stage fit', () => {
  const result = calculate([{ operatorId: 'airguard', promotionPhase: 0, level: 50 }]);
  const candidate = result.priorities.find((entry) => entry.operatorId === 'airguard');
  assert.deepEqual(candidate.nextStageFit.roles, ['anti_air']);
  assert.deepEqual(candidate.nextStageFit.enemies, ['flying']);
  assert.ok(candidate.nextStageFit.score > 0);
});

test('normalizes ownership records, merges duplicates, and respects rarity phase caps', () => {
  const normalized = normalizeRoadmapRoster([
    { operatorId: 'airguard', promotionPhase: 0, level: 40 },
    { operatorId: 'airguard', promotionPhase: 1, level: 30 },
    { operatorId: 'bulwark', owned: false, promotionPhase: 1 },
    { operatorId: 'unknown', promotionPhase: 0 },
    { operatorId: 'medic', promotionPhase: 1, level: 55 }
  ]);
  assert.deepEqual(normalized, [
    { operatorId: 'airguard', promotionPhase: 1, level: 30 },
    { operatorId: 'unknown', promotionPhase: 0, level: 1 },
    { operatorId: 'medic', promotionPhase: 1, level: 55 }
  ]);
  const result = calculate(normalized);
  assert.ok(!result.priorities.some((candidate) => candidate.operatorId === 'medic'));
  assert.equal(result.ownedCount, 2);
});

test('returns no next main stage when all main stages are cleared', () => {
  const result = calculate([{ operatorId: 'airguard', promotionPhase: 0 }], { clearedStageIds: ['main-01', 'main-02'] });
  assert.equal(result.nextStage, null);
  assert.equal(result.completedCount, 2);
  assert.equal(result.stageCount, 3);
  assert.equal(result.mainStageCount, 2);
  assert.equal(result.priorities[0].nextStageFit.score, 0);
});

test('keeps incomplete cost estimates visible instead of assuming missing values', () => {
  const result = calculate([{ operatorId: 'airguard', promotionPhase: 1, level: 80 }], { materials: [] });
  assert.equal(result.priorities[0].cost.lmd, 180000);
  assert.equal(result.priorities[0].cost.materialsAvailable, false);
  assert.equal(result.priorities[0].cost.items[0].material, null);
});

test('builds a promotion recommendation using the shipped master data', () => {
  const result = buildRoadmapPriorities({
    operators: operatorsData.operators,
    roster: [{ operatorId: 'silverash', promotionPhase: 1, level: 80 }],
    stages: stagesData.stages,
    materials: materialsData.materials,
    scoring: scoringData
  });
  assert.equal(result.nextStage.category, 'main');
  assert.equal(result.priorities[0].operatorId, 'silverash');
  assert.equal(result.priorities[0].cost.lmd, 180000);
  assert.ok(result.priorities[0].cost.items.length > 0);
  assert.ok(result.priorities[0].cost.items.every((item) => Number.isFinite(item.quantity) && item.quantity > 0));
});

test('master data counts and roadmap translations are present in all supported locales', () => {
  assert.equal(operatorsData.operators.length, 56);
  assert.equal(materialsData.materials.length, 49);
  assert.equal(stagesData.stages.length, 43);
  const keys = [
    'nav.roadmap', 'page.roadmap', 'roadmap.title', 'roadmap.description',
    'roadmap.progressTitle', 'roadmap.stageReason', 'roadmap.costTitle',
    'roadmap.lmdCost', 'roadmap.materialDataMissing', 'roadmap.noRoster'
  ];
  for (const locale of ['ja', 'zh-CN', 'ko', 'en']) {
    for (const key of keys) assert.ok(translations[locale]?.[key], `${locale}.${key} should exist`);
  }
});
