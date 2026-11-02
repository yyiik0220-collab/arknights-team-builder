const CATEGORY_PRIORITY = { currency: 0, records: 1, promotion: 2, skill: 3, chips: 4 };

function localizeName(material, language) {
  return material.nameI18n?.[language] ?? material.nameI18n?.en ?? material.name;
}

export function calculateFarmingRates({ stages = [], materials = [], dropData } = {}) {
  if (!dropData || !Array.isArray(dropData.stages) || !Array.isArray(dropData.materials)) return [];
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const materialBySourceId = new Map();
  for (const entry of dropData.materials) {
    materialBySourceId.set(entry.sourceItemId, entry);
    materialBySourceId.set(entry.id, entry);
  }
  const masterById = new Map(materials.map((entry) => [entry.id, entry]));
  const rows = [];

  for (const stageData of dropData.stages) {
    const stage = stageById.get(stageData.id);
    if (!stage || !Number.isFinite(stageData.sanityCost) || stageData.sanityCost <= 0 || !Number.isFinite(stageData.runs) || stageData.runs <= 0) continue;
    for (const [sourceItemId, quantity] of Object.entries(stageData.drops ?? {})) {
      const reference = materialBySourceId.get(sourceItemId);
      if (!reference || !Number.isFinite(quantity) || quantity <= 0) continue;
      const material = masterById.get(reference.id);
      const multiplier = Number(reference.multiplier) || 1;
      const expectedAmount = (quantity / stageData.runs) * multiplier;
      rows.push({
        stageId: stage.id,
        stageCode: stageData.code,
        stageNameI18n: stage.nameI18n,
        materialId: reference.id,
        materialName: material ? material.name : localizeName(reference, 'en'),
        materialNameI18n: material?.nameI18n ?? reference.nameI18n,
        category: reference.category,
        tier: material?.tier ?? 0,
        sanityCost: stageData.sanityCost,
        samples: stageData.runs,
        expectedAmount,
        efficiency: expectedAmount / stageData.sanityCost,
        sanityPerItem: stageData.sanityCost / expectedAmount
      });
    }
  }

  const bestByMaterial = new Map();
  for (const row of rows) bestByMaterial.set(row.materialId, Math.max(bestByMaterial.get(row.materialId) ?? 0, row.efficiency));
  return rows.map((row) => ({ ...row, isBest: Math.abs(row.efficiency - bestByMaterial.get(row.materialId)) < 1e-12 }));
}

export function filterAndSortFarmingRates(rows, { category = 'all', materialId = '', sort = 'efficiency' } = {}) {
  const filtered = rows.filter((row) => (category === 'all' || row.category === category) && (!materialId || row.materialId === materialId));
  const comparators = {
    efficiency: (left, right) => right.efficiency - left.efficiency,
    sanityPerItem: (left, right) => left.sanityPerItem - right.sanityPerItem,
    samples: (left, right) => right.samples - left.samples,
    stage: (left, right) => left.stageCode.localeCompare(right.stageCode, undefined, { numeric: true })
  };
  const compare = comparators[sort] ?? comparators.efficiency;
  return filtered.sort((left, right) => compare(left, right) || CATEGORY_PRIORITY[left.category] - CATEGORY_PRIORITY[right.category] || left.materialName.localeCompare(right.materialName) || left.stageCode.localeCompare(right.stageCode, undefined, { numeric: true }));
}

export function getFarmingMaterials({ materials = [], dropData } = {}) {
  const referenceById = new Map((dropData?.materials ?? []).map((reference) => [reference.id, reference]));
  for (const material of materials) {
    if (!referenceById.has(material.id)) {
      referenceById.set(material.id, { id: material.id, category: material.isChip ? 'chips' : 'promotion' });
    }
  }
  const masterById = new Map(materials.map((material) => [material.id, material]));
  return [...referenceById.values()].map((reference) => {
    const material = masterById.get(reference.id);
    return {
      id: reference.id,
      name: material?.name ?? reference.nameI18n?.en ?? reference.id,
      nameI18n: material?.nameI18n ?? reference.nameI18n,
      category: reference.category,
      tier: material?.tier ?? 0,
      available: (dropData?.stages ?? []).some((stage) => Object.hasOwn(stage.drops ?? {}, reference.sourceItemId) || Object.hasOwn(stage.drops ?? {}, reference.id))
    };
  }).sort((left, right) => CATEGORY_PRIORITY[left.category] - CATEGORY_PRIORITY[right.category] || left.tier - right.tier || left.name.localeCompare(right.name));
}
