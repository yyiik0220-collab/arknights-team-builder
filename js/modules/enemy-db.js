const SUPPORTED_TYPES = new Set(['normal', 'elite', 'boss']);
const DAMAGE_TYPES = new Set(['physical', 'arts', 'true']);
const SORT_FIELDS = new Set(['name', 'hp', 'atk', 'def', 'res', 'movementSpeed', 'attackInterval']);

export function validateEnemyData(data) {
  if (!data || !Array.isArray(data.enemies)) throw new Error('敵マスターデータの配列がありません。');
  const ids = new Set();
  for (const enemy of data.enemies) {
    if (!enemy.id || ids.has(enemy.id)) throw new Error(`敵IDが未設定または重複しています: ${enemy.id ?? 'unknown'}`);
    ids.add(enemy.id);
    if (!SUPPORTED_TYPES.has(enemy.type)) throw new Error(`敵タイプが不正です: ${enemy.id}`);
    if (!enemy.nameI18n || ['ja', 'zh-CN', 'ko', 'en'].some((language) => !enemy.nameI18n[language]?.trim())) throw new Error(`敵の多言語名が不足しています: ${enemy.id}`);
    if (!enemy.stats || ['hp', 'atk', 'def', 'res', 'movementSpeed', 'attackInterval'].some((key) => !Number.isFinite(enemy.stats[key]) || enemy.stats[key] < 0)) throw new Error(`敵ステータスが不正です: ${enemy.id}`);
    if (!Array.isArray(enemy.stageIds) || !Array.isArray(enemy.stageTagIds) || !enemy.sourceUrl) throw new Error(`敵の出典またはステージ参照が不正です: ${enemy.id}`);
  }
  return true;
}

export function filterAndSortEnemies(enemies, { query = '', type = 'all', stageId = '', stageTags = [], sort = 'name', direction = 'asc' } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectedSort = SORT_FIELDS.has(sort) ? sort : 'name';
  const factor = direction === 'desc' ? -1 : 1;
  return enemies.filter((enemy) => {
    const searchText = [enemy.name, enemy.code, ...Object.values(enemy.nameI18n ?? {})].join(' ').toLocaleLowerCase();
    const stageMatches = !stageId || enemy.stageIds.includes(stageId) || (stageTags ?? []).some((tag) => enemy.stageTagIds.includes(tag));
    return (type === 'all' || enemy.type === type) && stageMatches && (!normalizedQuery || searchText.includes(normalizedQuery));
  }).sort((left, right) => {
    const a = left.stats[selectedSort];
    const b = right.stats[selectedSort];
    const comparison = selectedSort === 'name'
      ? left.name.localeCompare(right.name)
      : a - b;
    return comparison * factor || left.id.localeCompare(right.id);
  });
}

export function getStageEnemyInfo(stage, enemies) {
  if (!stage) return { exactEnemies: [], tags: [] };
  const exactEnemies = enemies.filter((enemy) => enemy.stageIds.includes(stage.id));
  const tags = [...new Set(stage.enemies ?? [])];
  return { exactEnemies, tags };
}

export function calculateEnemyDamage({ enemy, attack = 0, damageType = 'physical', hits = 1 } = {}) {
  const attackCount = Math.floor(hits);
  if (!enemy?.stats || !Number.isFinite(attack) || attack < 0 || !Number.isFinite(attackCount) || attackCount < 1 || !DAMAGE_TYPES.has(damageType)) return null;
  const { def, res, hp } = enemy.stats;
  const damagePerHit = damageType === 'physical'
    ? Math.max(attack - def, attack * 0.05)
    : damageType === 'arts'
      ? Math.max(attack * (1 - res / 100), attack * 0.05)
      : attack;
  const hitCount = damagePerHit > 0 ? Math.ceil(hp / damagePerHit) : null;
  return {
    damagePerHit,
    hitCount,
    totalDamage: damagePerHit * attackCount,
    defeatedWithinHits: damagePerHit * attackCount >= hp
  };
}

export function calculateRequiredAttack({ enemy, damageType = 'physical', hits = 1 } = {}) {
  const attackCount = Math.floor(hits);
  if (!enemy?.stats || !Number.isFinite(attackCount) || attackCount < 1 || !DAMAGE_TYPES.has(damageType)) return null;
  const requiredDamage = enemy.stats.hp / attackCount;
  const { def, res } = enemy.stats;
  if (damageType === 'physical') return Math.ceil(Math.min(def + requiredDamage, requiredDamage / 0.05));
  if (damageType === 'arts') return Math.ceil(requiredDamage / Math.max(0.05, 1 - res / 100));
  return Math.ceil(requiredDamage);
}
