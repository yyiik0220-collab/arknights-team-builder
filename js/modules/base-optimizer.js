export const BASE_ROSTER_KEY = 'arknights-team-builder:roster:v1';

export const FACILITY_LIMITS = {
  tradePost: 3,
  factory: 3,
  powerPlant: 1,
  receptionRoom: 3,
  trainingRoom: 1
};

function normalizePromotion(entry) {
  const value = entry?.promotionPhase ?? entry?.promotion ?? entry?.elite ?? 0;
  if (typeof value === 'string') {
    const match = value.match(/(?:E|PHASE_)?([0-2])/i);
    return match ? Number(match[1]) : 0;
  }
  return Number.isInteger(value) ? Math.min(2, Math.max(0, value)) : 0;
}

export function normalizeOwnedRoster(roster) {
  const entries = Array.isArray(roster) ? roster : Array.isArray(roster?.roster) ? roster.roster : [];
  const owned = new Map();
  for (const entry of entries) {
    const operatorId = typeof entry === 'string' ? entry : entry?.operatorId ?? entry?.operator_id ?? entry?.id;
    if (typeof operatorId !== 'string' || !operatorId || entry?.owned === false) continue;
    const promotionPhase = normalizePromotion(typeof entry === 'string' ? null : entry);
    const previous = owned.get(operatorId);
    if (!previous || promotionPhase > previous.promotionPhase) owned.set(operatorId, { operatorId, promotionPhase });
  }
  return [...owned.values()];
}

export function selectActiveSkills(operatorSkills, facility, promotionPhase = 2) {
  const eligible = (operatorSkills ?? []).filter((skill) => skill.facility === facility && skill.promotion <= promotionPhase);
  const bySet = new Map();
  for (const skill of eligible) {
    const setId = skill.skillSet ?? 0;
    const current = bySet.get(setId);
    if (!current || skill.promotion > current.promotion) bySet.set(setId, skill);
  }
  return [...bySet.values()];
}

function scoreTeam(team) {
  const baseScore = team.reduce((total, member) => total + member.skills.reduce((skillTotal, skill) => skillTotal + (Number(skill.efficiency) || 0), 0), 0);
  const replacementRule = team.flatMap((member) => member.skills
    .filter((skill) => skill.teamRule?.kind === 'replace-team-efficiency-per-partner')
    .map((skill) => ({ member, skill })))[0];
  if (replacementRule) {
    const { member, skill } = replacementRule;
    const partnerCount = Math.min(team.length - 1, skill.teamRule.maxPartners ?? Infinity);
    const ownScore = member.skills.reduce((total, entry) => total + (Number(entry.efficiency) || 0), 0);
    return ownScore + partnerCount * skill.teamRule.valuePerPartner;
  }
  return baseScore + team.reduce((total, member) => total + member.skills.reduce((skillTotal, skill) => {
    return skillTotal + (skill.bonuses ?? []).reduce((bonusTotal, bonus) => {
      const satisfied = (bonus.partners ?? []).every((partnerId) => team.some((candidate) => candidate.operator.id === partnerId));
      return bonusTotal + (satisfied ? Number(bonus.value) || 0 : 0);
    }, 0);
  }, 0), 0);
}

function activeBonusNotes(team) {
  const notes = new Set();
  for (const member of team) {
    for (const skill of member.skills) {
      if (skill.teamRule?.note) notes.add(skill.teamRule.note);
      for (const bonus of skill.bonuses ?? []) {
        const satisfied = (bonus.partners ?? []).every((partnerId) => team.some((candidate) => candidate.operator.id === partnerId));
        if (satisfied && bonus.note) notes.add(bonus.note);
      }
    }
  }
  return [...notes];
}

function compareTeams(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  if (right.members.length !== left.members.length) return right.members.length - left.members.length;
  const leftKey = left.members.map((entry) => entry.operator.id).sort().join('|');
  const rightKey = right.members.map((entry) => entry.operator.id).sort().join('|');
  return leftKey.localeCompare(rightKey);
}

export function optimizeFacility({ facility, roster, operators, skillData, maxSlots, limit = 3 }) {
  const ownedRoster = normalizeOwnedRoster(roster);
  const operatorById = new Map((operators ?? []).map((operator) => [operator.id, operator]));
  const skillsById = new Map((skillData?.operators ?? []).map((entry) => [entry.id, entry.skills ?? []]));
  const capacity = Math.min(FACILITY_LIMITS[facility] ?? 1, Math.max(1, Math.floor(maxSlots ?? FACILITY_LIMITS[facility] ?? 1)));
  const candidates = ownedRoster.flatMap((entry) => {
    const operator = operatorById.get(entry.operatorId);
    if (!operator) return [];
    const skills = selectActiveSkills(skillsById.get(entry.operatorId), facility, entry.promotionPhase);
    if (!skills.length) return [];
    const efficiency = skills.reduce((total, skill) => total + (Number(skill.efficiency) || 0), 0);
    return [{ operator, promotionPhase: entry.promotionPhase, skills, efficiency }];
  }).sort((left, right) => right.efficiency - left.efficiency || left.operator.id.localeCompare(right.operator.id));
  const teams = [];
  const selected = [];
  const visit = (startIndex) => {
    if (selected.length > 0) {
      const members = selected.map((candidate) => ({ ...candidate }));
      teams.push({ members, score: scoreTeam(members), bonuses: activeBonusNotes(members) });
    }
    if (selected.length === capacity) return;
    for (let index = startIndex; index < candidates.length; index += 1) {
      selected.push(candidates[index]);
      visit(index + 1);
      selected.pop();
    }
  };
  visit(0);
  teams.sort(compareTeams);
  const uniqueTeams = [];
  const seen = new Set();
  for (const team of teams) {
    const key = team.members.map((member) => member.operator.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTeams.push(team);
    if (uniqueTeams.length === limit) break;
  }
  return {
    ownedCount: ownedRoster.length,
    eligibleCount: candidates.length,
    capacity,
    candidates,
    teams: uniqueTeams
  };
}
