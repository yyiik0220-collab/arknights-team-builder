const RARITIES = [6, 5, 4, 3];

export function validateGachaConfig(config) {
  if (!config || !Number.isInteger(config.currencyPerPull) || config.currencyPerPull <= 0 || !config.banners) {
    throw new Error('ガチャ設定の形式が不正です。');
  }
  for (const [bannerId, banner] of Object.entries(config.banners)) {
    const rates = banner?.rarityRates;
    const pity = banner?.pity;
    if (RARITIES.some((rarity) => typeof rates?.[rarity] !== 'number' || rates[rarity] < 0)
      || Math.abs(RARITIES.reduce((sum, rarity) => sum + rates[rarity], 0) - 1) > 1e-9) {
      throw new Error(`ガチャ確率テーブルが不正です: ${bannerId}`);
    }
    if (!Number.isInteger(pity?.startsAfter) || pity.startsAfter < 0
      || !Number.isInteger(pity?.guaranteedAt) || pity.guaranteedAt <= pity.startsAfter
      || typeof pity?.increasePerPull !== 'number' || pity.increasePerPull < 0) {
      throw new Error(`ガチャ天井設定が不正です: ${bannerId}`);
    }
    if (banner.featuredRate !== undefined && (banner.featuredRate < 0 || banner.featuredRate > 1)) {
      throw new Error(`ピックアップ確率が不正です: ${bannerId}`);
    }
  }
  return true;
}

export async function loadGachaData() {
  const response = await fetch(new URL('../../data/gacha.json', import.meta.url));
  if (!response.ok) throw new Error(`data/gacha.json (${response.status})`);
  const config = await response.json();
  validateGachaConfig(config);
  return config;
}

export function getRarityRates(banner, pityCount) {
  const rates = { ...banner.rarityRates };
  if (pityCount >= banner.pity.guaranteedAt - 1) {
    return { 6: 1, 5: 0, 4: 0, 3: 0 };
  }
  const extra = Math.max(0, pityCount - banner.pity.startsAfter + 1) * banner.pity.increasePerPull;
  rates[6] = Math.min(1, rates[6] + extra);
  const otherTotal = RARITIES.slice(1).reduce((sum, rarity) => sum + rates[rarity], 0);
  for (const rarity of RARITIES.slice(1)) rates[rarity] *= (1 - rates[6]) / otherTotal;
  return rates;
}

export function simulatePull({ banner, pityCount = 0, random = Math.random }) {
  if (typeof random !== 'function') throw new TypeError('random must be a function');
  const next = random();
  if (!(next >= 0 && next < 1)) throw new RangeError('random must return a value in [0, 1)');
  const rates = getRarityRates(banner, pityCount);
  let remaining = next;
  let rarity = 3;
  for (const candidate of RARITIES) {
    remaining -= rates[candidate];
    if (remaining < 0) {
      rarity = candidate;
      break;
    }
  }
  const pityHit = pityCount >= banner.pity.guaranteedAt - 1;
  if (rarity !== 6) return { rarity, pityCount: pityCount + 1, pityHit, featured: false };
  const featured = banner.featuredRate !== undefined && random() < banner.featuredRate;
  return { rarity, pityCount: 0, pityHit, featured };
}

export function simulatePulls({ banner, count, pityCount = 0, random = Math.random }) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  const results = [];
  let currentPity = pityCount;
  for (let index = 0; index < count; index += 1) {
    const result = simulatePull({ banner, pityCount: currentPity, random });
    results.push(result);
    currentPity = result.pityCount;
  }
  return { results, pityCount: currentPity, pityHits: results.filter((result) => result.pityHit).length };
}
