import { updateState } from './app-state.js';
import { onLanguageChange, t } from './i18n.js';

const viewTitles = {
  dashboard: 'page.dashboard',
  roster: 'page.roster',
  stages: 'page.stages',
  proposal: 'page.proposal',
  growth: 'page.growth',
  materials: 'page.materials',
  recruitment: 'page.recruitment',
  gacha: 'page.gacha',
  'base-optimizer': 'page.baseOptimizer',
  farming: 'page.farming',
  roadmap: 'page.roadmap',
  database: 'page.database',
  'enemy-db': 'page.enemyDb',
  'operator-detail': 'page.operatorDetail',
  settings: 'page.settings'
};

/** Read the current hash and resolve its view and optional stage ID. @returns {{view: string, stageId: string | null}} */
export function parseRoute(hash = window.location.hash) {
  const [view = 'dashboard', stageId = null] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'proposal') return { view, stageId };
  return { view: viewTitles[view] ? view : 'dashboard', stageId: null };
}

export function initializeNavigationMenu(nav, documentRef = document) {
  if (!nav) return () => {};
  const categories = Array.from(nav.querySelectorAll('.nav-category'));
  const closeCategories = (except = null) => {
    categories.forEach((category) => {
      if (category !== except) category.open = false;
    });
  };
  categories.forEach((category) => {
    category.addEventListener('toggle', () => {
      if (!category.open) return;
      closeCategories(category);
      // Bring the active route into the horizontal scroll viewport on narrow screens.
      category.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    category.addEventListener('click', (event) => {
      if (event.target.closest?.('a')) category.open = false;
    });
  });
  documentRef.addEventListener('click', (event) => {
    if (!categories.some((category) => category.contains(event.target))) closeCategories();
  });
  documentRef.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openCategory = categories.find((category) => category.open);
    if (!openCategory) return;
    closeCategories();
    openCategory.querySelector('summary')?.focus();
  });
  closeCategories();
  return closeCategories;
}

/** Synchronize navigation links, views, URL fragments, and focus behavior. @returns {void} */
export function initializeNavigation() {
  const closeNavigationCategories = initializeNavigationMenu(document.querySelector('.primary-nav'));
  const activateRoute = (focusTitle = true) => {
    closeNavigationCategories();
    const route = parseRoute();
    document.querySelectorAll('[data-view]').forEach((panel) => {
      panel.hidden = panel.dataset.view !== route.view;
    });
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      if (link.dataset.viewLink === route.view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('.nav-category').forEach((category) => {
      const isCurrent = Boolean(category.querySelector(`[data-view-link="${route.view}"]`));
      category.toggleAttribute('data-current', isCurrent);
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
