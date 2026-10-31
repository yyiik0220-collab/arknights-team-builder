const userStorageKey = 'arknights-team-builder:user:v1';
const preferencesStorageKey = 'arknights-team-builder:prefs:v1';
const backupStorageKey = 'arknights-team-builder:backup:v1';
const materialStorageKey = 'arknights-team-builder:materials:v1';
const templateStorageKey = 'arknights-team-builder:templates:v1';
const memoStorageKey = 'arknights-team-builder:memos:v1';

/** Load validated local user data without replacing unreadable stored content. @returns {{data: object | null, error: string | null}} */
export function loadUserData() {
  try {
    const raw = localStorage.getItem(userStorageKey);
    if (!raw) return { data: { schemaVersion: 1, roster: [] }, error: null };
    const data = JSON.parse(raw);
    if (data.schemaVersion !== 1 || !Array.isArray(data.roster) || data.roster.some((entry) => !entry || typeof entry !== 'object' || typeof entry.operatorId !== 'string')) throw new Error('未対応の形式です。');
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/** Save a versioned user data object and return any storage error. @param {object} data @returns {{saved: boolean, error: string | null}} */
export function saveUserData(data) {
  try {
    localStorage.setItem(userStorageKey, JSON.stringify({ ...data, schemaVersion: 1, updatedAt: new Date().toISOString() }));
    return { saved: true, error: null };
  } catch (error) {
    return { saved: false, error: error.message };
  }
}

/** Back up the exact current storage value before a destructive import. @returns {{saved: boolean, error: string | null}} */
export function backupUserData() {
  try {
    const raw = localStorage.getItem(userStorageKey);
    localStorage.setItem(backupStorageKey, JSON.stringify({ createdAt: new Date().toISOString(), data: raw }));
    return { saved: true, error: null };
  } catch (error) {
    return { saved: false, error: error.message };
  }
}

/** Clear roster data and local display preferences. @returns {{cleared: boolean, error: string | null}} */
export function clearUserData() {
  try {
    localStorage.removeItem(userStorageKey);
    localStorage.removeItem(preferencesStorageKey);
    localStorage.removeItem(backupStorageKey);
    localStorage.removeItem(materialStorageKey);
    localStorage.removeItem(templateStorageKey);
    localStorage.removeItem(memoStorageKey);
    return { cleared: true, error: null };
  } catch (error) {
    return { cleared: false, error: error.message };
  }
}

/** Load the material inventory (materialId -> owned quantity) from local storage. @returns {Record<string, number>} */
export function loadMaterialInventory() {
  try {
    const raw = localStorage.getItem(materialStorageKey);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const inventory = {};
    for (const [id, quantity] of Object.entries(data)) {
      if (id && Number.isFinite(quantity) && quantity >= 0) inventory[id] = Math.floor(quantity);
    }
    return inventory;
  } catch {
    return {};
  }
}

/** Store the material inventory (materialId -> owned quantity). @param {Record<string, number>} inventory @returns {{saved: boolean, error: string | null}} */
export function saveMaterialInventory(inventory) {
  try {
    localStorage.setItem(materialStorageKey, JSON.stringify(inventory ?? {}));
    return { saved: true, error: null };
  } catch (error) {
    return { saved: false, error: error.message };
  }
}

/** Load custom formation templates from local storage. @returns {object[]} */
export function loadCustomTemplates() {
  try {
    const raw = localStorage.getItem(templateStorageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data)
      ? data.filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Store custom formation templates. @param {object[]} templates @returns {{saved: boolean, error: string | null}} */
export function saveCustomTemplates(templates) {
  try {
    localStorage.setItem(templateStorageKey, JSON.stringify(templates ?? []));
    return { saved: true, error: null };
  } catch (error) {
    return { saved: false, error: error.message };
  }
}

/** Load display preferences independently of roster data. Holds `{ language, region }`; `region` is added for CN/Global switching and saved through `region.js`. @returns {object} */
export function loadPreferences() {
  try {
    const preferences = JSON.parse(localStorage.getItem(preferencesStorageKey) ?? '{}');
    return preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};
  } catch {
    return {};
  }
}

/** Store non-sensitive display preferences on this device. @param {object} preferences @returns {boolean} */
export function savePreferences(preferences) {
  try {
    localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

/** Load stage strategy memos (stageId -> { text, updatedAt }) from local storage. @returns {Record<string, {text: string, updatedAt: string}>} */
export function loadMemos() {
  try {
    const raw = localStorage.getItem(memoStorageKey);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const memos = Object.create(null);
    for (const [stageId, entry] of Object.entries(data)) {
      if (stageId && entry && typeof entry === 'object' && typeof entry.text === 'string') {
        memos[stageId] = { text: entry.text, updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '' };
      }
    }
    return memos;
  } catch {
    return {};
  }
}

/** Store stage strategy memos. @param {Record<string, {text: string, updatedAt: string}>} memos @returns {{saved: boolean, error: string | null}} */
export function saveMemos(memos) {
  try {
    localStorage.setItem(memoStorageKey, JSON.stringify(memos ?? {}));
    return { saved: true, error: null };
  } catch (error) {
    return { saved: false, error: error.message };
  }
}
