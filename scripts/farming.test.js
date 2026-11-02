import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateFarmingRates, filterAndSortFarmingRates, getFarmingMaterials } from '../js/modules/farming.js';

const dropData = JSON.parse(readFileSync(new URL('../data/drop-rates.json', import.meta.url), 'utf8'));
const stageData = JSON.parse(readFileSync(new URL('../data/stages.json', import.meta.url), 'utf8'));
const materialData = JSON.parse(readFileSync(new URL('../data/materials.json', import.meta.url), 'utf8'));
const rates = calculateFarmingRates({ stages: stageData.stages, materials: materialData.materials, dropData });

test('calculates expected drops per sanity from matrix runs', () => {
  const rock = rates.find((row) => row.stageCode === '1-7' && row.materialId === 'orirock_cube');
  assert.equal(rock.expectedAmount, 2747512083 / 2206827310);
  assert.equal(rock.efficiency, rock.expectedAmount / 6);
  assert.equal(rock.sanityPerItem, 6 / rock.expectedAmount);
  assert.equal(rock.samples, 2206827310);
});

test('converts pure gold drops into LMD using the documented item value', () => {
  const lmd = rates.find((row) => row.stageCode === '1-7' && row.materialId === 'lmd');
  assert.equal(lmd.expectedAmount, (198085479 / 2206827310) * 500);
});

test('does not mutate source data and skips unknown, missing, and invalid stage data', () => {
  const source = structuredClone(dropData);
  const result = calculateFarmingRates({ stages: stageData.stages, materials: materialData.materials, dropData: source });
  assert.deepEqual(source, dropData);
  assert.ok(result.every((row) => row.efficiency > 0 && Number.isFinite(row.efficiency)));
  assert.ok(!result.some((row) => row.stageId === 'missing-stage'));
  assert.ok(!result.some((row) => row.materialId === 'unknown'));
});

test('sorts by efficiency and supports category and material filters', () => {
  const sorted = filterAndSortFarmingRates(rates);
  assert.ok(sorted.every((row, index) => index === 0 || sorted[index - 1].efficiency >= row.efficiency));
  assert.ok(filterAndSortFarmingRates(rates, { category: 'records' }).every((row) => row.category === 'records'));
  assert.ok(filterAndSortFarmingRates(rates, { materialId: 'lmd' }).every((row) => row.materialId === 'lmd'));
  assert.deepEqual(filterAndSortFarmingRates(rates, { category: 'skill' }).map((row) => row.materialId), ['skill_book_t1']);
});

test('marks every equally efficient best stage for each material', () => {
  const ties = calculateFarmingRates({
    stages: [{ id: 'first', nameI18n: { en: 'First' } }, { id: 'second', nameI18n: { en: 'Second' } }],
    materials: [],
    dropData: {
      materials: [{ id: 'sample', sourceItemId: 'item', category: 'promotion', nameI18n: { en: 'Sample' } }],
      stages: [
        { id: 'first', code: 'A', sanityCost: 6, runs: 10, drops: { item: 5 } },
        { id: 'second', code: 'B', sanityCost: 12, runs: 10, drops: { item: 10 } }
      ]
    }
  });
  assert.deepEqual(ties.map((row) => row.isBest), [true, true]);
});

test('material choices include sourced items and indicate missing rates', () => {
  const list = getFarmingMaterials({ materials: materialData.materials, dropData });
  assert.ok(list.some((material) => material.id === 'lmd' && material.available));
  assert.ok(list.some((material) => material.id === 'skill_book_t2' && !material.available));
});

test('farming translations and all master-data references are valid in four locales', () => {
  const translations = JSON.parse(readFileSync(new URL('../data/i18n.json', import.meta.url), 'utf8'));
  const keys = ['nav.farming', 'page.farming', 'farming.title', 'farming.description', 'farming.category.currency', 'farming.category.records', 'farming.category.promotion', 'farming.category.skill', 'farming.sort.efficiency', 'farming.column.efficiency', 'farming.best'];
  for (const language of ['ja', 'zh-CN', 'ko', 'en']) for (const key of keys) assert.ok(translations[language]?.[key], `${language}.${key} should exist`);
  const materialIds = new Set(materialData.materials.map((material) => material.id));
  for (const material of dropData.materials) {
    if (!['currency', 'records', 'skill'].includes(material.category)) assert.ok(materialIds.has(material.id), `${material.id} should exist in materials.json`);
  }
  const stageIds = new Set(stageData.stages.map((stage) => stage.id));
  for (const stage of dropData.stages) assert.ok(stageIds.has(stage.id), `${stage.id} should exist in stages.json`);
});
