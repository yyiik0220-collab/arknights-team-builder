/** Search and filter the read-only operator master database. @param {object[]} operators @param {object} filters @returns {object[]} */
export function searchDatabase(operators, filters = {}) {
  const query = String(filters.query ?? '').trim().toLocaleLowerCase();
  return operators.filter((operator) => (!filters.rarity || operator.rarity === Number(filters.rarity))
    && (!filters.class || operator.class === filters.class)
    && (!filters.subclass || operator.subclass === filters.subclass)
    && (!query || operator.name.toLocaleLowerCase().includes(query)));
}

/** Find a master-data record using its immutable ID. @param {object[]} operators @param {string} operatorId @returns {object | null} */
export function getOperatorDetails(operators, operatorId) {
  return operators.find((operator) => operator.id === operatorId) ?? null;
}
