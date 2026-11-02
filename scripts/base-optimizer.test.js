import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeOwnedRoster, optimizeFacility, selectActiveSkills } from '../js/modules/base-optimizer.js';

const operators = [
  { id: 'texas', nameI18n: { en: 'Texas' } },
  { id: 'lappland', nameI18n: { en: 'Lappland' } },
  { id: 'exusiai', nameI18n: { en: 'Exusiai' } },
  { id: 'shamare', nameI18n: { en: 'Shamare' } },
  { id: 'generic', nameI18n: { en: 'Generic' } }
];

const skills = [
  { id: 'texas', skills: [{ facility: 'tradePost', skillSet: 0, promotion: 0, efficiency: 0, bonuses: [{ partners: ['lappland'], value: 65, note: 'Texas and Lappland' }] }, { facility: 'tradePost', skillSet: 1, promotion: 2, efficiency: 0, bonuses: [{ partners: ['exusiai'], value: 0, note: 'Texas and Exusiai' }] }] },
  { id: 'lappland', skills: [{ facility: 'tradePost', skillSet: 0, promotion: 0, efficiency: 0, bonuses: [{ partners: ['texas'], value: 0, note: 'Lappland and Texas' }] }] },
  { id: 'exusiai', skills: [{ facility: 'tradePost', skillSet: 0, promotion: 0, efficiency: 20 }, { facility: 'tradePost', skillSet: 0, promotion: 2, efficiency: 35 }] },
  { id: 'shamare', skills: [{ facility: 'tradePost', skillSet: 0, promotion: 0, efficiency: 0 }, { facility: 'tradePost', skillSet: 1, promotion: 2, efficiency: 0, teamRule: { kind: 'replace-team-efficiency-per-partner', valuePerPartner: 45, maxPartners: 2, note: 'Shamare special rule' } }] },
  { id: 'generic', skills: [{ facility: 'tradePost', skillSet: 0, promotion: 0, efficiency: 30 }] }
];

test('normalizes roster records and keeps the highest owned promotion', () => {
  assert.deepEqual(normalizeOwnedRoster({ roster: [
    { operatorId: 'texas', owned: true, promotionPhase: 1 },
    { operatorId: 'texas', owned: true, promotionPhase: 2 },
    { operatorId: 'lappland', owned: false, promotionPhase: 2 },
    'exusiai'
  ] }), [
    { operatorId: 'texas', promotionPhase: 2 },
    { operatorId: 'exusiai', promotionPhase: 0 }
  ]);
});

test('selects the best unlocked skill per skill set without mixing facilities', () => {
  const operatorSkills = [
    { facility: 'tradePost', skillSet: 0, promotion: 0, name: 'Trade base' },
    { facility: 'tradePost', skillSet: 0, promotion: 2, name: 'Trade E2' },
    { facility: 'factory', skillSet: 1, promotion: 2, name: 'Factory E2' }
  ];
  assert.deepEqual(selectActiveSkills(operatorSkills, 'tradePost', 0).map((skill) => skill.name), ['Trade base']);
  assert.deepEqual(selectActiveSkills(operatorSkills, 'tradePost', 2).map((skill) => skill.name), ['Trade E2']);
});

test('optimizes only owned operators and scores Texas-Lappland-Exusiai combination', () => {
  const result = optimizeFacility({
    facility: 'tradePost',
    roster: [{ operatorId: 'texas', promotionPhase: 2 }, 'lappland', { operatorId: 'exusiai', promotionPhase: 2 }, 'not-in-master'],
    operators,
    skillData: { operators: skills },
    maxSlots: 3
  });
  assert.equal(result.ownedCount, 4);
  assert.equal(result.eligibleCount, 3);
  assert.equal(result.teams[0].score, 100);
  assert.deepEqual(result.teams[0].members.map((member) => member.operator.id).sort(), ['exusiai', 'lappland', 'texas']);
  assert.equal(result.teams[0].bonuses.length, 3);
});

test('applies Shamare efficiency replacement rule instead of adding partner efficiency', () => {
  const result = optimizeFacility({
    facility: 'tradePost',
    roster: [{ operatorId: 'shamare', promotionPhase: 2 }, 'generic'],
    operators,
    skillData: { operators: skills },
    maxSlots: 2
  });
  assert.equal(result.teams[0].score, 45);
  assert.deepEqual(result.teams[0].bonuses, ['Shamare special rule']);
});

test('caps facility staffing and returns an empty recommendation for an empty roster', () => {
  const result = optimizeFacility({ facility: 'powerPlant', roster: [], operators, skillData: { operators: skills }, maxSlots: 3 });
  assert.equal(result.capacity, 1);
  assert.equal(result.ownedCount, 0);
  assert.deepEqual(result.teams, []);
});

test('base optimizer interface translations exist in all four supported locales', () => {
  const translations = JSON.parse(readFileSync(new URL('../data/i18n.json', import.meta.url), 'utf8'));
  const keys = [
    'nav.baseOptimizer', 'page.baseOptimizer', 'baseOptimizer.title', 'baseOptimizer.description',
    'baseOptimizer.facility.tradePost', 'baseOptimizer.facility.factory', 'baseOptimizer.facility.powerPlant',
    'baseOptimizer.facility.receptionRoom', 'baseOptimizer.facility.trainingRoom', 'baseOptimizer.noRoster',
    'baseOptimizer.noCandidates', 'baseOptimizer.recommendation', 'baseOptimizer.sourceLabel'
  ];
  for (const language of ['ja', 'zh-CN', 'ko', 'en']) {
    for (const key of keys) assert.ok(translations[language]?.[key], `${language}.${key} should exist`);
  }
});

test('base skill data covers every current operator with unique ids and valid effects', () => {
  const master = JSON.parse(readFileSync(new URL('../data/operators.json', import.meta.url), 'utf8'));
  const baseSkills = JSON.parse(readFileSync(new URL('../data/base-skills.json', import.meta.url), 'utf8'));
  assert.equal(baseSkills.operators.length, master.operators.length);
  assert.deepEqual(new Set(baseSkills.operators.map((entry) => entry.id)), new Set(master.operators.map((entry) => entry.id)));
  for (const operator of baseSkills.operators) {
    assert.ok(operator.skills.length > 0, `${operator.id} should have base-skill data`);
    for (const skill of operator.skills) {
      assert.ok(skill.facility);
      assert.ok(Number.isInteger(skill.promotion) && skill.promotion >= 0 && skill.promotion <= 2);
      assert.ok(Number.isFinite(skill.efficiency) && skill.efficiency >= 0);
    }
  }
});
