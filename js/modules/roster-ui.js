import { filterOperators, removeRosterEntry, upsertRosterEntry } from './roster.js';
import { getOperatorName, localizeMasterValue, onLanguageChange, t } from './i18n.js';

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSelect(labelText, values, selectedValue, name) {
  const label = makeElement('label', 'editor-field', labelText);
  const select = document.createElement('select');
  select.name = name;
  for (const [value, text] of values) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = text;
    option.selected = Number(value) === Number(selectedValue);
    select.append(option);
  }
  label.append(select);
  return label;
}

function makeNumberInput(labelText, value, min, max, name) {
  const label = makeElement('label', 'editor-field', labelText);
  const input = document.createElement('input');
  input.type = 'number';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.required = true;
  input.value = String(value);
  label.append(input);
  return label;
}

function setOptions(select, values, selectedValue = '', category = '') {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('filter.all');
  select.replaceChildren(placeholder);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = category ? localizeMasterValue(category, value) : value;
    option.selected = value === selectedValue;
    select.append(option);
  }
}

function renderCard(operator, record) {
  const name = getOperatorName(operator);
  const button = makeElement('button', `operator-card${record ? ' is-owned' : ''}`);
  button.type = 'button';
  button.dataset.operatorId = operator.id;
  button.setAttribute('aria-label', `${name}, ${t(record ? 'roster.editOwned' : 'roster.registerAction')}`);
  const top = makeElement('span', 'operator-card-top');
  top.append(makeElement('span', `operator-rarity rarity-${operator.rarity}`, `★${operator.rarity}`));
  top.append(makeElement('span', record ? 'ownership-badge is-owned' : 'ownership-badge', t(record ? 'roster.owned' : 'roster.unowned')));
  const nameElement = makeElement('strong', 'operator-name', name);
  const className = makeElement('span', 'operator-class', `${localizeMasterValue('class', operator.class)} / ${localizeMasterValue('subclass', operator.subclass)}`);
  const detail = makeElement('span', 'operator-progress', record
    ? t('roster.progress', { promotion: t(`promotion.${record.promotionPhase}`), level: record.level ?? 1 })
    : t('roster.progressPrompt'));
  button.append(top, nameElement, className, detail);
  return button;
}

function renderEditor(container, operator, record, feedback, clearFeedback = true, moveFocus = true) {
  container.replaceChildren();
  const isOwned = Boolean(record);
  const heading = makeElement('div', 'editor-heading');
  const title = makeElement('h3', '', `${getOperatorName(operator)} ${t(isOwned ? 'roster.edit' : 'roster.registerTitle')}`);
  const closeButton = makeElement('button', 'icon-button', t('roster.close'));
  closeButton.type = 'button';
  closeButton.dataset.action = 'close-editor';
  heading.append(title, closeButton);

  const form = document.createElement('form');
  form.className = 'progress-form';
  const promotionValues = [0, 1, 2].map((level) => [level, t(`promotion.${level}`)]);
  const fields = makeElement('div', 'editor-fields');
  fields.append(makeSelect(t('roster.promotion'), promotionValues, record?.promotionPhase ?? 0, 'promotionPhase'));
  fields.append(makeNumberInput(t('roster.level'), record?.level ?? 1, 1, 90, 'level'));
  for (let index = 0; index < 3; index += 1) {
    fields.append(makeNumberInput(t('roster.skillLevel', { index: index + 1 }), record?.skillLevels?.[index] ?? 1, 1, 7, `skill-${index}`));
  }
  for (let index = 0; index < 3; index += 1) {
    fields.append(makeSelect(t('roster.skillMastery', { index: index + 1 }), [0, 1, 2, 3].map((level) => [level, t('mastery.level', { level })]), record?.masteryLevels?.[index] ?? 0, `mastery-${index}`));
  }
  for (const [index, module] of (operator.modules ?? []).entries()) {
    const moduleName = module.name || t('roster.moduleFallback', { index: index + 1 });
    const values = [0, 1, 2, 3].map((level) => [level, level === 0 ? t('module.unequipped') : t('module.stage', { level })]);
    fields.append(makeSelect(t('roster.moduleLevel', { name: moduleName }), values, record?.moduleLevels?.[index] ?? 0, `module-${index}`));
  }

  const actions = makeElement('div', 'editor-actions');
  const saveButton = makeElement('button', 'button button-primary', t('roster.save'));
  saveButton.type = 'submit';
  actions.append(saveButton);
  if (isOwned) {
    const deleteButton = makeElement('button', 'button button-danger', t('roster.delete'));
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete-entry';
    actions.append(deleteButton);
  }
  form.append(fields, actions);
  container.append(heading, form);
  container.hidden = false;
  if (clearFeedback) feedback.textContent = '';
  if (moveFocus) fields.querySelector('select')?.focus({ preventScroll: true });
}

function collectRecord(form, operatorId, modules) {
  const formData = new FormData(form);
  const promotionPhase = Number(formData.get('promotionPhase'));
  const level = Number(formData.get('level'));
  const skillLevels = [0, 1, 2].map((index) => Number(formData.get(`skill-${index}`)));
  const masteryLevels = [0, 1, 2].map((index) => Number(formData.get(`mastery-${index}`)));
  const moduleLevels = modules.map((_, index) => Number(formData.get(`module-${index}`)));
  if (!Number.isInteger(promotionPhase) || promotionPhase < 0 || promotionPhase > 2) throw new TypeError(t('roster.validationPromotion'));
  if (!Number.isInteger(level) || level < 1 || level > 90) throw new TypeError(t('roster.validationLevel'));
  if (skillLevels.some((value) => !Number.isInteger(value) || value < 1 || value > 7)) throw new TypeError(t('roster.validationSkill'));
  if (masteryLevels.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) throw new TypeError(t('roster.validationMastery'));
  if (moduleLevels.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) throw new TypeError(t('roster.validationModule'));
  return { operatorId, owned: true, promotionPhase, level, skillLevels, masteryLevels, moduleLevels };
}

export function initializeRosterUI({ operators, roster, onRosterChange }) {
  const list = document.querySelector('#operator-list');
  const query = document.querySelector('#roster-query');
  const rarity = document.querySelector('#roster-rarity');
  const classFilter = document.querySelector('#roster-class');
  const subclassFilter = document.querySelector('#roster-subclass');
  const ownership = document.querySelector('#roster-ownership');
  const count = document.querySelector('#roster-count');
  const editor = document.querySelector('#roster-editor');
  const feedback = document.querySelector('#roster-feedback');
  const datalist = document.querySelector('#operator-options');
  if (![list, query, rarity, classFilter, subclassFilter, ownership, count, editor, feedback, datalist].every(Boolean)) return;

  let currentRoster = roster;
  let activeOperatorId = null;
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const classes = [...new Set(operators.map((operator) => operator.class))].sort((a, b) => a.localeCompare(b));
  const availableSubclasses = () => [...new Set(operators.filter((operator) => !classFilter.value || operator.class === classFilter.value).map((operator) => operator.subclass))].sort((a, b) => a.localeCompare(b));

  const renderOptions = () => {
    const selectedClass = classFilter.value;
    const selectedSubclass = subclassFilter.value;
    setOptions(classFilter, classes, selectedClass, 'class');
    setOptions(subclassFilter, availableSubclasses(), selectedSubclass, 'subclass');
    ownership.options[0].textContent = t('filter.all');
    ownership.options[1].textContent = t('filter.owned');
    ownership.options[2].textContent = t('filter.unowned');
    datalist.replaceChildren(...operators.map((operator) => {
      const option = document.createElement('option');
      option.value = getOperatorName(operator);
      return option;
    }));
  };

  const refresh = () => {
    const localizedOperators = operators.map((operator) => ({ ...operator, name: getOperatorName(operator) }));
    const filters = { query: query.value, rarity: rarity.value, class: classFilter.value, subclass: subclassFilter.value };
    const ownershipMode = ownership.value;
    const visibleOperators = filterOperators(localizedOperators, filters).map((operator) => operatorById.get(operator.id)).filter((operator) => {
      const record = currentRoster.find((entry) => entry.operatorId === operator.id && entry.owned !== false);
      return ownershipMode === 'all' || (ownershipMode === 'owned' ? Boolean(record) : !record);
    });
    list.replaceChildren(...visibleOperators.map((operator) => renderCard(operator, currentRoster.find((entry) => entry.operatorId === operator.id && entry.owned !== false))));
    const ownedCount = currentRoster.filter((entry) => entry.owned !== false && operatorById.has(entry.operatorId)).length;
    count.textContent = t('roster.count', { owned: ownedCount, total: operators.length, visible: visibleOperators.length });
    if (visibleOperators.length === 0) {
      list.append(makeElement('p', 'roster-empty', ownershipMode === 'owned' && ownedCount === 0 ? t('roster.noOwned') : t('roster.noResults')));
    }
  };

  const updateRoster = (nextRoster, successMessage) => {
    const result = onRosterChange(nextRoster);
    if (!result.saved) {
      feedback.textContent = t('roster.saveFailure', { error: result.error ? ` ${result.error}` : '' });
      return false;
    }
    currentRoster = nextRoster;
    refresh();
    feedback.textContent = t('roster.saved', { message: successMessage, count: currentRoster.filter((entry) => entry.owned !== false).length });
    const activeOperator = activeOperatorId && operatorById.get(activeOperatorId);
    const activeRecord = currentRoster.find((entry) => entry.operatorId === activeOperatorId);
    if (activeOperator && activeRecord) renderEditor(editor, activeOperator, activeRecord, feedback, false);
    return true;
  };

  renderOptions();
  query.addEventListener('input', refresh);
  rarity.addEventListener('change', refresh);
  ownership.addEventListener('change', refresh);
  classFilter.addEventListener('change', () => {
    setOptions(subclassFilter, availableSubclasses(), '', 'subclass');
    refresh();
  });
  subclassFilter.addEventListener('change', refresh);

  list.addEventListener('click', (event) => {
    const card = event.target.closest('[data-operator-id]');
    if (!card) return;
    const operator = operatorById.get(card.dataset.operatorId);
    if (!operator) return;
    activeOperatorId = operator.id;
    renderEditor(editor, operator, currentRoster.find((entry) => entry.operatorId === operator.id), feedback);
  });

  editor.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-editor') {
      editor.hidden = true;
      activeOperatorId = null;
    } else if (action === 'delete-entry') {
      const operator = operatorById.get(activeOperatorId);
      if (!operator || !window.confirm(t('roster.deleteConfirm', { name: getOperatorName(operator) }))) return;
      if (updateRoster(removeRosterEntry(currentRoster, operator.id), t('roster.deleteSuccess', { name: getOperatorName(operator) }))) {
        editor.hidden = true;
        activeOperatorId = null;
      }
    }
  });

  editor.addEventListener('submit', (event) => {
    if (!event.target.matches('form')) return;
    event.preventDefault();
    const operator = operatorById.get(activeOperatorId);
    if (!operator) return;
    try {
      const record = collectRecord(event.target, operator.id, operator.modules ?? []);
      updateRoster(upsertRosterEntry(currentRoster, record), t('roster.saveSuccess', { name: getOperatorName(operator) }));
    } catch (error) {
      feedback.textContent = error.message;
    }
  });

  onLanguageChange(() => {
    feedback.textContent = '';
    renderOptions();
    refresh();
    const activeOperator = activeOperatorId && operatorById.get(activeOperatorId);
    if (activeOperator) renderEditor(editor, activeOperator, currentRoster.find((entry) => entry.operatorId === activeOperator.id), feedback, false, false);
  });
  refresh();
  return {
    setRoster(nextRoster) {
      currentRoster = nextRoster;
      activeOperatorId = null;
      editor.hidden = true;
      refresh();
    }
  };
}
