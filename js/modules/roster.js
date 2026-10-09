/** Filter operators by normalized name, rarity, class, and subclass. @param {object[]} operators @param {object} filters @returns {object[]} */
export function filterOperators(operators, filters = {}) {
  const query = String(filters.query ?? '').trim().toLocaleLowerCase();
  return operators.filter((operator) => (!query || operator.name.toLocaleLowerCase().includes(query))
    && (!filters.rarity || operator.rarity === Number(filters.rarity))
    && (!filters.class || operator.class === filters.class)
    && (!filters.subclass || operator.subclass === filters.subclass));
}

/** Merge a validated operator record into the saved roster. @param {object[]} roster @param {object} record @returns {object[]} */
export function upsertRosterEntry(roster, record) {
  if (!record.operatorId || !Number.isInteger(record.promotionPhase) || record.promotionPhase < 0 || record.promotionPhase > 2) throw new TypeError('所持データの形式が不正です。');
  const nextRecord = { owned: true, skillLevels: [], masteryLevels: [], moduleLevels: [], ...record };
  return [...roster.filter((entry) => entry.operatorId !== record.operatorId), nextRecord];
}

/** Remove an operator's locally registered progression record. @param {object[]} roster @param {string} operatorId @returns {object[]} */
export function removeRosterEntry(roster, operatorId) {
  return roster.filter((entry) => entry.operatorId !== operatorId);
}
