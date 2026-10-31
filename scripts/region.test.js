import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveRegionMap } from '../js/modules/region.js';
import { applyRegionAvailability } from '../js/modules/data-loader.js';

// リージョンセレクタのオプション生成が regions.json の「ルート」と「regions マップ」の
// どちらを渡されても、コード→定義マップへ正規化できることを保証する回帰テスト。
// （以前はルート { schemaVersion, defaultRegion, regions } を直接 Object.entries して
//   セレクタに不正な選択肢が生成されていた）

const rootPayload = {
  schemaVersion: 1,
  defaultRegion: 'cn',
  updatedAt: '2026-10-30',
  source: 'test',
  regions: {
    cn: { code: 'cn', isReference: true, gameVersion: '2.7.71' },
    global: { code: 'global', isReference: false, gameVersion: '2.6.11' }
  }
};

test('resolveRegionMap extracts the region map from a full regions.json root', () => {
  const map = resolveRegionMap(rootPayload);
  assert.deepEqual(Object.keys(map).sort(), ['cn', 'global']);
  assert.equal(map.cn.code, 'cn');
  assert.equal(map.global.code, 'global');
});

test('resolveRegionMap passes through an already-normalized region map', () => {
  const map = resolveRegionMap(rootPayload.regions);
  assert.deepEqual(Object.keys(map), ['cn', 'global']);
});

test('resolveRegionMap returns an empty map for undefined input', () => {
  assert.deepEqual(resolveRegionMap(undefined), {});
  assert.deepEqual(resolveRegionMap(null), {});
});

test('shipped regions.json exposes cn and global with a valid defaultRegion', async () => {
  const regions = JSON.parse(await readFile(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const map = resolveRegionMap(regions);
  assert.deepEqual(Object.keys(map).sort(), ['cn', 'global']);
  assert.equal(typeof regions.defaultRegion, 'string');
  assert.ok(Object.hasOwn(map, regions.defaultRegion));
  assert.equal(map.cn.isReference, true);
  // CN は参照元（全データ）のため除外リストは空であること
  assert.deepEqual(map.cn.unreleasedOperatorIds, []);
  assert.deepEqual(map.cn.unreleasedStageIds, []);
});

test('shipped data filters operators to 56 (CN) and 50 (Global)', async () => {
  // リージョン切替時にオペレーター件数が正しく変化することを実データで保証する回帰テスト。
  // （切替フローで「Cannot read properties of undefined (reading 'stages')」が起きないことと、
  //   CN=56体 / Global=50体 という受入条件を同じフローで担保する）
  const [operators, stages, regions] = await Promise.all([
    readFile(new URL('../data/operators.json', import.meta.url), 'utf8'),
    readFile(new URL('../data/stages.json', import.meta.url), 'utf8'),
    readFile(new URL('../data/regions.json', import.meta.url), 'utf8')
  ]).then(([ops, stg, reg]) => [JSON.parse(ops), JSON.parse(stg), JSON.parse(reg)]);

  const cn = applyRegionAvailability({ operators, stages, regionConfig: regions.regions.cn });
  const global = applyRegionAvailability({ operators, stages, regionConfig: regions.regions.global });

  assert.equal(cn.operators.operators.length, 56);
  assert.equal(global.operators.operators.length, 50);
  // 両リージョンとも stages は正規形 { stages: [...] } を維持すること
  assert.ok(Array.isArray(cn.stages.stages));
  assert.ok(Array.isArray(global.stages.stages));
  assert.equal(cn.stages.stages.length, 43);
  assert.equal(global.stages.stages.length, 43);
});
