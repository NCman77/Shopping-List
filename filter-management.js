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
