import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBrowserLanguage } from '../js/modules/i18n.js';

// 初回アクセス時のブラウザ言語自動検出（navigator.language / languages → 対応言語コード）
// を保証する回帰テスト。保存済み言語が無い場合のみ、この関数の結果が初期言語に使われる。

test('maps regional variants to the supported base language', () => {
  assert.equal(resolveBrowserLanguage('en-US'), 'en');
  assert.equal(resolveBrowserLanguage('en-GB'), 'en');
  assert.equal(resolveBrowserLanguage('ja-JP'), 'ja');
  assert.equal(resolveBrowserLanguage('ja'), 'ja');
  assert.equal(resolveBrowserLanguage('ko-KR'), 'ko');
});

test('maps all Chinese variants to the single simplified-Chinese locale', () => {
  assert.equal(resolveBrowserLanguage('zh-CN'), 'zh-CN');
  assert.equal(resolveBrowserLanguage('zh-SG'), 'zh-CN');
  assert.equal(resolveBrowserLanguage('zh-TW'), 'zh-CN');
  assert.equal(resolveBrowserLanguage('zh-HK'), 'zh-CN');
  assert.equal(resolveBrowserLanguage('zh-Hant-TW'), 'zh-CN');
});

test('is case- and whitespace-insensitive', () => {
  assert.equal(resolveBrowserLanguage('EN-gb'), 'en');
  assert.equal(resolveBrowserLanguage('  ko  '), 'ko');
});

test('falls back to ja for unsupported or empty input', () => {
  assert.equal(resolveBrowserLanguage('fr-FR'), 'ja');
  assert.equal(resolveBrowserLanguage('de-DE'), 'ja');
  assert.equal(resolveBrowserLanguage(''), 'ja');
  assert.equal(resolveBrowserLanguage(undefined), 'ja');
  assert.equal(resolveBrowserLanguage(null), 'ja');
});

test('uses navigator.languages fallback list in order', () => {
  assert.equal(resolveBrowserLanguage('fr-FR', ['ko-KR', 'en-US']), 'ko');
  assert.equal(resolveBrowserLanguage(undefined, ['en-US', 'ja-JP']), 'en');
  assert.equal(resolveBrowserLanguage('pt-BR', []), 'ja');
});
