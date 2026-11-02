import { getLanguage, onLanguageChange, t } from './i18n.js';
import { getRarityRates, simulatePulls } from './gacha.js';

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const percentage = (value) => new Intl.NumberFormat(getLanguage(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const number = (value) => new Intl.NumberFormat(getLanguage()).format(value);

export function initializeGachaUI({ config }) {
  const bannerSelect = document.querySelector('#gacha-banner');
  const ratesContainer = document.querySelector('#gacha-rates');
  const resultsContainer = document.querySelector('#gacha-results');
  const statsContainer = document.querySelector('#gacha-stats');
  const pityLabel = document.querySelector('#gacha-pity');
  const currencyLabel = document.querySelector('#gacha-currency');
  const feedback = document.querySelector('#gacha-feedback');
  const resetButton = document.querySelector('#gacha-reset');
  const singleButton = document.querySelector('#gacha-single');
  const tenButton = document.querySelector('#gacha-ten');
  if (![bannerSelect, ratesContainer, resultsContainer, statsContainer, pityLabel, currencyLabel, feedback, resetButton, singleButton, tenButton].every(Boolean)) return;

  const bannerIds = Object.keys(config.banners);
  const bannerNames = { limited: 'gacha.banner.limited', standard: 'gacha.banner.standard', beginner: 'gacha.banner.beginner' };
  const stats = { total: 0, six: 0, five: 0, pityHits: 0 };
  const pityByBanner = Object.fromEntries(bannerIds.map((id) => [id, 0]));
  let latestResults = [];
  let latestBannerId = bannerIds.includes('limited') ? 'limited' : bannerIds[0];

  const activeBannerId = () => bannerSelect.value;

  const renderRates = () => {
    const banner = config.banners[activeBannerId()];
    const rates = getRarityRates(banner, pityByBanner[activeBannerId()]);
    ratesContainer.replaceChildren(...[6, 5, 4, 3].map((rarity) => {
      const row = makeElement('div', `gacha-rate rarity-${rarity}`);
      row.append(makeElement('span', 'gacha-rate-stars', '★'.repeat(rarity)));
      row.append(makeElement('span', 'gacha-rate-value', percentage(rates[rarity])));
      return row;
    }));
    const current = pityByBanner[activeBannerId()];
    pityLabel.textContent = t('gacha.pityProgress', { current: number(current), next: number(Math.min(current + 1, banner.pity.guaranteedAt)), guarantee: number(banner.pity.guaranteedAt) });
  };

  const renderStats = () => {
    const sixRate = stats.total ? stats.six / stats.total : 0;
    const fiveRate = stats.total ? stats.five / stats.total : 0;
    const rows = [
      ['gacha.totalPulls', number(stats.total)],
      ['gacha.sixStars', `${number(stats.six)} · ${percentage(sixRate)}`],
      ['gacha.fiveStars', `${number(stats.five)} · ${percentage(fiveRate)}`],
      ['gacha.pityHits', number(stats.pityHits)]
    ];
    statsContainer.replaceChildren(...rows.map(([label, value]) => {
      const row = makeElement('div', 'gacha-stat');
      row.append(makeElement('dt', '', t(label)), makeElement('dd', '', value));
      return row;
    }));
    currencyLabel.textContent = t('gacha.currencySpent', { amount: number(stats.total * config.currencyPerPull) });
  };

  const renderResults = () => {
    if (!latestResults.length) {
      resultsContainer.replaceChildren(makeElement('p', 'gacha-empty', t('gacha.empty')));
      return;
    }
    resultsContainer.replaceChildren(...latestResults.map((result) => {
      const card = makeElement('article', `gacha-pull rarity-${result.rarity}`);
      card.setAttribute('aria-label', `${'★'.repeat(result.rarity)}${result.featured ? ` · ${t('gacha.featured')}` : ''}`);
      card.append(makeElement('span', 'gacha-pull-stars', '★'.repeat(result.rarity)));
      if (result.rarity === 6 && config.banners[latestBannerId].featuredRate !== undefined) {
        card.append(makeElement('span', 'gacha-pull-badge', t(result.featured ? 'gacha.featured' : 'gacha.offBanner')));
      }
      return card;
    }));
  };

  const draw = (count) => {
    const bannerId = activeBannerId();
    const outcome = simulatePulls({ banner: config.banners[bannerId], count, pityCount: pityByBanner[bannerId] });
    pityByBanner[bannerId] = outcome.pityCount;
    latestBannerId = bannerId;
    latestResults = outcome.results;
    for (const result of outcome.results) {
      stats.total += 1;
      if (result.rarity === 6) stats.six += 1;
      if (result.rarity === 5) stats.five += 1;
      if (result.pityHit) stats.pityHits += 1;
    }
    feedback.textContent = t('gacha.drawFeedback', { count: number(count), six: number(outcome.results.filter((result) => result.rarity === 6).length) });
    renderRates();
    renderResults();
    renderStats();
  };

  bannerSelect.replaceChildren(...bannerIds.map((id) => {
    const option = makeElement('option', '', t(bannerNames[id] ?? `gacha.banner.${id}`));
    option.value = id;
    return option;
  }));
  bannerSelect.value = bannerIds.includes('limited') ? 'limited' : bannerIds[0];
  bannerSelect.addEventListener('change', renderRates);
  singleButton.addEventListener('click', () => draw(1));
  tenButton.addEventListener('click', () => draw(10));
  resetButton.addEventListener('click', () => {
    stats.total = 0;
    stats.six = 0;
    stats.five = 0;
    stats.pityHits = 0;
    for (const id of bannerIds) pityByBanner[id] = 0;
    latestBannerId = activeBannerId();
    latestResults = [];
    feedback.textContent = t('gacha.resetDone');
    renderRates();
    renderResults();
    renderStats();
  });
  onLanguageChange(() => {
    bannerSelect.querySelectorAll('option').forEach((option) => {
      option.textContent = t(bannerNames[option.value] ?? `gacha.banner.${option.value}`);
    });
    renderRates();
    renderResults();
    renderStats();
  });

  renderRates();
  renderResults();
  renderStats();
}
