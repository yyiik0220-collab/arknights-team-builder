/**
 * team-share.js — 編成（ステージ + 12枠のオペレーターと配置順）の共有機能。
 *
 * 機能:
 *   - 編成をコンパクトな Base64URL 文字列へ符号化 / 復号（URLパラメータ用）。
 *   - 共有 URL の生成・クリップボードコピー。
 *   - QR コード（qr.js の自前エンコーダー）の描画・ダウンロード。
 *   - X（旧Twitter）/ LINE への共有。
 *
 * 符号化形式（バイナリ → Base64URL）:
 *   [0] version=1
 *   [1] ステージのインデックス（ID をソートした正準順序）
 *   [2] オペレーター数 n（0〜12）
 *   [3..] 各オペレーターのインデックス（配置順 = スロット順）
 *
 * インデックスは ID のソート順に基づくため、data/operators.json や stages.json の
 * 配列順が将来変わっても、ID さえ変わらなければ安定して復号できる。
 */
import { getLanguage, getOperatorName, localizeMasterValue, t } from './i18n.js';
import { renderQrCanvas } from './qr.js';

const TEAM_QUERY_KEY = 'team';
const MEMO_QUERY_KEY = 'memo';
const TEAM_FORMAT_VERSION = 1;
const MAX_TEAM_SIZE = 12;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// ---- Base64URL（+ / = を URL 安全な文字へ変換） -------------------------------

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = [];
  for (let i = 0; i < binary.length; i += 1) bytes.push(binary.charCodeAt(i));
  return bytes;
}

// ---- インデックス変換 ----------------------------------------------------------

/** ID をソートした正準順序のインデックス対応表を作る。 */
function buildIndexMaps({ operators, stages }) {
  const operatorIds = [...new Set((operators ?? []).map((operator) => operator.id))].sort();
  const stageIds = [...new Set((stages ?? []).map((stage) => stage.id))].sort();
  return {
    operatorIds,
    stageIds,
    operatorIndex: new Map(operatorIds.map((id, index) => [id, index])),
    stageIndex: new Map(stageIds.map((id, index) => [id, index]))
  };
}

/**
 * 編成をコンパクトな文字列へ符号化する。
 * @param {{stageId: string, operatorIds: string[], operators: object[], stages: object[]}} options
 * @returns {string}
 */
export function encodeTeam({ stageId, operatorIds, operators, stages }) {
  const { operatorIndex, stageIndex } = buildIndexMaps({ operators, stages });
  const count = Math.min(MAX_TEAM_SIZE, operatorIds.length);
  const bytes = [TEAM_FORMAT_VERSION, stageIndex.get(stageId) ?? 0, count];
  for (let i = 0; i < count; i += 1) bytes.push(operatorIndex.get(operatorIds[i]) ?? 0);
  return bytesToBase64Url(bytes);
}

/**
 * 文字列を編成へ復号する。形式不正・範囲外インデックスは null を返す。
 * @param {string | null} payload
 * @param {{operators: object[], stages: object[]}} options
 * @returns {{stageId: string, operatorIds: string[]} | null}
 */
export function decodeTeam(payload, { operators, stages }) {
  if (!payload) return null;
  let bytes;
  try {
    bytes = base64UrlToBytes(payload);
  } catch {
    return null;
  }
  if (!bytes || bytes.length < 3 || bytes[0] !== TEAM_FORMAT_VERSION) return null;
  const { operatorIds, stageIds } = buildIndexMaps({ operators, stages });
  const stageIndex = bytes[1];
  const count = bytes[2];
  if (stageIndex < 0 || stageIndex >= stageIds.length) return null;
  if (count < 0 || count > MAX_TEAM_SIZE || bytes.length !== 3 + count) return null;
  const decodedOperatorIds = [];
  for (let i = 0; i < count; i += 1) {
    const index = bytes[3 + i];
    if (index < 0 || index >= operatorIds.length) return null;
    decodedOperatorIds.push(operatorIds[index]);
  }
  return { stageId: stageIds[stageIndex], operatorIds: decodedOperatorIds };
}

// ---- URL -----------------------------------------------------------------------

/** 現在のアプリ URL（origin + pathname）を返す。 */
function baseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

/** 編成から共有 URL を組み立てる。memoText があればメモも URL に含める。 */
export function buildShareUrl({ stageId, operatorIds, operators, stages, memoText = '' }) {
  const payload = encodeTeam({ stageId, operatorIds, operators, stages });
  let url = `${baseUrl()}?${TEAM_QUERY_KEY}=${payload}`;
  if (memoText) url += `&${MEMO_QUERY_KEY}=${encodeMemo(memoText)}`;
  return url;
}

/** URL のクエリから編成ペイロードを読み取る。 */
export function parseTeamPayloadFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get(TEAM_QUERY_KEY);
  } catch {
    return null;
  }
}

// ---- メモの符号化（UTF-8 → Base64URL） -------------------------------------

/** メモ本文を URL 安全な Base64URL 文字列へ符号化する。 */
export function encodeMemo(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  return bytesToBase64Url(bytes);
}

/** URL 安全な Base64URL 文字列をメモ本文へ復号する。形式不正時は空文字を返す。 */
export function decodeMemo(payload) {
  if (!payload) return '';
  try {
    const bytes = base64UrlToBytes(payload);
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return '';
  }
}

/** URL のクエリから共有メモを読み取る（未指定時は空文字）。 */
export function parseMemoPayloadFromUrl() {
  try {
    return decodeMemo(new URLSearchParams(window.location.search).get(MEMO_QUERY_KEY));
  } catch {
    return '';
  }
}

// ---- クリップボード -------------------------------------------------------------

/** テキストをクリップボードへコピーする。成功可否を boolean で返す。 */
export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

/** 非セキュア環境向けの execCommand フォールバック。 */
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

// ---- QR / ダウンロード / SNS ----------------------------------------------------

/** 共有 URL から QR コードを描画した Canvas を返す。 */
export function makeQrCanvas(url) {
  return renderQrCanvas(url, { scale: 4, margin: 3 });
}

/** Canvas を PNG としてダウンロードする。 */
export function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  link.click();
}

function openShareWindow(url) {
  window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
}

/** X（旧Twitter）の intent を開く。 */
export function shareToX(shareUrl, text) {
  openShareWindow(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
}

/** LINE の共有ダイアログを開く。 */
export function shareToLine(shareUrl, text) {
  openShareWindow(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
}

// ---- 共有パネル UI --------------------------------------------------------------

/**
 * 共有トリガーボタンと共有パネル（URL・コピー・QR・保存・SNS）を描画して配線する。
 * メモを含めるトグルを持ち、オン時は context.getMemoText() / context.memoText の内容を URL に含める。
 * @param {HTMLElement} container 共有UIを追加する親要素
 * @param {{stageId: string, operatorIds: string[], operators: object[], stages: object[], memoText?: string, getMemoText?: () => string}} context
 */
export function renderSharePanel(container, context) {
  const trigger = makeElement('button', 'button button-secondary share-trigger', t('share.button'));
  trigger.type = 'button';

  const panel = document.createElement('section');
  panel.className = 'share-panel';
  panel.hidden = true;

  const title = makeElement('h4', 'share-title', t('share.title'));
  const urlLabel = makeElement('label', 'share-url-label', t('share.urlLabel'));
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'share-url';
  urlInput.readOnly = true;
  urlLabel.append(urlInput);

  // メモを含めて共有するトグル（現在のステージのメモを随時取得する）。
  const memoToggle = document.createElement('label');
  memoToggle.className = 'share-memo-toggle';
  const memoCheckbox = document.createElement('input');
  memoCheckbox.type = 'checkbox';
  memoCheckbox.className = 'share-memo-checkbox';
  memoToggle.append(memoCheckbox, makeElement('span', '', t('share.includeMemo')));

  const actions = makeElement('div', 'share-actions');
  const copyButton = makeElement('button', 'button button-primary', t('share.copy'));
  copyButton.type = 'button';
  const downloadButton = makeElement('button', 'button button-secondary', t('share.download'));
  downloadButton.type = 'button';
  const xButton = makeElement('button', 'button button-secondary', t('share.shareX'));
  xButton.type = 'button';
  const lineButton = makeElement('button', 'button button-secondary', t('share.shareLine'));
  lineButton.type = 'button';
  actions.append(copyButton, downloadButton, xButton, lineButton);

  const qrWrap = makeElement('div', 'share-qr-wrap');
  const feedback = makeElement('p', 'share-feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');

  panel.append(title, urlLabel, memoToggle, actions, qrWrap, feedback);
  container.append(trigger, panel);

  // 現在のメモ本文を取得する（getter 優先。編成生成後のメモ編集にも追従させる）。
  const currentMemo = () => (typeof context.getMemoText === 'function' ? context.getMemoText() ?? '' : context.memoText ?? '');

  let includeMemo = false;
  let shareUrl = '';

  const resolveUrl = () => {
    shareUrl = buildShareUrl({ ...context, memoText: includeMemo ? currentMemo() : '' });
    return shareUrl;
  };

  // QR は初回表示時に一度だけ生成する（Canvas 描画は比較的コストが高い）。
  // メモトグル切替時は URL が変わるため再生成する。
  const ensureQr = () => {
    if (qrWrap.querySelector('canvas')) return;
    const canvas = makeQrCanvas(resolveUrl());
    if (canvas) qrWrap.append(canvas);
  };

  const openPanel = () => {
    urlInput.value = resolveUrl();
    panel.hidden = false;
    ensureQr();
    copyToClipboard(shareUrl).then((ok) => {
      feedback.textContent = ok ? t('share.copied') : t('share.copyFailed');
    });
  };

  trigger.addEventListener('click', openPanel);
  memoCheckbox.addEventListener('change', () => {
    includeMemo = memoCheckbox.checked;
    shareUrl = '';
    urlInput.value = resolveUrl();
    qrWrap.replaceChildren();
    ensureQr();
  });
  copyButton.addEventListener('click', () => {
    copyToClipboard(resolveUrl()).then((ok) => {
      feedback.textContent = ok ? t('share.copied') : t('share.copyFailed');
    });
  });
  downloadButton.addEventListener('click', () => {
    const canvas = qrWrap.querySelector('canvas');
    if (canvas) downloadCanvas(canvas, `arknights-team-${context.stageId}.png`);
  });
  xButton.addEventListener('click', () => shareToX(resolveUrl(), t('share.shareText')));
  lineButton.addEventListener('click', () => shareToLine(resolveUrl(), t('share.shareText')));

  return { trigger, panel };
}

// ---- 共有された編成の表示 -------------------------------------------------------

function stageDisplayName(stage) {
  const translated = t(`stage.${stage.id}`);
  return translated === `stage.${stage.id}` ? stage.nameI18n?.[getLanguage()] ?? stage.nameI18n?.en ?? stage.name : translated;
}

/**
 * URL から復元した共有編成（ステージ + スロット順のオペレーター）を読み取り専用で描画する。
 * 受信者の所持状況に依存せず、指定されたオペレーターをそのまま表示する。
 * @param {HTMLElement} container
 * @param {{stageId: string, operatorIds: string[], operators: object[], stages: object[], getMemoText?: () => string}} context
 */
export function renderSharedTeam(container, { stageId, operatorIds, operators, stages, getMemoText }) {
  container.replaceChildren();
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const stage = stages.find((entry) => entry.id === stageId);

  const banner = makeElement('div', 'shared-banner');
  banner.append(makeElement('span', 'shared-kicker', t('share.sharedFormation')));
  if (stage) banner.append(makeElement('p', 'shared-stage', `${t('share.stageLabel')}: ${stageDisplayName(stage)}`));

  const list = document.createElement('ol');
  list.className = 'proposal-team-list shared-team-list';
  operatorIds.forEach((operatorId, index) => {
    const operator = operatorById.get(operatorId);
    const item = document.createElement('li');
    item.className = 'proposal-member';
    const header = makeElement('div', 'proposal-member-header');
    header.append(makeElement('span', 'proposal-slot', t('proposal.slot', { slot: index + 1 })));
    item.append(header);
    item.append(makeElement('h4', '', operator ? getOperatorName(operator) : operatorId));
    if (operator) {
      item.append(makeElement('p', 'proposal-operator-class', `${localizeMasterValue('class', operator.class)} / ${localizeMasterValue('subclass', operator.subclass)}`));
    }
    list.append(item);
  });

  container.append(banner, list);
  renderSharePanel(container, { stageId, operatorIds, operators, stages, getMemoText });
}
