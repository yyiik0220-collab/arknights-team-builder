import { scoreOperator } from './scoring.js';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

/** ステージ要約とフェーズ詳細のギミックを ID で統合し、重複を排除する（requiredRoles は和集合）。 @param {object[]} stageMechanics @param {object[]} phaseMechanics @returns {object[]} */
function mergeMechanics(stageMechanics, phaseMechanics) {
  const merged = new Map();
  for (const mechanic of [...(stageMechanics ?? []), ...(phaseMechanics ?? [])]) {
    if (!mechanic?.id || mechanic.id === 'unverified') continue;
    const existing = merged.get(mechanic.id);
    if (!existing) {
      merged.set(mechanic.id, { ...mechanic });
    } else {
      merged.set(mechanic.id, {
        ...existing,
        ...mechanic,
        requiredRoles: [...new Set([...(existing.requiredRoles ?? []), ...(mechanic.requiredRoles ?? [])])]
      });
    }
  }
  return [...merged.values()];
}

function ownedRecords(roster, operators) {
  const operatorIds = new Set(operators.map((operator) => operator.id));
  const records = new Map();
  for (const record of roster ?? []) {
    if (record?.owned !== false && operatorIds.has(record?.operatorId)) records.set(record.operatorId, record);
  }
  return records;
}

function roleRequirements(phase) {
  const requirements = new Map();
  const add = (role, weight = 1, count = 1) => {
    if (!role) return;
    const existing = requirements.get(role) ?? { role, weight: 1, count: 1 };
    existing.weight = Math.max(existing.weight, Number.isFinite(weight) && weight > 0 ? weight : 1);
    existing.count = Math.max(existing.count, Number.isFinite(count) && count > 0 ? count : 1);
    requirements.set(role, existing);
  };
  for (const role of phase.requiredRoles ?? []) add(role, 1, phase.recommendedCount?.[role] ?? 1);
  for (const entry of phase.recommendedRoles ?? []) add(entry.role, entry.weight, phase.recommendedCount?.[entry.role] ?? 1);
  for (const [role, count] of Object.entries(phase.recommendedCount ?? {})) add(role, 1, count);
  return [...requirements.values()];
}

function coverageFor(operator, requirements, roleCounts) {
  const tags = new Set(operator.tags ?? []);
  const totalWeight = requirements.reduce((sum, requirement) => sum + requirement.weight * requirement.count, 0);
  let remainingWeight = 0;
  let duplicateWeight = 0;
  const coveredRoles = [];
  const neededRoles = [];
  for (const requirement of requirements) {
    if (!tags.has(requirement.role)) continue;
    const covered = roleCounts.get(requirement.role) ?? 0;
    const missing = Math.max(0, requirement.count - covered);
    if (missing > 0) {
      remainingWeight += requirement.weight * Math.min(1, missing);
      neededRoles.push(requirement.role);
    } else {
      duplicateWeight += requirement.weight;
    }
    coveredRoles.push(requirement.role);
  }
  return {
    coverage: totalWeight ? (remainingWeight / totalWeight) * 100 : 0,
    duplicate: totalWeight ? (duplicateWeight / totalWeight) * 100 : 0,
    coveredRoles,
    neededRoles
  };
}

function rankByScore(left, right) {
  return right.selectionScore - left.selectionScore
    || right.coverageGain - left.coverageGain
    || (right.baseScore ?? 0) - (left.baseScore ?? 0)
    || (right.breakdown.readiness ?? 0) - (left.breakdown.readiness ?? 0)
    || left.operator.id.localeCompare(right.operator.id);
}

export function rankCandidates(operators, roster, phase, weights) {
  const records = ownedRecords(roster, operators);
  return operators.filter((operator) => records.has(operator.id))
    .map((operator) => {
      const record = records.get(operator.id);
      const score = scoreOperator(operator, phase, weights, record);
      return { operator, record, ...score, baseScore: score.score };
    })
    .sort((left, right) => right.score - left.score || left.operator.id.localeCompare(right.operator.id));
}

export function buildTeam(candidates, limit = 12, { phase = {}, teamWeights = {} } = {}) {
  const maxTeamSize = Number.isInteger(teamWeights.maxTeamSize) && teamWeights.maxTeamSize > 0
    ? Math.min(12, teamWeights.maxTeamSize, limit)
    : Math.min(12, limit);
  const requirements = roleRequirements(phase);
  const roleCounts = new Map();
  const remaining = [...candidates];
  const team = [];
  while (team.length < maxTeamSize && remaining.length) {
    const ranked = remaining.map((candidate) => {
      const fit = scoreOperator(candidate.operator, phase, teamWeights, candidate.record);
      const coverage = coverageFor(candidate.operator, requirements, roleCounts);
      const baseFit = Number.isFinite(fit.baseFit) ? fit.baseFit : candidate.baseScore ?? candidate.score ?? 0;
      const coverageGain = (Number.isFinite(teamWeights.coverageBonus) ? teamWeights.coverageBonus : 0) * coverage.coverage;
      const duplicatePenalty = (Number.isFinite(teamWeights.duplicateRolePenalty) ? teamWeights.duplicateRolePenalty : 0) * coverage.duplicate;
      return {
        ...candidate,
        score: Math.round(clamp(baseFit + coverageGain - duplicatePenalty) * 100) / 100,
        baseScore: baseFit, 
        breakdown: fit.breakdown,
        missing: fit.missing,
        selectionScore: baseFit + coverageGain - duplicatePenalty,
        coverageGain,
        duplicatePenalty,
        coveredRoles: coverage.coveredRoles,
        neededRoles: coverage.neededRoles
      };
    }).sort(rankByScore);
    const selected = ranked[0];
    team.push({ ...selected, slot: team.length + 1 });
    remaining.splice(remaining.findIndex((candidate) => candidate.operator.id === selected.operator.id), 1);
    for (const role of new Set(selected.coveredRoles)) roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  for (const selected of team) {
    const slotRoles = new Set(selected.neededRoles.length ? selected.neededRoles : selected.coveredRoles);
    const alternatives = remaining.map((candidate) => {
      const fit = scoreOperator(candidate.operator, phase, teamWeights, candidate.record);
      const tags = new Set(candidate.operator.tags ?? []);
      const sharedRoles = [...slotRoles].filter((role) => tags.has(role));
      return { ...candidate, score: fit.score, breakdown: fit.breakdown, missing: fit.missing, sharedRoles };
    }).sort((left, right) => right.sharedRoles.length - left.sharedRoles.length
      || right.score - left.score
      || left.operator.id.localeCompare(right.operator.id));
    selected.alternatives = alternatives.slice(0, 3);
  }

  return team;
}

export function recommendTeam({ operators, roster, stage, phase = stage?.phases?.[0], scoring }) {
  const teamWeights = scoring.teamWeights;
  const selectedPhase = {
    ...(phase ?? {}),
    requiredRoles: stage.requiredRoles ?? [],
    recommendedCount: stage.recommendedCount ?? {},
    enemies: stage.enemies ?? [],
    mechanics: mergeMechanics(stage.mechanics, phase?.mechanics)
  };
  const records = ownedRecords(roster, operators);
  const candidates = rankCandidates(operators, roster, selectedPhase, teamWeights);
  const limit = Number.isInteger(teamWeights.maxTeamSize) && teamWeights.maxTeamSize > 0 ? teamWeights.maxTeamSize : 12;
  const team = buildTeam(candidates, limit, { phase: selectedPhase, teamWeights });
  const counts = new Map();
  for (const member of team) {
    for (const role of new Set(member.operator.tags ?? [])) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const requirements = roleRequirements(selectedPhase);
  const uncoveredRoles = requirements.filter((requirement) => (counts.get(requirement.role) ?? 0) < requirement.count)
    .map((requirement) => ({ role: requirement.role, missing: requirement.count - (counts.get(requirement.role) ?? 0) }));
  return { team, ownedCount: records.size, uncoveredRoles, slotCount: limit };
}
