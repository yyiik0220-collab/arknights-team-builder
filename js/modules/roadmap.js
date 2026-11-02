const MAX_PHASE_BY_RARITY = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2, 6: 2 };
const MAX_LEVEL_BY_RARITY = {
  1: [30],
  2: [30],
  3: [40, 55],
  4: [45, 60, 70],
  5: [50, 70, 80],
  6: [50, 80, 90]
};
const LMD_PROMOTION_COSTS = {
  1: { 1: 0, 2: 0, 3: 10000, 4: 15000, 5: 20000, 6: 30000 },
  2: { 1: 0, 2: 0, 3: 60000, 4: 60000, 5: 120000, 6: 180000 }
};

function normalizeRoster(roster) {
  const entries = Array.isArray(roster) ? roster : Array.isArray(roster?.roster) ? roster.roster : [];
  const byId = new Map();
  for (const entry of entries) {
    const operatorId = typeof entry === 'string' ? entry : entry?.operatorId ?? entry?.operator_id ?? entry?.id;
    if (typeof operatorId !== 'string' || !operatorId || entry?.owned === false) continue;
    const promotionPhase = typeof entry === 'string' ? 0 : Number(entry.promotionPhase ?? entry.promotion ?? entry.elite ?? 0);
    const level = typeof entry === 'string' ? 1 : Number(entry.level ?? 1);
    const normalized = {
      operatorId,
      promotionPhase: Number.isInteger(promotionPhase) ? Math.max(0, Math.min(2, promotionPhase)) : 0,
      level: Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1
    };
    const previous = byId.get(operatorId);
    if (!previous || normalized.promotionPhase > previous.promotionPhase
      || (normalized.promotionPhase === previous.promotionPhase && normalized.level > previous.level)) byId.set(operatorId, normalized);
  }
  return [...byId.values()];
}

function stageOrder(left, right) {
  return (Number(left.order) || 0) - (Number(right.order) || 0)
    || String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
}

function stageNeeds(stage) {
  const roleWeights = new Map();
  for (const role of stage.requiredRoles ?? []) roleWeights.set(role, Math.max(roleWeights.get(role) ?? 0, 1));
  for (const phase of stage.phases ?? []) {
    for (const entry of phase.recommendedRoles ?? []) {
      if (entry.role) roleWeights.set(entry.role, Math.max(roleWeights.get(entry.role) ?? 0, Number(entry.weight) || 1));
    }
    for (const mechanic of phase.mechanics ?? []) {
      for (const role of mechanic.requiredRoles ?? []) roleWeights.set(role, Math.max(roleWeights.get(role) ?? 0, 1));
    }
  }
  for (const mechanic of stage.mechanics ?? []) {
    for (const role of mechanic.requiredRoles ?? []) roleWeights.set(role, Math.max(roleWeights.get(role) ?? 0, 1));
  }
  const enemies = (stage.enemies ?? []).map((enemy) => enemy.replace(/^enemy\./, ''));
  const mechanics = (stage.mechanics ?? []).map((mechanic) => mechanic.id).filter(Boolean);
  return { roleWeights, enemies, mechanics };
}

function stageFit(operator, stage) {
  if (!stage) return { score: 0, roles: [], enemies: [], mechanics: [] };
  const needs = stageNeeds(stage);
  const tags = new Set(operator.tags ?? []);
  const counters = new Set(operator.enemyCounters ?? []);
  const mechanicTags = new Set(operator.mechanicTags ?? []);
  const roles = [...needs.roleWeights.keys()].filter((role) => tags.has(role));
  const enemies = needs.enemies.filter((enemy) => counters.has(enemy));
  const mechanics = needs.mechanics.filter((mechanic) => mechanicTags.has(mechanic));
  const totalRoleWeight = [...needs.roleWeights.values()].reduce((sum, weight) => sum + weight, 0);
  const roleScore = totalRoleWeight ? roles.reduce((sum, role) => sum + needs.roleWeights.get(role), 0) / totalRoleWeight : 0;
  const enemyScore = needs.enemies.length ? enemies.length / needs.enemies.length : 0;
  const mechanicScore = needs.mechanics.length ? mechanics.length / needs.mechanics.length : 0;
  return {
    score: roleScore * 65 + enemyScore * 20 + mechanicScore * 15,
    roles,
    enemies,
    mechanics
  };
}

function promotionCost(operator, targetPhase, materials) {
  const promotion = (operator.materials?.promotion ?? []).find((entry) => entry.phase === targetPhase);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const items = (promotion?.items ?? []).map((item) => ({
    itemId: item.itemId,
    quantity: item.quantity,
    material: materialById.get(item.itemId) ?? null
  }));
  const missingItems = items.filter((item) => !item.material);
  const materialWeight = items.reduce((sum, item) => sum + (Number(item.material?.unitCost) || 0) * item.quantity, 0);
  const lmd = LMD_PROMOTION_COSTS[targetPhase]?.[operator.rarity] ?? null;
  return {
    items,
    lmd,
    materialsAvailable: Boolean(promotion?.items?.length) && missingItems.length === 0,
    missingItems,
    materialWeight
  };
}

function roleLabelsForOperator(operator, scoring) {
  return [...new Set(operator.tags ?? [])]
    .filter((tag) => scoring?.roleTags?.[tag])
    .sort((left, right) => String(scoring.roleTags[left].label).localeCompare(String(scoring.roleTags[right].label)));
}

export function normalizeRoadmapRoster(roster) {
  return normalizeRoster(roster);
}

export function buildRoadmapPriorities({
  operators = [],
  roster = [],
  stages = [],
  materials = [],
  scoring = {},
  clearedStageIds = [],
  limit = 12
} = {}) {
  const validOperators = Array.isArray(operators) ? operators : operators.operators ?? [];
  const validStages = Array.isArray(stages) ? stages : stages.stages ?? [];
  const validMaterials = Array.isArray(materials) ? materials : materials.materials ?? [];
  const operatorById = new Map(validOperators.map((operator) => [operator.id, operator]));
  const records = normalizeRoster(roster).filter((record) => operatorById.has(record.operatorId));
  const cleared = new Set(Array.isArray(clearedStageIds) ? clearedStageIds.filter((id) => typeof id === 'string') : []);
  const mainStages = validStages.filter((stage) => stage.category === 'main').sort(stageOrder);
  const unclearedStages = mainStages.filter((stage) => !cleared.has(stage.id));
  const nextStage = unclearedStages[0] ?? null;
  const upcomingStages = unclearedStages.slice(0, 6);
  const materialById = new Map(validMaterials.map((material) => [material.id, material]));
  const candidates = [];

  for (const record of records) {
    const operator = operatorById.get(record.operatorId);
    const maxPhase = MAX_PHASE_BY_RARITY[operator.rarity] ?? 0;
    if (record.promotionPhase >= maxPhase) continue;
    const targetPhase = record.promotionPhase + 1;
    const levelCaps = MAX_LEVEL_BY_RARITY[operator.rarity] ?? MAX_LEVEL_BY_RARITY[1];
    const currentLevelCap = levelCaps[record.promotionPhase] ?? levelCaps.at(-1);
    const currentLevel = Math.min(record.level, currentLevelCap);
    const cost = promotionCost(operator, targetPhase, validMaterials);
    const currentStageFit = stageFit(operator, nextStage);
    const futureStageFit = upcomingStages.length
      ? upcomingStages.reduce((sum, stage, index) => sum + stageFit(operator, stage).score / (index + 1), 0)
        / upcomingStages.reduce((sum, _stage, index) => sum + 1 / (index + 1), 0)
      : 0;
    const readiness = currentLevel / currentLevelCap;
    const materialBurden = cost.materialWeight + (Number(cost.lmd) || 0) / 1000;
    const score = Math.round((currentStageFit.score * 0.65 + futureStageFit * 0.2 + targetPhase * 7 + readiness * 8 - Math.min(materialBurden / 100, 12)) * 100) / 100;
    candidates.push({
      operator,
      operatorId: operator.id,
      nextStage,
      record,
      currentPhase: record.promotionPhase,
      currentLevel,
      currentLevelCap,
      targetPhase,
      cost,
      nextStageFit: currentStageFit,
      futureStageFit: Math.round(futureStageFit * 100) / 100,
      score,
      matchedRoles: currentStageFit.roles.length ? currentStageFit.roles : roleLabelsForOperator(operator, scoring),
      roleLabels: scoring.roleTags ?? {}
    });
  }

  candidates.sort((left, right) => right.score - left.score
    || right.nextStageFit.score - left.nextStageFit.score
    || right.currentLevel / right.currentLevelCap - left.currentLevel / left.currentLevelCap
    || left.operatorId.localeCompare(right.operatorId));
  const priorities = candidates.slice(0, Math.max(0, Math.floor(limit)));
  priorities.forEach((candidate, index) => { candidate.rank = index + 1; });
  return {
    priorities,
    nextStage,
    upcomingStages,
    completedCount: validStages.filter((stage) => cleared.has(stage.id)).length,
    stageCount: validStages.length,
    mainCompletedCount: mainStages.filter((stage) => cleared.has(stage.id)).length,
    mainStageCount: mainStages.length,
    ownedCount: records.length,
    clearedStageIds: [...cleared].filter((id) => validStages.some((stage) => stage.id === id)),
    materialCount: materialById.size
  };
}
