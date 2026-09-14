const VALID_STATUSES = new Set(['wanted', 'purchased', 'not_wanted']);
const STATUS_RANK = { wanted: 0, not_wanted: 1, purchased: 2 };

export function resolveShoppingStatus(item = {}) {
  if (VALID_STATUSES.has(item.shoppingStatus)) return item.shoppingStatus;
  return item.purchased ? 'purchased' : 'wanted';
}

export function statusWritePatch(status) {
  if (!VALID_STATUSES.has(status)) throw new TypeError('Invalid shopping status');
  return {
    shoppingStatus: status,
    purchased: status === 'purchased'
  };
}

export function filterByShoppingStatus(items = [], filter = 'all') {
  if (filter === 'all') return [...items];
  if (!VALID_STATUSES.has(filter)) return [...items];
  return items.filter((item) => resolveShoppingStatus(item) === filter);
}

export function sortForHomepage(items = []) {
  return [...items].sort((a, b) => {
    const rankDiff = STATUS_RANK[resolveShoppingStatus(a)] - STATUS_RANK[resolveShoppingStatus(b)];
    if (rankDiff !== 0) return rankDiff;
    return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
  });
}

export function paginateItems(items = [], page = 1, pageSize = 10) {
  const normalizedSize = Math.max(1, Math.floor(Number(pageSize) || 10));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedSize));
  const requested = Math.floor(Number(page) || 1);
  const normalizedPage = Math.min(totalPages, Math.max(1, requested));
  const start = (normalizedPage - 1) * normalizedSize;
  return {
    items: items.slice(start, start + normalizedSize),
    page: normalizedPage,
    pageSize: normalizedSize,
    totalItems,
    totalPages
  };
}

export function nextPageForSwipe({ direction, page, totalPages }) {
  const normalizedTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = Math.min(normalizedTotal, Math.max(1, Math.floor(Number(page) || 1)));
  if (direction === 'left') return Math.max(1, current - 1);
  if (direction === 'right') return Math.min(normalizedTotal, current + 1);
  return current;
}
