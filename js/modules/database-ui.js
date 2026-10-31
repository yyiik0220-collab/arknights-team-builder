import { getOperatorDetails, searchDatabase } from './database.js';
import { getOperatorName, localizeMasterValue, onLanguageChange, t } from './i18n.js';

const VERIFIABLE_SECTIONS = ['skills', 'talents', 'modules', 'stats'];

const STAT_FIELDS = [
  ['hp', 'database.statsHp'],
  ['atk', 'database.statsAtk'],
  ['def', 'database.statsDef'],
  ['res', 'database.statsRes'],
  ['cost', 'database.statsCost'],
  ['block', 'database.statsBlock'],
  ['attackInterval', 'database.statsAttackInterval'],
  ['redeployTime', 'database.statsRedeploy']
];

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
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

/** Resolve a role tag to the localized label, falling back to the scoring-config label. */
function roleLabel(tag, roleTags) {
  const localized = localizeMasterValue('role', tag);
  if (localized !== tag) return localized;
  return roleTags?.[tag]?.label ?? tag;
}

/** Resolve a nested master-data name (skill/talent/module) in the active language. */
function itemName(item) {
  return getOperatorName({ nameI18n: item?.nameI18n, name: item?.name });
}

function formatStat(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function isFullyVerified(operator) {
  return VERIFIABLE_SECTIONS.every((key) => operator.dataStatus?.[key] === 'verified');
}

function makeEntry(name) {
  return makeElement('li', 'database-entry');
}

function appendDescription(entry, description) {
  if (description) entry.append(makeElement('p', 'database-entry-description', description));
}

function renderSkills(operator) {
  return operator.skills.map((skill) => {
    const entry = makeEntry();
    const heading = makeElement('div', 'database-entry-heading');
    heading.append(
      makeElement('strong', '', itemName(skill)),
      makeElement('span', 'database-entry-meta', `${t('database.spTypeLabel')}: ${t(`database.spType.${skill.spType}`)}`)
    );
    entry.append(heading);
    appendDescription(entry, skill.description);
    return entry;
  });
}

function renderTalents(operator) {
  return operator.talents.map((talent) => {
    const entry = makeEntry();
    entry.append(makeElement('strong', '', itemName(talent)));
    appendDescription(entry, talent.description);
    return entry;
  });
}

function renderModules(operator) {
  return operator.modules.map((module) => {
    const entry = makeEntry();
    const heading = makeElement('div', 'database-entry-heading');
    heading.append(
      makeElement('strong', '', itemName(module)),
      makeElement('span', 'database-entry-meta', `${t('database.moduleTypeLabel')}: ${module.type}`)
    );
    entry.append(heading);
    appendDescription(entry, module.description);
    return entry;
  });
}

function renderStats(operator) {
  const base = operator.stats?.base ?? {};
  const list = makeElement('dl', 'database-facts');
  for (const [key, labelKey] of STAT_FIELDS) {
    const row = document.createElement('div');
    row.append(makeElement('dt', '', t(labelKey)), makeElement('dd', '', formatStat(base[key])));
    list.append(row);
  }
  return [list];
}

function renderTags(operator, roleTags) {
  if (!operator.tags?.length) return [];
  const list = makeElement('ul', 'database-chip-list');
  for (const tag of operator.tags) list.append(makeElement('li', '', roleLabel(tag, roleTags)));
  return [list];
}

function renderSynergies(operator, operatorById) {
  return operator.synergies.map((synergy) => {
    const partner = operatorById.get(synergy.operatorId);
    const entry = makeEntry();
    const heading = makeElement('div', 'database-entry-heading');
    heading.append(
      makeElement('strong', '', partner ? getOperatorName(partner) : synergy.operatorId),
      makeElement('span', 'database-entry-meta', `${t('database.synergyTypeLabel')}: ${t(`database.synergyType.${synergy.type}`)}`)
    );
    entry.append(heading);
    appendDescription(entry, synergy.description);
    return entry;
  });
}

function makeSection(titleKey, children) {
  const section = makeElement('section', 'database-detail-section');
  section.append(makeElement('h4', '', t(titleKey)));
  if (children.length === 0) section.append(makeElement('p', 'database-section-empty', t('database.notIntegrated')));
  else {
    const isList = children[0].tagName === 'LI';
    const container = makeElement(isList ? 'ul' : 'div', `database-section-body${isList ? ' database-entry-list' : ''}`);
    container.append(...children);
    section.append(container);
  }
  return section;
}

function renderCard(operator, roleTags) {
  const button = makeElement('button', 'database-card');
  button.type = 'button';
  button.dataset.operatorId = operator.id;
  button.setAttribute('aria-label', getOperatorName(operator));
  const top = makeElement('div', 'database-card-top');
  top.append(makeElement('span', `database-card-rarity rarity-${operator.rarity}`, `★${operator.rarity}`));
  top.append(makeElement('span', `database-status-badge${isFullyVerified(operator) ? ' is-verified' : ''}`, t(isFullyVerified(operator) ? 'database.verified' : 'database.unverified')));
  button.append(
    top,
    makeElement('strong', 'database-card-name', getOperatorName(operator)),
    makeElement('span', 'database-card-class', `${localizeMasterValue('class', operator.class)} / ${localizeMasterValue('subclass', operator.subclass)}`),
    makeElement('span', 'database-card-tags', (operator.tags ?? []).map((tag) => roleLabel(tag, roleTags)).join(' · '))
  );
  return button;
}

function renderDetail(container, operator, operatorById, roleTags) {
  container.replaceChildren();
  const verified = isFullyVerified(operator);

  const heading = makeElement('div', 'database-detail-heading');
  const identity = makeElement('div', 'database-detail-identity');
  identity.append(
    makeElement('span', `database-detail-rarity rarity-${operator.rarity}`, `★${operator.rarity}`),
    makeElement('h3', '', getOperatorName(operator)),
    makeElement('p', 'database-detail-class', `${localizeMasterValue('class', operator.class)} / ${localizeMasterValue('subclass', operator.subclass)}`)
  );
  const closeButton = makeElement('button', 'icon-button', t('database.close'));
  closeButton.type = 'button';
  closeButton.dataset.action = 'close-detail';
  heading.append(identity, closeButton);

  container.append(heading);
  container.append(makeElement('p', `database-detail-status${verified ? ' is-verified' : ''}`, t(verified ? 'database.verified' : 'database.unverified')));
  if (!verified) container.append(makeElement('p', 'database-detail-warning', t('database.unverifiedNote')));

  const basic = makeElement('dl', 'database-facts');
  const basicRows = [
    ['filter.rarity', `★${operator.rarity}`],
    ['filter.class', localizeMasterValue('class', operator.class)],
    ['filter.subclass', localizeMasterValue('subclass', operator.subclass)]
  ];
  for (const [labelKey, value] of basicRows) {
    const row = document.createElement('div');
    row.append(makeElement('dt', '', t(labelKey)), makeElement('dd', '', value));
    basic.append(row);
  }
  const basicSection = makeSection('database.basicInfo', [basic]);
  container.append(basicSection);

  container.append(makeSection('database.skills', renderSkills(operator)));
  container.append(makeSection('database.talents', renderTalents(operator)));
  container.append(makeSection('database.modules', renderModules(operator)));
  container.append(makeSection('database.stats', renderStats(operator)));
  container.append(makeSection('database.tags', renderTags(operator, roleTags)));
  container.append(makeSection('database.synergies', renderSynergies(operator, operatorById)));

  container.hidden = false;
}

export function initializeDatabaseUI({ operators, scoring }) {
  const list = document.querySelector('#database-list');
  const detail = document.querySelector('#database-detail');
  const query = document.querySelector('#database-query');
  const rarity = document.querySelector('#database-rarity');
  const classFilter = document.querySelector('#database-class');
  const subclassFilter = document.querySelector('#database-subclass');
  const count = document.querySelector('#database-count');
  if (![list, detail, query, rarity, classFilter, subclassFilter, count].every(Boolean)) return;

  const roleTags = scoring?.roleTags ?? {};
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const classes = [...new Set(operators.map((operator) => operator.class))].sort((a, b) => a.localeCompare(b));
  const availableSubclasses = () => [...new Set(operators.filter((operator) => !classFilter.value || operator.class === classFilter.value).map((operator) => operator.subclass))].sort((a, b) => a.localeCompare(b));
  let activeOperatorId = null;

  const renderOptions = () => {
    const selectedClass = classFilter.value;
    const selectedSubclass = subclassFilter.value;
    setOptions(classFilter, classes, selectedClass, 'class');
    setOptions(subclassFilter, availableSubclasses(), selectedSubclass, 'subclass');
  };

  const refresh = () => {
    const localizedOperators = operators.map((operator) => ({ ...operator, name: getOperatorName(operator) }));
    const filters = { query: query.value, rarity: rarity.value, class: classFilter.value, subclass: subclassFilter.value };
    const visibleOperators = searchDatabase(localizedOperators, filters).map((operator) => operatorById.get(operator.id));
    list.replaceChildren(...visibleOperators.map((operator) => renderCard(operator, roleTags)));
    count.textContent = t('database.count', { visible: visibleOperators.length, total: operators.length });
    if (visibleOperators.length === 0) list.append(makeElement('p', 'database-empty', t('database.noResults')));
  };

  const showDetail = (operatorId) => {
    const operator = getOperatorDetails(operators, operatorId);
    if (!operator) return;
    activeOperatorId = operatorId;
    renderDetail(detail, operator, operatorById, roleTags);
    if (window.matchMedia?.('(width <= 760px)').matches) detail.scrollIntoView({ block: 'start' });
  };

  const closeDetail = () => {
    activeOperatorId = null;
    detail.hidden = true;
    detail.replaceChildren();
  };

  renderOptions();
  query.addEventListener('input', refresh);
  rarity.addEventListener('change', refresh);
  classFilter.addEventListener('change', () => {
    setOptions(subclassFilter, availableSubclasses(), '', 'subclass');
    refresh();
  });
  subclassFilter.addEventListener('change', refresh);

  list.addEventListener('click', (event) => {
    const card = event.target.closest('[data-operator-id]');
    if (card) showDetail(card.dataset.operatorId);
  });

  detail.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="close-detail"]')) closeDetail();
  });

  onLanguageChange(() => {
    renderOptions();
    refresh();
    if (activeOperatorId) showDetail(activeOperatorId);
  });

  refresh();
}
