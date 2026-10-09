import { t } from './i18n.js';
import { scoreGrowthAction } from './scoring.js';

function stageRoles(stage) {
  return (stage.phases ?? []).flatMap((phase) => [
    ...(phase.recommendedRoles ?? []).filter((entry) => entry.role).map((entry) => ({ role: entry.role, weight: Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 1 })),
    ...(phase.mechanics ?? []).flatMap((mechanic) => (mechanic.requiredRoles ?? []).map((role) => ({ role, weight: 1 })))
  ]);
}

function stageScores(operator, stages) {
  const tags = new Set(operator.tags ?? []);
  if (!tags.size) return { versatility: null, stageCoverage: null };
  const eligibleStages = stages.map((stage) => ({ stage, roles: stageRoles(stage) })).filter((entry) => entry.roles.length);
  if (!eligibleStages.length) return { versatility: null, stageCoverage: null };
  const coveredStages = eligibleStages.filter(({ roles }) => roles.some(({ role }) => tags.has(role))).length;
  const allRoles = eligibleStages.flatMap(({ roles }) => roles);
  const totalRoleWeight = allRoles.reduce((sum, entry) => sum + entry.weight, 0);
  const coveredRoleWeight = allRoles.reduce((sum, entry) => sum + (tags.has(entry.role) ? entry.weight : 0), 0);
  return {
    versatility: Math.round((coveredStages / eligibleStages.length) * 100),
    stageCoverage: totalRoleWeight ? Math.round((coveredRoleWeight / totalRoleWeight) * 100) : null
  };
}

function getActionMaterials(operator, type, details) {
  const materials = operator.materials ?? {};
  if (type === 'promotion') {
    const requiredPhases = Array.from({ length: 2 - details.currentPhase }, (_, index) => details.currentPhase + index + 1);
    const entries = requiredPhases.map((phase) => (materials.promotion ?? []).find((entry) => entry.phase === phase));
    if (!entries.length || entries.some((entry) => !entry || !Array.isArray(entry.items) || !entry.items.length)) return null;
    return entries.flatMap((entry) => entry.items);
  }
  if (type === 'mastery') {
    const entry = (materials.mastery ?? []).find((candidate) => candidate.skillId === details.skillId);
    const target = entry?.levels?.find((level) => (level.mastery ?? level.level) === details.targetLevel)
      ?? ((entry?.mastery ?? entry?.level) === details.targetLevel ? entry : null);
    return Array.isArray(target?.items) && target.items.length ? target.items : null;
  }
  const entry = (materials.modules ?? []).find((candidate) => candidate.moduleId === details.moduleId);
  const target = entry?.stages?.find((stage) => (stage.stage ?? stage.level) === details.targetLevel)
    ?? ((entry?.stage ?? entry?.level) === details.targetLevel ? entry : null);
  return Array.isArray(target?.items) && target.items.length ? target.items : null;
}

function materialCost(items, unitCosts) {
  if (!items?.length || !unitCosts || !Object.keys(unitCosts).length) return null;
  let total = 0;
  for (const item of items) {
    const unitCost = unitCosts[item.itemId];
    if (!item.itemId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) return null;
    total += item.quantity * unitCost;
  }
  return total > 0 ? total : null;
}

function readinessBenefit(type, details) {
  if (type === 'promotion') return ((2 - details.currentPhase) / 2) * 100;
  return 100 / 3;
}

function buildAction(operator, record, type, label, details, roleGapFit, gapImprovement, stages, unitCosts) {
  const items = getActionMaterials(operator, type, details);
  return {
    id: `${operator.id}:${type}:${details.actionId}`,
    operatorId: operator.id,
    operator,
    actionType: type,
    actionLabel: label,
    details,
    gapImprovement,
    rawMaterialCost: materialCost(items, unitCosts),
    components: {
      ...stageScores(operator, stages),
      rosterGapFit: roleGapFit,
      readinessBenefit: readinessBenefit(type, details)
    },
    currentRecord: record
  };
}

function listActions(operator, record, roleGapFit, gapImprovement, stages, unitCosts) {
  const actions = [];
  const currentPhase = Number.isInteger(record.promotionPhase) ? record.promotionPhase : 0;
  if (currentPhase < 2) {
    const details = { currentPhase, actionId: 'promotion-2' };
    actions.push(buildAction(operator, record, 'promotion', t('growth.registeredActionPromotion', { phase: currentPhase }), details, roleGapFit, gapImprovement, stages, unitCosts));
  }
  for (const [index, skill] of (operator.skills ?? []).entries()) {
    const currentLevel = Number.isInteger(record.masteryLevels?.[index]) ? record.masteryLevels[index] : 0;
    if (currentLevel >= 3) continue;
    const targetLevel = currentLevel + 1;
    const details = { skillId: skill.id, targetLevel, actionId: `${skill.id}-mastery-${targetLevel}` };
    actions.push(buildAction(operator, record, 'mastery', t('growth.masteryAction', { name: skill.name || t('growth.skillsFallback', { index: index + 1 }), level: targetLevel }), details, roleGapFit, gapImprovement, stages, unitCosts));
  }
  for (const [moduleIndex, module] of (operator.modules ?? []).entries()) {
    const currentLevel = Number.isInteger(record.moduleLevels?.[moduleIndex]) ? record.moduleLevels[moduleIndex] : 0;
    if (currentLevel >= 3) continue;
    const targetLevel = currentLevel + 1;
    const actionText = targetLevel === 1 ? t('growth.moduleAction') : t('growth.moduleUpgrade', { from: currentLevel, to: targetLevel });
    const details = { moduleId: module.id, moduleIndex, targetLevel, actionId: `${module.id}-module-${targetLevel}` };
    actions.push(buildAction(operator, record, 'module', t('growth.moduleActionDetails', { action: actionText, name: module.name || module.id }), details, roleGapFit, gapImprovement, stages, unitCosts));
  }
  return actions;
}

function missingValues(operators, ownedOperators, property) {
  const allValues = new Set(operators.map((operator) => operator[property]).filter(Boolean));
  const ownedValues = new Set(ownedOperators.map((operator) => operator[property]).filter(Boolean));
  return [...allValues].filter((value) => !ownedValues.has(value)).sort((left, right) => left.localeCompare(right));
}

export function findRosterGaps(operators, roster, roleTags) {
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const owned = roster.filter((entry) => entry.owned !== false).map((entry) => operatorById.get(entry.operatorId)).filter(Boolean);
  const knownTags = roleTags.filter((tag) => operators.some((operator) => operator.tags?.includes(tag)));
  if (!knownTags.length) return [];
  const covered = new Set(owned.flatMap((operator) => operator.tags ?? []));
  return knownTags.filter((tag) => !covered.has(tag));
}

export function buildGrowthPriorities({ operators, roster, stages, scoring }) {
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const ownedRecords = roster.filter((entry) => entry.owned !== false && operatorById.has(entry.operatorId));
  const ownedOperators = ownedRecords.map((entry) => operatorById.get(entry.operatorId));
  const roleLabels = scoring.roleTags ?? {};
  const roleTags = Object.keys(roleLabels).filter((tag) => operators.some((operator) => operator.tags?.includes(tag)));
  const coveredTags = new Set(ownedOperators.flatMap((operator) => operator.tags ?? []));
  const gaps = roleTags.filter((tag) => !coveredTags.has(tag));
  const unitCosts = scoring.materialUnitCosts ?? {};
  const candidates = ownedRecords.flatMap((record) => {
    const operator = operatorById.get(record.operatorId);
    const matchingGaps = gaps.filter((tag) => operator.tags?.includes(tag));
    const roleGapFit = gaps.length ? (matchingGaps.length / gaps.length) * 100 : null;
    return listActions(operator, record, roleGapFit, matchingGaps.length, stages, unitCosts);
  });
  const maxMaterialCost = Math.max(0, ...candidates.map((candidate) => candidate.rawMaterialCost ?? 0));
  const ranked = candidates.map((candidate) => {
    const normalizedCost = Number.isFinite(candidate.rawMaterialCost) && maxMaterialCost > 0
      ? (candidate.rawMaterialCost / maxMaterialCost) * 100
      : null;
    const components = { ...candidate.components, normalizedCost };
    const result = scoreGrowthAction(components, scoring.growthWeights);
    const reasons = [];
    if (candidate.gapImprovement) reasons.push(t('growth.gapImprovement', { count: candidate.gapImprovement }));
    if (Number.isFinite(components.versatility)) reasons.push(t('growth.versatilityReason', { value: components.versatility }));
    if (Number.isFinite(components.stageCoverage)) reasons.push(t('growth.stageReason', { value: components.stageCoverage }));
    if (Number.isFinite(components.readinessBenefit)) reasons.push(t('growth.readinessReason', { value: Math.round(components.readinessBenefit) }));
    if (Number.isFinite(normalizedCost)) reasons.push(t('growth.costReason', { value: Math.round(normalizedCost) }));
    return {
      ...candidate,
      components,
      score: result.score,
      missing: result.missing,
      reasons,
      costStatus: Number.isFinite(normalizedCost) ? 'evaluated' : 'not-evaluated'
    };
  }).sort((left, right) => (Number.isFinite(left.score) && Number.isFinite(right.score) ? right.score - left.score : 0)
    || right.gapImprovement - left.gapImprovement
    || (Number.isFinite(left.components.normalizedCost) && Number.isFinite(right.components.normalizedCost)
      ? left.components.normalizedCost - right.components.normalizedCost
      : 0)
    || left.operatorId.localeCompare(right.operatorId)
    || left.id.localeCompare(right.id));
  ranked.forEach((candidate, index) => { candidate.rank = index + 1; });
  return {
    priorities: ranked,
    ownedCount: ownedRecords.length,
    gaps: {
      roles: gaps,
      classes: missingValues(operators, ownedOperators, 'class'),
      subclasses: missingValues(operators, ownedOperators, 'subclass')
    },
    roleLabels
  };
}
