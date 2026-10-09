import { loadPreferences, savePreferences } from './storage.js';

export const supportedLanguages = ['ja', 'zh-CN', 'ko', 'en'];
export const languageLabels = {
  ja: '日本語',
  'zh-CN': '简体中文',
  ko: '한국어',
  en: 'English'
};

let translations = {};
let currentLanguage = 'ja';
const listeners = new Set();

export async function initializeI18n() {
  const response = await fetch(new URL('../../data/i18n.json', import.meta.url));
  if (!response.ok) throw new Error(`data/i18n.json (${response.status})`);
  translations = await response.json();
  const storedLanguage = loadPreferences().language;
  currentLanguage = supportedLanguages.includes(storedLanguage) ? storedLanguage : 'ja';
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
