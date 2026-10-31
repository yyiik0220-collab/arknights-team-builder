const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function normalizedAverage(values) {
  const available = values.filter(Number.isFinite);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

function readinessScore(record, weights) {
  if (!record || record.owned === false || !weights) return null;
  const parts = [];
  if (Number.isFinite(record.promotionPhase) && weights.promotionPhase > 0) parts.push({ value: clamp(record.promotionPhase / 2 * 100), weight: weights.promotionPhase });
  if (Number.isFinite(record.level) && weights.level > 0) parts.push({ value: clamp(record.level / 90 * 100), weight: weights.level });
  const skillScore = normalizedAverage((record.skillLevels ?? []).map((level) => Number.isFinite(level) ? clamp(level / 7 * 100) : null));
  if (Number.isFinite(skillScore) && weights.skill > 0) parts.push({ value: skillScore, weight: weights.skill });
  const masteryScore = normalizedAverage((record.masteryLevels ?? []).map((level) => Number.isFinite(level) ? clamp(level / 3 * 100) : null));
  if (Number.isFinite(masteryScore) && weights.mastery > 0) parts.push({ value: masteryScore, weight: weights.mastery });
  const weightTotal = parts.reduce((sum, part) => sum + part.weight, 0);
  return weightTotal ? parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weightTotal : null;
}

function roleTargets(phase) {
  const targets = new Map();
  const add = (role, weight, count = 1) => {
    if (!role) return;
    const existing = targets.get(role) ?? { role, weight: 0, count: 1 };
    existing.weight = Math.max(existing.weight, Number.isFinite(weight) && weight > 0 ? weight : 1);
    existing.count = Math.max(existing.count, Number.isFinite(count) && count > 0 ? count : 1);
    targets.set(role, existing);
  };
  for (const entry of phase.recommendedRoles ?? []) add(entry.role, entry.weight, phase.recommendedCount?.[entry.role] ?? 1);
  for (const role of phase.requiredRoles ?? []) {
    const existing = targets.get(role);
    if (existing) existing.count = Math.max(existing.count, phase.recommendedCount?.[role] ?? 1);
    else add(role, 1, phase.recommendedCount?.[role] ?? 1);
  }
  for (const [role, count] of Object.entries(phase.recommendedCount ?? {})) {
    const existing = targets.get(role);
    if (existing) existing.count = Math.max(existing.count, count);
    else add(role, 1, count);
  }
  return [...targets.values()].map((target) => ({ ...target, totalWeight: target.weight * target.count }));
}

function getOperatorTags(operator, key) {
  const values = operator[key];
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
}

function roleMatch(operator, phase) {
  const targets = roleTargets(phase);
  const tags = getOperatorTags(operator, 'tags');
  if (!targets.length || !tags.size) return null;
  const total = targets.reduce((sum, target) => sum + target.totalWeight, 0);
  const matched = targets.reduce((sum, target) => sum + (tags.has(target.role) ? target.totalWeight : 0), 0);
  return total ? (matched / total) * 100 : null;
}

function mechanicMatch(operator, phase) {
  // 未確認プレースホルダー（id === 'unverified'）は評価対象から除外する。
  const mechanics = (phase.mechanics ?? []).filter((mechanic) => mechanic && mechanic.id !== 'unverified');
  if (!mechanics.length) return null;
  const roleTags = getOperatorTags(operator, 'tags');
  // ギミックへの直接対処能力は mechanicTags / abilities に記載する（例: 寒冷耐性）。
  const capabilityTags = new Set([
    ...getOperatorTags(operator, 'mechanicTags'),
    ...getOperatorTags(operator, 'abilities')
  ]);
  // ギミックごとに「必要役割の充足度」または「直接対処」を0〜100で評価し、平均を返す。
  const scores = mechanics.map((mechanic) => {
    if (capabilityTags.has(mechanic.id)) return 100;
    const requiredRoles = mechanic.requiredRoles ?? [];
    if (!requiredRoles.length) return 0;
    const matchedRoles = requiredRoles.filter((role) => roleTags.has(role)).length;
    return (matchedRoles / requiredRoles.length) * 100;
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function enemyMatch(operator, phase) {
  // 敵アーキタイプはフェーズの enemyTags で評価する（表示用の enemies は個別名を含むため一致評価には使わない）。
  const normalize = (value) => (value.startsWith('enemy.') ? value.slice('enemy.'.length) : value);
  const enemies = (phase.enemyTags ?? [])
    .filter((enemy) => typeof enemy === 'string' && !enemy.includes('unverified'))
    .map(normalize);
  if (!enemies.length) return null;
  // オペレーターの対処能力は enemyTags / enemyCounters / specialties に記載する（例: 対空 → flying）。
  const strengths = new Set([
    ...getOperatorTags(operator, 'enemyTags'),
    ...getOperatorTags(operator, 'enemyCounters'),
    ...getOperatorTags(operator, 'specialties')
  ].map(normalize));
  if (!strengths.size) return null;
  const matched = enemies.filter((enemy) => strengths.has(enemy)).length;
  return (matched / enemies.length) * 100;
}

export function scoreOperator(operator, phase, weights, record = null) {
  const baseWeights = weights.baseFit ?? weights;
  const breakdown = {
    roleMatch: roleMatch(operator, phase),
    mechanicMatch: mechanicMatch(operator, phase),
    enemyMatch: enemyMatch(operator, phase),
    readiness: readinessScore(record, weights.readinessWeights)
  };
  const missing = Object.keys(breakdown).filter((key) => !Number.isFinite(breakdown[key]));
  const available = Object.entries(breakdown).filter(([key, value]) => Number.isFinite(value) && Number.isFinite(baseWeights[key]) && baseWeights[key] > 0);
  const weightTotal = available.reduce((sum, [key]) => sum + baseWeights[key], 0);
  const baseFit = weightTotal ? clamp(available.reduce((sum, [key, value]) => sum + value * baseWeights[key], 0) / weightTotal) : null;
  return {
    score: Number.isFinite(baseFit) ? Math.round(baseFit * 100) / 100 : 0,
    baseFit: Number.isFinite(baseFit) ? Math.round(baseFit * 100) / 100 : null,
    breakdown,
    missing
  };
}

export function scoreGrowthAction(components, weights) {
  const positive = Object.entries(weights).filter(([key, weight]) => key !== 'normalizedCost' && Number.isFinite(weight) && weight > 0 && Number.isFinite(components[key]));
  const positiveTotal = positive.reduce((sum, [, weight]) => sum + weight, 0);
  const positiveScore = positiveTotal ? positive.reduce((sum, [key, weight]) => sum + components[key] * weight, 0) / positiveTotal : 0;
  const costWeight = Number.isFinite(weights.normalizedCost) ? Math.abs(weights.normalizedCost) : 0;
  const costPenalty = costWeight && Number.isFinite(components.normalizedCost) ? costWeight * components.normalizedCost : 0;
  const missing = Object.keys(weights).filter((key) => !Number.isFinite(components[key]));
  return {
    score: positiveTotal ? Math.round(clamp(positiveScore - costPenalty) * 100) / 100 : null,
    missing,
    breakdown: Object.fromEntries(Object.keys(weights).map((key) => [key, Number.isFinite(components[key]) ? components[key] : null]))
  };
}
