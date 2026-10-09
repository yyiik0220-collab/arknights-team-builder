import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { recommendTeam } from '../js/modules/recommendation.js';
import { scoreOperator } from '../js/modules/scoring.js';

const projectRoot = new URL('../', import.meta.url);
const roleTags = ['healing', 'anti_air', 'defense', 'dp_generation'];
const scoring = {
  teamWeights: {
    baseFit: { roleMatch: 0.45, mechanicMatch: 0.3, enemyMatch: 0.15, readiness: 0.1 },
    coverageBonus: 0.12,
    duplicateRolePenalty: 0.08,
    maxTeamSize: 12
  }
};
const operators = Array.from({ length: 15 }, (_, index) => ({
  id: `operator-${String(index).padStart(2, '0')}`,
  name: `Operator ${index}`,
  class: 'Medic',
  subclass: 'Medic',
  tags: [roleTags[index % roleTags.length]],
  skills: []
}));
const roster = operators.map((operator, index) => ({
  operatorId: operator.id,
  owned: index !== 14,
  promotionPhase: index % 3,
  level: 30 + index,
  skillLevels: [4],
  masteryLevels: [index % 4]
}));
const stage = {
  requiredRoles: roleTags,
  recommendedCount: Object.fromEntries(roleTags.map((role) => [role, 1])),
  enemies: ['enemy.armored'],
  mechanics: [{ id: 'unverified', requiredRoles: [] }],
  phases: [{ id: 'normal', recommendedRoles: roleTags.map((role) => ({ role, weight: 1 })), mechanics: [] }]
};

 test('selects twelve unique owned operators and covers required roles', () => {
  const result = recommendTeam({ operators, roster, stage, scoring });
  assert.equal(result.team.length, 12);
  assert.equal(result.ownedCount, 14);
  assert.equal(new Set(result.team.map((member) => member.operator.id)).size, 12);
  assert.ok(result.team.every((member) => member.operator.id !== 'operator-14'));
  assert.ok(roleTags.every((role) => result.team.some((member) => member.operator.tags.includes(role))));
  assert.deepEqual(result.team.map((member) => member.slot), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.ok(result.team.every((member) => member.alternatives.length <= 3));
});

test('does not pad teams beyond owned candidates', () => {
  const result = recommendTeam({ operators, roster: roster.slice(0, 3), stage, scoring });
  assert.equal(result.team.length, 3);
  assert.equal(result.ownedCount, 3);
});

test('re-normalizes base weights when stage data is missing', () => {
  const result = scoreOperator(operators[0], { requiredRoles: ['healing'] }, scoring.teamWeights, roster[0]);
  assert.equal(result.breakdown.roleMatch, 100);
  assert.equal(result.breakdown.mechanicMatch, null);
  assert.equal(result.breakdown.enemyMatch, null);
  assert.equal(result.missing.includes('mechanicMatch'), true);
  assert.ok(result.score > 0);
});

test('all shipped JSON files parse and proposal strings exist in all four languages', async () => {
  const paths = ['.verdentc.json', 'package.json', 'package-lock.json', 'data/i18n.json', 'data/operators.json', 'data/scoring-config.json', 'data/stages.json'];
  const parsed = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(new URL(path, projectRoot), 'utf8'))));
  const translations = parsed[3];
  const requiredKeys = ['stages.proposeTeam', 'proposal.reasonRole', 'proposal.alternatives', 'proposal.noOwned'];
  for (const language of ['ja', 'zh-CN', 'ko', 'en']) {
    for (const key of requiredKeys) assert.equal(typeof translations[language][key], 'string', `${language}.${key}`);
  }
  assert.equal(parsed[6].stages.length, 25);
});
