import { getLanguage, onLanguageChange, t } from './i18n.js';

const maxImportBytes = 1_000_000;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

/** Export only the local roster data with its format and master-data metadata. @param {object} userData @param {string} gameVersion @param {string} region @param {Date} date @returns {string} */
export function exportUserData(userData, gameVersion = 'unknown', region = 'cn', date = new Date()) {
  return JSON.stringify({
    schemaVersion: 1,
    exportDate: date.toISOString(),
    region,
    gameVersion,
    roster: userData.roster
  }, null, 2);
}

/** Validate an import without changing the current user data. @param {string} text @param {Set<string>} knownOperatorIds @returns {{valid: boolean, roster: object[], errors: string[], unknownIds: string[]}} */
export function validateImport(text, knownOperatorIds) {
  if (new TextEncoder().encode(text).byteLength > maxImportBytes) {
    return { valid: false, roster: [], errors: [t('settings.fileTooLarge')], unknownIds: [] };
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(t('settings.error.topLevel'));
    if (data.schemaVersion !== 1) throw new Error(t('settings.error.schema', { version: String(data.schemaVersion ?? t('settings.error.missing')), supported: 1 }));
    if (!Array.isArray(data.roster)) throw new Error(t('settings.error.rosterMissing'));

    const errors = [];
    const seen = new Set();
    const unknownIds = new Set();
    data.roster.forEach((entry, index) => {
      const position = t('settings.position', { index: index + 1 });
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(t('settings.error.entryObject', { position }));
        return;
      }
      if (typeof entry.operatorId !== 'string' || !entry.operatorId.trim()) {
        errors.push(t('settings.error.operatorId', { position }));
        return;
      }
      if (seen.has(entry.operatorId)) errors.push(t('settings.error.duplicateId', { position }));
      seen.add(entry.operatorId);
      if (!knownOperatorIds.has(entry.operatorId)) unknownIds.add(entry.operatorId);
      if (entry.owned !== undefined && typeof entry.owned !== 'boolean') errors.push(t('settings.error.owned', { position }));
      if (entry.promotionPhase !== undefined && !isIntegerInRange(entry.promotionPhase, 0, 2)) errors.push(t('settings.error.promotion', { position }));
      if (entry.level !== undefined && !isIntegerInRange(entry.level, 1, 90)) errors.push(t('settings.error.level', { position }));
      for (const [field, minimum, maximum, labelKey] of [
        ['skillLevels', 1, 7, 'settings.error.skill'],
        ['masteryLevels', 0, 3, 'settings.error.mastery'],
        ['moduleLevels', 0, 3, 'settings.error.module']
      ]) {
        if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some((value) => !isIntegerInRange(value, minimum, maximum)))) {
          errors.push(t(labelKey, { position }));
        }
      }
    });
    const roster = errors.length ? [] : data.roster.map((entry) => ({
      operatorId: entry.operatorId,
      owned: entry.owned ?? true,
      promotionPhase: entry.promotionPhase ?? 0,
      level: entry.level ?? 1,
      skillLevels: entry.skillLevels ?? [],
      masteryLevels: entry.masteryLevels ?? [],
      moduleLevels: entry.moduleLevels ?? []
    }));
    return { valid: errors.length === 0, roster, errors, unknownIds: [...unknownIds] };
  } catch (error) {
    return { valid: false, roster: [], errors: [error.message], unknownIds: [] };
  }
}

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return t('settings.noRecord');
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? t('settings.noRecord') : new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Connect settings actions for local JSON backup, restoration, and data clearing. @param {object} options */
export function initializeImportExport({ operators, gameVersion, region, getUserData, onUserDataChange, backupUserData, clearUserData }) {
  const exportButton = document.querySelector('#export-data');
  const fileInput = document.querySelector('#import-file');
  const preview = document.querySelector('#import-preview');
  const previewSummary = document.querySelector('#import-preview-summary');
  const feedback = document.querySelector('#import-export-feedback');
  const clearButton = document.querySelector('#clear-data');
  const keepUnknown = document.querySelector('#import-keep-unknown');
  const applyButton = document.querySelector('#apply-import');
  const cancelButton = document.querySelector('#cancel-import');
  const registrationCount = document.querySelector('#settings-registration-count');
  const updatedAt = document.querySelector('#settings-updated-at');
  if (![exportButton, fileInput, preview, previewSummary, feedback, clearButton, keepUnknown, applyButton, cancelButton, registrationCount, updatedAt].every(Boolean)) return;

  const knownOperatorIds = new Set(operators.map((operator) => operator.id));
  let pendingImport = null;

  const renderPreviewSummary = () => {
    if (!pendingImport) return;
    const details = [
      makeElement('p', '', t('settings.importCount', { count: pendingImport.roster.length })),
      makeElement('p', '', t('settings.knownCount', { count: pendingImport.roster.length - pendingImport.unknownIds.length })),
      makeElement('p', '', t('settings.unknownCount', { count: pendingImport.unknownIds.length }))
    ];
    if (pendingImport.unknownIds.length) {
      const ids = new Intl.ListFormat(getLanguage(), { style: 'short', type: 'conjunction' }).format(pendingImport.unknownIds);
      details.push(makeElement('p', 'import-warning', t('settings.unknownIds', { ids })));
    }
    previewSummary.replaceChildren(...details);
  };

  const renderSummary = () => {
    const data = getUserData();
    const ownedCount = data.roster.filter((entry) => entry.owned !== false).length;
    registrationCount.textContent = t('settings.people', { count: ownedCount });
    updatedAt.textContent = formatUpdatedAt(data.updatedAt);
    exportButton.disabled = ownedCount === 0;
    exportButton.setAttribute('aria-describedby', 'export-empty-guidance');
    document.querySelector('#export-empty-guidance').textContent = ownedCount === 0
      ? t('settings.noOwnedGuidance')
      : t('settings.exportGuidance');
  };

  const closePreview = () => {
    if (preview.hidden) return;
    pendingImport = null;
    preview.hidden = true;
    previewSummary.replaceChildren();
    fileInput.value = '';
    keepUnknown.checked = false;
    document.querySelector('input[name="import-strategy"][value="replace"]').checked = true;
  };

  const resetPreview = () => {
    pendingImport = null;
    preview.hidden = true;
    previewSummary.replaceChildren();
    keepUnknown.checked = false;
    document.querySelector('input[name="import-strategy"][value="replace"]').checked = true;
  };

  exportButton.addEventListener('click', () => {
    const data = getUserData();
    if (!data.roster.some((entry) => entry.owned !== false)) return;
    const blob = new Blob([exportUserData(data, gameVersion, region)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    link.href = url;
    link.download = `arknights-roster-${date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    feedback.textContent = t('settings.exportSuccess');
  });

  fileInput.addEventListener('change', () => {
    resetPreview();
    feedback.textContent = '';
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > maxImportBytes) {
      feedback.textContent = t('settings.fileTooLarge');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const result = validateImport(String(reader.result ?? ''), knownOperatorIds);
      if (!result.valid) {
        feedback.textContent = t('settings.invalidImport', { errors: result.errors.join(' ') });
        fileInput.value = '';
        return;
      }
      pendingImport = result;
      renderPreviewSummary();
      preview.hidden = false;
      applyButton.disabled = false;
    });
    reader.addEventListener('error', () => {
      feedback.textContent = t('settings.readError');
      fileInput.value = '';
    });
    reader.readAsText(file, 'UTF-8');
  });

  keepUnknown.addEventListener('change', () => {
    keepUnknown.setAttribute('aria-describedby', 'import-unknown-guidance');
  });

  applyButton.addEventListener('click', () => {
    if (!pendingImport) return;
    const strategy = document.querySelector('input[name="import-strategy"]:checked')?.value;
    if (strategy !== 'replace' && strategy !== 'merge') {
      feedback.textContent = t('settings.chooseStrategy');
      return;
    }
    const importedRoster = pendingImport.roster.filter((entry) => keepUnknown.checked || knownOperatorIds.has(entry.operatorId));
    const existing = getUserData();
    const roster = strategy === 'replace'
      ? importedRoster
      : [...new Map([...existing.roster, ...importedRoster].map((entry) => [entry.operatorId, entry])).values()];
    const nextData = { schemaVersion: 1, roster };
    const backup = backupUserData();
    if (!backup.saved) {
      feedback.textContent = t('settings.backupFailure', { error: backup.error ? ` ${backup.error}` : '' });
      return;
    }
    const result = onUserDataChange(nextData);
    if (!result.saved) {
      feedback.textContent = t('settings.saveFailure', { error: result.error ? ` ${result.error}` : '' });
      return;
    }
    feedback.textContent = t('settings.importSuccess', {
      count: roster.length,
      unknown: () => pendingImport.unknownIds.length && !keepUnknown.checked ? t('settings.unknownExcluded') : ''
    });
    closePreview();
    renderSummary();
  });

  cancelButton.addEventListener('click', () => {
    closePreview();
    feedback.textContent = t('settings.cancelled');
  });

  clearButton.addEventListener('click', () => {
    if (!window.confirm(t('settings.clearConfirm'))) return;
    const result = clearUserData();
    if (!result.cleared) {
      feedback.textContent = t('settings.clearFailure', { error: result.error ? ` ${result.error}` : '' });
      return;
    }
    closePreview();
    feedback.textContent = t('settings.clearSuccess');
    renderSummary();
  });

  renderSummary();
  onLanguageChange(() => {
    feedback.textContent = '';
    renderSummary();
    renderPreviewSummary();
  });
  return { refresh: renderSummary };
}
