import { loadPreferences, savePreferences } from './storage.js';

export const supportedLanguages = ['ja', 'zh-CN', 'ko', 'en'];
export const languageLabels = {
  ja: '日本語',
  'zh-CN': '简体中文',
  ko: '한국어',
  en: 'English'
};

// OGP の locale 値（content 属性）は「翻訳文字列」ではなく固定の言語タグなので、
// i18n.json には置かず、ここで言語コード → OGP locale を対応付ける。
const ogLocaleByLanguage = {
  ja: 'ja_JP',
  'zh-CN': 'zh_CN',
  ko: 'ko_KR',
  en: 'en_US'
};

/**
 * ブラウザ言語（navigator.language / languages）を、本アプリが対応する言語コードへ解決する。
 * - zh* はすべて 'zh-CN'（簡体字）へ。本アプリの中国語ロケールは簡体字のみのため、
 *   zh-TW / zh-HK / zh-Hant も同じロケールへフォールバックする（中国語を日本語へ落とさない）。
 * - 対応外・空値はデフォルトの 'ja' へフォールバックする。
 * 引数を取る純関数にすることで Node のテストから navigator 無しで検証できる。
 */
export function resolveBrowserLanguage(navLanguage, navLanguages = []) {
  const candidates = [navLanguage, ...(Array.isArray(navLanguages) ? navLanguages : [])]
    .filter((entry) => typeof entry === 'string' && entry.length > 0)
    .map((entry) => entry.trim().toLowerCase());
  for (const candidate of candidates) {
    if (candidate.startsWith('zh')) return 'zh-CN';
    const primary = candidate.split('-')[0];
    if (primary === 'ja' || primary === 'ko' || primary === 'en') return primary;
  }
  return 'ja';
}

/** 初回アクセス時のブラウザ言語を取得する（保存済み言語が無い場合のフォールバックに使う）。 */
export function detectBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'ja';
  return resolveBrowserLanguage(navigator.language, navigator.languages);
}

let translations = {};
let currentLanguage = 'ja';
const listeners = new Set();

export async function initializeI18n() {
  const response = await fetch(new URL('../../data/i18n.json', import.meta.url));
  if (!response.ok) throw new Error(`data/i18n.json (${response.status})`);
  translations = await response.json();
  const storedLanguage = loadPreferences().language;
  // 保存済み言語（手動変更済み）を最優先。無ければブラウザ言語を自動検出し、対応外は 'ja' へ。
  currentLanguage = supportedLanguages.includes(storedLanguage)
    ? storedLanguage
    : detectBrowserLanguage();
  document.documentElement.lang = currentLanguage;
  translateDocument();
  const selector = document.querySelector('#language-select');
  if (selector) {
    selector.value = currentLanguage;
    selector.addEventListener('change', () => {
      const saved = setLanguage(selector.value);
      const feedback = document.querySelector('#language-feedback');
      if (feedback) feedback.textContent = t(saved ? 'settings.languageSaved' : 'settings.languageSaveFailed');
    });
  }
  return currentLanguage;
}

export function getLanguage() {
  return currentLanguage;
}

export function t(key, values = {}) {
  const message = translations[currentLanguage]?.[key] ?? translations.en?.[key] ?? key;
  return message.replace(/\{\{([\w]+)\}\}/g, (_, name) => String(typeof values[name] === 'function' ? values[name]() : values[name] ?? ''));
}

export function getOperatorName(operator) {
  return operator?.nameI18n?.[currentLanguage]
    || operator?.nameI18n?.en
    || operator?.name
    || '';
}

export function localizeMasterValue(category, value) {
  const key = `${category}.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

export function translateDocument(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((element) => {
    for (const entry of element.dataset.i18nAttr.split(',')) {
      const [attribute, key] = entry.trim().split(':');
      if (attribute && key) element.setAttribute(attribute, t(key));
    }
  });
  document.documentElement.lang = currentLanguage;
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute('content', ogLocaleByLanguage[currentLanguage] ?? ogLocaleByLanguage.ja);
}

export function setLanguage(language) {
  if (!supportedLanguages.includes(language) || language === currentLanguage) return false;
  currentLanguage = language;
  const saved = savePreferences({ ...loadPreferences(), language });
  document.documentElement.lang = currentLanguage;
  translateDocument();
  const selector = document.querySelector('#language-select');
  if (selector) selector.value = currentLanguage;
  listeners.forEach((listener) => listener(currentLanguage));
  return saved;
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
