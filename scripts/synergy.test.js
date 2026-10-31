import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSynergies, detectSynergies, classComposition, suggestSynergies } from '../js/modules/synergy.js';

// シナジー検出・統合のためのフィクスチャ。型は talent / faction を使用する。
const silverAsh = {
  id: 'silverash', class: 'Guard', synergies: [
    { operatorId: 'texas', type: 'talent', description: '再配置時間短縮' },
    { operatorId: 'phantom', type: 'talent', description: '再配置補助' }
  ]
};
const texas = {
  id: 'texas', class: 'Specialist', synergies: [
    { operatorId: 'silverash', type: 'talent', description: '相互シナジー' }
  ]
};
const phantom = { id: 'phantom', class: 'Specialist', synergies: [] };
const saria = { id: 'saria', class: 'Defender', synergies: [] };
const ifrit = {
  id: 'ifrit', class: 'Caster', synergies: [
    { operatorId: 'saria', type: 'faction', description: 'ライン生命所属' }
  ]
};

test('detectSynergies merges bidirectional edges into one mutual pair', () => {
  const { pairs } = detectSynergies([silverAsh, texas, phantom]);
  // シルバーアッシュ→テキサス / テキサス→シルバーアッシュ は1ペアへ統合される。
  const mutualPair = pairs.find((pair) => pair.mutual);
  assert.ok(mutualPair);
  assert.deepEqual([mutualPair.a, mutualPair.b].sort(), ['silverash', 'texas']);
  assert.equal(mutualPair.types.includes('talent'), true);
  assert.equal(mutualPair.strength, 3); // talent(2) × 相互係数 1.5
});

test('detectSynergies scores one-way pairs without mutual bonus', () => {
  const { pairs } = detectSynergies([silverAsh, phantom]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].mutual, false);
  assert.equal(pairs[0].strength, 2); // talent(2) × 1.0
});

test('detectSynergies ignores edges to operators outside the team', () => {
  const { pairs } = detectSynergies([silverAsh, ifrit]);
  // silverash→texas/phantom はチーム外、ifrit→saria もチーム外。ペアは存在しない。
  assert.equal(pairs.length, 0);
  assert.equal(pairs.length, detectSynergies([ifrit]).pairs.length);
});

test('classComposition counts and sorts by descending count', () => {
  const composition = classComposition([silverAsh, texas, phantom, saria]);
  assert.equal(composition[0].class, 'Specialist');
  assert.equal(composition[0].count, 2);
  assert.equal(composition.find((entry) => entry.class === 'Guard').count, 1);
});

test('analyzeSynergies returns totalScore and typeCounts', () => {
  const result = analyzeSynergies({ teamOperators: [silverAsh, texas, phantom] });
  // 相互 talent(3) + 片方向 talent(2) = 5
  assert.equal(result.totalScore, 5);
  assert.equal(result.typeCounts.talent, 2);
  assert.equal(result.composition.length, 2);
});

test('suggestSynergies lists owned operators that would activate new synergies', () => {
  const pairs = detectSynergies([saria]).pairs;
  const suggestions = suggestSynergies({ teamOperators: [saria], addableOperators: [ifrit, phantom], pairs });
  // ifrit→saria は faction シナジーを活性化するため追加候補に含まれる。phantom は対象外。
  assert.equal(suggestions.add.length, 1);
  assert.equal(suggestions.add[0].operator.id, 'ifrit');
  assert.equal(suggestions.add[0].newEdges.length, 1);
});
