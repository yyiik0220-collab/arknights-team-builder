/**
 * synergy-ui.js — 編成シナジーの可視化（関係図・クラス構成・一覧・提案）。
 *
 * DOM の生成は innerHTML を一切使わず、createElement / createElementNS で行う。
 * グラフは SVG で自前実装する（外部チャートライブラリ不使用）。
 *   ・関係図: オペレーターを円周上に配置し、シナジーで結ばれたペアを線でつなぐ。
 *   ・クラス構成: 職業別人数を横棒グラフで表示する。
 * 配色は base.css の --ak-* トークン（--ak-class-* / --ak-syn-*）を参照する。
 */
import { getOperatorName, localizeMasterValue, t } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** シナジー型の並び順（一覧・凡例の表示順）。未知型は末尾に回す。 */
const SYNERGY_TYPE_ORDER = ['faction', 'combo', 'talent', 'skill', 'buff'];

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** SVG 要素を生成する（属性はオブジェクトで指定）。 */
function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  return element;
}

/** シナジー型の表示名を返す（未知型は生の型文字列にフォールバック）。 */
function synergyTypeLabel(type) {
  const label = t(`synergy.type.${type}`);
  return label === `synergy.type.${type}` ? type : label;
}

/** 型の表示順序を整える（未知型は定義順の後ろへ）。 */
function sortedTypes(types) {
  const ordered = [...types].sort((a, b) => {
    const ia = SYNERGY_TYPE_ORDER.indexOf(a);
    const ib = SYNERGY_TYPE_ORDER.indexOf(b);
    const rankA = ia === -1 ? SYNERGY_TYPE_ORDER.length : ia;
    const rankB = ib === -1 ? SYNERGY_TYPE_ORDER.length : ib;
    return rankA - rankB || a.localeCompare(b);
  });
  return ordered;
}

// ---- 関係図（SVG） -------------------------------------------------------------

/**
 * シナジー関係図を SVG で生成する。ノードは円周配置、シナジーペアは線で結ぶ。
 * @param {object[]} pairs 検出済みシナジーペア
 * @param {object[]} teamOperators 編成メンバー
 * @returns {SVGSVGElement}
 */
function buildSynergyGraph(pairs, teamOperators) {
  const width = 600;
  const height = 380;
  const cx = width / 2;
  const cy = height / 2 - 4;
  const rx = 232;
  const ry = 142;

  const svg = svgElement('svg', {
    class: 'synergy-graph',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': t('synergy.graphLabel')
  });
  const n = teamOperators.length;
  const positions = new Map();
  teamOperators.forEach((operator, index) => {
    // 先頭を真上（-90°）に置き、時計回りに等間隔で配置する。
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    positions.set(operator.id, { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  });

  // 線（シナジー関係）を先に描画し、ノードを上に重ねる。
  for (const pair of pairs) {
    const a = positions.get(pair.a);
    const b = positions.get(pair.b);
    if (!a || !b) continue;
    const type = sortedTypes(pair.types)[0] ?? 'unknown';
    const line = svgElement('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      class: `syn-edge syn-edge--${type}`
    });
    // 線の太さを強度に応じて増減する（太いほど強いシナジー）。
    line.setAttribute('stroke-width', String(1.2 + pair.strength * 0.55));
    svg.append(line);
  }

  // ノード（職業色の円）＋名前ラベル。
  teamOperators.forEach((operator) => {
    const pos = positions.get(operator.id);
    if (!pos) return;
    const name = getOperatorName(operator);
    const label = name.length > 10 ? `${name.slice(0, 9)}…` : name;

    const group = svgElement('g', { class: 'syn-node' });
    const circle = svgElement('circle', {
      cx: pos.x, cy: pos.y, r: 15,
      class: `syn-node-dot syn-node--${String(operator.class).toLowerCase()}`
    });
    // 全名は <title> で保持（ツールチップとスクリーンリーダー用）。
    const title = svgElement('title', {});
    title.textContent = name;
    circle.append(title);
    const text = svgElement('text', {
      x: pos.x, y: pos.y + 32,
      class: 'syn-node-label',
      'text-anchor': 'middle'
    });
    text.textContent = label;
    group.append(circle, text);
    svg.append(group);
  });

  return svg;
}

// ---- クラス構成（SVG 横棒グラフ） ------------------------------------------------

/**
 * クラス構成を横棒グラフで生成する。
 * @param {{class: string, count: number}[]} composition
 * @returns {SVGSVGElement}
 */
function buildClassComposition(composition) {
  const barHeight = 22;
  const gap = 8;
  const labelWidth = 92;
  const chartWidth = 200;
  const maxCount = Math.max(1, ...composition.map((entry) => entry.count));
  const total = composition.reduce((sum, entry) => sum + entry.count, 0);

  const svg = svgElement('svg', {
    class: 'synergy-class-chart',
    viewBox: `0 0 340 ${composition.length * (barHeight + gap) + 4}`,
    role: 'img',
    'aria-label': t('synergy.classChartLabel')
  });

  composition.forEach((entry, index) => {
    const y = index * (barHeight + gap);
    const width = total ? Math.max(3, Math.round((entry.count / maxCount) * chartWidth)) : 3;

    const nameText = svgElement('text', {
      x: labelWidth - 6, y: y + barHeight - 6,
      class: 'syn-bar-name', 'text-anchor': 'end'
    });
    nameText.textContent = localizeMasterValue('class', entry.class);

    const bar = svgElement('rect', {
      x: labelWidth, y, width, height: barHeight,
      class: `syn-bar syn-bar--${String(entry.class).toLowerCase()}`
    });

    const countText = svgElement('text', {
      x: labelWidth + width + 8, y: y + barHeight - 6,
      class: 'syn-bar-count'
    });
    countText.textContent = String(entry.count);

    svg.append(nameText, bar, countText);
  });

  return svg;
}

// ---- 活性シナジー一覧 -------------------------------------------------------------

function makeTypeBadge(type, mutual) {
  const badge = makeElement('span', `syn-type-badge syn-type-badge--${type}`, synergyTypeLabel(type));
  if (mutual) badge.append(makeElement('span', 'syn-mutual-badge', t('synergy.mutual')));
  return badge;
}

function buildActiveSynergyList(pairs, operatorById) {
  const list = document.createElement('ol');
  list.className = 'synergy-active-list';
  pairs.forEach((pair) => {
    const item = document.createElement('li');
    item.className = 'synergy-active-item';

    const header = makeElement('div', 'synergy-active-header');
    const names = makeElement('span', 'synergy-active-names', `${getOperatorName(operatorById.get(pair.a) ?? {})} × ${getOperatorName(operatorById.get(pair.b) ?? {})}`);
    header.append(makeTypeBadge(pair.types[0], pair.mutual), names);
    header.append(makeElement('span', 'synergy-active-strength', t('synergy.strengthValue', { value: pair.strength })));

    const body = makeElement('p', 'synergy-active-description', pair.description);
    item.append(header, body);
    list.append(item);
  });
  return list;
}

// ---- 提案 ------------------------------------------------------------------------

function makeNewEdgeText(edge) {
  return synergyTypeLabel(edge.type);
}

function buildAddSuggestions(addCandidates) {
  const list = document.createElement('ul');
  list.className = 'synergy-suggestion-list';
  addCandidates.forEach((candidate) => {
    const item = document.createElement('li');
    const name = getOperatorName(candidate.operator);
    item.append(makeElement('span', 'synergy-suggestion-title', t('synergy.suggestAdd', { operator: name, count: candidate.newEdges.length, gain: candidate.gain })));
    const edges = makeElement('p', 'synergy-suggestion-edges', candidate.newEdges.map(makeNewEdgeText).join('・'));
    item.append(edges);
    list.append(item);
  });
  return list;
}

function buildSwapSuggestions(swapCandidates) {
  const list = document.createElement('ul');
  list.className = 'synergy-suggestion-list';
  swapCandidates.forEach((candidate) => {
    const item = document.createElement('li');
    const addName = getOperatorName(candidate.add);
    const removeName = getOperatorName(candidate.remove);
    item.append(makeElement('span', 'synergy-suggestion-title', t('synergy.suggestSwap', { remove: removeName, add: addName, count: candidate.addedEdges.length, gain: candidate.gain })));
    const edges = makeElement('p', 'synergy-suggestion-edges', candidate.addedEdges.map(makeNewEdgeText).join('・'));
    item.append(edges);
    list.append(item);
  });
  return list;
}

// ---- パネル ----------------------------------------------------------------------

/**
 * シナジー情報パネルを描画する。
 * @param {HTMLElement} container 挿入先の親要素
 * @param {{teamOperators: object[], analysis: object}} context
 *   analysis は synergy.js の analyzeSynergies() の戻り値。
 */
export function renderSynergyPanel(container, { teamOperators, analysis }) {
  const panel = document.createElement('section');
  panel.className = 'synergy-panel';

  const kicker = makeElement('span', 'section-kicker', t('synergy.kicker'));
  const title = makeElement('h4', 'synergy-title', t('synergy.title'));
  panel.append(kicker, title);

  const operatorById = new Map(teamOperators.map((operator) => [operator.id, operator]));

  // 概要（活性シナジー数・合計スコア）。
  const summary = makeElement('p', 'synergy-summary', t('synergy.activeCount', { count: analysis.pairs.length, score: analysis.totalScore }));
  panel.append(summary);

  if (teamOperators.length >= 2) {
    panel.append(buildSynergyGraph(analysis.pairs, teamOperators));
  }

  // クラス構成チャート（チームが1名以上あれば表示する）。
  if (analysis.composition.length) {
    const chartSection = makeElement('div', 'synergy-class-section');
    chartSection.append(makeElement('h5', 'synergy-section-title', t('synergy.classChartTitle')));
    chartSection.append(buildClassComposition(analysis.composition));
    panel.append(chartSection);
  }

  // 活性シナジーの一覧。
  const activeSection = makeElement('div', 'synergy-active-section');
  activeSection.append(makeElement('h5', 'synergy-section-title', t('synergy.activeTitle')));
  if (analysis.pairs.length) {
    activeSection.append(buildActiveSynergyList(analysis.pairs, operatorById));
  } else {
    activeSection.append(makeElement('p', 'synergy-empty', t('synergy.noActive')));
  }
  panel.append(activeSection);

  // 提案（追加・入替）。
  const addCandidates = analysis.suggestions.add.slice(0, 5);
  const swapCandidates = analysis.suggestions.swap.slice(0, 5);
  if (addCandidates.length || swapCandidates.length) {
    const suggestSection = makeElement('div', 'synergy-suggest-section');
    suggestSection.append(makeElement('h5', 'synergy-section-title', t('synergy.suggestTitle')));
    if (addCandidates.length) {
      suggestSection.append(makeElement('h6', 'synergy-suggest-subtitle', t('synergy.suggestAddTitle')));
      suggestSection.append(buildAddSuggestions(addCandidates));
    }
    if (swapCandidates.length) {
      suggestSection.append(makeElement('h6', 'synergy-suggest-subtitle', t('synergy.suggestSwapTitle')));
      suggestSection.append(buildSwapSuggestions(swapCandidates));
    }
    panel.append(suggestSection);
  }

  container.append(panel);
  return panel;
}
