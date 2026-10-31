/**
 * stage-memo.js — ステージ攻略メモの保存・簡易書式レンダリング・編集UI。
 *
 * 要件:
 *   - ステージごとにユーザー自身のメモを LocalStorage へ保存する。
 *   - Markdown風の簡易書式（**太字** / - リスト / 改行）をプレビュー表示する。
 *   - 編集 / プレビューの切替、デバウンス自動保存、手動保存、削除を提供する。
 *   - XSS安全: 一切 innerHTML を使わず、createElement / textContent のみで DOM を構築する。
 *     HTMLタグはテキストとしてそのまま表示され、決して解釈されない。
 *   - 配色は css/components.css の .memo-*（--ak-* トークン）を参照する。
 */
import { t } from './i18n.js';

const AUTO_SAVE_DELAY_MS = 800;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** インラインの **太字** を <strong> に変換しつつ、テキストノードを親へ追加する。 */
function appendInlineText(parent, text) {
  // "**" で分割し、奇数番目を太字として扱う（未対応の記号はそのままテキスト表示）。
  const parts = String(text).split(/\*\*/);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      if (part) parent.append(makeElement('strong', '', part));
    } else if (part) {
      parent.append(document.createTextNode(part));
    }
  });
}

/**
 * 簡易書式（**太字** / "- "・"* " リスト / 改行）を DOM へ安全に描画する。
 * @param {HTMLElement} container 描画先（既存内容は破棄される）
 * @param {string} text メモ本文
 */
export function renderMarkdown(container, text) {
  container.replaceChildren();
  const lines = String(text ?? '').split(/\r?\n/);
  let list = null;
  const flushList = () => {
    if (list) {
      container.append(list);
      list = null;
    }
  };
  for (const rawLine of lines) {
    const listMatch = rawLine.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      if (!list) {
        list = document.createElement('ul');
        list.className = 'memo-preview-list';
      }
      const item = document.createElement('li');
      appendInlineText(item, listMatch[1]);
      list.append(item);
      continue;
    }
    flushList();
    if (!rawLine.trim()) continue; // 空行は段落区切りとして扱い、出力しない。
    const paragraph = document.createElement('p');
    appendInlineText(paragraph, rawLine);
    container.append(paragraph);
  }
  flushList();
}

/**
 * ステージ詳細へ攻略メモの編集UIを描画する。
 * @param {HTMLElement} container 描画先
 * @param {{stageId: string, memoText?: string, sharedMemo?: string, onSave: (stageId: string, text: string) => {saved: boolean, error: string | null}, onDelete: (stageId: string) => {saved: boolean, error: string | null}}} context
 */
export function renderMemoEditor(container, { stageId, memoText = '', sharedMemo = '', onSave, onDelete }) {
  container.replaceChildren();

  const panel = makeElement('section', 'memo-panel');
  panel.append(makeElement('h4', 'memo-title', t('memo.title')));

  // URL から届いた共有メモは読み取り専用で併記する（自分用メモとは別）。
  if (sharedMemo) {
    const shared = makeElement('div', 'memo-shared');
    shared.append(makeElement('span', 'memo-shared-kicker', t('memo.sharedKicker')));
    const sharedPreview = makeElement('div', 'memo-preview');
    renderMarkdown(sharedPreview, sharedMemo);
    shared.append(sharedPreview);
    panel.append(shared);
  }

  // 編集 / プレビュー 切替ツールバー。
  const toolbar = makeElement('div', 'memo-toolbar');
  const editButton = makeElement('button', 'memo-mode is-active', t('memo.edit'));
  editButton.type = 'button';
  const previewButton = makeElement('button', 'memo-mode', t('memo.preview'));
  previewButton.type = 'button';
  const status = makeElement('span', 'memo-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  toolbar.append(editButton, previewButton, status);
  panel.append(toolbar);

  const input = document.createElement('textarea');
  input.className = 'memo-input';
  input.rows = 6;
  input.maxLength = 4000;
  input.value = memoText;
  input.setAttribute('placeholder', t('memo.placeholder'));
  input.setAttribute('aria-label', t('memo.title'));

  const preview = makeElement('div', 'memo-preview');
  preview.hidden = true;

  const actions = makeElement('div', 'memo-actions');
  const saveButton = makeElement('button', 'button button-primary memo-save', t('memo.save'));
  saveButton.type = 'button';
  const deleteButton = makeElement('button', 'button button-danger memo-delete', t('memo.delete'));
  deleteButton.type = 'button';
  actions.append(saveButton, deleteButton);

  panel.append(input, preview, actions);
  container.append(panel);

  function setMode(mode) {
    const editing = mode === 'edit';
    input.hidden = !editing;
    preview.hidden = editing;
    editButton.classList.toggle('is-active', editing);
    previewButton.classList.toggle('is-active', !editing);
    if (!editing) {
      if (input.value.trim()) {
        renderMarkdown(preview, input.value);
      } else {
        preview.replaceChildren(makeElement('p', 'memo-preview-empty', t('memo.previewEmpty')));
      }
    }
  }

  let debounceTimer = null;
  function report(result) {
    status.textContent = result && result.saved ? t('memo.saved') : t('memo.saveFailed');
  }

  input.addEventListener('input', () => {
    status.textContent = t('memo.saving');
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => report(onSave(stageId, input.value)), AUTO_SAVE_DELAY_MS);
  });

  editButton.addEventListener('click', () => setMode('edit'));
  previewButton.addEventListener('click', () => setMode('preview'));

  saveButton.addEventListener('click', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    report(onSave(stageId, input.value));
  });

  // 削除は2段階確認（1回目で確認文言へ変える）。
  let confirming = false;
  deleteButton.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      deleteButton.textContent = t('memo.deleteConfirm');
      return;
    }
    confirming = false;
    deleteButton.textContent = t('memo.delete');
    const result = onDelete(stageId);
    if (result && result.saved) {
      input.value = '';
      preview.replaceChildren();
      status.textContent = t('memo.deleted');
      setMode('edit');
    } else {
      status.textContent = t('memo.saveFailed');
    }
  });

  setMode('edit');
  return panel;
}
