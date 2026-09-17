# Country Brand Dictionary Design

## Goal
Add a country-scoped brand dictionary inside account settings and use it together with local string matching to prevent or warn about duplicate location names without relying on an external API.

## Scope
Only the following behavior changes are in scope:
- Add a `品牌字典` entry inside the existing account settings UI.
- Keep brand data separated by travel country.
- Give each country a different default set of language fields while allowing extra language fields to be added per country.
- Store brand records separately from `settings/preferences` so the dictionary can grow without inflating the main settings document.
- Use the active trip country to choose which brand dictionary participates in location duplicate detection.
- Add local duplicate detection for newly added locations.
- Preserve the existing location display values exactly as typed; normalization is comparison-only.
- Do not revive the retired store / Places / nearby-distance feature set.
- Do not change item data, trip behavior, pricing, photos, category behavior, Maps settings, or location rename/delete semantics.

## Brand data model
Brand documents live under:

`artifacts/japan-shopping-app/users/{uid}/brands/{brandId}`

Each document contains:
- `country: string`
- `displayName: string`
- `aliases: Array<{ language: string, value: string }>`
- `createdAt`
- `updatedAt`

Language-field templates stay small and belong in `settings/preferences.brandLanguageFields`, keyed by country. A saved country template is an ordered array of labels such as `['日文', '英文', '中文', '其他']`.

## Country language templates
Default templates are country-specific. Initial presets cover the countries discussed in the product plus common travel destinations:
- 日本: 日文 / 英文 / 中文 / 其他
- 加拿大: 英文 / 法文 / 中文 / 其他
- 西班牙: 西班牙文 / 英文 / 中文 / 其他
- 韓國: 韓文 / 英文 / 中文 / 其他
- 泰國: 泰文 / 英文 / 中文 / 其他
- 法國: 法文 / 英文 / 中文 / 其他
- 德國: 德文 / 英文 / 中文 / 其他
- 義大利: 義大利文 / 英文 / 中文 / 其他
- 葡萄牙: 葡萄牙文 / 英文 / 中文 / 其他
- 美國 / 英國 / 澳洲 / 紐西蘭 / 新加坡: 英文 / 中文 / 其他
- 台灣 / 香港 / 澳門: 中文 / 英文 / 其他
- Unknown/custom countries: 英文 / 中文 / 其他

The country page includes `＋新增語言`, which persists a full customized template for that country. Preset fields remain available; custom fields can be removed. `其他` is always retained as a fallback.

## Brand dictionary UI
Account settings gets a new `品牌字典` button. Opening it uses a dedicated brand-dictionary modal so the existing account settings navigation remains unchanged.

The first view lists only countries already present in the user's `旅遊國家` settings and shows the number of brand records in each country.

Selecting a country opens that country's dictionary:
- current language template
- `＋新增語言`
- brand cards
- add brand action

The brand editor shows the fields from the selected country's template, plus `主要顯示名稱`. At least one alias/name is required. When the main display name is blank, the first entered alias becomes the display name. `其他` can contain multiple aliases separated by commas, Chinese commas, ideographic commas, semicolons, or new lines.

Brand aliases must not conflict with another brand in the same country after exact normalization. Other countries are independent.

## Location duplicate detection
The existing global `handleAddLocation` behavior stays the source of truth for actually saving a location. A new guard wraps it and either blocks, warns, or delegates to the original function.

Detection order:
1. **Certain string duplicate — block**
   - Unicode NFKC normalization
   - case-insensitive Latin matching
   - normalize full-width/half-width spacing and punctuation
   - compare script-aware chunks so bilingual order does not matter
   - examples that must block:
     - `Matsumoto Kiyoshi` vs `matsumoto kiyoshi`
     - `マツモトキヨシ Matsumoto Kiyoshi` vs `Matsumoto Kiyoshi マツモトキヨシ`
     - existing `Matsumoto Kiyoshi` vs new `マツモトキヨシ Matsumoto Kiyoshi`

2. **Brand dictionary alias match — warning**
   - only brands for the current active-trip country are considered
   - if the new location is one alias of a brand and an existing location is another alias of that same brand, show:
     - `可能已存在「<existing>」`
     - buttons: `取消` / `仍然新增`
   - example: the Japan dictionary explicitly links `松本清`, `Matsumoto Kiyoshi`, and `マツモトキヨシ`; then any of these can warn against an already-saved alias.

3. **Kana ↔ Romaji strong similarity — warning**
   - local kana-to-romaji transliteration only; no API
   - example: `マツモトキヨシ` vs `Matsumoto Kiyoshi`
   - show the same `取消` / `仍然新增` choice

4. **No match — save normally**

Chinese/Han text is never guessed across languages. `松本清` does not match `Matsumoto Kiyoshi` unless the user explicitly linked both names inside the same brand record.

## Country isolation
Brand matching uses `window.shoppingListActiveTrip.country` (falling back to the app's active country/default country only when no active trip is available). A Japan brand never causes an alias warning while the active trip is Spain or Canada.

Exact string duplicate checks still compare the existing saved location list because that list remains the existing shared settings data; this feature does not change the location storage model.

## Security
Firestore rules add an owner-only rule for `/brands/{brandId}` under each user. No other Firestore rule is changed.

## Testing
Add regression coverage for:
- country language presets and custom-field normalization
- alias parsing and same-country brand conflict detection
- exact duplicate examples
- bilingual order-insensitive matching
- Kana/Romaji warning behavior
- dictionary-linked Han/English/Kana warning behavior
- Han/English non-match when no dictionary link exists
- country isolation of brand matches
- settings UI bootstrap markers
- owner-only Firestore brand access

Existing unit/regression, syntax, Browser E2E, schema guard, and Firestore rules suites must remain green before merge.