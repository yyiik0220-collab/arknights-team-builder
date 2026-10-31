/**
 * templates.js — 編成テンプレート（プリセット／カスタム）の読込・永続化・描画。
 *
 * - プリセットは data/templates.json から読み込む（ステージID + オペレーターID配列 + 多言語説明）。
 * - カスタムテンプレートは localStorage（arknights-team-builder:templates:v1）に保存する。
 * - DOM 生成は innerHTML を一切使わず createElement で行う。
 * - 配色は css/components.css の .template-*（--ak-* トークン）を参照する。
 */
import { getLanguage, getOperatorName, localizeMasterValue, t } from './i18n.js';
import { loadCustomTemplates, saveCustomTemplates } from './storage.js';
import { renderSharePanel } from './team-share.js';

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** プリセットテンプレートを取得する。 */
export async function loadTemplates() {
  const response = await fetch(new URL('../../data/templates.json', import.meta.url));
  if (!response.ok) throw new Error(`data/templates.json (${response.status})`);
  const data = await response.json();
  return Array.isArray(data.templates) ? data.templates : [];
}

// カスタムテンプレートの読込は storage.js をそのまま再輸出する。
export { loadCustomTemplates };

/** テンプレートの表示名を解決する（i18n → 単一名 → ID の順にフォールバック）。 */
export function templateName(template) {
  return template?.nameI18n?.[getLanguage()] ?? template?.nameI18n?.en ?? template?.name ?? template?.id ?? '';
}

/** テンプレートの説明を解決する。 */
export function templateDescription(template) {
  return template?.descriptionI18n?.[getLanguage()] ?? template?.descriptionI18n?.en ?? template?.description ?? '';
}

/** カスタムテンプレートを1件追加する。 @returns {{saved: boolean, error: string | null}} */
export function addCustomTemplate({ stageId, operatorIds, name }) {
  const list = loadCustomTemplates();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  list.push({ id, stageId, name, operatorIds, createdAt: new Date().toISOString() });
  return saveCustomTemplates(list);
}

/** カスタムテンプレートを1件削除する。 @returns {{saved: boolean, error: string | null}} */
export function deleteCustomTemplate(id) {
  const list = loadCustomTemplates().filter((template) => template.id !== id);
  return saveCustomTemplates(list);
}

/** operatorIds を表示名の一覧へ解決する（存在しないIDは生IDを返す）。 */
function resolveOperatorNames(operatorIds, operators) {
  const byId = new Map(operators.map((operator) => [operator.id, operator]));
  return (operatorIds ?? []).map((id) => {
    const operator = byId.get(id);
    return operator ? getOperatorName(operator) : id;
  });
}

/**
 * ステージ向けテンプレートの一覧パネルを描画する。
 * @param {HTMLElement} container
 * @param {{stageId: string, presetTemplates: object[], customTemplates: object[], operators: object[], feedback?: string, onLoad: (t)=>void, onDelete: (t)=>void}} context
 */
export function renderTemplatePanel(container, { stageId, presetTemplates, customTemplates, operators, feedback = '', onLoad, onDelete }) {
  container.replaceChildren();
  const presets = presetTemplates.filter((template) => template.stageId === stageId);
  const customs = customTemplates.filter((template) => template.stageId === stageId);

  container.append(makeElement('h4', 'template-panel-title', t('template.panelTitle')));

  if (feedback) {
    const feedbackEl = makeElement('p', 'template-feedback', feedback);
    feedbackEl.setAttribute('role', 'status');
    feedbackEl.setAttribute('aria-live', 'polite');
    container.append(feedbackEl);
  }

  if (!presets.length && !customs.length) {
    container.append(makeElement('p', 'template-empty', t('template.empty')));
    return container;
  }

  const list = document.createElement('ol');
  list.className = 'template-list';

  const renderItem = (template, isPreset) => {
    const item = document.createElement('li');
    item.className = 'template-item';

    const header = makeElement('div', 'template-item-header');
    header.append(
      makeElement('h5', 'template-item-name', templateName(template)),
      makeElement('span', 'template-badge', isPreset ? t('template.presetLabel') : t('template.customLabel'))
    );
    item.append(header);

    const description = templateDescription(template);
    if (description) item.append(makeElement('p', 'template-item-description', description));

    // プレビュー（オペレーター名一覧）。
    const memberNames = resolveOperatorNames(template.operatorIds, operators);
    if (memberNames.length) {
      const preview = makeElement('div', 'template-preview');
      preview.append(makeElement('span', 'template-preview-label', t('template.membersLabel')));
      preview.append(makeElement('p', 'template-preview-names', memberNames.join('・')));
      item.append(preview);
    }

    const actions = makeElement('div', 'template-item-actions');
    const loadButton = makeElement('button', 'button button-primary template-load', t('template.load'));
    loadButton.type = 'button';
    loadButton.addEventListener('click', () => onLoad(template));
    actions.append(loadButton);

    if (!isPreset) {
      const deleteButton = makeElement('button', 'button button-danger template-delete', t('template.delete'));
      deleteButton.type = 'button';
      // 破壊操作は2段階確認（1回目で文言を確認文言へ変える）。
      let confirming = false;
      deleteButton.addEventListener('click', () => {
        if (!confirming) {
          confirming = true;
          deleteButton.textContent = t('template.deleteConfirm');
          return;
        }
        onDelete(template);
      });
      actions.append(deleteButton);
    }
    item.append(actions);
    return item;
  };

  presets.forEach((template) => list.append(renderItem(template, true)));
  customs.forEach((template) => list.append(renderItem(template, false)));
  container.append(list);
  return container;
}

/**
 * 読み込んだテンプレートの編成を読み取り専用で描画する（共有編成と同じ見た目）。
 * @param {HTMLElement} container
 * @param {{stageId: string, operatorIds: string[], template: object, operators: object[], stages: object[], getMemoText?: () => string}} context
 */
export function renderTemplateTeam(container, { stageId, operatorIds, template, operators, stages, getMemoText }) {
  container.replaceChildren();
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));

  const banner = makeElement('div', 'template-loaded-banner');
  banner.append(makeElement('span', 'template-loaded-kicker', t('template.loadedBanner')));
  banner.append(makeElement('h4', 'template-loaded-name', templateName(template)));
  const description = templateDescription(template);
  if (description) banner.append(makeElement('p', 'template-loaded-description', description));

  const list = document.createElement('ol');
  list.className = 'proposal-team-list template-team-list';
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
  return container;
}

/**
 * 「現在の編成をテンプレートとして保存」するコントロールを描画する。
 * @param {HTMLElement} container
 * @param {{stageId: string, operatorIds: string[], onSave: (payload)=>object}} context
 */
export function renderSaveTemplateControl(container, { stageId, operatorIds, onSave }) {
  const trigger = makeElement('button', 'button button-secondary template-save-trigger', t('template.saveCurrent'));
  trigger.type = 'button';

  const form = makeElement('div', 'template-save-form');
  form.hidden = true;

  const label = makeElement('label', 'template-save-label', t('template.nameLabel'));
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'template-save-input';
  input.maxLength = 60;
  input.setAttribute('placeholder', t('template.namePlaceholder'));
  label.append(input);

  const actions = makeElement('div', 'template-save-actions');
  const saveButton = makeElement('button', 'button button-primary', t('template.save'));
  saveButton.type = 'button';
  const cancelButton = makeElement('button', 'button button-secondary', t('template.cancel'));
  cancelButton.type = 'button';
  actions.append(saveButton, cancelButton);

  const feedback = makeElement('p', 'template-save-feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');

  form.append(label, actions, feedback);
  container.append(trigger, form);

  trigger.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) input.focus();
  });
  cancelButton.addEventListener('click', () => {
    form.hidden = true;
    input.value = '';
    feedback.textContent = '';
  });
  saveButton.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) {
      feedback.textContent = t('template.nameRequired');
      return;
    }
    const result = onSave({ stageId, operatorIds, name });
    // 成功時は呼び出し側が再描画してテンプレートパネルへ結果を表示する。
    if (!result || !result.saved) {
      feedback.textContent = t('template.saveFailed');
    }
  });

  return { trigger, form };
}
