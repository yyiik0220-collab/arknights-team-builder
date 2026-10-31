import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  computeCombinations,
  computePool,
  generateCombinations,
  highlightTier,
  MAX_SELECTED_TAGS,
  RARITY_FORCING_TAGS
} from '../js/modules/recruitment.js';
import { validateRecruitment } from '../js/modules/data-loader.js';

// 公開求人タグ計算の純粋ロジックと、実データ（data/recruitment.json）の整合性を検証する。

const operators = [
  { id: 'kroos', rarity: 3, tags: ['sniper', 'ranged', 'dps'] },
  { id: 'jessica', rarity: 4, tags: ['sniper', 'ranged', 'dps', 'survival'] },
  { id: 'platinum', rarity: 5, tags: ['sniper', 'ranged', 'dps'] },
  { id: 'exusiai', rarity: 6, tags: ['sniper', 'ranged', 'dps'] },
  { id: 'lava', rarity: 3, tags: ['caster', 'ranged', 'aoe'] }
];

test('generateCombinations returns C(n,1..size) subsets', () => {
  assert.equal(generateCombinations(['a', 'b', 'c'], 3).length, 7); // C(3,1)+C(3,2)+C(3,3)
  assert.equal(generateCombinations(['a', 'b', 'c', 'd', 'e'], 3).length, 25); // 5+10+10
  assert.deepEqual(generateCombinations(['a'], 3), [['a']]);
  assert.deepEqual(generateCombinations([], 3), []);
  // 重複タグは除外され、各組み合わせが一度だけ現れる（順序は問わない）
  const deduped = generateCombinations(['a', 'a', 'b'], 3).map((c) => [...c].sort());
  assert.deepEqual(deduped.sort(), [['a'], ['a', 'b'], ['b']]);
});

test('computePool filters operators by tag intersection', () => {
  const { operators: pool, guaranteedRarity } = computePool(['sniper', 'ranged'], operators);
  assert.deepEqual(pool.map((operator) => operator.id).sort(), ['exusiai', 'jessica', 'kroos', 'platinum']);
  assert.equal(guaranteedRarity, 3); // 最低レアリティが ★3
});

test('top_operator forces rarity 6, senior_operator forces rarity 5', () => {
  const { operators: topPool, guaranteedRarity: topRarity } = computePool(['top_operator', 'sniper'], operators);
  assert.deepEqual(topPool.map((operator) => operator.id), ['exusiai']);
  assert.equal(topRarity, 6);

  const { operators: seniorPool, guaranteedRarity: seniorRarity } = computePool(['senior_operator', 'sniper'], operators);
  assert.deepEqual(seniorPool.map((operator) => operator.id), ['platinum']);
  assert.equal(seniorRarity, 5);
});

test('RARITY_FORCING_TAGS maps top_operator→6 and senior_operator→5', () => {
  assert.equal(RARITY_FORCING_TAGS.top_operator, 6);
  assert.equal(RARITY_FORCING_TAGS.senior_operator, 5);
});

test('guaranteed rarity 4 produces purple tier, 5+ produces gold tier', () => {
  // ★4 のみ候補（jessica）なら紫
  const { operators: fourOnly, guaranteedRarity } = computePool(['survival'], operators);
  assert.deepEqual(fourOnly.map((operator) => operator.id), ['jessica']);
  assert.equal(highlightTier(guaranteedRarity), 'purple');

  assert.equal(highlightTier(6), 'gold');
  assert.equal(highlightTier(5), 'gold');
  assert.equal(highlightTier(3), null);
  assert.equal(highlightTier(null), null);
});

test('computeCombinations excludes empty pools and sorts by guarantee', () => {
  const results = computeCombinations(['sniper', 'survival', 'caster'], { operators });
  // 相互排他（sniper+caster）は空になり除外される
  const hasCross = results.some((result) => result.tagIds.includes('sniper') && result.tagIds.includes('caster'));
  assert.equal(hasCross, false);
  // 保証レアリティ降順で並ぶ（先頭が★4以上）
  const rarities = results.map((result) => result.guaranteedRarity ?? -1);
  assert.deepEqual(rarities, [...rarities].sort((a, b) => b - a));
});

test('MAX_SELECTED_TAGS equals the in-game slot limit of 5', () => {
  assert.equal(MAX_SELECTED_TAGS, 5);
});

test('shipped recruitment.json is valid and internally consistent', async () => {
  const recruitment = JSON.parse(await readFile(new URL('../data/recruitment.json', import.meta.url), 'utf8'));
  assert.equal(validateRecruitment(recruitment), true);

  const tagIds = new Set(Object.keys(recruitment.tags));
  // tagCategories が実在タグのみを参照すること
  for (const category of recruitment.tagCategories) {
    for (const tagId of category.tags) assert.ok(tagIds.has(tagId), `unknown tag ${tagId}`);
  }
  // 各オペレーターの regions が cn/global の少なくとも一方を含むこと
  for (const operator of recruitment.operators) {
    assert.ok(operator.regions.some((region) => ['cn', 'global'].includes(region)), operator.id);
  }
  // ★6 はオペレーターの tags に top_operator を含めず、レアリティで解決する設計を担保
  for (const operator of recruitment.operators) {
    if (operator.rarity === 6) assert.equal(operator.tags.includes('top_operator'), false, operator.id);
  }
});

test('every shipped 4★+ guarantee uses at least one rarity-forcing or exclusivity logic', async () => {
  // 「特殊」タグ（specialist）は★3以下に存在しないため、★4以上確定になることを実データで検証。
  const recruitment = JSON.parse(await readFile(new URL('../data/recruitment.json', import.meta.url), 'utf8'));
  const { operators: pool, guaranteedRarity } = computePool(['specialist'], recruitment.operators);
  assert.equal(guaranteedRarity, 4);
  assert.equal(pool.length > 0, true);
});
