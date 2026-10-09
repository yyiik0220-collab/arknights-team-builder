import { updateState } from './app-state.js';
import { onLanguageChange, t } from './i18n.js';

let lastMasters = null;
let listeningForLanguage = false;
let statusListeningForLanguage = false;
let statusKey = 'status.loading';
let statusValues = {};

const countTemplate = (label, value, detail) => {
  const card = document.createElement('article');
  card.className = 'summary-card';
  const heading = document.createElement('span');
  heading.textContent = label;
  const count = document.createElement('strong');
  count.textContent = String(value);
  const note = document.createElement('small');
  note.textContent = detail;
  card.append(heading, count, note);
  return card;
};

/** Render source-data summary without injecting JSON strings as HTML. @param {{operators: object, stages: object}} masters */
export function renderMasterSummary(masters) {
  lastMasters = masters;
  if (!listeningForLanguage) {
    listeningForLanguage = true;
    onLanguageChange(() => {
      if (lastMasters) renderMasterSummary(lastMasters);
    });
  }
  const container = document.querySelector('#master-summary');
  if (!container) return;
  const sixStar = masters.operators.operators.filter((operator) => operator.rarity === 6).length;
  container.replaceChildren(
    countTemplate(t('summary.operators'), masters.operators.operators.length, t('summary.operatorsDetail')),
    countTemplate(t('summary.sixStar'), sixStar, t('summary.registeredData')),
    countTemplate(t('summary.stages'), masters.stages.stages.length, t('summary.initialEntries'))
  );
  updateState({ masterData: masters });
}

/** Update the application live region with initialization or recovery feedback. @param {string} message */
export function setStatus(key, values = {}) {
  statusKey = key;
  statusValues = values;
  const status = document.querySelector('#app-status');
  if (status) status.textContent = t(statusKey, statusValues);
  if (!statusListeningForLanguage) {
    statusListeningForLanguage = true;
    onLanguageChange(() => {
      const currentStatus = document.querySelector('#app-status');
      if (currentStatus) currentStatus.textContent = t(statusKey, statusValues);
    });
  }
}
