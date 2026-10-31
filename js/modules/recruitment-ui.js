import { getOperatorName, onLanguageChange, t, getLanguage } from './i18n.js';
import { computeCombinations, MAX_SELECTED_TAGS } from './recruitment.js';

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** タグID → ローカライズ済み表示名。 */
function tagName(tags, tagId) {
  return tags[tagId]?.nameI18n?.[getLanguage()] ?? tags[tagId]?.nameI18n?.en ?? tagId;
}

/**
 * 公開求人タグ計算機のUIを初期化する。表示タグ・候補は選択状態に応じて再描画し、
 * 言語切替時は onLanguageChange で再描画してローカライズへ追従する。
 * @param {{operators: object[], tags: object, tagCategories: Array<{id:string, tags:string[]}>}} params
 */
export function initializeRecruitmentUI({ operators, tags, tagCategories }) {
  const tagGrid = document.querySelector('#recruitment-tags');
  const resultsContainer = document.querySelector('#recruitment-results');
  const emptyHint = document.querySelector('#recruitment-empty');
  const countLabel = document.querySelector('#recruitment-count');
  const resetButton = document.querySelector('#recruitment-reset');
  if (![tagGrid, resultsContainer, emptyHint, countLabel, resetButton].every(Boolean)) return;

  const selected = new Set();

  const toggleTag = (tagId) => {
    if (selected.has(tagId)) {
      selected.delete(tagId);
    } else if (selected.size < MAX_SELECTED_TAGS) {
      selected.add(tagId);
    }
    renderTags();
    renderResults();
  };

  const renderTags = () => {
    const sections = tagCategories.map((category) => {
      const section = makeElement('section', 'recruitment-category');
      section.setAttribute('aria-labelledby', `recruit-cat-${category.id}`);
      section.append(makeElement('h3', 'recruitment-category-title', t(`recruitment.category.${category.id}`)));
      section.firstElementChild.id = `recruit-cat-${category.id}`;
      const list = makeElement('div', 'recruitment-tag-list');
      for (const tagId of category.tags) {
        const button = makeElement('button', 'recruit-tag', tagName(tags, tagId));
        button.type = 'button';
        button.dataset.tagId = tagId;
        button.classList.toggle('is-selected', selected.has(tagId));
        button.setAttribute('aria-pressed', String(selected.has(tagId)));
        button.disabled = !selected.has(tagId) && selected.size >= MAX_SELECTED_TAGS;
        button.addEventListener('click', () => toggleTag(tagId));
        list.append(button);
      }
      section.append(list);
      return section;
    });
    tagGrid.replaceChildren(...sections);
    countLabel.textContent = t('recruitment.count', { count: selected.size });
  };

  const renderResults = () => {
    if (!selected.size) {
      resultsContainer.replaceChildren();
      emptyHint.hidden = false;
      return;
    }
    const results = computeCombinations([...selected], { operators });
    if (!results.length) {
      resultsContainer.replaceChildren();
      emptyHint.hidden = false;
      return;
    }
    emptyHint.hidden = true;
    const cards = results.map((result) => {
      const card = makeElement('article', `recruit-combo${result.tier ? ` tier-${result.tier}` : ''}`);

      const header = makeElement('header', 'recruit-combo-head');
      const tagBadges = makeElement('div', 'recruit-combo-tags');
      for (const tagId of result.tagIds) tagBadges.append(makeElement('span', 'recruit-combo-tag', tagName(tags, tagId)));
      header.append(tagBadges);

      if (result.tier) {
        header.append(makeElement('span', `recruit-badge badge-${result.tier}`, t(`recruitment.tier${result.tier === 'gold' ? 'Gold' : 'Purple'}`)));
      }

      const ops = makeElement('ul', 'recruit-ops');
      const sorted = [...result.operators].sort((a, b) => (b.rarity - a.rarity) || getOperatorName(a).localeCompare(getOperatorName(b)));
      for (const operator of sorted) {
        const chip = makeElement('li', `recruit-op rarity-${operator.rarity}`);
        chip.append(makeElement('span', 'recruit-op-stars', '★'.repeat(operator.rarity)));
        chip.append(makeElement('span', 'recruit-op-name', getOperatorName(operator)));
        ops.append(chip);
      }
      card.append(header, ops);
      return card;
    });
    resultsContainer.replaceChildren(...cards);
  };

  resetButton.addEventListener('click', () => {
    selected.clear();
    renderTags();
    renderResults();
  });

  onLanguageChange(() => {
    renderTags();
    renderResults();
  });

  renderTags();
  renderResults();
}
