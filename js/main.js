import { loadMasterData } from './modules/data-loader.js';
import { initializeNavigation } from './modules/navigation.js';
import { backupUserData, clearUserData as clearStoredUserData, loadUserData, saveUserData } from './modules/storage.js';
import { updateState } from './modules/app-state.js';
import { initializeImportExport } from './modules/import-export.js';
import { initializeRosterUI } from './modules/roster-ui.js';
import { initializeGrowthUI } from './modules/growth-ui.js';
import { initializeStagesUI } from './modules/stages.js';
import { initializeDatabaseUI } from './modules/database-ui.js';
import { initializeI18n, t } from './modules/i18n.js';
import { renderMasterSummary, setStatus } from './modules/ui.js';

async function initializeApp() {
  await initializeI18n();
  initializeNavigation();
  setStatus('status.loading');
  const storedUserData = loadUserData();
  let userData = storedUserData.data ?? { schemaVersion: 1, roster: [] };
  let storageError = storedUserData.error;
  updateState({ roster: userData.roster });
  try {
    const masterData = await loadMasterData();
    renderMasterSummary(masterData);
    const rosterUI = initializeRosterUI({
      operators: masterData.operators.operators,
      roster: userData.roster,
      onRosterChange(nextRoster) {
        if (storageError) return { saved: false, error: t('roster.storageBlocked') };
        const result = saveUserData({ roster: nextRoster });
        if (result.saved) {
          userData = loadUserData().data ?? { schemaVersion: 1, roster: nextRoster };
          updateState({ roster: nextRoster });
          refreshSettingsSummary();
        }
        return result;
      }
    });
    initializeGrowthUI({
      operators: masterData.operators.operators,
      stages: masterData.stages.stages,
      scoring: masterData.scoring,
      roster: userData.roster
    });
    initializeStagesUI({
      stages: masterData.stages.stages,
      operators: masterData.operators.operators,
      scoring: masterData.scoring,
      roster: userData.roster
    });
    initializeDatabaseUI({
      operators: masterData.operators.operators,
      scoring: masterData.scoring
    });
    const settingsUI = initializeImportExport({
      operators: masterData.operators.operators,
      gameVersion: masterData.operators.gameVersion,
      getUserData: () => userData,
      backupUserData,
      onUserDataChange(nextData) {
        const result = saveUserData(nextData);
        if (result.saved) {
          userData = loadUserData().data ?? nextData;
          storageError = null;
          updateState({ roster: userData.roster });
          rosterUI?.setRoster(userData.roster);
        }
        return result;
      },
      clearUserData() {
        const result = clearStoredUserData();
        if (result.cleared) {
          userData = { schemaVersion: 1, roster: [] };
          storageError = null;
          updateState({ roster: [] });
          rosterUI?.setRoster([]);
        }
        return result;
      }
    });
    function refreshSettingsSummary() {
      settingsUI?.refresh();
    }
    const operatorCount = masterData.operators.operators.length;
    const stageCount = masterData.stages.stages.length;
    setStatus('status.loaded', {
      operators: operatorCount,
      stages: stageCount,
      warning: () => storageError ? ` ${t('status.storageWarning', { error: storageError })}` : ''
    });
  } catch (error) {
    setStatus('status.loadError', { error: error.message });
  }
}

initializeApp();
