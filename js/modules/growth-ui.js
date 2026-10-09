import { subscribe } from './app-state.js';
import { buildGrowthPriorities } from './growth-advisor.js';
import { getOperatorName, localizeMasterValue, onLanguageChange, t } from './i18n.js';

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function updateOptions(select, values, selectedValue, category) {
  const options = [new Option(values.length ? t('filter.all') : t('filter.noGap'), '')];
  for (const value of values) options.push(new Option(localizeMasterValue(category, value), value));
  select.replaceChildren(...options);
  select.value = values.includes(selectedValue) ? selectedValue : '';
  select.disabled = values.length === 0;
}

function roleLabel(tag, labels) {
  const localized = localizeMasterValue('role', tag);
  return localized === tag ? labels[tag]?.label ?? tag : localized;
}

function formatScore(value) {
  return Number.isFinite(value) ? t('growth.point', { value: Math.round(value) }) : t('growth.notEvaluated');
}

function addMetric(container, label, value, className = '') {
  const metric = makeElement('div', `growth-metric${className ? ` ${className}` : ''}`);
  metric.append(makeElement('span', 'growth-metric-label', label), makeElement('strong', 'growth-metric-value', formatScore(value)));
  container.append(metric);
}

function makePriorityCard(priority, labels) {
  const item = makeElement('li', 'growth-priority');
  const header = makeElement('div', 'growth-priority-header');
  const identity = makeElement('div', 'growth-priority-identity');
  identity.append(
    makeElement('span', 'growth-rank', `#${priority.rank}`),
    makeElement('h3', '', getOperatorName(priority.operator)),
    makeElement('span', 'growth-class', `${localizeMasterValue('class', priority.operator.class)} / ${localizeMasterValue('subclass', priority.operator.subclass)}`)
  );
  const score = makeElement('div', 'growth-total-score');
  score.append(makeElement('strong', '', Number.isFinite(priority.score) ? String(Math.round(priority.score)) : '—'), makeElement('span', '', Number.isFinite(priority.score) ? t('growth.totalScore') : t('growth.notEvaluated')));
  header.append(identity, score);

  const action = makeElement('p', 'growth-action', priority.actionLabel);
  const metrics = makeElement('div', 'growth-metrics');
  addMetric(metrics, t('growth.versatility'), priority.components.versatility);
  addMetric(metrics, t('growth.roleCoverage'), priority.components.rosterGapFit);
  addMetric(metrics, t('growth.stageFit'), priority.components.stageCoverage);
  addMetric(metrics, t('growth.readiness'), priority.components.readinessBenefit);
  const cost = priority.costStatus === 'evaluated'
    ? t('growth.costRelative', { score: Math.round(priority.components.normalizedCost) })
    : t('growth.costUnavailable');
  const costMetric = makeElement('div', 'growth-metric growth-cost');
  costMetric.append(makeElement('span', 'growth-metric-label', t('growth.cost')), makeElement('strong', 'growth-metric-value', cost));
  metrics.append(costMetric);

  const reasons = makeElement('ul', 'growth-reasons');
  for (const reason of priority.reasons) reasons.append(makeElement('li', '', reason));
  if (priority.missing.some((key) => ['versatility', 'rosterGapFit', 'stageCoverage'].includes(key))) {
    reasons.append(makeElement('li', 'growth-data-note', t('growth.missingRoleData')));
  }
  if (priority.costStatus !== 'evaluated') reasons.append(makeElement('li', 'growth-data-note', t('growth.missingCostData')));
  const roleNames = priority.operator.tags.map((tag) => roleLabel(tag, labels));
  if (roleNames.length) reasons.append(makeElement('li', 'growth-role-tags', t('growth.tags', { tags: roleNames.join('・') })));
  item.append(header, action, metrics, reasons);
  return item;
}

function renderWeights(container, scoring) {
  const weights = scoring.growthWeights;
  const descriptions = [
    ['versatility', 'growth.weight.versatility'],
    ['rosterGapFit', 'growth.weight.rosterGapFit'],
    ['stageCoverage', 'growth.weight.stageCoverage'],
    ['readinessBenefit', 'growth.weight.readinessBenefit'],
    ['normalizedCost', 'growth.weight.normalizedCost']
  ];
  const list = makeElement('ul', 'growth-weight-list');
  for (const [key, labelKey] of descriptions) {
    if (!Number.isFinite(weights[key])) continue;
    const value = `${weights[key] < 0 ? '−' : ''}${Math.round(Math.abs(weights[key]) * 100)}%`;
    list.append(makeElement('li', '', `${t(labelKey)} ${value}`));
  }
  container.replaceChildren(list, makeElement('p', 'growth-weight-note', t('growth.weightNote')));
}

export function initializeGrowthUI({ operators, stages, scoring, roster }) {
  const rankings = document.querySelector('#growth-rankings');
  const empty = document.querySelector('#growth-empty');
  const summary = document.querySelector('#growth-summary');
  const gapSummary = document.querySelector('#growth-gap-summary');
  const classFilter = document.querySelector('#growth-gap-class');
  const subclassFilter = document.querySelector('#growth-gap-subclass');
  const weights = document.querySelector('#growth-weights');
  if (![rankings, empty, summary, gapSummary, classFilter, subclassFilter, weights].every(Boolean)) return;

  let currentRoster = roster;
  const render = () => {
    const result = buildGrowthPriorities({ operators, roster: currentRoster, stages, scoring });
    const classValue = classFilter.value;
    const subclassValue = subclassFilter.value;
    updateOptions(classFilter, result.gaps.classes, classValue, 'class');
    updateOptions(subclassFilter, result.gaps.subclasses, subclassValue, 'subclass');
    summary.textContent = t('growth.summary', { owned: result.ownedCount, count: result.priorities.length });
    if (result.gaps.roles.length) {
      gapSummary.textContent = t('growth.gapList', { roles: result.gaps.roles.map((tag) => roleLabel(tag, result.roleLabels)).join('・') });
    } else {
      const knownRoles = Object.keys(result.roleLabels).some((tag) => operators.some((operator) => operator.tags?.includes(tag)));
      gapSummary.textContent = knownRoles ? t('growth.noGaps') : t('growth.unknownGaps');
    }

    if (result.ownedCount === 0) {
      const prompt = makeElement('div', 'growth-empty-card');
      prompt.append(makeElement('p', '', t('growth.emptyTitle')));
      const link = makeElement('a', 'button button-primary', t('growth.register'));
      link.href = '#roster';
      prompt.append(link);
      empty.replaceChildren(prompt);
      empty.hidden = false;
      rankings.replaceChildren();
      return;
    }

    const filtered = result.priorities.filter((priority) => (!classFilter.value || priority.operator.class === classFilter.value)
      && (!subclassFilter.value || priority.operator.subclass === subclassFilter.value));
    if (!filtered.length) {
      empty.replaceChildren(makeElement('p', 'growth-empty-card', result.priorities.length ? t('growth.noMatches') : t('growth.noActions')));
      empty.hidden = false;
    } else {
      empty.replaceChildren();
      empty.hidden = true;
    }
    rankings.replaceChildren(...filtered.map((priority) => makePriorityCard(priority, result.roleLabels)));
  };

  const refresh = () => {
    renderWeights(weights, scoring);
    render();
  };
  classFilter.addEventListener('change', render);
  subclassFilter.addEventListener('change', render);
  subscribe((state) => {
    currentRoster = state.roster;
    render();
  });
  onLanguageChange(refresh);
  refresh();
}
