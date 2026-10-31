/**
 * synergy.js — 編成内シナジーの検出・スコアリング・提案（純粋ロジック、DOM非依存）。
 *
 * data/operators.json の各オペレーターは `synergies` 配列を持ち、各要素は
 * `{ operatorId, type, description }` の方向付きエッジを表す。
 * 本モジュールは、編成（チーム）内で両端が揃ったエッジを検出し、
 * ・ペア単位へ統合（A→B と B→A を相互シナジーとして加算）
 * ・型別の重みで強度スコアを算出
 * ・クラス構成の集計
 * ・未採用の所持オペレーターを追加/入替した場合に活性化するシナジーの提案
 * を行う。表示・描画は synergy-ui.js が担当する。
 *
 * 型（type）はデータに実在する talent / skill / faction を基準に重み付けする。
 * combo / buff は現データでは未使用だが、要件で挙げられた型として重みを定義し、
 * 未知の型は DEFAULT_WEIGHT へフォールバックする（将来のデータ拡張に耐える）。
 */

/** シナジー型ごとの強度重み。値が大きいほど編成へ与える寄与を高く評価する。 */
const TYPE_WEIGHTS = {
  faction: 3,   // 陣営: アイデンティティ単位の相互強化（バフ共有等）を想定
  combo: 2.5,   // コンボ: 特定の組み合わせによる複合効果
  talent: 2,    // 天賦: 天賦効果の噛み合わせ
  skill: 2,     // スキル: スキル運用の噛み合わせ
  buff: 2       // バフ重複: 同一系統バフの重ねがけ
};

/** 型が未定義の場合のフォールバック重み。 */
const DEFAULT_WEIGHT = 1.5;

/** 相互シナジー（A→B と B→A の両方向が宣言されている）に掛ける係数。 */
const MUTUAL_MULTIPLIER = 1.5;

/** 型ごとの重みを返す（未知型は既定値）。 @param {string} type @returns {number} */
export function typeWeight(type) {
  return Number.isFinite(TYPE_WEIGHTS[type]) ? TYPE_WEIGHTS[type] : DEFAULT_WEIGHT;
}

/** 方向を無視したペアの正準キーを返す。 @param {string} a @param {string} b @returns {string} */
function pairKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/**
 * チーム内で活性化しているシナジーを検出し、ペア単位へ統合する。
 * @param {object[]} teamOperators 編成に含まれるオペレーターオブジェクト
 * @returns {{pairs: object[], directed: object[], totalScore: number, typeCounts: object}}
 */
export function detectSynergies(teamOperators) {
  const ids = new Set(teamOperators.map((operator) => operator.id));
  const directed = [];
  for (const operator of teamOperators) {
    for (const synergy of operator.synergies ?? []) {
      // 自己参照やチーム外への参照は対象外（孤参照は data-loader 側で除去済みだが念のため）。
      if (!synergy?.operatorId || synergy.operatorId === operator.id || !ids.has(synergy.operatorId)) continue;
      directed.push({
        from: operator.id,
        to: synergy.operatorId,
        type: synergy.type ?? 'unknown',
        description: synergy.description ?? ''
      });
    }
  }

  const pairMap = new Map();
  for (const edge of directed) {
    const key = pairKey(edge.from, edge.to);
    if (!pairMap.has(key)) pairMap.set(key, { a: edge.from, b: edge.to, edges: [] });
    pairMap.get(key).edges.push(edge);
  }

  const pairs = [];
  for (const pair of pairMap.values()) {
    const types = [...new Set(pair.edges.map((edge) => edge.type))];
    const mutual = pair.edges.length >= 2;
    // 強度は「最も重い型」を基準に、相互シナジーなら係数を乗じる。
    const baseWeight = Math.max(...types.map(typeWeight));
    const strength = Math.round(baseWeight * (mutual ? MUTUAL_MULTIPLIER : 1) * 10) / 10;
    const description = pair.edges.find((edge) => edge.description)?.description ?? '';
    pairs.push({ a: pair.a, b: pair.b, types, mutual, strength, description });
  }
  pairs.sort((left, right) => right.strength - left.strength || left.a.localeCompare(right.a));

  const typeCounts = {};
  for (const pair of pairs) {
    for (const type of pair.types) typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  const totalScore = Math.round(pairs.reduce((sum, pair) => sum + pair.strength, 0) * 10) / 10;
  return { pairs, directed, totalScore, typeCounts };
}

/**
 * 編成のクラス（職業）構成を集計する。人数の多い順に整列する。
 * @param {object[]} teamOperators
 * @returns {{class: string, count: number}[]}
 */
export function classComposition(teamOperators) {
  const counts = new Map();
  for (const operator of teamOperators) {
    counts.set(operator.class, (counts.get(operator.class) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([className, count]) => ({ class: className, count }))
    .sort((left, right) => right.count - left.count || left.class.localeCompare(right.class));
}

/** 各チームメンバーが何件のシナジーに関与しているかを数える。 */
function memberSynergyCounts(teamOperators, pairs) {
  const counts = new Map(teamOperators.map((operator) => [operator.id, 0]));
  for (const pair of pairs) {
    counts.set(pair.a, (counts.get(pair.a) ?? 0) + 1);
    counts.set(pair.b, (counts.get(pair.b) ?? 0) + 1);
  }
  return counts;
}

/**
 * 現在の編成に追加/入替した際に新たに活性化するシナジーを提案する。
 * @param {{teamOperators: object[], addableOperators: object[], pairs: object[]}} options
 * @returns {{add: object[], swap: object[]}}
 */
export function suggestSynergies({ teamOperators, addableOperators = [], pairs }) {
  const teamIds = new Set(teamOperators.map((operator) => operator.id));

  // 追加候補: 未採用の所持オペレーターがチーム内と形成できる新しいシナジーを列挙する。
  const add = [];
  for (const candidate of addableOperators) {
    const newEdges = [];
    // 候補 → チームメンバー 方向
    for (const synergy of candidate.synergies ?? []) {
      if (teamIds.has(synergy?.operatorId)) {
        newEdges.push({ to: synergy.operatorId, type: synergy.type ?? 'unknown', description: synergy.description ?? '' });
      }
    }
    // チームメンバー → 候補 方向
    for (const member of teamOperators) {
      for (const synergy of member.synergies ?? []) {
        if (synergy?.operatorId === candidate.id) {
          newEdges.push({ from: member.id, type: synergy.type ?? 'unknown', description: synergy.description ?? '' });
        }
      }
    }
    if (!newEdges.length) continue;
    const gain = Math.round(newEdges.reduce((sum, edge) => sum + typeWeight(edge.type), 0) * 10) / 10;
    add.push({ operator: candidate, newEdges, gain });
  }
  add.sort((left, right) => right.gain - left.gain || right.newEdges.length - left.newEdges.length || left.operator.id.localeCompare(right.operator.id));

  // 入替候補: シナジー関与が最も少ないチームメンバーを、追加候補と入れ替えた際の改善を提示する。
  const counts = memberSynergyCounts(teamOperators, pairs);
  const weakMember = teamOperators.reduce((min, operator) => (counts.get(operator.id) < counts.get(min.id) ? operator : min), teamOperators[0] ?? null);
  const swap = [];
  if (weakMember) {
    const weakCount = counts.get(weakMember.id) ?? 0;
    for (const candidate of add) {
      if (candidate.newEdges.length > weakCount) {
        swap.push({ add: candidate.operator, remove: weakMember.operator, gain: candidate.gain, addedEdges: candidate.newEdges });
      }
    }
    swap.sort((left, right) => right.gain - left.gain || left.add.id.localeCompare(right.add.id));
  }
  return { add, swap };
}

/**
 * 編成のシナジー分析をまとめて実行する（検出・構成・提案）。
 * @param {{teamOperators: object[], addableOperators?: object[]}} options
 * @returns {{pairs: object[], directed: object[], totalScore: number, typeCounts: object, composition: object[], suggestions: {add: object[], swap: object[]}}}
 */
export function analyzeSynergies({ teamOperators, addableOperators = [] }) {
  const detection = detectSynergies(teamOperators);
  const composition = classComposition(teamOperators);
  const suggestions = suggestSynergies({ teamOperators, addableOperators, pairs: detection.pairs });
  return { ...detection, composition, suggestions };
}
