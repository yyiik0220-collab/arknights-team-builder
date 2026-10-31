const requiredOperatorKeys = ['id', 'name', 'nameI18n', 'rarity', 'class', 'subclass', 'skills', 'talents', 'modules', 'stats', 'materials', 'tags', 'synergies'];
const supportedNameLanguages = ['ja', 'zh-CN', 'ko', 'en'];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname} (${response.status})`);
  return response.json();
}

/** Validate the material master (data/materials.json). @param {object} materials @returns {boolean} */
export function validateMaterials(materials) {
  if (!materials || !Array.isArray(materials.materials) || !materials.materials.length) throw new Error('素材マスターデータの配列がありません。');
  const ids = new Set();
  for (const material of materials.materials) {
    if (!material.id || !material.name || !Number.isInteger(material.tier) || material.tier < 1) throw new Error(`素材の必須項目が不正です: ${material.id ?? 'unknown'}`);
    if (ids.has(material.id)) throw new Error(`素材IDが重複しています: ${material.id}`);
    ids.add(material.id);
  }
  return true;
}

/** Validate operator records (required keys, multilingual names, unique IDs, synergy edges). @param {object} operators */
function validateOperatorList(operators) {
  if (!Array.isArray(operators.operators)) throw new Error('マスターデータの配列がありません。');
  const operatorIds = new Set();
  for (const operator of operators.operators) {
    if (requiredOperatorKeys.some((key) => !(key in operator))) throw new Error(`必須項目が不足しています: ${operator.id ?? 'unknown'}`);
    if (!operator.nameI18n || supportedNameLanguages.some((language) => typeof operator.nameI18n[language] !== 'string' || !operator.nameI18n[language].trim())) throw new Error(`多言語名が不足しています: ${operator.id ?? 'unknown'}`);
    if (operatorIds.has(operator.id)) throw new Error(`オペレーターIDが重複しています: ${operator.id}`);
    operatorIds.add(operator.id);
  }
  for (const operator of operators.operators) {
    for (const synergy of operator.synergies) {
      if (!operatorIds.has(synergy.operatorId)) throw new Error(`シナジー参照先がありません: ${operator.id} → ${synergy.operatorId}`);
    }
  }
  return true;
}

/** Validate stage records (structure, multilingual fields, role tags). @param {object} stages @param {object} scoring */
function validateStageList(stages, scoring = null) {
  if (!Array.isArray(stages.stages)) throw new Error('マスターデータの配列がありません。');
  const stageIds = new Set();
  const knownRoles = scoring?.roleTags ? new Set(Object.keys(scoring.roleTags)) : null;
  for (const stage of stages.stages) {
    if (!stage.id || stageIds.has(stage.id)) throw new Error(`ステージIDが未設定または重複しています: ${stage.id ?? 'unknown'}`);
    stageIds.add(stage.id);
    const requiredKeys = ['name', 'nameI18n', 'chapter', 'chapterI18n', 'difficulty', 'enemies', 'mechanics', 'requiredRoles', 'recommendedCount', 'tipsI18n', 'phases'];
    if (requiredKeys.some((key) => !(key in stage))) throw new Error(`ステージ必須項目が不足しています: ${stage.id}`);
    for (const field of ['nameI18n', 'chapterI18n', 'tipsI18n']) {
      if (supportedNameLanguages.some((language) => typeof stage[field]?.[language] !== 'string' || !stage[field][language].trim())) throw new Error(`ステージ多言語データが不足しています: ${stage.id} (${field})`);
    }
    if (!Array.isArray(stage.phases) || !Array.isArray(stage.enemies) || !Array.isArray(stage.mechanics) || !Array.isArray(stage.requiredRoles)) throw new Error(`ステージ配列項目の形式が不正です: ${stage.id}`);
    const stageRoles = [...stage.requiredRoles, ...Object.keys(stage.recommendedCount ?? {}), ...stage.phases.flatMap((phase) => [
      ...(phase.recommendedRoles ?? []).map((entry) => entry.role),
      ...(phase.mechanics ?? []).flatMap((mechanic) => mechanic.requiredRoles ?? [])
    ])];
    if (knownRoles && stageRoles.some((role) => !knownRoles.has(role))) throw new Error(`未定義の役割タグがあります: ${stage.id}`);
  }
  return true;
}

/** Validate IDs and required record structure before exposing master data. @param {object} operators @param {object} stages */
export function validateMasterData(operators, stages, scoring = null) {
  validateOperatorList(operators);
  validateStageList(stages, scoring);
  return true;
}

/** Validate the region availability table (regions.json) against the master data. @param {object} regions @param {object} operators @param {object} stages @returns {boolean} */
export function validateRegionTable(regions, operators, stages) {
  if (!regions || typeof regions !== 'object' || !regions.regions || typeof regions.regions !== 'object') throw new Error('リージョン可用性テーブル（regions.json）が不正です。');
  if (typeof regions.defaultRegion !== 'string' || !regions.regions[regions.defaultRegion]) throw new Error(`defaultRegion が存在しません: ${regions.defaultRegion}`);
  const operatorIds = new Set(operators.operators.map((operator) => operator.id));
  const stageIds = new Set(stages.stages.map((stage) => stage.id));
  for (const [code, config] of Object.entries(regions.regions)) {
    if (!config || config.code !== code) throw new Error(`リージョンコードが一致しません: ${code}`);
    if (typeof config.isReference !== 'boolean') throw new Error(`isReference が不正です: ${code}`);
    if (typeof config.gameVersion !== 'string' || !config.gameVersion) throw new Error(`gameVersion が不正です: ${code}`);
    const unreleasedOps = config.unreleasedOperatorIds ?? [];
    const unreleasedStages = config.unreleasedStageIds ?? [];
    if (!Array.isArray(unreleasedOps) || !Array.isArray(unreleasedStages)) throw new Error(`除外リストが配列ではありません: ${code}`);
    for (const id of unreleasedOps) if (!operatorIds.has(id)) throw new Error(`存在しないオペレーターIDが除外リストにあります: ${code} → ${id}`);
    for (const id of unreleasedStages) if (!stageIds.has(id)) throw new Error(`存在しないステージIDが除外リストにあります: ${code} → ${id}`);
  }
  return true;
}

/** Pure function: filter master data to the active region's released subset. Excludes unreleased operators/stages and drops synergy edges that reference excluded operators. @param {{operators: object, stages: object, regionConfig: object}} params @returns {{operators: object, stages: object}} */
export function applyRegionAvailability({ operators, stages, regionConfig }) {
  const unreleasedOps = new Set(regionConfig?.unreleasedOperatorIds ?? []);
  const unreleasedStages = new Set(regionConfig?.unreleasedStageIds ?? []);
  const filteredOperators = operators.operators.filter((operator) => !unreleasedOps.has(operator.id));
  const filteredStages = stages.stages.filter((stage) => !unreleasedStages.has(stage.id));
  const availableIds = new Set(filteredOperators.map((operator) => operator.id));
  // 未実装オペを参照するシナジー辺を除去（孤参照による生ID表示を防ぐ）。元データは変更しない。
  const availableOperators = filteredOperators.map((operator) => {
    if (!Array.isArray(operator.synergies)) return operator;
    const synergies = operator.synergies.filter((synergy) => availableIds.has(synergy.operatorId));
    return synergies.length === operator.synergies.length ? operator : { ...operator, synergies };
  });
  return {
    operators: { ...operators, operators: availableOperators },
    stages: { ...stages, stages: filteredStages }
  };
}

/**
 * 起動時に必要なコアデータ（operators / scoring-config / regions）を読み込み、オペレーターを
 * 検証してリージョン除外でフィルタする。stages / materials は初回描画に不要なため、
 * loadStageData / loadMaterialsData で遅延ロードする（初期表示のネットワーク量を削減）。
 * @param {{region?: string}} options
 */
export async function loadCoreMasterData({ region = 'cn' } = {}) {
  const [operators, scoring, regions] = await Promise.all([
    fetchJson(new URL('../../data/operators.json', import.meta.url)),
    fetchJson(new URL('../../data/scoring-config.json', import.meta.url)),
    fetchJson(new URL('../../data/regions.json', import.meta.url))
  ]);
  // オペレーター＋シナジーを検証（ステージは後続の loadStageData で検証する）。
  validateMasterData(operators, { stages: [] }, scoring);
  const activeRegion = regions.regions[region] ?? regions.regions[regions.defaultRegion];
  const filtered = applyRegionAvailability({ operators, stages: { stages: [] }, regionConfig: activeRegion });
  return {
    operators: filtered.operators, // UI表示用（リージョンでフィルタ済み）
    allOperators: operators,       // 検証・シナジー整合に使う全量（CN基準）
    scoring,
    regions,
    activeRegion
  };
}

/**
 * ステージデータを遅延ロードし、全マスターデータ（オペレーター＋ステージ）の整合性を検証した上で
 * リージョン除外を適用する。ステージ画面・育成優先度の初回表示時に呼ぶ。
 */
export async function loadStageData({ regions, allOperators, scoring, activeRegion }) {
  const stages = await fetchJson(new URL('../../data/stages.json', import.meta.url));
  validateMasterData(allOperators, stages, scoring);
  validateRegionTable(regions, allOperators, stages);
  const filtered = applyRegionAvailability({ operators: allOperators, stages, regionConfig: activeRegion });
  return filtered.stages;
}

/** 素材マスターを遅延ロードして検証する。素材計算画面の初回表示時に呼ぶ。 */
export async function loadMaterialsData() {
  const materials = await fetchJson(new URL('../../data/materials.json', import.meta.url));
  validateMaterials(materials);
  return materials;
}

/** Validate the recruitment master (data/recruitment.json). @param {object} recruitment */
export function validateRecruitment(recruitment) {
  if (!recruitment || typeof recruitment.tags !== 'object' || !Array.isArray(recruitment.operators)) {
    throw new Error('公開求人マスターデータ（recruitment.json）の形式が不正です。');
  }
  if (!Array.isArray(recruitment.tagCategories)) throw new Error('公開求人タグカテゴリがありません。');
  const tagIds = new Set(Object.keys(recruitment.tags));
  const operatorIds = new Set();
  for (const operator of recruitment.operators) {
    if (!operator.id || !Number.isInteger(operator.rarity) || !Array.isArray(operator.tags)) {
      throw new Error(`公開求人オペレーターの必須項目が不正です: ${operator.id ?? 'unknown'}`);
    }
    if (operatorIds.has(operator.id)) throw new Error(`公開求人オペレーターIDが重複しています: ${operator.id}`);
    operatorIds.add(operator.id);
    if (supportedNameLanguages.some((language) => typeof operator.nameI18n?.[language] !== 'string' || !operator.nameI18n[language].trim())) {
      throw new Error(`公開求人オペレーターの多言語名が不足しています: ${operator.id}`);
    }
    for (const tagId of operator.tags) {
      if (!tagIds.has(tagId)) throw new Error(`未定義の公開求人タグを参照しています: ${operator.id} → ${tagId}`);
    }
  }
  return true;
}

/** 公開求人マスター（recruitment.json）を遅延ロードして検証する。公開求人画面の初回表示時に呼ぶ。 */
export async function loadRecruitmentData() {
  const recruitment = await fetchJson(new URL('../../data/recruitment.json', import.meta.url));
  validateRecruitment(recruitment);
  return recruitment;
}
