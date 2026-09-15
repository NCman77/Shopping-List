export function appendComparisonHistory(existing = [], entry = {}, limit = 20) {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 20));
  return [...(Array.isArray(existing) ? existing : []), { ...entry }]
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
    .slice(0, normalizedLimit)
    .map((record) => ({ ...record }));
}

export function removeNewestComparisonHistory(existing = []) {
  return (Array.isArray(existing) ? existing : [])
    .map((record) => ({ ...record }))
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
    .slice(1);
}
