import { getLanguage, onLanguageChange, t } from './i18n.js';
import { calculateFarmingRates, filterAndSortFarmingRates, getFarmingMaterials } from './farming.js';

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

export async function initializeFarmingUI({ stages, materials }) {
  const categorySelect = document.querySelector('#farming-category');
  const materialSelect = document.querySelector('#farming-material');
  const sortSelect = document.querySelector('#farming-sort');
  const tableHost = document.querySelector('#farming-results');
  const summary = document.querySelector('#farming-summary');
  const empty = document.querySelector('#farming-empty');
  const sources = document.querySelector('#farming-sources');
  if (![categorySelect, materialSelect, sortSelect, tableHost, summary, empty, sources].every(Boolean)) return;

  const response = await fetch(new URL('../../data/drop-rates.json', import.meta.url));
  if (!response.ok) throw new Error(`data/drop-rates.json (${response.status})`);
  const dropData = await response.json();
  const rates = calculateFarmingRates({ stages, materials, dropData });
  const availableMaterials = getFarmingMaterials({ materials, dropData });
  const categories = ['all', 'currency', 'records', 'promotion', 'skill', 'chips'];

  const render = () => {
    const category = categorySelect.value || 'all';
    const materialOptions = availableMaterials.filter((material) => category === 'all' || material.category === category);
    const previousMaterial = materialSelect.value;
    materialSelect.replaceChildren(
      element('option', '', t('farming.allMaterials')),
      ...materialOptions.map((material) => {
        const option = element('option', '', localizedName(material.nameI18n, material.name));
        option.value = material.id;
        option.disabled = !material.available;
        return option;
      })
    );
    if (materialOptions.some((material) => material.id === previousMaterial)) materialSelect.value = previousMaterial;
    else materialSelect.value = '';

    const rows = filterAndSortFarmingRates(rates, {
      category,
      materialId: materialSelect.value,
      sort: sortSelect.value
    });
    summary.textContent = t('farming.summary', { stages: new Set(rows.map((row) => row.stageId)).size, materials: new Set(rows.map((row) => row.materialId)).size, count: rows.length });
    empty.hidden = rows.length > 0;
    tableHost.replaceChildren();
    if (rows.length) {
      const table = element('table', 'farming-table');
      const caption = element('caption', 'visually-hidden', t('farming.tableCaption'));
      const head = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const key of ['stage', 'material', 'expected', 'sanity', 'efficiency', 'samples']) {
        const cell = element('th', '', t(`farming.column.${key}`));
        cell.scope = 'col';
        headerRow.append(cell);
      }
      head.append(headerRow);
      const body = document.createElement('tbody');
      const number = new Intl.NumberFormat(getLanguage(), { maximumFractionDigits: 3 });
      rows.forEach((row) => {
        const tr = element('tr', row.isBest ? 'is-best' : '');
        const stageName = localizedName(row.stageNameI18n, row.stageCode);
        const stageCell = element('th', 'farming-stage', stageName);
        stageCell.scope = 'row';
        const materialLabel = localizedName(row.materialNameI18n, row.materialName);
        const materialCell = element('td', 'farming-material', materialLabel);
        const best = row.isBest ? element('span', 'farming-best', t('farming.best')) : null;
        if (best) materialCell.append(best);
        tr.append(
          stageCell,
          materialCell,
          element('td', '', number.format(row.expectedAmount)),
          element('td', '', number.format(row.sanityCost)),
          element('td', 'farming-efficiency', number.format(row.efficiency)),
          element('td', '', number.format(row.samples))
        );
        body.append(tr);
      });
      table.append(caption, head, body);
      tableHost.append(table);
    }
    sources.replaceChildren(
      element('span', '', t('farming.dataNote', { date: dropData.updatedAt, server: dropData.server })),
      ...dropData.sourceUrls.map((url) => {
        const link = element('a', 'farming-source-link', new URL(url).pathname.split('/').filter(Boolean).at(-1));
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', t('farming.sourceLinkLabel'));
        return link;
      })
    );
  };

  categorySelect.replaceChildren(...categories.map((category) => {
    const option = element('option', '', t(`farming.category.${category}`));
    option.value = category;
    return option;
  }));
  const renderLabels = () => {
    categorySelect.querySelectorAll('option').forEach((option) => { option.textContent = t(`farming.category.${option.value}`); });
    sortSelect.querySelectorAll('option').forEach((option) => { option.textContent = t(`farming.sort.${option.value}`); });
    render();
  };
  categorySelect.addEventListener('change', render);
  materialSelect.addEventListener('change', render);
  sortSelect.addEventListener('change', render);
  onLanguageChange(renderLabels);
  render();
}
