/**
 * recruitment.js — 公開求人タグ計算の純粋ロジック（DOM 非依存・テスト対象）。
 *
 * 公開求人の仕様（docs/design-guide.md と arknights.wiki.gg の Recruitment ページに準拠）:
 *   - タグは各オペレーターの tags 配列に含まれ、選択タグの積集合で候補を絞り込む。
 *   - 「上級エリート (top_operator)」は★6、「エリート (senior_operator)」は★5 を
 *     強制する特殊タグで、オペレーターの tags には含まれない。レアリティで絞り込む。
 *   - 「初期 (starter)」は★2、「ロボット (robot)」は★1 を実質確定させるが、これらは
 *     通常タグとして★2/★1 オペレーターの tags に含める（ゲームと同様の対応）。
 *   - 獲得可能な最低レアリティ（保証レアリティ）は候補中の最小レアリティで決まる。
 *     例: 「特殊」は★3 以下が存在しないため★4 以上確定になる。
 */

/** 一度に選択できる最大タグ数（ゲームのスロット上限 5 と一致）。 */
export const MAX_SELECTED_TAGS = 5;

/** 組み合わせ計算の最大サイズ（ゲームで確定できるタグは最大 3 つ）。 */
export const MAX_COMBINATION_SIZE = 3;

/** レアリティ強制タグ: タグID → 強制するレアリティ。オペレーターの tags には含まれない。 */
export const RARITY_FORCING_TAGS = { top_operator: 6, senior_operator: 5 };

/**
 * 選択タグIDの配列から、サイズ 1〜maxSize の全組み合わせ（部分集合）を生成する。
 * 例: 5 タグ → C(5,1)+C(5,2)+C(5,3) = 25 通り。軽量のため再帰で実装。
 * @param {string[]} tagIds
 * @param {number} [maxSize]
 * @returns {string[][]}
 */
export function generateCombinations(tagIds, maxSize = MAX_COMBINATION_SIZE) {
  const ids = [...new Set(tagIds)].sort();
  const size = Math.min(maxSize, ids.length);
  const results = [];
  const current = [];

  const backtrack = (start) => {
    if (current.length > 0) results.push([...current]);
    if (current.length >= size) return;
    for (let i = start; i < ids.length; i += 1) {
      current.push(ids[i]);
      backtrack(i + 1);
      current.pop();
    }
  };

  backtrack(0);
  return results;
}

/**
 * 選択タグの組み合わせから、該当オペレーター群と保証レアリティを算出する。
 * @param {string[]} selectedTagIds 選択中のタグID配列（1 組の組み合わせ）
 * @param {Array<{id:string, rarity:number, tags:string[]}>} operators
 * @returns {{operators: object[], guaranteedRarity: number|null}}
 */
export function computePool(selectedTagIds, operators) {
  const selected = new Set(selectedTagIds);

  // レアリティ強制タグ（上級エリート/エリート）の解決。同時指定は想定しないが、
  // 両方来た場合は高いレアリティ（★6）を優先する。
  let forcedRarity = null;
  for (const id of selected) {
    const rarity = RARITY_FORCING_TAGS[id];
    if (rarity !== undefined) forcedRarity = forcedRarity === null ? rarity : Math.max(forcedRarity, rarity);
  }

  const regularTags = [...selected].filter((id) => !(id in RARITY_FORCING_TAGS));

  const pool = operators.filter((operator) => {
    if (forcedRarity !== null && operator.rarity !== forcedRarity) return false;
    return regularTags.every((tag) => operator.tags.includes(tag));
  });

  const guaranteedRarity = pool.length ? Math.min(...pool.map((operator) => operator.rarity)) : null;
  return { operators: pool, guaranteedRarity };
}

/**
 * 保証レアリティからハイライト階層を返す。
 *   - 'gold'   : ★5 以上確定（★5/★6 確定）
 *   - 'purple' : ★4 以上確定（★4 確定。★5 以上は含まない）
 *   - null     : 保証なし
 * @param {number|null} guaranteedRarity
 * @returns {'gold'|'purple'|null}
 */
export function highlightTier(guaranteedRarity) {
  if (guaranteedRarity == null) return null;
  if (guaranteedRarity >= 5) return 'gold';
  if (guaranteedRarity === 4) return 'purple';
  return null;
}

/**
 * 選択中の全タグから、サイズ 1〜maxSize の全組み合わせについて候補と保証を計算する。
 * 空の候補（相互排他タグなど）は除外し、保証レアリティ降順 → 候補数の昇順で並べる。
 * @param {string[]} selectedTagIds
 * @param {{operators: object[], maxSize?: number}} [options]
 * @returns {Array<{tagIds:string[], operators:object[], guaranteedRarity:number|null, tier:'gold'|'purple'|null}>}
 */
export function computeCombinations(selectedTagIds, { operators, maxSize = MAX_COMBINATION_SIZE } = {}) {
  const combinations = generateCombinations(selectedTagIds, maxSize);
  return combinations
    .map((tagIds) => {
      const { operators: matches, guaranteedRarity } = computePool(tagIds, operators);
      return { tagIds, operators: matches, guaranteedRarity, tier: highlightTier(guaranteedRarity) };
    })
    .filter((result) => result.operators.length > 0)
    .sort((a, b) => {
      if ((b.guaranteedRarity ?? -1) !== (a.guaranteedRarity ?? -1)) return (b.guaranteedRarity ?? -1) - (a.guaranteedRarity ?? -1);
      return a.operators.length - b.operators.length;
    });
}
