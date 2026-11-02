import { getLanguage, onLanguageChange, t } from './i18n.js';
import { calculateEnemyDamage, calculateRequiredAttack, filterAndSortEnemies, getStageEnemyInfo, validateEnemyData } from './enemy-db.js';

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function localizedName(names, fallback) {
  const language = getLanguage();
  return names?.[language] ?? names?.en ?? fallback;
}

function createOption(value, label) {
  const option = element('option', '', label);
  option.value = value;
  return option;
}

function metric(label, value, unit = '') {
  const item = element('div', 'enemy-db-metric');
  item.append(element('dt', '', label), element('dd', '', `${value}${unit}`));
  return item;
}

function localizedStageName(stage) {
  return localizedName(stage.nameI18n, stage.name);
}

export async function initializeEnemyDbUI({ stages = [] } = {}) {
  const queryInput = document.querySelector('#enemy-db-query');
  const typeSelect = document.querySelector('#enemy-db-type');
  const stageSelect = document.querySelector('#enemy-db-stage');
  const sortSelect = document.querySelector('#enemy-db-sort');
  const directionSelect = document.querySelector('#enemy-db-direction');
  const summary = document.querySelector('#enemy-db-summary');
  const stageInfo = document.querySelector('#enemy-db-stage-info');
  const tableHost = document.querySelector('#enemy-db-results');
  const empty = document.querySelector('#enemy-db-empty');
  const detail = document.querySelector('#enemy-db-detail');
  const damageTools = document.querySelector('#enemy-db-damage-tools');
  const damageType = document.querySelector('#enemy-db-damage-type');
  const attackInput = document.querySelector('#enemy-db-attack');
  const hitsInput = document.querySelector('#enemy-db-hits');
  const damageResult = document.querySelector('#enemy-db-damage-result');
  const source = document.querySelector('#enemy-db-source');
  const hosts = [queryInput, typeSelect, stageSelect, sortSelect, directionSelect, summary, stageInfo, tableHost, empty, detail, damageTools, damageType, attackInput, hitsInput, damageResult, source];
  if (!hosts.every(Boolean)) return;

  const response = await fetch(new URL('../../data/enemies.json', import.meta.url));
  if (!response.ok) throw new Error(`data/enemies.json (${response.status})`);
  const enemyData = await response.json();
  validateEnemyData(enemyData);
  const enemies = enemyData.enemies;
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  let selectedEnemy = null;

  stageSelect.replaceChildren(createOption('', t('enemyDb.allStages')),
    ...stages.map((stage) => createOption(stage.id, localizedStageName(stage))));
  typeSelect.replaceChildren(...['all', 'normal', 'elite', 'boss'].map((type) => createOption(type, t(`enemyDb.type.${type}`))));
  sortSelect.replaceChildren(...['name', 'hp', 'atk', 'def', 'res', 'movementSpeed', 'attackInterval'].map((field) => createOption(field, t(`enemyDb.sort.${field}`))));
  damageType.replaceChildren(...['physical', 'arts', 'true'].map((type) => createOption(type, t(`enemyDb.damageType.${type}`))));

  const formatNumber = (value, digits = 2) => new Intl.NumberFormat(getLanguage(), { maximumFractionDigits: digits }).format(value);
  const stageTagsFor = (stage) => (stage?.enemies ?? []).filter((tag) => !/^enemy\.(flying|horde|elite|boss|armored|energy-cluster)$/.test(tag));
  const relevantEnemiesForStage = (stage) => {
    if (!stage) return [];
    const tags = new Set(stageTagsFor(stage));
    return enemies.filter((enemy) => enemy.stageIds.includes(stage.id) || enemy.stageTagIds.some((tag) => tags.has(tag)));
  };

  function renderStageInfo(stage) {
    stageInfo.replaceChildren();
    stageInfo.hidden = !stage;
    if (!stage) return;
    const { exactEnemies, tags } = getStageEnemyInfo(stage, enemies);
    const matchedByTag = relevantEnemiesForStage(stage).filter((enemy) => !exactEnemies.includes(enemy));
    stageInfo.append(element('h3', '', t('enemyDb.stageInfoTitle', { stage: localizedStageName(stage) })));
    if (exactEnemies.length || matchedByTag.length) {
      const list = element('ul', 'enemy-db-stage-list');
      for (const enemy of [...exactEnemies, ...matchedByTag]) list.append(element('li', '', localizedName(enemy.nameI18n, enemy.name)));
      stageInfo.append(list);
    } else {
      stageInfo.append(element('p', 'enemy-db-stage-empty', t('enemyDb.stageUnverified')));
    }
    if (tags.length) {
      const tagList = element('p', 'enemy-db-stage-tags', t('enemyDb.stageTags', { tags: tags.map((tag) => {
        const key = `enemyDb.tag.${tag.replace(/^enemy\./, '')}`;
        const label = t(key);
        return label === key ? tag : label;
      }).join(', ') }));
      stageInfo.append(tagList);
    }
    stageInfo.append(element('p', 'enemy-db-stage-disclaimer', t('enemyDb.stageDataNote')));
  }

  function renderDetail(enemy) {
    selectedEnemy = enemy;
    detail.replaceChildren();
    detail.hidden = !enemy;
    damageTools.hidden = !enemy;
    damageResult.textContent = '';
    if (!enemy) return;

    const heading = element('div', 'enemy-db-detail-heading');
    heading.append(element('span', `enemy-db-badge enemy-db-badge-${enemy.type}`, t(`enemyDb.type.${enemy.type}`)));
    heading.append(element('h3', '', localizedName(enemy.nameI18n, enemy.name)));
    heading.append(element('span', 'enemy-db-code', enemy.code));
    const stats = element('dl', 'enemy-db-metrics');
    const number = (value) => formatNumber(value);
    for (const [key, value, unit] of [
      ['hp', enemy.stats.hp, ''], ['atk', enemy.stats.atk, ''], ['def', enemy.stats.def, ''], ['res', enemy.stats.res, '%'],
      ['movementSpeed', enemy.stats.movementSpeed, ''], ['attackInterval', enemy.stats.attackInterval, t('enemyDb.seconds')]
    ]) stats.append(metric(t(`enemyDb.stat.${key}`), number(value), unit));
    if (enemy.stats.hpRegen) stats.append(metric(t('enemyDb.stat.hpRegen'), number(Math.abs(enemy.stats.hpRegen)), enemy.stats.hpRegen < 0 ? ` ${t('enemyDb.hpLossPerSecond')}` : ` ${t('enemyDb.hpPerSecond')}`));

    const stagesLabel = t('enemyDb.confirmedStages');
    const relatedStages = enemy.stageIds.map((id) => stageById.get(id)).filter(Boolean).map(localizedStageName);
    const relatedTags = enemy.stageTagIds.map((tag) => {
      const key = `enemyDb.tag.${tag.replace(/^enemy\./, '')}`;
      return t(key) === key ? tag : t(key);
    });
    const appearances = element('p', 'enemy-db-appearances', `${stagesLabel}: ${[...relatedStages, ...relatedTags].join(', ') || t('enemyDb.noConfirmedStages')}`);
    const sourceLink = element('a', 'enemy-db-source-link', t('enemyDb.sourceLink'));
    sourceLink.href = enemy.sourceUrl;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    detail.append(heading, stats, appearances, sourceLink);
    updateDamageResult();
  }

  function updateDamageResult() {
    if (!selectedEnemy) return;
    const result = calculateEnemyDamage({ enemy: selectedEnemy, attack: Number(attackInput.value), damageType: damageType.value, hits: Number(hitsInput.value) });
    const hitCount = result?.hitCount == null ? t('enemyDb.unavailable') : t('enemyDb.hitCount', { count: result.hitCount });
    const total = result ? formatNumber(result.totalDamage) : t('enemyDb.unavailable');
    const defeated = result ? t(result.defeatedWithinHits ? 'enemyDb.defeated' : 'enemyDb.notDefeated') : '';
    const required = calculateRequiredAttack({ enemy: selectedEnemy, damageType: damageType.value, hits: Number(hitsInput.value) });
    damageResult.replaceChildren(
      element('p', 'enemy-db-damage-line', t('enemyDb.damageSummary', { damage: total, hits: formatNumber(Number(hitsInput.value), 0), result: defeated })),
      element('p', 'enemy-db-damage-line', t('enemyDb.requiredAttack', { attack: required === null ? t('enemyDb.unavailable') : formatNumber(required) })),
      element('p', 'enemy-db-damage-line', t('enemyDb.attackCount', { count: hitCount }))
    );
  }

  function render() {
    const selectedStage = stageById.get(stageSelect.value);
    const selectedStageTags = stageTagsFor(selectedStage);
    const rows = filterAndSortEnemies(enemies, {
      query: queryInput.value,
      type: typeSelect.value,
      stageId: stageSelect.value,
      stageTags: selectedStageTags,
      sort: sortSelect.value,
      direction: directionSelect.value
    });
    const previousId = selectedEnemy?.id;
    summary.textContent = t('enemyDb.summary', { count: rows.length, total: enemies.length });
    empty.hidden = rows.length > 0;
    tableHost.replaceChildren();
    renderStageInfo(selectedStage);

    if (rows.length) {
      const table = element('table', 'enemy-db-table');
      table.append(element('caption', 'visually-hidden', t('enemyDb.tableCaption')));
      const head = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const key of ['name', 'type', 'hp', 'atk', 'def', 'res', 'movementSpeed', 'attackInterval']) {
        const cell = element('th', '', t(`enemyDb.column.${key}`));
        cell.scope = 'col';
        headerRow.append(cell);
      }
      head.append(headerRow);
      const body = document.createElement('tbody');
      for (const enemy of rows) {
        const row = document.createElement('tr');
        const nameCell = element('th', 'enemy-db-name', localizedName(enemy.nameI18n, enemy.name));
        nameCell.scope = 'row';
        const typeCell = element('td', 'enemy-db-type-cell');
        typeCell.append(element('span', `enemy-db-badge enemy-db-badge-${enemy.type}`, t(`enemyDb.type.${enemy.type}`)));
        row.append(nameCell, typeCell,
          element('td', '', formatNumber(enemy.stats.hp)),
          element('td', '', formatNumber(enemy.stats.atk)),
          element('td', '', formatNumber(enemy.stats.def)),
          element('td', '', `${formatNumber(enemy.stats.res)}%`),
          element('td', '', formatNumber(enemy.stats.movementSpeed)),
          element('td', '', `${formatNumber(enemy.stats.attackInterval)}${t('enemyDb.seconds')}`));
        row.tabIndex = 0;
        row.setAttribute('aria-label', t('enemyDb.openDetail', { name: localizedName(enemy.nameI18n, enemy.name) }));
        row.addEventListener('click', () => renderDetail(enemy));
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            renderDetail(enemy);
          }
        });
        body.append(row);
      }
      table.append(head, body);
      tableHost.append(table);
    }
    const nextSelection = rows.find((enemy) => enemy.id === previousId) ?? rows[0] ?? null;
    renderDetail(nextSelection);
    source.replaceChildren(element('span', '', t('enemyDb.sourceNote', { date: enemyData.updatedAt })), element('span', '', t('enemyDb.stageSourceNote')));
  }

  const renderLabels = () => {
    for (const option of typeSelect.options) option.textContent = t(`enemyDb.type.${option.value}`);
    for (const option of sortSelect.options) option.textContent = t(`enemyDb.sort.${option.value}`);
    for (const option of damageType.options) option.textContent = t(`enemyDb.damageType.${option.value}`);
    stageSelect.options[0].textContent = t('enemyDb.allStages');
    for (const option of [...stageSelect.options].slice(1)) {
      const stage = stageById.get(option.value);
      if (stage) option.textContent = localizedStageName(stage);
    }
    directionSelect.options[0].textContent = t('enemyDb.direction.asc');
    directionSelect.options[1].textContent = t('enemyDb.direction.desc');
    render();
  };
  for (const control of [queryInput, typeSelect, stageSelect, sortSelect, directionSelect]) control.addEventListener(control === queryInput ? 'input' : 'change', render);
  for (const control of [attackInput, hitsInput, damageType]) control.addEventListener('input', updateDamageResult);
  damageType.addEventListener('change', updateDamageResult);
  onLanguageChange(renderLabels);
  renderLabels();
}
