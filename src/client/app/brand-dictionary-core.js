function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function displayValue(value) {
  return String(value ?? '').trim();
}

function countryKey(value) {
  return clean(value).toLocaleLowerCase().replace(/\s+/g, '');
}

const LANGUAGE_PRESETS = new Map();

function addPreset(countries, fields) {
  for (const country of countries) LANGUAGE_PRESETS.set(countryKey(country), fields);
}

addPreset(['日本', 'Japan'], ['日文', '英文', '中文', '其他']);
addPreset(['加拿大', 'Canada'], ['英文', '法文', '中文', '其他']);
addPreset(['西班牙', 'Spain'], ['西班牙文', '英文', '中文', '其他']);
addPreset(['韓國', '韩国', 'South Korea', 'Korea'], ['韓文', '英文', '中文', '其他']);
addPreset(['泰國', '泰国', 'Thailand'], ['泰文', '英文', '中文', '其他']);
addPreset(['法國', '法国', 'France'], ['法文', '英文', '中文', '其他']);
addPreset(['德國', '德国', 'Germany'], ['德文', '英文', '中文', '其他']);
addPreset(['義大利', '意大利', 'Italy'], ['義大利文', '英文', '中文', '其他']);
addPreset(['葡萄牙', 'Portugal'], ['葡萄牙文', '英文', '中文', '其他']);
addPreset(['美國', '美国', 'USA', 'United States', 'United States of America', '英國', '英国', 'UK', 'United Kingdom', '澳洲', 'Australia', '紐西蘭', '纽西兰', 'New Zealand', '新加坡', 'Singapore'], ['英文', '中文', '其他']);
addPreset(['台灣', '台湾', 'Taiwan', '香港', 'Hong Kong', '澳門', '澳门', 'Macau', 'Macao'], ['中文', '英文', '其他']);

export function defaultLanguageFieldsForCountry(country) {
  return [...(LANGUAGE_PRESETS.get(countryKey(country)) || ['英文', '中文', '其他'])];
}

function normalizedFieldLabels(values) {
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const label = clean(raw);
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

export function effectiveLanguageFields(country, savedFields) {
  const fields = normalizedFieldLabels(savedFields);
  const result = fields.length ? fields : defaultLanguageFieldsForCountry(country);
  if (!result.some((label) => label === '其他')) result.push('其他');
  return result;
}

export function parseAliasValues(value) {
  const result = [];
  const seen = new Set();
  for (const raw of String(value ?? '').split(/[\n,，、;；]+/u)) {
    const alias = displayValue(raw);
    const key = comparisonKey(alias);
    if (!alias || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

export function normalizeBrandAliases(aliases = []) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(aliases) ? aliases : []) {
    const language = clean(entry?.language) || '其他';
    for (const value of parseAliasValues(entry?.value)) {
      const key = comparisonKey(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push({ language, value });
    }
  }
  return result;
}

function isLatinOrNumber(char) {
  return /[\p{Script=Latin}\p{Number}]/u.test(char);
}

function isKana(char) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char) || char === 'ー';
}

function isHan(char) {
  return /\p{Script=Han}/u.test(char);
}

function isLetterOrNumber(char) {
  return /[\p{Letter}\p{Number}]/u.test(char);
}

function scriptType(char) {
  if (isLatinOrNumber(char)) return 'latin';
  if (isKana(char)) return 'kana';
  if (isHan(char)) return 'han';
  if (isLetterOrNumber(char)) return 'other';
  return '';
}

function scriptChunks(value) {
  const text = clean(value).toLocaleLowerCase();
  const chunks = [];
  let type = '';
  let current = '';
  for (const char of text) {
    const nextType = scriptType(char);
    if (!nextType) continue;
    if (type && nextType !== type) {
      chunks.push({ type, value: current });
      current = '';
    }
    type = nextType;
    current += char;
  }
  if (type && current) chunks.push({ type, value: current });
  const unique = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const key = `${chunk.type}:${chunk.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }
  return unique;
}

function comparisonKey(value) {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function chunkKey(chunk) {
  return `${chunk.type}:${chunk.value}`;
}

function setIsSubset(smaller, larger) {
  for (const value of smaller) if (!larger.has(value)) return false;
  return true;
}

export function isCertainDuplicateName(left, right) {
  const a = clean(left);
  const b = clean(right);
  if (!a || !b) return false;
  const aKey = comparisonKey(a);
  const bKey = comparisonKey(b);
  if (aKey && aKey === bKey) return true;

  const aSet = new Set(scriptChunks(a).map(chunkKey));
  const bSet = new Set(scriptChunks(b).map(chunkKey));
  if (!aSet.size || !bSet.size) return false;
  const aSubset = setIsSubset(aSet, bSet);
  const bSubset = setIsSubset(bSet, aSet);
  return aSubset || bSubset;
}

const KANA_SINGLE = {
  あ:'a',い:'i',う:'u',え:'e',お:'o',
  か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
  さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
  た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
  な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',
  は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',
  ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',
  や:'ya',ゆ:'yu',よ:'yo',
  ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',
  わ:'wa',を:'o',ん:'n',
  が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',
  ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',
  だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',
  ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
  ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',
  ゔ:'vu',ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o'
};

const KANA_PAIR = {
  きゃ:'kya',きゅ:'kyu',きょ:'kyo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',
  しゃ:'sha',しゅ:'shu',しょ:'sho',じゃ:'ja',じゅ:'ju',じょ:'jo',
  ちゃ:'cha',ちゅ:'chu',ちょ:'cho',にゃ:'nya',にゅ:'nyu',にょ:'nyo',
  ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',びゃ:'bya',びゅ:'byu',びょ:'byo',
  ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',みゃ:'mya',みゅ:'myu',みょ:'myo',
  りゃ:'rya',りゅ:'ryu',りょ:'ryo',
  てぃ:'ti',でぃ:'di',とぅ:'tu',どぅ:'du',ふぁ:'fa',ふぃ:'fi',ふぇ:'fe',ふぉ:'fo',
  ゔぁ:'va',ゔぃ:'vi',ゔぇ:'ve',ゔぉ:'vo'
};

function katakanaToHiragana(value) {
  let result = '';
  for (const char of clean(value)) {
    const code = char.codePointAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) result += String.fromCodePoint(code - 0x60);
    else result += char;
  }
  return result;
}

export function kanaToRomaji(value) {
  const text = katakanaToHiragana(value);
  let output = '';
  let geminate = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === 'ー') continue;
    if (char === 'っ') {
      geminate = true;
      continue;
    }
    const pair = text.slice(index, index + 2);
    let roma = KANA_PAIR[pair];
    if (roma) index += 1;
    else roma = KANA_SINGLE[char] || '';
    if (!roma) continue;
    if (geminate) {
      const consonant = roma.match(/^[bcdfghjklmnpqrstvwxyz]/)?.[0] || '';
      output += consonant;
      geminate = false;
    }
    output += roma;
  }
  return output.toLocaleLowerCase();
}

function kanaRomajiSimilar(left, right) {
  const leftChunks = scriptChunks(left);
  const rightChunks = scriptChunks(right);
  const leftKana = leftChunks.filter((chunk) => chunk.type === 'kana').map((chunk) => kanaToRomaji(chunk.value)).filter(Boolean);
  const rightKana = rightChunks.filter((chunk) => chunk.type === 'kana').map((chunk) => kanaToRomaji(chunk.value)).filter(Boolean);
  const leftLatin = leftChunks.filter((chunk) => chunk.type === 'latin').map((chunk) => comparisonKey(chunk.value)).filter(Boolean);
  const rightLatin = rightChunks.filter((chunk) => chunk.type === 'latin').map((chunk) => comparisonKey(chunk.value)).filter(Boolean);
  return leftKana.some((kana) => rightLatin.includes(kana)) || rightKana.some((kana) => leftLatin.includes(kana));
}

function brandNames(brand) {
  const values = [clean(brand?.displayName)];
  for (const alias of Array.isArray(brand?.aliases) ? brand.aliases : []) values.push(clean(alias?.value));
  return values.filter(Boolean);
}

function sameCountry(left, right) {
  return countryKey(left) === countryKey(right);
}

export function findBrandAliasConflict(brands, candidateNames, excludeId = '', country = '') {
  const candidates = (Array.isArray(candidateNames) ? candidateNames : [candidateNames]).map(clean).filter(Boolean);
  for (const brand of Array.isArray(brands) ? brands : []) {
    if (excludeId && String(brand?.id || '') === String(excludeId)) continue;
    if (country && !sameCountry(brand?.country, country)) continue;
    const names = brandNames(brand);
    if (candidates.some((candidate) => names.some((name) => isCertainDuplicateName(candidate, name)))) return brand;
  }
  return null;
}

export function detectLocationDuplicate({ input, existingLocations = [], brands = [], country = '' } = {}) {
  const candidate = clean(input);
  if (!candidate) return { kind: 'none' };
  const existing = (Array.isArray(existingLocations) ? existingLocations : []).map(clean).filter(Boolean);

  for (const value of existing) {
    if (isCertainDuplicateName(candidate, value)) return { kind: 'exact', existing: value };
  }

  const countryBrands = (Array.isArray(brands) ? brands : []).filter((brand) => sameCountry(brand?.country, country));
  for (const brand of countryBrands) {
    const names = brandNames(brand);
    if (!names.some((name) => isCertainDuplicateName(candidate, name))) continue;
    for (const value of existing) {
      if (names.some((name) => isCertainDuplicateName(value, name))) {
        return { kind: 'dictionary', existing: value, brand };
      }
    }
  }

  for (const value of existing) {
    if (kanaRomajiSimilar(candidate, value)) return { kind: 'similar', existing: value };
  }

  return { kind: 'none' };
}
