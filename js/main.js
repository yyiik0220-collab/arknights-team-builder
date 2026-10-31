import { loadCoreMasterData, loadStageData, loadMaterialsData, loadRecruitmentData } from './modules/data-loader.js';
import { initializeNavigation } from './modules/navigation.js';
import { backupUserData, clearUserData as clearStoredUserData, loadUserData, saveUserData } from './modules/storage.js';
import { updateState } from './modules/app-state.js';
import { initializeImportExport } from './modules/import-export.js';
import { initializeRosterUI } from './modules/roster-ui.js';
import { initializeDatabaseUI } from './modules/database-ui.js';
import { initializeI18n, t } from './modules/i18n.js';
import { initializeRegion, getRegion, onRegionChange, setupRegionSelector } from './modules/region.js';
import { initializeTheme, setupThemeSelector } from './modules/theme.js';
import { renderMasterSummary, setStatus } from './modules/ui.js';
import { decodeTeam, parseMemoPayloadFromUrl, parseTeamPayloadFromUrl } from './modules/team-share.js';
import { initializePwa } from './modules/pwa.js';

let storedUserData = null;
let core = null;           // UI向けマスターデータ（operators/scoring/regions/activeRegion + 遅延ロード後の stages）
let allOperators = null;   // 検証用の全量（CN基準。UIの core.operators はフィルタ済み）
let userData = null;
let storageError = null;
let rosterUI = null;
let settingsUI = null;
let templates = [];
let stagesLoaded = false;
let materialsLoaded = false;
let recruitmentLoaded = false;

async function initializeApp() {
  await initializeI18n();
  initializePwa();
  initializeRegion();
  // 共有 URL（?team=...）で開かれた場合は、ナビゲーション初期化前にステージ画面へ誘導する。
  // 編成の復号自体はステージデータ読込後（ensureStagesLoaded 内）に行う。
  if (parseTeamPayloadFromUrl()) window.location.hash = '#stages';
  initializeNavigation();
  // テーマは prefs.theme から復元し、data-theme / meta theme-color を同期する。
  // 選択UIは設定画面に置く（language / region と同じセレクタ形式）。
  initializeTheme();
  setupThemeSelector();
  // リージョン変更時はページを再読込して全UIをクリーンに再初期化する。
  // 各UI初期化は永続DOMノードへイベントリスナーを付与するため、同一ページ内で再実行すると
  // リスナーが二重登録される（エクスポートの二重ダウンロード等の不具合）を避ける。
  // roster / リージョン / 言語は localStorage、表示ビューは URL ハッシュに保存されるため、
  // 再読込しても状態は失われない。
  onRegionChange(() => window.location.reload());
  setStatus('status.loading');
  await loadAndRenderCore();
}

async function loadAndRenderCore() {
  storedUserData = loadUserData();
  userData = storedUserData.data ?? { schemaVersion: 1, roster: [] };
  storageError = storedUserData.error;
  try {
    const coreData = await loadCoreMasterData({ region: getRegion() });
    allOperators = coreData.allOperators;
    core = {
      operators: coreData.operators,
      scoring: coreData.scoring,
      regions: coreData.regions,
      activeRegion: coreData.activeRegion
    };
    renderCore();
    setupLazyLoaders();
  } catch (error) {
    setStatus('status.loadError', { error: error.message });
  }
}

function renderCore() {
  // roster はリージョン非依存の全件保存のまま維持する（§3.7: データ消失を防ぐ）。
  // 未実装オペは operators/stages がデータローダー側でフィルタ済みのため、
  // 各UIでは表示・計算から自然に除外される（CNへ戻せば再表示される）。
  updateState({ masterData: core, roster: userData.roster, region: getRegion(), activeRegion: core.activeRegion });
  renderMasterSummary(core);
  setupRegionSelector(core.regions);
  rosterUI = initializeRosterUI({
    operators: core.operators.operators,
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
  initializeDatabaseUI({
    operators: core.operators.operators,
    scoring: core.scoring
  });
  settingsUI = initializeImportExport({
    operators: core.operators.operators,
    gameVersion: core.activeRegion.gameVersion,
    region: getRegion(),
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
  updateStatusLoaded();
}

function refreshSettingsSummary() {
  settingsUI?.refresh();
}

function updateStatusLoaded() {
  setStatus('status.loaded', {
    operators: core.operators.operators.length,
    // ステージ未ロード時は省略記号で示し、ロード後に再描画して実数へ更新する。
    stages: core.stages?.stages?.length ?? '…',
    warning: () => storageError ? ` ${t('status.storageWarning', { error: storageError })}` : ''
  });
}

/** ステージ・育成優先度ビューに必要なデータ（stages.json + templates.json）を初回表示時に遅延ロードする。 */
async function ensureStagesLoaded() {
  if (stagesLoaded) return;
  stagesLoaded = true;
  try {
    const stages = await loadStageData({
      regions: core.regions,
      allOperators,
      scoring: core.scoring,
      activeRegion: core.activeRegion
    });
    // ステージ・育成優先度ビューに必要なUIモジュールを初回表示時に遅延ロードする。
    // （build.mjs が本番ビルドでこれらを単一チャンクへまとめ、初期表示のJS量を削減する）
    const [{ initializeGrowthUI }, { initializeStagesUI }, { loadTemplates }] = await Promise.all([
      import('./modules/growth-ui.js'),
      import('./modules/stages.js'),
      import('./modules/templates.js')
    ]);
    // テンプレートは補助データのため、読み込み失敗時は空配列へフォールバックして既存機能を維持する。
    try {
      templates = await loadTemplates();
    } catch (error) {
      console.warn('テンプレートを読み込めませんでした:', error);
    }
    core = { ...core, stages };
    updateState({ masterData: core });
    renderMasterSummary(core);
    updateStatusLoaded();
    const sharedTeam = decodeTeam(parseTeamPayloadFromUrl(), {
      operators: core.operators.operators,
      stages: core.stages.stages
    });
    // 共有メモは共有編成と共に届く前提。編成が無い URL では読み取らない。
    const sharedMemo = sharedTeam ? parseMemoPayloadFromUrl() : '';
    initializeGrowthUI({
      operators: core.operators.operators,
      stages: core.stages.stages,
      scoring: core.scoring,
      roster: userData.roster
    });
    initializeStagesUI({
      stages: core.stages.stages,
      operators: core.operators.operators,
      scoring: core.scoring,
      roster: userData.roster,
      templates,
      sharedTeam,
      sharedMemo
    });
  } catch (error) {
    setStatus('status.loadError', { error: error.message });
  }
}

/** 素材計算ビューに必要なデータ（materials.json）を初回表示時に遅延ロードする。 */
async function ensureMaterialsLoaded() {
  if (materialsLoaded) return;
  materialsLoaded = true;
  try {
    const materials = await loadMaterialsData();
    // 素材計算ビューに必要なUIモジュールを初回表示時に遅延ロードする。
    const { initializeMaterialsUI } = await import('./modules/materials-ui.js');
    initializeMaterialsUI({
      operators: core.operators.operators,
      materials: materials.materials
    });
  } catch (error) {
    setStatus('status.loadError', { error: error.message });
  }
}

/** 公開求人ビューに必要なデータ（recruitment.json）を初回表示時に遅延ロードする。 */
async function ensureRecruitmentLoaded() {
  if (recruitmentLoaded) return;
  recruitmentLoaded = true;
  try {
    const recruitment = await loadRecruitmentData();
    // リージョン別の公開求人プール（regions 配列）で絞り込む。
    const operators = recruitment.operators.filter((operator) => operator.regions.includes(getRegion()));
    const { initializeRecruitmentUI } = await import('./modules/recruitment-ui.js');
    initializeRecruitmentUI({
      operators,
      tags: recruitment.tags,
      tagCategories: recruitment.tagCategories
    });
  } catch (error) {
    setStatus('status.loadError', { error: error.message });
  }
}

// ビュールート → 遅延ローダーの対応表。初期表示に不要なデータを持つビューだけを対象にする。
const lazyLoaders = {
  stages: ensureStagesLoaded,
  growth: ensureStagesLoaded,
  materials: ensureMaterialsLoaded,
  recruitment: ensureRecruitmentLoaded
};

function triggerLazyLoad() {
  const route = (window.location.hash || '').replace(/^#\/?/, '').split('/')[0];
  const loader = lazyLoaders[route];
  if (loader) loader();
}

function setupLazyLoaders() {
  window.addEventListener('hashchange', triggerLazyLoad);
  // 直接 #stages / #materials で開かれた場合（共有URL等）にも初回実行する。
  triggerLazyLoad();
}

initializeApp();
