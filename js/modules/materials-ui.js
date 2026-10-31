import { getMaterialName, getPromotionItems, getMasteryItems, getModuleItems, aggregateRequirements } from './materials.js';
import { getOperatorName, onLanguageChange, t } from './i18n.js';
import { loadMaterialInventory, saveMaterialInventory } from './storage.js';

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSelectField(labelText, name, values, className = 'materials-field') {
  const label = makeElement('label', className);
  label.append(makeElement('span', '', labelText));
  const select = document.createElement('select');
  select.name = name;
  for (const [value, text] of values) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = text;
    select.append(option);
  }
  label.append(select);
  return label;
}

function describeEntry(entry, operatorById) {
  const operator = operatorById.get(entry.operatorId);
  if (!operator) return entry.id;
  const name = getOperatorName(operator);
  if (entry.type === 'promotion') {
    return `${name} · ${t(entry.phase === 1 ? 'materials.targetE1' : 'materials.targetE2')}`;
  }
  if (entry.type === 'mastery') {
    const skill = (operator.skills ?? []).find((candidate) => candidate.id === entry.skillId);
    return `${name} · ${getOperatorName(skill ?? { name: entry.skillId })} ${t('materials.masteryLevel', { level: entry.level })}`;
  }
  const module = (operator.modules ?? []).find((candidate) => candidate.id === entry.moduleId);
  return `${name} · ${getOperatorName(module ?? { name: entry.moduleId })} ${t('materials.moduleLevel', { level: entry.level })}`;
}

export function initializeMaterialsUI({ operators, materials }) {
  const operatorSelect = document.querySelector('#material-operator');
  const typeSelect = document.querySelector('#material-target-type');
  const detail = document.querySelector('#material-target-detail');
  const form = document.querySelector('#materials-add-form');
  const planList = document.querySelector('#material-plan-list');
  const planEmpty = document.querySelector('#material-plan-empty');
  const planCount = document.querySelector('#material-plan-count');
  const requirements = document.querySelector('#material-requirements');
  const requirementEmpty = document.querySelector('#material-requirement-empty');
  const requirementCount = document.querySelector('#material-requirement-count');
  const resetButton = document.querySelector('#material-reset');
  const feedback = document.querySelector('#material-feedback');
  if (![operatorSelect, typeSelect, detail, form, planList, planEmpty, planCount, requirements, requirementEmpty, requirementCount, resetButton, feedback].every(Boolean)) return;

  const materialsById = new Map(materials.map((material) => [material.id, material]));
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const sortedOperators = [...operators].sort((a, b) => getOperatorName(a).localeCompare(getOperatorName(b)));
  const sortedMaterials = [...materials].sort((a, b) => (a.tier - b.tier) || getMaterialName(a).localeCompare(getMaterialName(b)));

  let plan = [];
  let inventory = loadMaterialInventory();
  let entryCounter = 0;

  const currentOperator = () => operatorById.get(operatorSelect.value);

  const populateOperatorSelect = () => {
    operatorSelect.replaceChildren(...sortedOperators.map((operator) => {
      const option = document.createElement('option');
      option.value = operator.id;
      option.textContent = getOperatorName(operator);
      return option;
    }));
  };

  const populateTypeSelect = () => {
    typeSelect.replaceChildren(
      ...[['promotion', 'materials.targetType.promotion'], ['mastery', 'materials.targetType.mastery'], ['module', 'materials.targetType.module']]
        .map(([value, key]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = t(key);
          return option;
        })
    );
  };

  const renderDetail = () => {
    const operator = currentOperator();
    detail.replaceChildren();
    if (!operator) return;
    if (typeSelect.value === 'promotion') {
      detail.append(makeSelectField(t('materials.targetPhase'), 'phase', [[1, t('materials.targetE1')], [2, t('materials.targetE2')]]));
      return;
    }
    if (typeSelect.value === 'mastery') {
      const skills = operator.skills ?? [];
      if (!skills.length) {
        detail.append(makeElement('p', 'materials-detail-note', t('materials.noSkills')));
        return;
      }
      detail.append(makeSelectField(t('materials.targetSkill'), 'skill', skills.map((skill) => [skill.id, getOperatorName(skill)])));
      detail.append(makeSelectField(t('materials.targetMasteryLevel'), 'level', [1, 2, 3].map((level) => [level, t('materials.masteryLevel', { level })])));
      return;
    }
    const modules = operator.modules ?? [];
    if (!modules.length) {
      detail.append(makeElement('p', 'materials-detail-note', t('materials.noModules')));
      return;
    }
    detail.append(makeSelectField(t('materials.targetModule'), 'module', modules.map((module) => [module.id, getOperatorName(module)])));
    detail.append(makeSelectField(t('materials.targetModuleLevel'), 'level', [1, 2, 3].map((level) => [level, t('materials.moduleLevel', { level })])));
  };

  const addTarget = () => {
    const operator = currentOperator();
    if (!operator) return;
    const type = typeSelect.value;
    const formData = new FormData(form);
    let entry;
    if (type === 'promotion') {
      const phase = Number(formData.get('phase'));
      entry = { operatorId: operator.id, type, phase, items: getPromotionItems(operator, phase) };
    } else if (type === 'mastery') {
      const skillId = String(formData.get('skill') ?? '');
      const level = Number(formData.get('level'));
      if (!skillId) return;
      entry = { operatorId: operator.id, type, skillId, level, items: getMasteryItems(operator, skillId, level) };
    } else {
      const moduleId = String(formData.get('module') ?? '');
      const level = Number(formData.get('level'));
      if (!moduleId) return;
      entry = { operatorId: operator.id, type, moduleId, level, items: getModuleItems(operator, moduleId, level) };
    }
    entry.id = `${entry.operatorId}:${entry.type}:${entryCounter += 1}`;
    entry.hasData = Array.isArray(entry.items);
    plan = [...plan, entry];
    feedback.textContent = '';
    renderPlan();
    renderRequirements();
  };

  const renderPlan = () => {
    if (!plan.length) {
      planList.replaceChildren();
      planEmpty.hidden = false;
      planCount.textContent = '';
      return;
    }
    planEmpty.hidden = true;
    planCount.textContent = t('materials.planCount', { count: plan.length });
    planList.replaceChildren(...plan.map((entry) => {
      const item = makeElement('li', 'material-plan-entry');
      const label = makeElement('div', 'material-plan-label');
      label.append(makeElement('strong', '', describeEntry(entry, operatorById)));
      if (!entry.hasData) label.append(makeElement('span', 'material-plan-missing', t('materials.missingData')));
      const remove = makeElement('button', 'icon-button', t('materials.remove'));
      remove.type = 'button';
      remove.dataset.entryId = entry.id;
      remove.setAttribute('aria-label', `${t('materials.remove')}: ${describeEntry(entry, operatorById)}`);
      item.append(label, remove);
      return item;
    }));
  };

  const renderRequirements = () => {
    const aggregated = aggregateRequirements(plan);
    if (!aggregated.length) {
      requirements.replaceChildren();
      requirementEmpty.hidden = false;
      requirementCount.textContent = '';
      return;
    }
    requirementEmpty.hidden = true;
    const byId = new Map(aggregated.map((entry) => [entry.materialId, entry.quantity]));
    const tiers = new Map();
    for (const material of sortedMaterials) {
      const quantity = byId.get(material.id);
      if (!quantity) continue;
      if (!tiers.has(material.tier)) tiers.set(material.tier, []);
      tiers.get(material.tier).push({ material, quantity });
    }
    const groups = [...tiers.entries()].sort((a, b) => a[0] - b[0]).map(([tier, rows]) => {
      const section = makeElement('section', 'material-tier-group');
      section.append(makeElement('h4', 'material-tier-title', t('materials.tier', { n: tier })));
      const list = makeElement('ul', 'material-list');
      for (const { material, quantity } of rows) list.append(makeMaterialRow(material, quantity));
      section.append(list);
      return section;
    });
    requirementCount.textContent = t('materials.requirementCount', { count: aggregated.length });
    requirements.replaceChildren(...groups);
  };

  function makeMaterialRow(material, quantity) {
    const row = makeElement('li', 'material-row');
    row.dataset.materialId = material.id;
    const identity = makeElement('div', 'material-identity');
    identity.append(
      makeElement('strong', 'material-name', getMaterialName(material)),
      makeElement('span', `material-tier tier-${material.tier}`, `T${material.tier}`)
    );
    const stats = makeElement('div', 'material-stats');
    const required = makeElement('span', 'material-required', t('materials.required', { count: quantity }));
    const ownedLabel = makeElement('label', 'material-owned');
    ownedLabel.append(makeElement('span', '', t('materials.owned')));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.value = String(inventory[material.id] ?? 0);
    input.addEventListener('change', () => {
      const owned = Number.isFinite(input.valueAsNumber) && input.valueAsNumber >= 0 ? Math.floor(input.valueAsNumber) : 0;
      inventory[material.id] = owned;
      input.value = String(owned);
      saveMaterialInventory(inventory);
      updateRowStatus(row, quantity, owned);
    });
    ownedLabel.append(input);
    const status = makeElement('span', 'material-status');
    stats.append(required, ownedLabel, status);
    row.append(identity, stats);
    updateRowStatus(row, quantity, inventory[material.id] ?? 0);
    return row;
  }

  function updateRowStatus(row, quantity, owned) {
    const status = row.querySelector('.material-status');
    const shortage = Math.max(0, quantity - owned);
    const surplus = Math.max(0, owned - quantity);
    row.classList.toggle('is-short', shortage > 0);
    if (shortage > 0) {
      status.textContent = t('materials.shortage', { count: shortage });
      status.className = 'material-status is-short';
    } else if (surplus > 0) {
      status.textContent = t('materials.surplus', { count: surplus });
      status.className = 'material-status is-surplus';
    } else {
      status.textContent = t('materials.justEnough');
      status.className = 'material-status';
    }
  }

  const resetOwned = () => {
    if (!window.confirm(t('materials.resetConfirm'))) return;
    inventory = {};
    saveMaterialInventory(inventory);
    feedback.textContent = t('materials.resetDone');
    renderRequirements();
  };

  const refresh = () => {
    populateOperatorSelect();
    populateTypeSelect();
    renderDetail();
    renderPlan();
    renderRequirements();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addTarget();
  });
  typeSelect.addEventListener('change', renderDetail);
  operatorSelect.addEventListener('change', renderDetail);
  planList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-entry-id]');
    if (!button) return;
    plan = plan.filter((entry) => entry.id !== button.dataset.entryId);
    renderPlan();
    renderRequirements();
  });
  resetButton.addEventListener('click', resetOwned);
  onLanguageChange(refresh);
  refresh();
}
