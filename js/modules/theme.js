// テーマ（ダーク / ライト / 端末設定に従う）の状態管理。
// prefs.theme に保存し、<html data-theme="..."> と meta[name=theme-color] を同期する。
// 表示言語（i18n.js）やリージョン（region.js）とは独立した表示設定として prefs に同居する。
import { loadPreferences, savePreferences } from './storage.js';
import { onLanguageChange, t } from './i18n.js';

// 対応するテーマ値。'system' は端末の prefers-color-scheme に追従する。
export const supportedThemes = ['system', 'dark', 'light'];

let currentTheme = 'system';
let selectorWired = false;

// 端末の配色設定を読み取り、実際の配色（dark / light）へ解決する。
// 未対応ブラウザでは既定のダークへフォールバックする。
function systemPreference() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// 選択値（system / dark / light）を実際の配色（dark / light）へ解決する。
export function resolveTheme(theme) {
  return theme === 'system' ? systemPreference() : theme;
}

// data-theme 属性とテーマカラーを実際の配色に合わせて更新する。
// data-theme には 'dark' / 'light' のどちらかを設定する（CSS は html[data-theme="light"] で上書き）。
function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#EEF1F2' : '#0C1216';
}

// 起動時に prefs.theme から復元する。未設定・不正値は 'system'（端末設定に従う）へフォールバック。
export function initializeTheme() {
  const stored = loadPreferences().theme;
  currentTheme = supportedThemes.includes(stored) ? stored : 'system';
  applyTheme(currentTheme);
  syncSelector();
  // 'system' 選択中のみ、端末の配色設定変更に追従する。
  window.matchMedia?.('(prefers-color-scheme: light)')?.addEventListener?.('change', () => {
    if (currentTheme === 'system') applyTheme(currentTheme);
  });
  return currentTheme;
}

export function getTheme() {
  return currentTheme;
}

// テーマを切り替え、prefs へ保存し、表示へ反映する。同じ値への再設定は無視する。
export function setTheme(theme) {
  if (!supportedThemes.includes(theme) || theme === currentTheme) return false;
  currentTheme = theme;
  const saved = savePreferences({ ...loadPreferences(), theme });
  applyTheme(currentTheme);
  syncSelector();
  return saved;
}

function syncSelector() {
  const selector = document.querySelector('#theme-select');
  if (selector) selector.value = currentTheme;
}

// ヘッダー/設定画面のテーマセレクタへオプションを動的生成し、change イベントを接続する。
// オプションは固定3種のため、文言を i18n キー（settings.theme.system / dark / light）から解決する。
export function setupThemeSelector() {
  const selector = document.querySelector('#theme-select');
  if (!selector) return;
  const renderOptions = () => {
    selector.replaceChildren(...supportedThemes.map((theme) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = t(`settings.theme.${theme}`);
      return option;
    }));
    selector.value = currentTheme;
  };
  renderOptions();
  if (!selectorWired) {
    selectorWired = true;
    selector.addEventListener('change', () => {
      const saved = setTheme(selector.value);
      const feedback = document.querySelector('#theme-feedback');
      if (feedback) feedback.textContent = t(saved ? 'settings.themeSaved' : 'settings.themeSaveFailed');
    });
    // 表示言語が変わったらオプション文言を再描画する。
    onLanguageChange(renderOptions);
  }
}
