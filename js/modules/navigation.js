import { updateState } from './app-state.js';
import { onLanguageChange, t } from './i18n.js';

const viewTitles = {
  dashboard: 'page.dashboard',
  roster: 'page.roster',
  stages: 'page.stages',
  proposal: 'page.proposal',
  growth: 'page.growth',
  database: 'page.database',
  'operator-detail': 'page.operatorDetail',
  settings: 'page.settings'
};

/** Read the current hash and resolve its view and optional stage ID. @returns {{view: string, stageId: string | null}} */
export function parseRoute(hash = window.location.hash) {
  const [view = 'dashboard', stageId = null] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'proposal') return { view, stageId };
  return { view: viewTitles[view] ? view : 'dashboard', stageId: null };
}

/** Synchronize navigation links, views, URL fragments, and focus behavior. @returns {void} */
export function initializeNavigation() {
  const activateRoute = (focusTitle = true) => {
    const route = parseRoute();
    document.querySelectorAll('[data-view]').forEach((panel) => {
      panel.hidden = panel.dataset.view !== route.view;
    });
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      if (link.dataset.viewLink === route.view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const title = document.querySelector('#page-title');
    if (title) {
      title.textContent = t(viewTitles[route.view]);
      if (focusTitle && document.activeElement !== document.body) title.focus({ preventScroll: true });
    }
    updateState({ activeView: route.view, selectedStageId: route.stageId });
  };
  window.addEventListener('hashchange', activateRoute);
  onLanguageChange(() => activateRoute(false));
  activateRoute();
}
