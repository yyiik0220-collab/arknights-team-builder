const userStorageKey = 'arknights-team-builder:user:v1';
const preferencesStorageKey = 'arknights-team-builder:prefs:v1';
const backupStorageKey = 'arknights-team-builder:backup:v1';

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
    return { cleared: true, error: null };
  } catch (error) {
    return { cleared: false, error: error.message };
  }
}

/** Load display preferences independently of roster data. @returns {object} */
export function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(preferencesStorageKey) ?? '{}');
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
