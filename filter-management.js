export function moveOption(values, fromIndex, toIndex) {
  const list = Array.isArray(values) ? [...values] : [];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return list;
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return list;
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
}

export function removeOption(values, value) {
  return (Array.isArray(values) ? values : []).filter((entry) => entry !== value);
}

export function findItemsUsingOption(items, kind, value) {
  if (kind !== 'category' && kind !== 'location') return [];
  return (Array.isArray(items) ? items : []).filter((item) => item?.[kind] === value);
}

export function buildDeletionImpact(items, kind, value) {
  const label = kind === 'category' ? '分類' : '地點';
  const usages = findItemsUsingOption(items, kind, value);
  const itemNames = usages.map((item) => item?.name || '未命名商品');
  return {
    usages,
    itemNames,
    usageCount: usages.length,
    summary: usages.length
      ? `目前有 ${usages.length} 個商品仍在使用這個${label}：`
      : `目前沒有商品使用這個${label}。`,
    retainNote: usages.length
      ? `刪除後，上面這些既有商品仍會保留「${value}」文字；只是之後新增或編輯商品時，不會再出現在${label}選單中。`
      : `刪除後，「${value}」將不再出現在${label}選單中。`
  };
}
