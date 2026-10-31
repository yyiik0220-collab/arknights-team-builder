// リージョン（大陸版 CN / グローバル版 Global）の状態管理と切替ロジック。
// 表示言語（i18n.js）とは独立した設定として prefs.region に保存する（相互に依存しない）。
import { loadPreferences, savePreferences } from './storage.js';
import { onLanguageChange, t } from './i18n.js';

// アプリが対応するリージョンコード。data/regions.json のキーと一致させること。
export const supportedRegions = ['cn', 'global'];

let currentRegion = 'cn';
let lastRegions = null;
let selectorWired = false;
const listeners = new Set();

// 起動時に prefs.region から復元する。未設定・不正値は CN（従来と同じ全量表示）にフォールバック。
export function initializeRegion() {
  const stored = loadPreferences().region;
  currentRegion = supportedRegions.includes(stored) ? stored : 'cn';
  syncSelector();
  return currentRegion;
}

export function getRegion() {
  return currentRegion;
}

// リージョンを切り替え、prefs へ保存し、リスナー（main.js の再読込・再描画）へ通知する。
// 言語設定（prefs.language）には触れないため、リージョンと言語は独立に保持される。
export function setRegion(region) {
  if (!supportedRegions.includes(region) || region === currentRegion) return false;
  const saved = savePreferences({ ...loadPreferences(), region });
  if (!saved) {
    syncSelector();
    return false;
  }
  currentRegion = region;
  syncSelector();
  listeners.forEach((listener) => listener(currentRegion));
  return true;
}

export function onRegionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function syncSelector() {
  const selector = document.querySelector('#region-select');
  if (selector) selector.value = currentRegion;
}

// regions.json のルート（{ schemaVersion, defaultRegion, regions, ... }）と、
// コード→定義マップ（regions.regions）のどちらを受け取っても、コード→定義マップへ
// 正規化して返す。main.js はルートを渡すため、呼び出し側の形に依存せず地域マップを
// 取り出せる（単体テスト対象の純関数）。
export function resolveRegionMap(regions) {
  return regions?.regions ?? regions ?? {};
}

// ヘッダーのリージョンセレクタを regions.json の定義から動的生成し、
// change イベントと現在値の表示を接続する。将来リージョンを増やす場合は regions.json に
// キーを足すだけで追従する（オプションのハードコードを避ける）。
export function setupRegionSelector(regions) {
  lastRegions = resolveRegionMap(regions);
  const selector = document.querySelector('#region-select');
  if (!selector) return;
  selector.replaceChildren(...Object.entries(lastRegions).map(([code]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = t(`region.${code}`);
    return option;
  }));
  selector.value = currentRegion;
  if (!selectorWired) {
    selectorWired = true;
    selector.addEventListener('change', () => {
      const config = lastRegions?.[selector.value];
      const changed = setRegion(selector.value);
      const feedback = document.querySelector('#region-feedback');
      if (feedback && changed) feedback.textContent = t('region.changed', { gameVersion: config?.gameVersion ?? '' });
    });
    // 表示言語が変わったら、セレクタの地域名ラベルと設定画面の注記を再描画する。
    onLanguageChange(() => {
      if (lastRegions) setupRegionSelector(lastRegions);
      renderRegionSummary();
    });
  }
  renderRegionSummary();
}

// 設定画面のリージョン情報（地域名・ゲーム内バージョン・未実装の非表示件数）を更新する。
export function renderRegionSummary() {
  const config = lastRegions?.[currentRegion];
  const summary = document.querySelector('#settings-region');
  if (summary && config) {
    summary.textContent = `${t(`region.${config.code}`)} · ${t('region.gameVersion')} ${config.gameVersion}`;
  }
  const hiddenNote = document.querySelector('#settings-region-hidden');
  if (hiddenNote && config) {
    const operators = config.unreleasedOperatorIds?.length ?? 0;
    const stages = config.unreleasedStageIds?.length ?? 0;
    hiddenNote.textContent = t('region.unreleasedHidden', { operators, stages });
    hiddenNote.hidden = (operators + stages) === 0;
  }
}
