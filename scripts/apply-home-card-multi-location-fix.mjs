import { readFile, writeFile } from 'node:fs/promises';

async function load(path) {
  return readFile(path, 'utf8');
}

async function save(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceRequired(text, find, replacement, label, alreadyPatched) {
  if (alreadyPatched && alreadyPatched.test(text)) return text;
  const next = text.replace(find, replacement);
  if (next === text) throw new Error(`Patch target not found: ${label}`);
  return next;
}

async function patchIndex() {
  const path = 'index.html';
  let text = await load(path);

  text = replaceRequired(
    text,
    '    import { safePersistedImageSource } from "./src/client/app/safe-rendering.js";\n',
    '    import { safePersistedImageSource } from "./src/client/app/safe-rendering.js";\n' +
      '    import { resolveItemLocations } from "./src/client/pricing/location-selection.js";\n' +
      '    import { createGoogleMapsUrl } from "./src/client/utils/url-utils.js";\n',
    'index imports',
    /import \{ resolveItemLocations \} from "\.\/src\/client\/pricing\/location-selection\.js";/
  );

  text = replaceRequired(
    text,
    "            if (state.filters.location !== 'all' && item.location !== state.filters.location) return false;",
    "            if (state.filters.location !== 'all' && !resolveItemLocations(item).includes(state.filters.location)) return false;",
    'multi-location filter',
    /!resolveItemLocations\(item\)\.includes\(state\.filters\.location\)/
  );

  text = replaceRequired(
    text,
    /            filteredItems\.forEach\(item => \{\n\s*const mapLink = `https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=\$\{encodeURIComponent\(\(item\.location \|\| ''\) \+ ' 日本'\)\}`;\n\s*const photoSrc = safePersistedImageSource\(item\.photoUrl\);/,
    "            filteredItems.forEach(item => {\n                const itemLocations = resolveItemLocations(item);\n                const photoSrc = safePersistedImageSource(item.photoUrl);",
    'remove legacy Japan-suffixed map query',
    /const itemLocations = resolveItemLocations\(item\);/
  );

  text = replaceRequired(
    text,
    /(                card\.className = `fade-in[^\n]+`;\n)/,
    '$1                card.dataset.itemId = String(item.id);\n',
    'home card data item id',
    /card\.dataset\.itemId = String\(item\.id\);/
  );

  text = replaceRequired(
    text,
    /                if \(item\.location\) \{\n                    const location = document\.createElement\('a'\);\n                    location\.href = mapLink;\n                    location\.target = '_blank';\n                    location\.className = 'text-\[10px\] font-bold bg-pastelBlue text-warmBrown px-2\.5 py-0\.5 rounded-full border border-warmBrown hover:bg-blue-200 transition-colors';\n                    const locationIcon = document\.createElement\('i'\);\n                    locationIcon\.className = 'fas fa-map-marker-alt mr-1 opacity-70';\n                    const locationLabel = document\.createElement\('span'\);\n                    locationLabel\.textContent = String\(item\.location\);\n                    location\.append\(locationIcon, locationLabel\);\n                    tags\.appendChild\(location\);\n                \}/,
    "                for (const itemLocation of itemLocations) {\n                    const location = document.createElement('a');\n                    location.href = createGoogleMapsUrl(itemLocation);\n                    location.target = '_blank';\n                    location.rel = 'noopener noreferrer';\n                    location.className = 'text-[10px] font-bold bg-pastelBlue text-warmBrown px-2.5 py-0.5 rounded-full border border-warmBrown hover:bg-blue-200 transition-colors';\n                    const locationIcon = document.createElement('i');\n                    locationIcon.className = 'fas fa-map-marker-alt mr-1 opacity-70';\n                    const locationLabel = document.createElement('span');\n                    locationLabel.textContent = itemLocation;\n                    location.append(locationIcon, locationLabel);\n                    tags.appendChild(location);\n                }",
    'render every selected home-card location',
    /for \(const itemLocation of itemLocations\)/
  );

  if (text.includes("(item.location || '') + ' 日本'")) {
    throw new Error('Legacy country suffix still exists in index.html');
  }

  await save(path, text);
}

async function patchAppEnhancements() {
  const path = 'src/client/app/app-enhancements.js';
  let text = await load(path);
  text = replaceRequired(
    text,
    /  function getCardItemId\(card\) \{\n    const clickable = card\.querySelector\('\[onclick\*="openEditModal"\]'\);\n    const source = clickable\?\.getAttribute\('onclick'\) \|\| '';\n    const match = source\.match\(\/openEditModal\\\(\['"\]\(\[\^'"\]\+\)\['"\]\\\)\/\);\n    return match\?\.\[1\] \|\| '';\n  \}/,
    "  function getCardItemId(card) {\n    const direct = String(card?.dataset?.itemId || card?.dataset?.enhancedItemId || '').trim();\n    if (direct) return direct;\n    const clickable = card?.querySelector?.('[onclick*=\\\"openEditModal\\\"]');\n    const source = clickable?.getAttribute?.('onclick') || '';\n    const match = source.match(/openEditModal\\(['\\\"]([^'\\\"]+)['\\\"]\\)/);\n    return match?.[1] || '';\n  }",
    'modern home-card id lookup in app enhancements',
    /card\?\.dataset\?\.itemId/
  );
  await save(path, text);
}

async function patchItemWorkflow() {
  const path = 'src/client/app/item-workflow-enhancements.js';
  let text = await load(path);
  text = replaceRequired(
    text,
    "function cardItemId(card) {\n  const enhanced = String(card?.dataset?.enhancedItemId || '').trim();\n  if (enhanced) return enhanced;",
    "function cardItemId(card) {\n  const enhanced = String(card?.dataset?.enhancedItemId || card?.dataset?.itemId || '').trim();\n  if (enhanced) return enhanced;",
    'modern home-card id lookup in workflow enhancements',
    /card\?\.dataset\?\.enhancedItemId \|\| card\?\.dataset\?\.itemId/
  );
  await save(path, text);
}

async function patchHomeLocationDisplay() {
  const path = 'src/client/app/home-location-display.js';
  let text = await load(path);

  text = replaceRequired(
    text,
    "function legacyLocationLink(card) {\n  return [...(card?.querySelectorAll?.('a[target=\"_blank\"]') || [])].find((link) => {\n    const href = link.getAttribute?.('href') || link.href || '';\n    return /google\\.com\\/maps\\/search/i.test(href);\n  }) || null;\n}",
    "function legacyLocationLinks(card) {\n  return [...(card?.querySelectorAll?.('a[target=\"_blank\"]') || [])].filter((link) => {\n    const href = link.getAttribute?.('href') || link.href || '';\n    return /google\\.com\\/maps\\/search/i.test(href);\n  });\n}",
    'collect every legacy/core Maps link',
    /function legacyLocationLinks\(card\)/
  );

  text = replaceRequired(
    text,
    "  const legacyLink = legacyLocationLink(card);\n  const metaRow = metadataRow(card, legacyLink);",
    "  const legacyLinks = legacyLocationLinks(card);\n  const metaRow = metadataRow(card, legacyLinks[0] || null);",
    'use first legacy link only to locate metadata row',
    /const legacyLinks = legacyLocationLinks\(card\);/
  );

  text = replaceRequired(
    text,
    "  if (legacyLink) legacyLink.remove();",
    "  for (const legacyLink of legacyLinks) legacyLink.remove();",
    'remove every core Maps link before inserting enhanced buttons',
    /for \(const legacyLink of legacyLinks\) legacyLink\.remove\(\);/
  );

  await save(path, text);
}

await patchIndex();
await patchAppEnhancements();
await patchItemWorkflow();
await patchHomeLocationDisplay();
