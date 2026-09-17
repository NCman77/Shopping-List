import {
  defaultLanguageFieldsForCountry,
  isCertainDuplicateName,
  kanaToRomaji
} from './brand-dictionary-core.js';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function rawDisplay(value) {
  return String(value ?? '').trim();
}

function key(value) {
  return clean(value).toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function sameCountry(left, right) {
  return clean(left).toLocaleLowerCase().replace(/\s+/g, '') === clean(right).toLocaleLowerCase().replace(/\s+/g, '');
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const label = clean(value);
    const normalized = label.toLocaleLowerCase();
    if (!label || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(label);
  }
  return out;
}

export function displayLanguagePriorityForCountry(country) {
  const defaults = defaultLanguageFieldsForCountry(country);
  return unique([
    '中文',
    ...defaults.filter((label) => label !== '中文' && label !== '其他'),
    '其他'
  ]);
}

export function mapLanguagePriorityForCountry(country) {
  const defaults = defaultLanguageFieldsForCountry(country);
  return unique([
    ...defaults.filter((label) => label !== '中文' && label !== '其他'),
    '其他'
  ]);
}

function countryDefaults(country) {
  return defaultLanguageFieldsForCountry(country);
}

function localPrimaryLanguage(country) {
  return countryDefaults(country).find((label) => !['中文', '英文', '其他'].includes(label)) || '';
}

function isEastAsianEnglishFallbackCountry(country) {
  const value = clean(country).toLocaleLowerCase();
  return [
    '日本', 'japan', '韓國', '韩国', 'south korea', 'korea', '泰國', '泰国', 'thailand',
    '台灣', '台湾', 'taiwan', '香港', 'hong kong', '澳門', '澳门', 'macau', 'macao'
  ].includes(value);
}

function splitScriptSegments(value) {
  const text = rawDisplay(value);
  if (!text) return [];
  const pattern = /[\p{Script=Latin}\p{Number}]+(?:[\s.&'’_\-]+[\p{Script=Latin}\p{Number}]+)*|[\p{Script=Hiragana}\p{Script=Katakana}ー]+|[\p{Script=Hangul}]+|[\p{Script=Thai}]+|[\p{Script=Han}]+/gu;
  return [...text.matchAll(pattern)].map((match) => match[0].trim()).filter(Boolean);
}

function segmentLanguage(segment, country) {
  if (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(segment)) return '日文';
  if (/^\p{Script=Hangul}+$/u.test(segment)) return '韓文';
  if (/^\p{Script=Thai}+$/u.test(segment)) return '泰文';
  if (/^\p{Script=Han}+$/u.test(segment)) return '其他';
  if (/^[\p{Script=Latin}\p{Number}]/u.test(segment)) {
    if (isEastAsianEnglishFallbackCountry(country)) return '英文';
    const defaults = countryDefaults(country);
    if (defaults[0] === '英文') return '英文';
    // Latin-script countries are ambiguous without a language service.
    // Keep the user's text intact under 其他 rather than guessing Spanish/German/etc.
    return '其他';
  }
  return localPrimaryLanguage(country) || '其他';
}

export function inferAliasesFromLocation(value, country) {
  const result = [];
  const seen = new Set();
  for (const segment of splitScriptSegments(value)) {
    const language = segmentLanguage(segment, country);
    const normalized = `${language}:${key(segment)}`;
    if (!key(segment) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ language, value: segment });
  }
  if (!result.length && rawDisplay(value)) result.push({ language: '其他', value: rawDisplay(value) });
  return result;
}

function brandNames(brand) {
  const values = [];
  if (rawDisplay(brand?.displayName)) values.push(rawDisplay(brand.displayName));
  for (const alias of Array.isArray(brand?.aliases) ? brand.aliases : []) {
    if (rawDisplay(alias?.value)) values.push(rawDisplay(alias.value));
  }
  return values;
}

function kanaLatinEquivalent(left, right) {
  const leftSegments = splitScriptSegments(left);
  const rightSegments = splitScriptSegments(right);
  const leftKana = leftSegments.filter((value) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(value));
  const rightKana = rightSegments.filter((value) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(value));
  const leftLatin = leftSegments.filter((value) => /^[\p{Script=Latin}\p{Number}]/u.test(value));
  const rightLatin = rightSegments.filter((value) => /^[\p{Script=Latin}\p{Number}]/u.test(value));
  return leftKana.some((kana) => rightLatin.some((latin) => key(kanaToRomaji(kana)) === key(latin)))
    || rightKana.some((kana) => leftLatin.some((latin) => key(kanaToRomaji(kana)) === key(latin)));
}

function namesMatch(left, right) {
  return isCertainDuplicateName(left, right) || kanaLatinEquivalent(left, right);
}

export function findBrandForLocation(brands, location, country) {
  const candidate = rawDisplay(location);
  if (!candidate) return null;
  for (const brand of Array.isArray(brands) ? brands : []) {
    if (!sameCountry(brand?.country, country)) continue;
    if (brandNames(brand).some((name) => namesMatch(candidate, name))) return brand;
  }
  return null;
}

function aliasesByLanguage(brand) {
  const grouped = new Map();
  for (const alias of Array.isArray(brand?.aliases) ? brand.aliases : []) {
    const language = clean(alias?.language) || '其他';
    const value = rawDisplay(alias?.value);
    if (!value) continue;
    if (!grouped.has(language)) grouped.set(language, []);
    grouped.get(language).push(value);
  }
  return grouped;
}

function firstAliasForPriority(brand, basePriority, { excludeChinese = false } = {}) {
  const grouped = aliasesByLanguage(brand);
  const ordered = basePriority.filter((language) => !(excludeChinese && language === '中文'));
  const known = new Set(ordered);
  const extras = [...grouped.keys()].filter((language) => !known.has(language) && language !== '其他' && !(excludeChinese && language === '中文'));
  const finalOrder = [...ordered.filter((language) => language !== '其他'), ...extras, '其他'];
  for (const language of finalOrder) {
    const value = grouped.get(language)?.[0];
    if (value) return value;
  }
  return '';
}

export function resolveLocationDisplayName(location, brands, country) {
  const raw = rawDisplay(location);
  const brand = findBrandForLocation(brands, raw, country);
  if (!brand) return raw;
  return firstAliasForPriority(brand, displayLanguagePriorityForCountry(country))
    || rawDisplay(brand.displayName)
    || raw;
}

export function resolveLocationMapQuery(location, brands, country) {
  const raw = rawDisplay(location);
  const brand = findBrandForLocation(brands, raw, country);
  if (!brand) return raw;
  return firstAliasForPriority(brand, mapLanguagePriorityForCountry(country), { excludeChinese: true }) || raw;
}

export function mergeInferredAliases(existingAliases, inferredAliases) {
  const result = Array.isArray(existingAliases) ? existingAliases.map((alias) => ({ ...alias })) : [];
  const seen = new Set(result.map((alias) => `${clean(alias?.language)}:${key(alias?.value)}`));
  for (const alias of Array.isArray(inferredAliases) ? inferredAliases : []) {
    const language = clean(alias?.language) || '其他';
    const value = rawDisplay(alias?.value);
    const token = `${language}:${key(value)}`;
    if (!value || !key(value) || seen.has(token)) continue;
    seen.add(token);
    result.push({ language, value });
  }
  return result;
}
