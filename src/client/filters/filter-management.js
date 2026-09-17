import { locationWritePatch, resolveItemLocations } from '../pricing/location-selection.js';

function clean(value) {
  return String(value ?? '').trim();
}

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

export function renameOption(values, oldValue, newValue) {
  const oldName = clean(oldValue);
  const nextName = clean(newValue);
  const list = Array.isArray(values) ? [...values] : [];
  if (!oldName || !nextName || oldName === nextName) return list;
  return list.map((entry) => entry === oldName ? nextName : entry);
}

export function buildRenameItemPatch(item, kind, oldValue, newValue) {
  const oldName = clean(oldValue);
  const nextName = clean(newValue);
  if (!oldName || !nextName || oldName === nextName) return null;

  if (kind === 'category') {
    return clean(item?.category) === oldName ? { category: nextName } : null;
  }

  if (kind === 'location') {
    const locations = resolveItemLocations(item);
    if (!locations.includes(oldName)) return null;
    return locationWritePatch(locations.map((location) => location === oldName ? nextName : location));
  }

  return null;
}

export function buildLocationDeletionItemPatch(item, rawLocation) {
  const target = clean(rawLocation);
  if (!target) return null;
  const current = resolveItemLocations(item);
  if (!current.includes(target)) return null;
  return locationWritePatch(current.filter((location) => location !== target));
}

export function buildLocationDeletionPlan(items, rawLocation) {
  const affected = [];
  for (const item of Array.isArray(items) ? items : []) {
    const patch = buildLocationDeletionItemPatch(item, rawLocation);
    if (patch && clean(item?.id)) affected.push({ id: item.id, patch });
  }
  return { affected, writeCount: affected.length };
}

export function findItemsUsingOption(items, kind, value) {
  if (kind !== 'category' && kind !== 'location') return [];
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (kind === 'location') return resolveItemLocations(item).includes(value);
    return item?.category === value;
  });
}

export function buildDeletionImpact(items, kind, value) {
  const label = kind === 'category' ? '分類' : '地點';
  const usages = findItemsUsingOption(items, kind, value);
  const itemNames = usages.map((item) => item?.name || '未命名商品');
  const locationNote = usages.length
    ? `刪除後，上面這些既有商品會同步移除「${value}」地點；品牌字典與優惠券資料都會保留，不會一起刪除。`
    : `刪除後，「${value}」將不再出現在地點選單中；品牌字典與優惠券資料都會保留。`;
  const categoryNote = usages.length
    ? `刪除後，上面這些既有商品仍會保留「${value}」文字；只是之後新增或編輯商品時，不會再出現在分類選單中。`
    : `刪除後，「${value}」將不再出現在分類選單中。`;
  return {
    usages,
    itemNames,
    usageCount: usages.length,
    summary: usages.length
      ? `目前有 ${usages.length} 個商品仍在使用這個${label}：`
      : `目前沒有商品使用這個${label}。`,
    retainNote: kind === 'location' ? locationNote : categoryNote
  };
}
