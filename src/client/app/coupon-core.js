import {
  findBrandForLocation,
  resolveLocationDisplayName
} from './brand-location-resolver.js';

function clean(value) {
  return String(value ?? '').trim();
}

function countryKey(value) {
  return clean(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
}

function brandId(value) {
  return clean(value?.id || value?.brandId);
}

function validDateKey(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function normalizeCouponUrl(value) {
  const raw = clean(value);
  if (!raw) throw new Error('請輸入優惠券網址。');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('優惠券網址格式不正確。');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('優惠券網址必須是 http(s) 網址。');
  }
  return url.href;
}

export function couponDateStatus(coupon, todayKey) {
  const today = clean(todayKey);
  const validFrom = clean(coupon?.validFrom);
  const validUntil = clean(coupon?.validUntil);
  if (validFrom && today < validFrom) return 'future';
  if (!validUntil || today > validUntil) return 'expired';
  return 'active';
}

export function validateCouponDraft(draft = {}) {
  const normalized = {
    ...draft,
    brandId: clean(draft.brandId),
    country: clean(draft.country),
    validFrom: clean(draft.validFrom),
    validUntil: clean(draft.validUntil)
  };

  if (!normalized.brandId || !normalized.country) {
    return { ok: false, error: '請選擇商店。' };
  }
  if (!validDateKey(normalized.validFrom) || !validDateKey(normalized.validUntil)) {
    return { ok: false, error: '請完整填寫有效的使用日期。' };
  }
  if (normalized.validFrom > normalized.validUntil) {
    return { ok: false, error: '開始日期不能晚於截止日期。' };
  }

  try {
    normalized.couponUrl = normalizeCouponUrl(draft.couponUrl);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '優惠券網址格式不正確。' };
  }
  return { ok: true, value: normalized };
}

export function findUniqueBrandMatch(brands, location, country) {
  const matches = [];
  for (const brand of Array.isArray(brands) ? brands : []) {
    const id = brandId(brand);
    if (!id) continue;
    const matched = findBrandForLocation([brand], location, country);
    if (matched && brandId(matched) === id) matches.push(brand);
  }
  if (!matches.length) return { kind: 'none' };
  if (matches.length > 1) return { kind: 'ambiguous', brands: matches };
  return { kind: 'match', brand: matches[0] };
}

export function searchBrandsByAlias(brands, query, country) {
  const expectedCountry = countryKey(country);
  const needle = clean(query).normalize('NFKC').toLocaleLowerCase();
  return (Array.isArray(brands) ? brands : []).filter((brand) => {
    if (!brandId(brand) || countryKey(brand?.country) !== expectedCountry) return false;
    if (!needle) return true;
    const names = [
      brand?.displayName,
      ...(Array.isArray(brand?.aliases) ? brand.aliases.map((alias) => alias?.value) : [])
    ];
    return names.some((name) => clean(name).normalize('NFKC').toLocaleLowerCase().includes(needle));
  });
}

export function cleanupCoupons(coupons, brands, todayKey) {
  const brandKeys = new Set(
    (Array.isArray(brands) ? brands : [])
      .map((brand) => {
        const id = brandId(brand);
        return id ? `${countryKey(brand?.country)}:${id}` : '';
      })
      .filter(Boolean)
  );
  const kept = [];
  const removed = [];

  for (const coupon of Array.isArray(coupons) ? coupons : []) {
    const id = clean(coupon?.brandId);
    const key = `${countryKey(coupon?.country)}:${id}`;
    const expired = couponDateStatus(coupon, todayKey) === 'expired';
    const orphan = !id || !brandKeys.has(key);
    (expired || orphan ? removed : kept).push(coupon);
  }
  return { kept, removed };
}

export function deriveItemCouponRows({
  locations,
  brands,
  coupons,
  country,
  todayKey,
  includeInactive = false
} = {}) {
  const rows = [];
  const seenBrandIds = new Set();
  const countryCoupons = (Array.isArray(coupons) ? coupons : []).filter(
    (coupon) => countryKey(coupon?.country) === countryKey(country)
  );

  for (const rawLocation of Array.isArray(locations) ? locations : []) {
    const match = findUniqueBrandMatch(brands, rawLocation, country);
    if (match.kind !== 'match') continue;
    const id = brandId(match.brand);
    if (!id || seenBrandIds.has(id)) continue;
    seenBrandIds.add(id);

    const coupon = countryCoupons.find((entry) => clean(entry?.brandId) === id) || null;
    const status = coupon ? couponDateStatus(coupon, todayKey) : 'none';
    if (status === 'expired') continue;
    if (!includeInactive && status !== 'active') continue;

    rows.push({
      brandId: id,
      brand: match.brand,
      rawLocation,
      displayName: resolveLocationDisplayName(rawLocation, brands, country) || rawLocation,
      coupon,
      status
    });
  }
  return rows;
}
