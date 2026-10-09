import { subscribe } from './app-state.js';
import { recommendTeam } from './recommendation.js';
import { getLanguage, getOperatorName, localizeMasterValue, onLanguageChange, t } from './i18n.js';

/** Filter stage records by query, chapter, or category. @param {object[]} stages @param {object} filters @returns {object[]} */
export function filterStages(stages, filters = {}) {
  const query = String(filters.query ?? '').trim().toLocaleLowerCase();
  return stages.filter((stage) => (!filters.category || stage.category === filters.category)
    && (!filters.chapter || stage.chapter === filters.chapter)
    && (!query || `${stage.name} ${Object.values(stage.nameI18n ?? {}).join(' ')} ${stage.chapter} ${Object.values(stage.chapterI18n ?? {}).join(' ')} ${stage.id}`.toLocaleLowerCase().includes(query)));
}

/** Resolve a stage and selected phase by stable IDs. @param {object[]} stages @param {string} stageId @param {string} phaseId @returns {{stage: object, phase: object} | null} */
export function findStagePhase(stages, stageId, phaseId = 'normal') {
  const stage = stages.find((entry) => entry.id === stageId);
  const phase = stage?.phases?.find((entry) => entry.id === phaseId);
  return stage && phase ? { stage, phase } : null;
}

function stageName(stage) {
  const translated = t(`stage.${stage.id}`);
  return translated === `stage.${stage.id}` ? stage.nameI18n?.[getLanguage()] ?? stage.nameI18n?.en ?? stage.name : translated;
}

function chapterName(stage) {
  return stage.chapterI18n?.[getLanguage()] ?? stage.chapterI18n?.en ?? stage.chapter;
}

function localizedList(values) {
  return values.map((value) => {
    const translated = t(value);
    return translated === value ? value : translated;
  });
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSection(title, values) {
  const section = document.createElement('section');
  section.className = 'stage-detail-section';
  const heading = document.createElement('h4');
  heading.textContent = title;
  section.append(heading);
  const list = document.createElement('ul');
  list.className = 'stage-chip-list';
  values.forEach((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    list.append(item);
  });
  section.append(list);
  return section;
}

function makeStageCard(stage, selectedId) {
  const button = document.createElement('button');
  button.className = 'stage-option';
  button.type = 'button';
  button.dataset.stageId = stage.id;
  button.setAttribute('aria-pressed', String(stage.id === selectedId));
  const name = document.createElement('span');
  name.className = 'stage-option-name';
  name.textContent = stageName(stage);
  const meta = document.createElement('span');
  meta.className = 'stage-option-meta';
  meta.textContent = `${stage.id} · ${t(`difficulty.${stage.difficulty}`)}`;
  button.append(name, meta);
  return button;
}

function renderStageList({ stages, query, chapter, selectedId, list, empty }) {
  const filtered = filterStages(stages, { query: query.value, chapter: chapter.value });
  list.replaceChildren();
  empty.hidden = filtered.length > 0;
  if (!filtered.length) return;

  const groups = new Map();
  filtered.forEach((stage) => {
    if (!groups.has(stage.chapter)) groups.set(stage.chapter, []);
    groups.get(stage.chapter).push(stage);
  });
  groups.forEach((chapterStages) => {
    const group = document.createElement('section');
    group.className = 'stage-chapter-group';
    const heading = document.createElement('h4');
    heading.textContent = chapterName(chapterStages[0]);
    const options = document.createElement('div');
    options.className = 'stage-options';
    chapterStages.forEach((stage) => options.append(makeStageCard(stage, selectedId)));
    group.append(heading, options);
    list.append(group);
  });
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}` : '—';
}

function roleNames(roles) {
  return roles.map((role) => localizeMasterValue('role', role));
}

function makeReasonList(member) {
  const reasons = document.createElement('ul');
  reasons.className = 'proposal-reasons';
  if (member.neededRoles.length) {
    reasons.append(makeElement('li', '', t('proposal.reasonRole', { roles: roleNames(member.neededRoles).join('・') })));
  } else if (member.coveredRoles.length) {
    reasons.append(makeElement('li', '', t('proposal.reasonRole', { roles: roleNames(member.coveredRoles).join('・') })));
  }
  if (member.breakdown.mechanicMatch > 0) reasons.append(makeElement('li', '', t('proposal.reasonMechanic')));
  if (member.breakdown.enemyMatch > 0) reasons.append(makeElement('li', '', t('proposal.reasonEnemy')));
  if (member.breakdown.readiness > 0) reasons.append(makeElement('li', '', t('proposal.reasonReadiness')));
  if (!reasons.childElementCount) reasons.append(makeElement('li', 'proposal-data-note', t('proposal.reasonFallback')));
  return reasons;
}

function makeOperatorIdentity(operator, className) {
  return makeElement('span', className, `${getOperatorName(operator)} · ${localizeMasterValue('class', operator.class)} / ${localizeMasterValue('subclass', operator.subclass)}`);
}

function makeMetrics(member) {
  const metrics = document.createElement('dl');
  metrics.className = 'proposal-metrics';
  const labels = [
    ['roleMatch', 'proposal.roleMatch'],
    ['mechanicMatch', 'proposal.mechanicMatch'],
    ['enemyMatch', 'proposal.enemyMatch'],
    ['readiness', 'proposal.readiness']
  ];
  labels.forEach(([key, label]) => {
    const metric = document.createElement('div');
    metric.className = 'proposal-metric';
    metric.append(makeElement('dt', '', t(label)), makeElement('dd', '', formatScore(member.breakdown[key])));
    metrics.append(metric);
  });
  const adjustments = document.createElement('div');
  adjustments.className = 'proposal-score-adjustments';
  adjustments.textContent = t('proposal.adjustments', {
    coverage: Math.round(member.coverageGain * 100) / 100,
    penalty: Math.round(member.duplicatePenalty * 100) / 100
  });
  metrics.append(adjustments);
  return metrics;
}

function makeAlternatives(member) {
  const section = document.createElement('section');
  section.className = 'proposal-alternatives';
  section.append(makeElement('h5', '', t('proposal.alternatives')));
  if (!member.alternatives.length) {
    section.append(makeElement('p', 'proposal-data-note', t('proposal.noAlternatives')));
    return section;
  }
  const list = document.createElement('ul');
  member.alternatives.forEach((candidate) => {
    const item = document.createElement('li');
    item.append(makeOperatorIdentity(candidate.operator, 'proposal-alternative-name'));
    if (candidate.sharedRoles.length) item.append(makeElement('span', 'proposal-alternative-role', roleNames(candidate.sharedRoles).join('・')));
    list.append(item);
  });
  section.append(list);
  return section;
}

function renderProposal(stage, { operators, scoring, roster }, container) {
  container.replaceChildren();
  const ownedOperatorIds = new Set(operators.map((operator) => operator.id));
  const ownedCount = roster.filter((record) => record?.owned !== false && ownedOperatorIds.has(record?.operatorId)).length;
  if (!ownedCount) {
    const empty = makeElement('div', 'proposal-empty');
    empty.append(makeElement('p', '', t('proposal.noOwned')));
    const link = makeElement('a', 'button button-primary', t('proposal.register'));
    link.href = '#roster';
    empty.append(link);
    container.append(empty);
    return;
  }

  const result = recommendTeam({ operators, roster, stage, scoring });
  const heading = makeElement('div', 'proposal-results-heading');
  heading.append(makeElement('p', '', t('proposal.resultCount', { count: result.team.length, max: result.slotCount })));
  if (result.ownedCount < 12) {
    heading.append(makeElement('p', 'proposal-shortage', t('proposal.shortage', { owned: result.ownedCount, missing: 12 - result.ownedCount })));
    const rosterLink = makeElement('a', 'proposal-roster-link', t('proposal.register'));
    rosterLink.href = '#roster';
    heading.append(rosterLink);
  }
  container.append(heading);

  if (result.uncoveredRoles.length) {
    const gaps = result.uncoveredRoles.map(({ role, missing }) => `${localizeMasterValue('role', role)} (${missing})`).join('・');
    container.append(makeElement('p', 'proposal-uncovered', t('proposal.uncoveredRoles', { roles: gaps })));
  }

  const list = document.createElement('ol');
  list.className = 'proposal-team-list';
  result.team.forEach((member) => {
    const card = document.createElement('li');
    card.className = 'proposal-member';
    const header = makeElement('div', 'proposal-member-header');
    header.append(makeElement('span', 'proposal-slot', t('proposal.slot', { slot: member.slot })), makeElement('span', 'proposal-total-score', t('proposal.totalScore', { score: member.score })));
    const name = makeElement('h4', '', getOperatorName(member.operator));
    const operatorClass = makeElement('p', 'proposal-operator-class', `${localizeMasterValue('class', member.operator.class)} / ${localizeMasterValue('subclass', member.operator.subclass)}`);
    const reasons = makeReasonList(member);
    card.append(header, name, operatorClass, reasons, makeMetrics(member), makeAlternatives(member));
    list.append(card);
  });
  container.append(list);
}

function renderStageDetail(stage, detail, proposalContext, proposalStageId) {
  detail.replaceChildren();
  if (!stage) {
    detail.textContent = t('stages.selectPrompt');
    return null;
  }

  const heading = document.createElement('div');
  heading.className = 'stage-detail-heading';
  const title = document.createElement('h3');
  title.textContent = stageName(stage);
  const meta = document.createElement('p');
  meta.textContent = `${chapterName(stage)} · ${t(`difficulty.${stage.difficulty}`)}`;
  heading.append(title, meta);

  const enemies = localizedList(stage.enemies ?? []);
  const mechanics = (stage.mechanics ?? []).map((mechanic) => {
    const translated = t(`mechanic.${mechanic.id}`);
    return translated === `mechanic.${mechanic.id}` ? mechanic.name ?? t('stages.unverified') : translated;
  });
  const roles = (stage.requiredRoles ?? []).map((role) => localizeMasterValue('role', role));
  const detailSections = [
    makeSection(t('stages.enemies'), enemies),
    makeSection(t('stages.mechanics'), mechanics),
    makeSection(t('stages.requiredRoles'), roles)
  ];
  const counts = document.createElement('section');
  counts.className = 'stage-detail-section';
  const countsHeading = document.createElement('h4');
  countsHeading.textContent = t('stages.recommendedCount');
  const countsList = document.createElement('ul');
  countsList.className = 'stage-count-list';
  Object.entries(stage.recommendedCount ?? {}).forEach(([role, count]) => {
    const item = document.createElement('li');
    item.textContent = `${localizeMasterValue('role', role)}: ${count}`;
    countsList.append(item);
  });
  counts.append(countsHeading, countsList);
  const tips = document.createElement('p');
  tips.className = 'stage-tips';
  tips.textContent = stage.tipsI18n?.[getLanguage()] ?? stage.tipsI18n?.en ?? t('stages.unverified');
  const status = document.createElement('p');
  status.className = 'stage-data-status';
  status.textContent = `${t('stages.dataStatus')}: ${stage.dataStatus}`;
  const propose = makeElement('button', 'button button-primary stage-propose-button', t('stages.proposeTeam'));
  propose.type = 'button';
  propose.dataset.action = 'propose-team';
  const proposal = makeElement('section', 'team-proposal');
  proposal.setAttribute('aria-live', 'polite');
  proposal.setAttribute('aria-label', t('proposal.title'));
  proposal.hidden = proposalStageId !== stage.id;
  detail.append(heading, ...detailSections, counts, tips, status, propose, proposal);
  if (!proposal.hidden) renderProposal(stage, proposalContext, proposal);
  return proposal;
}

/** Initialize the localized chapter-grouped stage selector and team proposal UI. @param {{stages: object[], operators: object[], scoring: object, roster: object[]}} options */
export function initializeStagesUI({ stages, operators, scoring, roster }) {
  const query = document.querySelector('#stage-query');
  const chapter = document.querySelector('#stage-chapter');
  const list = document.querySelector('#stage-list');
  const detail = document.querySelector('#stage-detail');
  const empty = document.querySelector('#stage-empty');
  if (!query || !chapter || !list || !detail || !empty) return null;

  const selectedId = stages[0]?.id ?? null;
  const chapterValues = [...new Set(stages.map((stage) => stage.chapter))];
  chapter.replaceChildren(new Option(t('filter.all'), ''));
  chapterValues.forEach((chapterId) => chapter.add(new Option(chapterName(stages.find((stage) => stage.chapter === chapterId)), chapterId)));

  let currentStageId = selectedId;
  let proposalStageId = null;
  const proposalContext = { operators, scoring, roster };

  function render() {
    const selectedChapter = chapter.value;
    chapter.replaceChildren(new Option(t('filter.all'), ''));
    chapterValues.forEach((chapterId) => chapter.add(new Option(chapterName(stages.find((stage) => stage.chapter === chapterId)), chapterId)));
    chapter.value = chapterValues.includes(selectedChapter) ? selectedChapter : '';
    renderStageList({ stages, query, chapter, selectedId: currentStageId, list, empty });
    const selectedStage = stages.find((stage) => stage.id === currentStageId) ?? null;
    renderStageDetail(selectedStage, detail, proposalContext, proposalStageId);
  }

  query.addEventListener('input', render);
  chapter.addEventListener('change', render);
  list.addEventListener('click', (event) => {
    const option = event.target.closest('[data-stage-id]');
    if (!option || !list.contains(option)) return;
    currentStageId = option.dataset.stageId;
    proposalStageId = null;
    render();
    list.querySelector(`[data-stage-id="${CSS.escape(currentStageId)}"]`)?.focus();
  });
  detail.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action="propose-team"]')) return;
    proposalStageId = currentStageId;
    render();
    detail.querySelector('.team-proposal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  subscribe((state) => {
    proposalContext.roster = state.roster;
    if (proposalStageId) render();
  });
  const unsubscribeLanguage = onLanguageChange(render);
  render();
  return { render, destroy: unsubscribeLanguage };
}
