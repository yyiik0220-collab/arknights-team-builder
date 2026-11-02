import { getLanguage, getOperatorName, onLanguageChange, t } from './i18n.js';
import { BASE_ROSTER_KEY, FACILITY_LIMITS, optimizeFacility } from './base-optimizer.js';

const facilityKeys = {
  tradePost: 'baseOptimizer.facility.tradePost',
  factory: 'baseOptimizer.facility.factory',
  powerPlant: 'baseOptimizer.facility.powerPlant',
  receptionRoom: 'baseOptimizer.facility.receptionRoom',
  trainingRoom: 'baseOptimizer.facility.trainingRoom'
};

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatEfficiency(value) {
  return `${new Intl.NumberFormat(getLanguage(), { maximumFractionDigits: 1 }).format(value)}%`;
}

function readOwnedRoster(fallback) {
  try {
    const currentRoster = localStorage.getItem(BASE_ROSTER_KEY);
    if (currentRoster !== null) return JSON.parse(currentRoster);
  } catch {
    return [];
  }
  return typeof fallback === 'function' ? fallback() : fallback ?? [];
}

export async function initializeBaseOptimizerUI({ operators, getRoster }) {
  const facilitySelect = document.querySelector('#base-facility');
  const slotsSelect = document.querySelector('#base-slots');
  const summary = document.querySelector('#base-summary');
  const results = document.querySelector('#base-results');
  const pool = document.querySelector('#base-candidates');
  const dataSource = document.querySelector('#base-data-source');
  if (![facilitySelect, slotsSelect, summary, results, pool, dataSource].every(Boolean)) return;

  const response = await fetch(new URL('../../data/base-skills.json', import.meta.url));
  if (!response.ok) throw new Error(`data/base-skills.json (${response.status})`);
  const skillData = await response.json();
  const facilityIds = Object.keys(facilityKeys);
  facilitySelect.replaceChildren(...facilityIds.map((facility) => {
    const option = element('option', '', t(facilityKeys[facility]));
    option.value = facility;
    return option;
  }));

  const render = () => {
    facilitySelect.querySelectorAll('option').forEach((option) => {
      option.textContent = t(facilityKeys[option.value]);
    });
    const facility = facilitySelect.value;
    const maxSlots = FACILITY_LIMITS[facility] ?? 1;
    const currentSlots = Number(slotsSelect.value) || maxSlots;
    slotsSelect.replaceChildren(...Array.from({ length: maxSlots }, (_, index) => {
      const count = index + 1;
      const option = element('option', '', t('baseOptimizer.slotsOption', { count }));
      option.value = String(count);
      return option;
    }));
    slotsSelect.value = String(Math.min(currentSlots, maxSlots));

    const result = optimizeFacility({
      facility,
      roster: readOwnedRoster(getRoster),
      operators,
      skillData,
      maxSlots: Number(slotsSelect.value),
      limit: 3
    });
    summary.textContent = t('baseOptimizer.summary', { owned: result.ownedCount, eligible: result.eligibleCount });
    results.replaceChildren();
    pool.replaceChildren();

    if (result.ownedCount === 0) {
      results.append(element('p', 'base-empty', t('baseOptimizer.noRoster')));
      pool.hidden = true;
    } else if (!result.teams.length) {
      results.append(element('p', 'base-empty', t('baseOptimizer.noCandidates')));
      pool.hidden = true;
    } else {
      pool.hidden = false;
      result.teams.forEach((team, index) => {
        const card = element('article', `base-team${index === 0 ? ' is-top' : ''}`);
        const heading = element('div', 'base-team-heading');
        heading.append(
          element('h3', 'base-team-title', t('baseOptimizer.recommendation', { rank: index + 1 })),
          element('strong', 'base-team-score', `+${formatEfficiency(team.score)}`)
        );
        card.append(heading);
        const memberList = element('ol', 'base-team-members');
        team.members.forEach((member) => {
          const row = element('li', 'base-team-member');
          const name = element('strong', 'base-operator-name', getOperatorName(member.operator));
          const skillList = element('ul', 'base-skill-list');
          member.skills.forEach((skill) => {
            const skillRow = element('li', 'base-skill-entry');
            const skillTitle = skill.efficiency > 0 ? `${skill.name} · +${formatEfficiency(skill.efficiency)}` : skill.name;
            skillRow.append(element('strong', '', skillTitle));
            if (skill.description) skillRow.append(element('span', 'base-skill-description', skill.description));
            skillList.append(skillRow);
          });
          row.append(name, skillList);
          memberList.append(row);
        });
        card.append(memberList);
        if (team.bonuses.length) {
          const bonusList = element('ul', 'base-bonus-list');
          team.bonuses.forEach((bonus) => bonusList.append(element('li', '', bonus)));
          card.append(element('h4', 'base-bonus-title', t('baseOptimizer.activeBonuses')), bonusList);
        }
        results.append(card);
      });
      pool.append(
        element('h3', 'base-pool-title', t('baseOptimizer.eligibleTitle', { count: result.eligibleCount })),
        element('p', 'base-pool-summary', result.candidates.slice(0, 12).map((candidate) => `${getOperatorName(candidate.operator)} +${formatEfficiency(candidate.efficiency)}`).join(' · '))
      );
    }

    const sourceLinks = (skillData.sourceUrls ?? []).map((url) => {
      const link = element('a', 'base-source-link', new URL(url).pathname.split('/').filter(Boolean).at(-1).replaceAll('_', ' '));
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    });
    dataSource.replaceChildren(element('span', '', t('baseOptimizer.sourceLabel', { source: skillData.source })), ...sourceLinks);
  };

  facilitySelect.addEventListener('change', render);
  slotsSelect.addEventListener('change', render);
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === BASE_ROSTER_KEY || event.key === 'arknights-team-builder:user:v1') render();
  });
  onLanguageChange(render);
  render();
}
