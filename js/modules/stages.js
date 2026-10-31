import { subscribe } from './app-state.js';
import { recommendTeam } from './recommendation.js';
import { getLanguage, getOperatorName, localizeMasterValue, onLanguageChange, t } from './i18n.js';
import { renderSharedTeam, renderSharePanel } from './team-share.js';
import { addCustomTemplate, deleteCustomTemplate, loadCustomTemplates, renderSaveTemplateControl, renderTemplatePanel, renderTemplateTeam } from './templates.js';
import { analyzeSynergies } from './synergy.js';
import { renderSynergyPanel } from './synergy-ui.js';
import { loadMemos, saveMemos } from './storage.js';
import { renderMemoEditor } from './stage-memo.js';

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

function makeStageCard(stage, selectedId, hasMemo) {
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
  if (hasMemo) {
    const badge = document.createElement('span');
    badge.className = 'stage-option-memo';
    badge.textContent = t('memo.badge');
    badge.setAttribute('aria-label', t('memo.badge'));
    button.append(badge);
  }
  return button;
}

function renderStageList({ stages, query, chapter, selectedId, list, empty, memoStageIds = new Set() }) {
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
    chapterStages.forEach((stage) => options.append(makeStageCard(stage, selectedId, memoStageIds.has(stage.id))));
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

function renderProposal(stage, { operators, scoring, roster, stages, getMemoText }, container, onSaveTemplate) {
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
  // シナジー可視化: 編成内で活性化しているシナジーの関係図・クラス構成・提案を追加する。
  // 追加/入替の提案対象は「所持していて編成に未採用」のオペレーターのみ。
  const teamOperators = result.team.map((member) => member.operator);
  const teamOperatorIds = new Set(teamOperators.map((operator) => operator.id));
  const ownedRosterIds = new Set(roster.filter((record) => record?.owned !== false && ownedOperatorIds.has(record?.operatorId)).map((record) => record.operatorId));
  const addableOperators = operators.filter((operator) => ownedRosterIds.has(operator.id) && !teamOperatorIds.has(operator.id));
  const analysis = analyzeSynergies({ teamOperators, addableOperators });
  renderSynergyPanel(container, { teamOperators, analysis });
  // 生成された編成（スロット順のオペレーターID）を共有できるように、共有UIを末尾へ追加する。
  const operatorIds = result.team.map((member) => member.operator.id);
  renderSharePanel(container, {
    stageId: stage.id,
    operatorIds,
    operators,
    stages,
    getMemoText: getMemoText ? () => getMemoText(stage.id) : undefined
  });
  // 現在の編成提案をカスタムテンプレートとして保存できるようにする。
  renderSaveTemplateControl(container, { stageId: stage.id, operatorIds, onSave: onSaveTemplate });
}

function renderStageDetail(stage, detail, proposalContext, proposalStageId, sharedTeam, loadedTemplate, templateContext, memoContext) {
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

  // 攻略メモ（自分用・自動保存）＋ URL から届いた共有メモの読み取り専用表示。
  const memoEditor = makeElement('section', 'memo-editor');
  renderMemoEditor(memoEditor, {
    stageId: stage.id,
    memoText: memoContext.getMemoText(stage.id),
    sharedMemo: memoContext.sharedMemoStageId === stage.id ? memoContext.sharedMemo : '',
    onSave: memoContext.onSaveMemo,
    onDelete: memoContext.onDeleteMemo
  });

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
  // このステージ向けのテンプレート（プリセット＋マイテンプレート）を表示する。
  const templatePanel = makeElement('section', 'template-panel');
  renderTemplatePanel(templatePanel, {
    stageId: stage.id,
    presetTemplates: templateContext.templates,
    customTemplates: templateContext.customTemplates,
    operators: proposalContext.operators,
    feedback: templateContext.feedback,
    onLoad: templateContext.onLoadTemplate,
    onDelete: templateContext.onDeleteTemplate
  });
  const propose = makeElement('button', 'button button-primary stage-propose-button', t('stages.proposeTeam'));
  propose.type = 'button';
  propose.dataset.action = 'propose-team';
  const proposal = makeElement('section', 'team-proposal');
  proposal.setAttribute('aria-live', 'polite');
  proposal.setAttribute('aria-label', t('proposal.title'));
  proposal.hidden = proposalStageId !== stage.id;
  detail.append(heading, memoEditor, ...detailSections, counts, tips, status, templatePanel, propose, proposal);
  if (!proposal.hidden) {
    // URL から復元した共有編成 → 読み込んだテンプレート → 自動生成した編成提案の順で表示する。
    if (sharedTeam && sharedTeam.stageId === stage.id) {
      renderSharedTeam(proposal, {
        stageId: sharedTeam.stageId,
        operatorIds: sharedTeam.operatorIds,
        operators: proposalContext.operators,
        stages: proposalContext.stages,
        getMemoText: () => memoContext.getMemoText(stage.id)
      });
      renderSaveTemplateControl(proposal, {
        stageId: sharedTeam.stageId,
        operatorIds: sharedTeam.operatorIds,
        onSave: templateContext.onSaveTemplate
      });
    } else if (loadedTemplate && loadedTemplate.stageId === stage.id) {
      renderTemplateTeam(proposal, {
        stageId: loadedTemplate.stageId,
        operatorIds: loadedTemplate.operatorIds,
        template: loadedTemplate.template,
        operators: proposalContext.operators,
        stages: proposalContext.stages,
        getMemoText: () => memoContext.getMemoText(stage.id)
      });
    } else {
      renderProposal(stage, proposalContext, proposal, templateContext.onSaveTemplate);
    }
  }
  return proposal;
}

/** Initialize the localized chapter-grouped stage selector and team proposal UI.
 *  @param {{stages: object[], operators: object[], scoring: object, roster: object[], templates?: object[], sharedTeam?: {stageId: string, operatorIds: string[]} | null, sharedMemo?: string}} options */
export function initializeStagesUI({ stages, operators, scoring, roster, sharedTeam = null, templates = [], sharedMemo = '' }) {
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

  // URL から共有編成が渡された場合は、そのステージを選択済みにして共有編成を表示する。
  const sharedStageId = sharedTeam?.stageId ?? null;
  let currentStageId = sharedStageId && stages.some((stage) => stage.id === sharedStageId) ? sharedStageId : selectedId;
  let proposalStageId = sharedStageId ?? null;
  let sharedTeamData = sharedTeam ?? null;
  const proposalContext = { operators, scoring, roster, stages, getMemoText: (stageId) => memos[stageId]?.text ?? '' };
  // テンプレート機能の状態（プリセットは options から、カスタムは localStorage から）。
  let loadedTemplate = null;
  let customTemplates = loadCustomTemplates();
  let templateFeedback = '';
  let templateFeedbackTimer = null;

  // 攻略メモの状態（stageId -> { text, updatedAt }）。編集・削除は LocalStorage へ即時反映する。
  let memos = loadMemos();
  let memoStageIds = new Set(Object.keys(memos).filter((id) => memos[id]?.text?.trim()));
  const memoContext = {
    getMemoText: (stageId) => memos[stageId]?.text ?? '',
    sharedMemo,
    sharedMemoStageId: sharedTeam?.stageId ?? null,
    onSaveMemo: persistMemo,
    onDeleteMemo: deleteMemo
  };

  function flashTemplateFeedback(message) {
    templateFeedback = message;
    if (templateFeedbackTimer) clearTimeout(templateFeedbackTimer);
    templateFeedbackTimer = setTimeout(() => {
      templateFeedback = '';
      render();
    }, 3000);
  }

  const templateContext = {
    templates,
    get customTemplates() { return customTemplates; },
    get feedback() { return templateFeedback; },
    onLoadTemplate(template) {
      loadedTemplate = { stageId: template.stageId, operatorIds: template.operatorIds, template };
      proposalStageId = template.stageId;
      sharedTeamData = null;
      render();
      detail.querySelector('.team-proposal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    onDeleteTemplate(template) {
      deleteCustomTemplate(template.id);
      customTemplates = loadCustomTemplates();
      flashTemplateFeedback(t('template.deleted'));
      render();
    },
    onSaveTemplate({ stageId, operatorIds, name }) {
      const result = addCustomTemplate({ stageId, operatorIds, name });
      if (result.saved) {
        customTemplates = loadCustomTemplates();
        flashTemplateFeedback(t('template.saved'));
        render();
      }
      return result;
    }
  };

  function render() {
    const selectedChapter = chapter.value;
    chapter.replaceChildren(new Option(t('filter.all'), ''));
    chapterValues.forEach((chapterId) => chapter.add(new Option(chapterName(stages.find((stage) => stage.chapter === chapterId)), chapterId)));
    chapter.value = chapterValues.includes(selectedChapter) ? selectedChapter : '';
    renderStageList({ stages, query, chapter, selectedId: currentStageId, list, empty, memoStageIds });
    const selectedStage = stages.find((stage) => stage.id === currentStageId) ?? null;
    renderStageDetail(selectedStage, detail, proposalContext, proposalStageId, sharedTeamData, loadedTemplate, templateContext, memoContext);
    renderMemoList();
  }

  // メモ保存時は「編成詳細」を再構築すると入力欄のフォーカスが失われるため、
  // ステージ一覧（バッジ）とメモ一覧だけを更新する。編成詳細の入力欄は維持される。
  function renderStageListOnly() {
    renderStageList({ stages, query, chapter, selectedId: currentStageId, list, empty, memoStageIds });
  }

  function renderMemoList() {
    const panel = document.querySelector('#stage-memo-list');
    const items = document.querySelector('#stage-memo-list-items');
    const emptyEl = document.querySelector('#stage-memo-list-empty');
    if (!panel || !items || !emptyEl) return;
    const ids = Object.keys(memos).filter((id) => memos[id]?.text?.trim() && stages.some((stage) => stage.id === id));
    panel.hidden = ids.length === 0;
    emptyEl.hidden = ids.length > 0;
    items.replaceChildren();
    ids.forEach((id) => {
      const stage = stages.find((entry) => entry.id === id);
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'memo-list-item';
      button.dataset.stageId = id;
      const name = makeElement('span', 'memo-list-item-name', stageName(stage));
      const snippet = makeElement('span', 'memo-list-item-snippet', memos[id].text.replace(/\s+/g, ' ').trim().slice(0, 80));
      button.append(name, snippet);
      item.append(button);
      items.append(item);
    });
  }

  function persistMemo(stageId, text) {
    const trimmed = text.trim();
    if (trimmed) {
      memos[stageId] = { text, updatedAt: new Date().toISOString() };
    } else {
      delete memos[stageId];
    }
    memoStageIds = new Set(Object.keys(memos).filter((id) => memos[id]?.text?.trim()));
    const result = saveMemos(memos);
    if (result.saved) {
      renderMemoList();
      renderStageListOnly();
    }
    return result;
  }

  function deleteMemo(stageId) {
    delete memos[stageId];
    memoStageIds = new Set(Object.keys(memos).filter((id) => memos[id]?.text?.trim()));
    const result = saveMemos(memos);
    if (result.saved) {
      renderMemoList();
      renderStageListOnly();
    }
    return result;
  }

  query.addEventListener('input', render);
  chapter.addEventListener('change', render);
  list.addEventListener('click', (event) => {
    const option = event.target.closest('[data-stage-id]');
    if (!option || !list.contains(option)) return;
    currentStageId = option.dataset.stageId;
    proposalStageId = null;
    sharedTeamData = null;
    loadedTemplate = null;
    render();
    list.querySelector(`[data-stage-id="${CSS.escape(currentStageId)}"]`)?.focus();
  });
  const memoListItems = document.querySelector('#stage-memo-list-items');
  if (memoListItems) {
    memoListItems.addEventListener('click', (event) => {
      const option = event.target.closest('[data-stage-id]');
      if (!option || !memoListItems.contains(option)) return;
      currentStageId = option.dataset.stageId;
      proposalStageId = null;
      sharedTeamData = null;
      loadedTemplate = null;
      render();
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  detail.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action="propose-team"]')) return;
    proposalStageId = currentStageId;
    sharedTeamData = null;
    loadedTemplate = null;
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
