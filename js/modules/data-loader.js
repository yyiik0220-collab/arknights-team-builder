const requiredOperatorKeys = ['id', 'name', 'nameI18n', 'rarity', 'class', 'subclass', 'skills', 'talents', 'modules', 'stats', 'materials', 'tags', 'synergies'];
const supportedNameLanguages = ['ja', 'zh-CN', 'ko', 'en'];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname} (${response.status})`);
  return response.json();
}

/** Validate IDs and required record structure before exposing master data. @param {object} operators @param {object} stages */
export function validateMasterData(operators, stages, scoring = null) {
  if (!Array.isArray(operators.operators) || !Array.isArray(stages.stages)) throw new Error('マスターデータの配列がありません。');
  const operatorIds = new Set();
  for (const operator of operators.operators) {
    if (requiredOperatorKeys.some((key) => !(key in operator))) throw new Error(`必須項目が不足しています: ${operator.id ?? 'unknown'}`);
    if (!operator.nameI18n || supportedNameLanguages.some((language) => typeof operator.nameI18n[language] !== 'string' || !operator.nameI18n[language].trim())) throw new Error(`多言語名が不足しています: ${operator.id ?? 'unknown'}`);
    if (operatorIds.has(operator.id)) throw new Error(`オペレーターIDが重複しています: ${operator.id}`);
    operatorIds.add(operator.id);
  }
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
  for (const operator of operators.operators) {
    for (const synergy of operator.synergies) {
      if (!operatorIds.has(synergy.operatorId)) throw new Error(`シナジー参照先がありません: ${operator.id} → ${synergy.operatorId}`);
    }
  }
  return true;
}

/** Fetch and validate versioned JSON masters relative to this module. @returns {Promise<{operators: object, stages: object, scoring: object}>} */
export async function loadMasterData() {
  const [operators, stages, scoring] = await Promise.all([
    fetchJson(new URL('../../data/operators.json', import.meta.url)),
    fetchJson(new URL('../../data/stages.json', import.meta.url)),
    fetchJson(new URL('../../data/scoring-config.json', import.meta.url))
  ]);
  validateMasterData(operators, stages, scoring);
  return { operators, stages, scoring };
}
