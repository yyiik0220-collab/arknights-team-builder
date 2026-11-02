import { subscribe } from './app-state.js';
import { getLanguage, getOperatorName, localizeMasterValue, onLanguageChange, t } from './i18n.js';
import { buildRoadmapPriorities } from './roadmap.js';

const ROSTER_KEY = 'arknights-team-builder:roster:v1';
const CLEARED_STAGE_KEY = 'arknights-team-builder:roadmap:cleared:v1';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readRoster(fallback) {
  try {
    const stored = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '[]');
    return Array.isArray(stored) ? stored : Array.isArray(stored?.roster) ? stored.roster : fallback;
  } catch {
    return fallback;
  }
}

function readClearedStages(stageIds) {
  try {
    const stored = JSON.parse(localStorage.getItem(CLEARED_STAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string' && stageIds.has(id)) : [];
  } catch {
    return [];
  }
}

function saveClearedStages(stageIds) {
  try {
    localStorage.setItem(CLEARED_STAGE_KEY, JSON.stringify([...stageIds]));
    return true;
  } catch {
    return false;
  }
}

function localizedStageName(stage) {
  return stage.nameI18n?.[getLanguage()] || stage.nameI18n?.en || stage.name;
}

function localizedMaterialName(material, itemId) {
  return material?.nameI18n?.[getLanguage()] || material?.nameI18n?.en || material?.name || itemId;
}

function renderProgress(container, stages, clearedIds, result, onToggle) {
  container.replaceChildren();
  const heading = element('div', 'roadmap-progress-heading');
  heading.append(
    element('h3', '', t('roadmap.progressTitle')),
    element('p', 'roadmap-progress-count', t('roadmap.progressCount', { completed: result.completedCount, total: result.stageCount }))
  );
  const list = element('div', 'roadmap-stage-list');
  stages.slice().sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0) || String(left.id).localeCompare(String(right.id), undefined, { numeric: true })).forEach((stage) => {
    const label = element('label', `roadmap-stage${clearedIds.has(stage.id) ? ' is-cleared' : ''}`);
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = clearedIds.has(stage.id);
    checkbox.dataset.stageId = stage.id;
    checkbox.setAttribute('aria-label', t('roadmap.stageCheckbox', { stage: localizedStageName(stage) }));
    label.append(checkbox, element('span', 'roadmap-stage-name', localizedStageName(stage)));
    if (stage.id === result.nextStage?.id) label.append(element('span', 'roadmap-stage-next', t('roadmap.nextStageBadge')));
    list.append(label);
  });
  list.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-stage-id]');
    if (checkbox) onToggle(checkbox.dataset.stageId, checkbox.checked);
  });
  container.append(heading, list);
}

function renderCosts(candidate, materialById) {
  const section = element('section', 'roadmap-cost');
  section.append(element('h4', '', t('roadmap.costTitle')));
  const lmd = element('p', 'roadmap-lmd', t('roadmap.lmdCost', {
    amount: candidate.cost.lmd === null ? t('roadmap.unknownCost') : new Intl.NumberFormat(getLanguage()).format(candidate.cost.lmd)
  }));
  section.append(lmd);
  if (candidate.cost.items.length) {
    const list = element('ul', 'roadmap-material-list');
    candidate.cost.items.forEach((item) => {
      list.append(element('li', '', t('roadmap.materialCost', {
        name: localizedMaterialName(item.material ?? materialById.get(item.itemId), item.itemId),
        quantity: new Intl.NumberFormat(getLanguage()).format(item.quantity)
      })));
    });
    section.append(list);
  }
  if (!candidate.cost.materialsAvailable) section.append(element('p', 'roadmap-data-note', t('roadmap.materialDataMissing')));
  return section;
}

function renderCandidate(candidate, materialById, index) {
  const card = element('li', 'roadmap-card');
  const heading = element('div', 'roadmap-card-heading');
  heading.append(
    element('span', 'roadmap-rank', t('roadmap.rank', { rank: index + 1 })),
    element('span', 'roadmap-score', t('roadmap.score', { score: candidate.score }))
  );
  const name = element('h3', 'roadmap-operator-name', getOperatorName(candidate.operator));
  const progress = element('p', 'roadmap-operator-progress', t('roadmap.operatorProgress', {
    phase: candidate.currentPhase,
    level: candidate.currentLevel,
    cap: candidate.currentLevelCap,
    target: candidate.targetPhase
  }));
  const reason = candidate.nextStage
    ? t('roadmap.stageReason', {
      operator: getOperatorName(candidate.operator),
      stage: localizedStageName(candidate.nextStage),
      roles: candidate.nextStageFit.roles.map((role) => localizeMasterValue('role', role)).join('、') || t('roadmap.generalRole'),
      phase: candidate.targetPhase
    })
    : t('roadmap.noStageReason', { phase: candidate.targetPhase });
  const reasonNode = element('p', 'roadmap-reason', reason);
  const cardContent = [heading, name, progress, reasonNode];
  if (candidate.nextStageFit.enemies.length) {
    cardContent.push(element('p', 'roadmap-fit-detail', t('roadmap.enemyReason', {
      enemies: candidate.nextStageFit.enemies.map((enemy) => t(`enemy.${enemy}`)).join('、')
    })));
  }
  if (candidate.nextStageFit.mechanics.length) {
    cardContent.push(element('p', 'roadmap-fit-detail', t('roadmap.mechanicReason', {
      mechanics: candidate.nextStageFit.mechanics.map((mechanic) => t(`mechanic.${mechanic}`)).join('、')
    })));
  }
  card.append(...cardContent, renderCosts(candidate, materialById));
  return card;
}

export function initializeRoadmapUI({ operators, roster, stages, materials, scoring }) {
  const progressHost = document.querySelector('#roadmap-progress');
  const summary = document.querySelector('#roadmap-summary');
  const nextStageHost = document.querySelector('#roadmap-next-stage');
  const rankingHost = document.querySelector('#roadmap-rankings');
  const empty = document.querySelector('#roadmap-empty');
  if (![progressHost, summary, nextStageHost, rankingHost, empty].every(Boolean)) return;

  const validStageIds = new Set(stages.map((stage) => stage.id));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const clearedIds = new Set(readClearedStages(validStageIds));
  let currentRoster = readRoster(roster);

  const render = (rosterData = currentRoster) => {
    currentRoster = rosterData;
    const result = buildRoadmapPriorities({ operators, roster: currentRoster, stages, materials, scoring, clearedStageIds: [...clearedIds] });
    renderProgress(progressHost, stages, clearedIds, result, (stageId, isCleared) => {
      if (isCleared) clearedIds.add(stageId);
      else clearedIds.delete(stageId);
      saveClearedStages(clearedIds);
      render();
    });
    summary.textContent = t('roadmap.summary', { owned: result.ownedCount, completed: result.completedCount, total: result.stageCount });
    nextStageHost.replaceChildren();
    if (result.nextStage) {
      nextStageHost.append(
        element('p', 'roadmap-next-label', t('roadmap.nextStage')),
        element('h3', '', localizedStageName(result.nextStage)),
        element('a', 'button button-secondary roadmap-stage-link', t('roadmap.openStage'))
      );
      const stageLink = nextStageHost.querySelector('a');
      stageLink.href = '#stages';
      stageLink.setAttribute('aria-label', t('roadmap.openStageFor', { stage: localizedStageName(result.nextStage) }));
    } else {
      nextStageHost.append(element('p', 'roadmap-all-stages-clear', t('roadmap.allStagesClear')));
    }
    rankingHost.replaceChildren(...result.priorities.map((candidate, index) => renderCandidate(candidate, materialById, index)));
    empty.hidden = result.priorities.length > 0;
    empty.textContent = result.ownedCount
      ? t('roadmap.noActions')
      : t('roadmap.noRoster');
  };

  render();
  const onStorage = (event) => {
    if (!event.key || event.key === ROSTER_KEY || event.key === CLEARED_STAGE_KEY) {
      if (event.key === CLEARED_STAGE_KEY) {
        clearedIds.clear();
        readClearedStages(validStageIds).forEach((id) => clearedIds.add(id));
      }
      render(readRoster(roster));
    }
  };
  window.addEventListener('storage', onStorage);
  subscribe((state) => render(readRoster(state.roster)));
  onLanguageChange(() => render());
  return () => window.removeEventListener('storage', onStorage);
}
