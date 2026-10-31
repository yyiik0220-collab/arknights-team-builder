import { getLanguage } from './i18n.js';

/** Localize a material name (ja/en fallback for zh-CN/ko, then English master name). @param {object} material @returns {string} */
export function getMaterialName(material) {
  const language = getLanguage();
  return material?.nameI18n?.[language] || material?.nameI18n?.en || material?.name || material?.id || '';
}

/** Resolve promotion (E1/E2) items for an operator, or null when data is missing. @param {object} operator @param {number} phase @returns {{itemId: string, quantity: number}[] | null} */
export function getPromotionItems(operator, phase) {
  const entry = (operator?.materials?.promotion ?? []).find((candidate) => candidate.phase === phase);
  return Array.isArray(entry?.items) && entry.items.length ? entry.items : null;
}

/** Resolve skill-mastery (M1-M3) items, or null when data is missing. Matches the schema conventions used by growth-advisor. @param {object} operator @param {string} skillId @param {number} level @returns {{itemId: string, quantity: number}[] | null} */
export function getMasteryItems(operator, skillId, level) {
  const entry = (operator?.materials?.mastery ?? []).find((candidate) => candidate.skillId === skillId);
  if (!entry) return null;
  const target = entry.levels?.find((candidate) => (candidate.mastery ?? candidate.level) === level)
    ?? ((entry.mastery ?? entry.level) === level ? entry : null);
  return Array.isArray(target?.items) && target.items.length ? target.items : null;
}

/** Resolve module-upgrade items, or null when data is missing. @param {object} operator @param {string} moduleId @param {number} level @returns {{itemId: string, quantity: number}[] | null} */
export function getModuleItems(operator, moduleId, level) {
  const entry = (operator?.materials?.modules ?? []).find((candidate) => candidate.moduleId === moduleId);
  if (!entry) return null;
  const target = entry.stages?.find((candidate) => (candidate.stage ?? candidate.level) === level)
    ?? ((entry.stage ?? entry.level) === level ? entry : null);
  return Array.isArray(target?.items) && target.items.length ? target.items : null;
}

/** Sum item quantities across plan entries. Entries without material data contribute nothing. @param {{items?: {itemId: string, quantity: number}[]}[]} planEntries @returns {{materialId: string, quantity: number}[]} */
export function aggregateRequirements(planEntries) {
  const totals = new Map();
  for (const entry of planEntries) {
    if (!Array.isArray(entry.items)) continue;
    for (const item of entry.items) {
      const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0;
      if (!item.itemId || !quantity) continue;
      totals.set(item.itemId, (totals.get(item.itemId) ?? 0) + quantity);
    }
  }
  return [...totals.entries()].map(([materialId, quantity]) => ({ materialId, quantity }));
}
