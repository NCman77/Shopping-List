# Coupon Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add centralized, brand-linked tourist coupon management that automatically appears across existing/new multi-location items, removes expired coupons on load, and changes homepage location deletion so the deleted raw location is removed from every affected item without touching Brand Dictionary or coupon records.

**Architecture:** Keep coupons in one owner-authorized Firestore settings document (`settings/couponDictionary`) keyed logically by stable `brandId`, never by display text and never copied into item documents. Reuse the existing Brand Dictionary matching/display resolver for alias recognition and Chinese-first labels, while coupon-specific core helpers handle URL/date validation, unique brand matching, item-to-coupon derivation, active/expired state, and cleanup. UI is split into a dedicated Coupon Management modal and a derived item-coupon integration layer; existing files receive only narrow wiring/layout/delete changes.

**Tech Stack:** Vanilla ES modules, DOM APIs, Firebase Auth + Firestore 11.6.1, Node `node:test`, Playwright, existing Tailwind utility classes, existing Brand Dictionary resolver helpers.

**Spec:** `docs/superpowers/specs/2026-09-17-coupon-management-design.md`

## Global Constraints

- Only modify coupon management, coupon-to-brand/product association, coupon display in item workflows, expiry/orphan cleanup, and synchronized homepage location deletion from existing items.
- Do not change Google Maps query resolution or `resolveLocationMapQuery()` behavior.
- Do not change the current rule that Maps uses destination/local-language names rather than Chinese display names.
- Do not re-enable retired Store / Google Places / nearby-branches functionality.
- Do not change Brand Dictionary alias storage or brand display-language priority.
- Do not rename or migrate existing raw item location strings.
- Do not store coupon IDs or coupon URLs in item documents.
- One coupon maximum per `brandId`.
- Coupon display names are derived from Brand Dictionary: Chinese first, then destination-local language, then secondary/default language, then other aliases.
- Expired coupons are deleted on login/data load; no coupon history/archive is retained.
- Location deletion removes only the exact raw location from affected items; it must not delete/modify Brand Dictionary or coupons.
- Category deletion behavior remains unchanged.
- If location deletion would require more than 499 item writes plus the preferences write, block the operation and perform no partial changes.

---

## File Structure

### New production modules

- `src/client/app/coupon-core.js` — pure coupon validation, status, cleanup, unique brand matching, brand search, per-item coupon derivation.
- `src/client/app/coupon-management-ui.js` — settings entry, country/list/editor modal, Firestore subscription/transaction writes, expiry/orphan cleanup, shared editor API.
- `src/client/app/item-coupon-ui.js` — derived coupon rows in add/edit item form, coupon editor launch/return behavior, coupon cards in item detail.

### Existing production files modified narrowly

- `src/client/app/feature-bootstrap.js` — initialize Coupon Management after Brand Dictionary and initialize item coupon integration after location picker/brand display dependencies.
- `src/client/app/item-modal-layout.js` — include the injected coupon section inside the existing edit-detail card between location chips and price research; no other layout redesign.
- `src/client/app/item-workflow-enhancements.js` — after rendering an item detail surface, invoke the coupon-detail renderer for the same item.
- `src/client/filters/filter-management.js` — add pure helper that builds item patches for exact raw-location deletion; update deletion-impact copy for `location` only.
- `src/client/app/home-ui-enhancements.js` — execute location deletion as one Firestore batch (preferences + affected item patches), while category deletion continues through the existing path.

### New/updated tests

- `tests/app/coupon-core.test.mjs`
- `tests/app/coupon-management-ui.test.mjs`
- `tests/app/item-coupon-ui.test.mjs`
- `tests/app/location-delete-sync.test.mjs`
- `tests/app/feature-bootstrap.test.mjs` if a dedicated bootstrap test exists; otherwise a focused source-wiring test file `tests/app/coupon-feature-wiring.test.mjs`.
- `tests/e2e/coupon-item-flow.spec.mjs`
- Existing `tests/e2e/brand-location-map-button.spec.mjs` remains a required regression run proving Maps local-language query behavior is unchanged.

---

### Task 1: Coupon Core Domain Helpers

**Files:**
- Create: `src/client/app/coupon-core.js`
- Create: `tests/app/coupon-core.test.mjs`

**Interfaces:**
- Consumes: `findBrandForLocation(brands, location, country)` and `resolveLocationDisplayName(location, brands, country)` from `src/client/app/brand-location-resolver.js` without modifying that resolver.
- Produces:
  - `normalizeCouponUrl(value: string): string`
  - `couponDateStatus(coupon, todayKey: string): 'future' | 'active' | 'expired'`
  - `validateCouponDraft(draft): { ok: true, value } | { ok: false, error: string }`
  - `findUniqueBrandMatch(brands, location, country): { kind: 'match', brand } | { kind: 'none' } | { kind: 'ambiguous', brands }`
  - `searchBrandsByAlias(brands, query, country): Brand[]`
  - `cleanupCoupons(coupons, brands, todayKey): { kept: Coupon[], removed: Coupon[] }`
  - `deriveItemCouponRows({ locations, brands, coupons, country, todayKey, includeInactive }): CouponRow[]`

- [ ] **Step 1: Write failing core tests for URL/date validation**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCouponUrl,
  couponDateStatus,
  validateCouponDraft
} from '../../src/client/app/coupon-core.js';

test('coupon URL requires absolute http(s) and preserves query and fragment', () => {
  assert.equal(
    normalizeCouponUrl('https://example.jp/coupon?a=1#use'),
    'https://example.jp/coupon?a=1#use'
  );
  assert.throws(() => normalizeCouponUrl('javascript:alert(1)'));
  assert.throws(() => normalizeCouponUrl('/coupon'));
});

test('coupon end date is active through that calendar day', () => {
  const coupon = { validFrom: '2026-09-01', validUntil: '2026-09-17' };
  assert.equal(couponDateStatus(coupon, '2026-09-17'), 'active');
  assert.equal(couponDateStatus(coupon, '2026-09-18'), 'expired');
  assert.equal(couponDateStatus(coupon, '2026-08-31'), 'future');
});

test('coupon draft rejects reversed date range', () => {
  const result = validateCouponDraft({
    brandId: 'brand_123', country: '日本', couponUrl: 'https://example.jp/coupon',
    validFrom: '2026-10-01', validUntil: '2026-09-30'
  });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
node --test tests/app/coupon-core.test.mjs
```

Expected: FAIL because `src/client/app/coupon-core.js` does not exist yet.

- [ ] **Step 3: Implement URL/date helpers minimally**

```js
function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeCouponUrl(value) {
  const raw = clean(value);
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('優惠券網址必須是 http(s) 網址。');
  return url.href;
}

export function couponDateStatus(coupon, todayKey) {
  const today = clean(todayKey);
  if (today < clean(coupon?.validFrom)) return 'future';
  if (today > clean(coupon?.validUntil)) return 'expired';
  return 'active';
}

export function validateCouponDraft(draft = {}) {
  const brandId = clean(draft.brandId);
  const country = clean(draft.country);
  const validFrom = clean(draft.validFrom);
  const validUntil = clean(draft.validUntil);
  if (!brandId || !country || !validFrom || !validUntil) return { ok: false, error: '請完整填寫商店與使用日期。' };
  if (validFrom > validUntil) return { ok: false, error: '開始日期不能晚於截止日期。' };
  try {
    return { ok: true, value: { ...draft, brandId, country, couponUrl: normalizeCouponUrl(draft.couponUrl), validFrom, validUntil } };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
```

- [ ] **Step 4: Add failing tests for brand alias matching, ambiguity, cleanup, dedupe, and multi-location derivation**

Use fixtures containing:

```js
const brands = [
  {
    id: 'matsumoto', country: '日本',
    aliases: [
      { language: '中文', value: '松本清' },
      { language: '日文', value: 'マツモトキヨシ' },
      { language: '英文', value: 'Matsumoto Kiyoshi' }
    ]
  },
  {
    id: 'tsuruha', country: '日本',
    aliases: [
      { language: '中文', value: '鶴羽藥妝' },
      { language: '日文', value: 'ツルハドラッグ' },
      { language: '英文', value: 'TSURUHA' }
    ]
  }
];
```

Required assertions:

```js
assert.equal(findUniqueBrandMatch(brands, '松本清', '日本').brand.id, 'matsumoto');
assert.equal(findUniqueBrandMatch(brands, 'マツモトキヨシ', '日本').brand.id, 'matsumoto');
assert.equal(findUniqueBrandMatch(brands, 'Matsumoto Kiyoshi', '日本').brand.id, 'matsumoto');
assert.deepEqual(searchBrandsByAlias(brands, 'matsumoto', '日本').map((b) => b.id), ['matsumoto']);

const rows = deriveItemCouponRows({
  locations: ['Matsumoto Kiyoshi', 'マツモトキヨシ', 'ツルハドラッグ TSURUHA'],
  brands,
  coupons: [
    { brandId: 'matsumoto', country: '日本', couponUrl: 'https://m.example', validFrom: '2026-09-01', validUntil: '2026-09-30' },
    { brandId: 'tsuruha', country: '日本', couponUrl: 'https://t.example', validFrom: '2026-09-01', validUntil: '2026-09-30' }
  ],
  country: '日本', todayKey: '2026-09-17', includeInactive: false
});
assert.deepEqual(rows.map((row) => row.brandId), ['matsumoto', 'tsuruha']);
assert.deepEqual(rows.map((row) => row.displayName), ['松本清', '鶴羽藥妝']);
```

Also create an ambiguity fixture where two brands both match the same alias and assert `kind === 'ambiguous'` rather than selecting the first brand.

- [ ] **Step 5: Run the expanded core test and verify RED for missing matching helpers**

```bash
node --test tests/app/coupon-core.test.mjs
```

Expected: FAIL on undefined `findUniqueBrandMatch`, `searchBrandsByAlias`, `cleanupCoupons`, or `deriveItemCouponRows`.

- [ ] **Step 6: Implement unique matching without changing the Maps/display resolver**

```js
import { findBrandForLocation, resolveLocationDisplayName } from './brand-location-resolver.js';

export function findUniqueBrandMatch(brands, location, country) {
  const matches = (Array.isArray(brands) ? brands : []).filter((brand) =>
    findBrandForLocation([brand], location, country)?.id === brand.id
  );
  if (!matches.length) return { kind: 'none' };
  if (matches.length > 1) return { kind: 'ambiguous', brands: matches };
  return { kind: 'match', brand: matches[0] };
}

export function searchBrandsByAlias(brands, query, country) {
  const needle = clean(query).normalize('NFKC').toLocaleLowerCase();
  return (Array.isArray(brands) ? brands : []).filter((brand) => {
    if (clean(brand?.country).toLocaleLowerCase() !== clean(country).toLocaleLowerCase()) return false;
    const names = [brand?.displayName, ...(brand?.aliases || []).map((alias) => alias?.value)];
    return !needle || names.some((name) => clean(name).normalize('NFKC').toLocaleLowerCase().includes(needle));
  });
}
```

Implement `cleanupCoupons()` so it removes coupons that are expired or whose `brandId` does not exist in the same-country brand set. Implement `deriveItemCouponRows()` so it resolves every raw location, deduplicates by brandId, derives Chinese-first display via `resolveLocationDisplayName(rawLocation, brands, country)`, and optionally excludes `future`/`expired` coupons.

- [ ] **Step 7: Run Task 1 tests GREEN**

```bash
node --test tests/app/coupon-core.test.mjs
```

Expected: all Task 1 tests PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/client/app/coupon-core.js tests/app/coupon-core.test.mjs
git commit -m "feat: add coupon domain helpers"
```

---

### Task 2: Coupon Management Settings UI and Firestore Persistence

**Files:**
- Create: `src/client/app/coupon-management-ui.js`
- Create: `tests/app/coupon-management-ui.test.mjs`
- Modify: `src/client/app/feature-bootstrap.js`
- Create/Modify: `tests/app/coupon-feature-wiring.test.mjs`

**Interfaces:**
- Consumes Task 1 `validateCouponDraft`, `cleanupCoupons`, `searchBrandsByAlias`, `couponDateStatus`.
- Reads `settings/preferences`, `settings/brandDictionary`, and `settings/couponDictionary`.
- Produces shared browser API:

```js
window.shoppingListCouponManager = {
  open({ country, brandId = '', returnContext = null }),
  coupons(),
  brands(),
  todayKey(),
  subscribe(listener)
};
```

`returnContext` is opaque state used only to return the user to the item form; Coupon Management must not mutate item form controls.

- [ ] **Step 1: Write failing UI/source tests**

Test that the source must contain:

```js
assert.match(source, /account-open-coupon-management/);
assert.match(source, /優惠券管理/);
assert.match(source, /account-open-personalization/);
assert.match(source, /couponDictionary/);
assert.match(source, /runTransaction/);
assert.match(source, /cleanupCoupons/);
assert.match(source, /searchBrandsByAlias/);
assert.match(source, /shoppingListCouponManager/);
```

Also test settings ordering by checking that the coupon button is inserted immediately before `#account-open-personalization`, matching the existing Brand Dictionary injection pattern.

- [ ] **Step 2: Run UI test RED**

```bash
node --test tests/app/coupon-management-ui.test.mjs
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement settings entry and three-view modal**

`ensureSettingsEntry(documentRef)` must create:

```html
<button id="account-open-coupon-management" type="button">…優惠券管理…</button>
```

and insert it with:

```js
const personalization = documentRef.getElementById('account-open-personalization');
root.insertBefore(button, personalization);
```

Modal views:

```text
coupon-country-view
coupon-list-view
coupon-editor-view
```

Editor fields:

```text
coupon-brand-search
coupon-brand-results
coupon-selected-brand
coupon-url
coupon-valid-from
coupon-valid-until
coupon-editor-save
coupon-editor-delete
```

- [ ] **Step 4: Implement country-scoped brand search and Chinese-first result labels**

Use `searchBrandsByAlias()` for matching. For each result, display the current preferred brand label by resolving one populated alias through the existing resolver; show aliases as secondary context but persist only `brandId`.

- [ ] **Step 5: Write failing persistence tests/source assertions**

Require a transaction against exactly:

```text
artifacts/japan-shopping-app/users/{uid}/settings/couponDictionary
```

and replacement-by-brand behavior equivalent to:

```js
const nextCoupons = current.filter((coupon) => coupon.brandId !== saved.brandId);
nextCoupons.push(saved);
```

Require cleanup to write only when stored and cleaned arrays differ.

- [ ] **Step 6: Implement Firestore subscribe + cleanup + transaction upsert/delete**

Use:

```js
const couponRef = doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'couponDictionary');
const brandRef = doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'brandDictionary');
```

On coupon/brand snapshot availability:

```js
const { kept, removed } = cleanupCoupons(state.coupons, state.brands, todayKey());
state.coupons = kept;
if (removed.length) void persistCleanedCoupons(kept);
```

Upsert inside `runTransaction(db, async (transaction) => { ... })`; re-read current document in the transaction, replace only the selected `brandId`, preserve unrelated brands, then `transaction.set(couponRef, { coupons: next }, { merge: true })`.

- [ ] **Step 7: Expose shared editor API and preserve caller context**

`open({ country, brandId, returnContext })` must:

1. hide Account Settings only when invoked from settings;
2. open directly to editor when `brandId` is supplied from an item;
3. retain `returnContext` in internal state;
4. after save/delete/cancel, dispatch `shopping-list:coupons-changed` and return without clearing/rebuilding the item form.

- [ ] **Step 8: Wire Coupon Management after Brand Dictionary in bootstrap**

Add one initializer immediately after `initBrandDictionaryUi()`:

```js
async () => {
  const { initCouponManagementUi } = await import('./coupon-management-ui.js');
  return initCouponManagementUi();
},
```

Add matching label `優惠券管理` at the same index in the labels array.

- [ ] **Step 9: Run Task 2 tests GREEN**

```bash
node --test tests/app/coupon-management-ui.test.mjs tests/app/coupon-feature-wiring.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/client/app/coupon-management-ui.js src/client/app/feature-bootstrap.js tests/app/coupon-management-ui.test.mjs tests/app/coupon-feature-wiring.test.mjs
git commit -m "feat: add coupon management"
```

---

### Task 3: Derived Coupon Section in Add/Edit Item Forms

**Files:**
- Create: `src/client/app/item-coupon-ui.js`
- Create: `tests/app/item-coupon-ui.test.mjs`
- Modify: `src/client/app/item-modal-layout.js`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- Consumes `window.shoppingListCouponManager` from Task 2.
- Consumes Task 1 `deriveItemCouponRows()` and `findUniqueBrandMatch()`.
- Produces `initItemCouponUi()` and `renderItemCouponEditorRows({ documentRef, windowRef })`.
- Creates one derived DOM section `#item-coupon-section`; no item document fields are added.

- [ ] **Step 1: Write failing form-UI tests**

Require source/DOM behavior proving:

```js
assert.match(source, /item-coupon-section/);
assert.match(source, /item-multi-location/);
assert.match(source, /shoppingListCouponManager\.open/);
assert.doesNotMatch(source, /updateDoc\([^)]*coupon/);
assert.doesNotMatch(source, /setDoc\([^)]*items/);
```

Add a DOM fixture with selected locations for Matsumoto and Tsuruha and assert two distinct coupon rows are rendered, not only the first location.

- [ ] **Step 2: Run Task 3 test RED**

```bash
node --test tests/app/item-coupon-ui.test.mjs
```

Expected: FAIL because item coupon module does not exist.

- [ ] **Step 3: Implement derived section creation and location reading**

Create `#item-coupon-section` immediately after `#item-multi-location-chips-row` in add/edit mode.

Selected raw locations must be read from the existing multi-location controls, not from translated display text. Use `data-location` / selected state already maintained by `location-picker-chips.js`.

For each selected raw location:

```js
const match = findUniqueBrandMatch(brands, rawLocation, country);
```

Render:

```text
<preferred brand name>   已設定優惠券 · 編輯
<preferred brand name>   ＋新增優惠券
<raw unresolved name>    需先建立品牌字典
```

Deduplicate by brandId.

- [ ] **Step 4: Implement shared coupon editor launch without touching unsaved item fields**

On `＋新增優惠券` / `編輯`:

```js
windowRef.shoppingListCouponManager.open({
  country,
  brandId,
  returnContext: { source: 'item-form' }
});
```

Do not call `openAddModal`, `openEditModal`, reset functions, form serialization, or item save functions.

Listen to `shopping-list:coupons-changed`, multi-location chip changes, and active-trip/country changes and rerender only `#item-coupon-section`.

- [ ] **Step 5: Include coupon section in existing edit-detail card layout**

In `applyItemEditDetailStyle()`, change only the moved node list from:

```js
[
  item-edit-name-field,
  item-purchase-meta-row,
  item-multi-location-chips-row,
  price-research-section,
  ...
]
```

to:

```js
[
  item-edit-name-field,
  item-purchase-meta-row,
  item-multi-location-chips-row,
  item-coupon-section,
  price-research-section,
  ...
]
```

Add a narrow `.workflow-edit-mode #item-coupon-section` card style only; do not reorder unrelated fields.

- [ ] **Step 6: Add item-coupon initializer to bootstrap**

Place after `initBrandLocationDisplay()` / location picker dependencies and before item workflow detail rendering:

```js
async () => {
  const { initItemCouponUi } = await import('./item-coupon-ui.js');
  return initItemCouponUi();
},
```

Add aligned label `商品優惠券`.

- [ ] **Step 7: Run form tests and existing edit-layout tests**

```bash
node --test tests/app/item-coupon-ui.test.mjs tests/app/item-modal-layout.test.mjs
npm run test:e2e -- tests/e2e/item-edit-detail-style.spec.mjs
```

If the exact unit filename for item modal layout differs, use the existing test file discovered in `tests/app`; do not invent or modify unrelated tests.

Expected: PASS; unsaved item inputs survive opening/closing coupon editor in the dedicated test fixture.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/client/app/item-coupon-ui.js src/client/app/item-modal-layout.js src/client/app/feature-bootstrap.js tests/app/item-coupon-ui.test.mjs
git commit -m "feat: show coupons in item forms"
```

---

### Task 4: Coupon Cards in Item Detail for Every Matching Location

**Files:**
- Modify: `src/client/app/item-coupon-ui.js`
- Modify: `src/client/app/item-workflow-enhancements.js`
- Modify: `tests/app/item-coupon-ui.test.mjs`
- Create: `tests/e2e/coupon-item-flow.spec.mjs`

**Interfaces:**
- Produces `renderItemDetailCoupons(container, item, { openWindow })` from `item-coupon-ui.js`.
- `item-workflow-enhancements.js` invokes it immediately after existing `renderItemDetailView()`.

- [ ] **Step 1: Write failing tests for active multi-location detail coupons**

Given an item with locations:

```js
['Matsumoto Kiyoshi', 'ツルハドラッグ TSURUHA', 'マツモトキヨシ']
```

and active coupons for Matsumoto and Tsuruha, assert:

- coupon section contains exactly 2 cards;
- names are `松本清` and `鶴羽藥妝`;
- duplicate Matsumoto aliases produce one card;
- future coupon is not shown;
- expired coupon is not shown;
- clicking `開啟優惠券` calls `window.open(exactCouponUrl, '_blank', 'noopener,noreferrer')`.

- [ ] **Step 2: Run detail tests RED**

```bash
node --test tests/app/item-coupon-ui.test.mjs
```

Expected: FAIL because detail renderer is absent.

- [ ] **Step 3: Implement `renderItemDetailCoupons()`**

Append a separate `#item-detail-coupon-section` to `#item-detail-view` after the main information card and before notes/actions when active coupons exist. Each card contains only:

```text
商店顯示名稱
有效期間：YYYY/MM/DD ～ YYYY/MM/DD
開啟優惠券
```

The button opens the exact stored URL. Do not display or transform the raw URL in the card.

- [ ] **Step 4: Wire item workflow detail render**

In the existing `window.openEditModal` wrapper:

```js
renderItemDetailView(detailSurface, item, { ... });
window.shoppingListItemCouponUi?.renderItemDetailCoupons?.(detailSurface, item);
```

Prefer the shared API exposed by `initItemCouponUi()` so `item-workflow-enhancements.js` does not gain Firestore/coupon state responsibilities.

- [ ] **Step 5: Add Playwright regression for exact live URL and multiple coupons**

`tests/e2e/coupon-item-flow.spec.mjs` should stub the coupon/brand runtime API, open an item detail, and assert two coupon cards render for two brands. Intercept `window.open` and assert the original coupon URL including query and fragment is passed unchanged.

- [ ] **Step 6: Run Task 4 tests GREEN**

```bash
node --test tests/app/item-coupon-ui.test.mjs
npm run test:e2e -- tests/e2e/coupon-item-flow.spec.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/client/app/item-coupon-ui.js src/client/app/item-workflow-enhancements.js tests/app/item-coupon-ui.test.mjs tests/e2e/coupon-item-flow.spec.mjs
git commit -m "feat: show active coupons in item detail"
```

---

### Task 5: Synchronized Raw Location Deletion from Existing Items

**Files:**
- Modify: `src/client/filters/filter-management.js`
- Modify: `src/client/app/home-ui-enhancements.js`
- Create: `tests/app/location-delete-sync.test.mjs`

**Interfaces:**
- Produces `buildLocationDeletionItemPatch(item, rawLocation)` returning `null` or the existing `locationWritePatch(nextLocations)` compatibility object.
- Produces `buildLocationDeletionPlan(items, rawLocation)` returning `{ affected: [{ id, patch }], writeCount }`.

- [ ] **Step 1: Write failing pure helper tests**

```js
import { buildLocationDeletionItemPatch, buildLocationDeletionPlan } from '../../src/client/filters/filter-management.js';

test('deleting one raw location preserves the other selected locations', () => {
  const item = { id: 'a', locations: ['Matsumoto Kiyoshi', 'ツルハドラッグ TSURUHA'] };
  const patch = buildLocationDeletionItemPatch(item, 'ツルハドラッグ TSURUHA');
  assert.deepEqual(patch.locations, ['Matsumoto Kiyoshi']);
});

test('item with only deleted location becomes locationless but is not deleted', () => {
  const patch = buildLocationDeletionItemPatch({ id: 'a', locations: ['A'] }, 'A');
  assert.deepEqual(patch.locations, []);
});

test('location deletion plan counts only affected items', () => {
  const plan = buildLocationDeletionPlan([
    { id: 'a', locations: ['A', 'B'] },
    { id: 'b', locations: ['B'] }
  ], 'A');
  assert.equal(plan.writeCount, 1);
  assert.deepEqual(plan.affected.map((entry) => entry.id), ['a']);
});
```

Use the actual `locationWritePatch()` result shape in assertions after inspecting `src/client/pricing/location-selection.js`; do not assume only `locations` if compatibility fields are also written.

- [ ] **Step 2: Run helper test RED**

```bash
node --test tests/app/location-delete-sync.test.mjs
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement pure deletion helpers**

```js
export function buildLocationDeletionItemPatch(item, rawLocation) {
  const current = resolveItemLocations(item);
  if (!current.includes(rawLocation)) return null;
  return locationWritePatch(current.filter((location) => location !== rawLocation));
}

export function buildLocationDeletionPlan(items, rawLocation) {
  const affected = [];
  for (const item of Array.isArray(items) ? items : []) {
    const patch = buildLocationDeletionItemPatch(item, rawLocation);
    if (patch && item?.id) affected.push({ id: item.id, patch });
  }
  return { affected, writeCount: affected.length };
}
```

Update `buildDeletionImpact()` copy only for `kind === 'location'` so it states the location will be removed from affected products while Brand Dictionary and coupon data remain. Leave category copy unchanged.

- [ ] **Step 4: Write failing source/integration test for atomic batch and 499 limit**

Require `home-ui-enhancements.js` to import/use `writeBatch` and `buildLocationDeletionPlan`, and to block when:

```js
plan.writeCount > 499
```

No preferences write may occur before this guard.

- [ ] **Step 5: Implement location-only batch deletion path**

In confirm handler:

```js
if (pending.kind === 'location') {
  const nextLocations = removeOption(valuesFor('location'), pending.value);
  const plan = buildLocationDeletionPlan(state.items, pending.value);
  if (plan.writeCount > 499) {
    notify('無法刪除', '使用這個地點的商品超過單次安全更新上限，未進行任何變更。', 'warning');
    return;
  }
  const batch = writeBatch(db);
  batch.set(settingsRef, { locations: nextLocations }, { merge: true });
  for (const entry of plan.affected) {
    batch.update(doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', entry.id), entry.patch);
  }
  await batch.commit();
  state.locations = nextLocations;
  renderManageList();
} else {
  await persistValues('category', removeOption(valuesFor('category'), pending.value));
}
```

Do not reference Brand Dictionary or coupon documents in this batch.

- [ ] **Step 6: Run Task 5 tests GREEN**

```bash
node --test tests/app/location-delete-sync.test.mjs
```

Also run existing filter management/rename tests to confirm category behavior and location rename remain intact:

```bash
node --test tests/app/*filter*test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/client/filters/filter-management.js src/client/app/home-ui-enhancements.js tests/app/location-delete-sync.test.mjs
git commit -m "fix: remove deleted locations from items"
```

---

### Task 6: Coupon Cleanup and Shared Runtime Robustness

**Files:**
- Modify: `src/client/app/coupon-management-ui.js`
- Modify: `tests/app/coupon-management-ui.test.mjs`

**Interfaces:**
- Uses Task 1 `cleanupCoupons()`.
- Maintains UI-filtered coupons even if cleanup persistence fails.

- [ ] **Step 1: Add failing tests for expired/orphan cleanup retry semantics**

Test state transition equivalent to:

```js
stored = [active, expired, orphan];
visible = [active];
```

and assert a Firestore cleanup write is attempted only when arrays differ.

Simulate a rejected cleanup write and assert the runtime API still returns `[active]` rather than repopulating expired/orphan records.

- [ ] **Step 2: Run cleanup tests RED**

```bash
node --test tests/app/coupon-management-ui.test.mjs
```

- [ ] **Step 3: Implement guarded cleanup scheduling**

Prevent repeated snapshot/write loops with an in-flight/signature guard:

```js
const signature = JSON.stringify(kept.map(({ brandId, updatedAt }) => [brandId, updatedAt]));
if (signature !== state.lastCleanupSignature && removed.length) {
  state.lastCleanupSignature = signature;
  void persistCleanedCoupons(kept).catch((error) => {
    state.lastCleanupSignature = '';
    console.error('Coupon cleanup failed:', error);
  });
}
```

The in-memory `state.coupons` must already be `kept` before persistence starts.

- [ ] **Step 4: Run Task 6 tests GREEN**

```bash
node --test tests/app/coupon-management-ui.test.mjs
```

- [ ] **Step 5: Commit Task 6**

```bash
git add src/client/app/coupon-management-ui.js tests/app/coupon-management-ui.test.mjs
git commit -m "fix: clean expired coupons safely"
```

---

### Task 7: Full Regression, Maps Protection, Scope Review, and PR

**Files:**
- No production changes unless a failing test demonstrates a defect within this feature scope.
- Existing/new tests only if a discovered regression lacks coverage.

**Interfaces:**
- Verifies all previous task outputs together.

- [ ] **Step 1: Run all Node tests**

```bash
npm test
```

Expected: exit 0, 0 failed tests.

- [ ] **Step 2: Run all Playwright tests**

```bash
npm run test:e2e
```

Expected: exit 0. Specifically confirm `tests/e2e/brand-location-map-button.spec.mjs` remains green, proving the Japanese Maps query still uses local-language resolver behavior.

- [ ] **Step 3: Run Firestore rules integration**

```bash
npm run test:rules
```

Expected: exit 0. Coupon storage uses the already-authorized settings document pattern; no new collection rules should be required.

- [ ] **Step 4: Inspect branch diff against the approved base**

```bash
git diff --stat 1aa1e7b36dffe2bcb89f42d3ea2cd8c8910d3015...HEAD
git diff 1aa1e7b36dffe2bcb89f42d3ea2cd8c8910d3015...HEAD -- src/client/app/brand-location-resolver.js
```

Expected:

- second command prints no diff;
- changed production files are limited to coupon modules plus the narrow bootstrap/item-layout/item-workflow/location-delete integration files listed in this plan;
- no Maps/Places/nearby/photo/pricing/trip/category behavior was modified outside necessary integration.

- [ ] **Step 5: Review requirements line-by-line**

Confirm explicitly:

```text
[ ] one coupon per brandId
[ ] all brand aliases searchable
[ ] Chinese-first display, existing resolver reused
[ ] multi-location item displays all distinct active coupons
[ ] no coupon copied into item document
[ ] live exact coupon URL opened
[ ] expired/orphan coupon cleanup on load
[ ] location delete removes raw location from affected items
[ ] brand dictionary untouched by location delete
[ ] coupons untouched by location delete
[ ] category deletion unchanged
[ ] resolveLocationMapQuery unchanged
```

- [ ] **Step 6: Create/update pull request from `feature/coupon-management` to `main`**

PR body must summarize:

```text
- centralized settings/couponDictionary storage
- brandId-based association with alias search
- add/edit item coupon UI and multi-location detail cards
- automatic expiry/orphan cleanup
- atomic raw-location removal from existing items
- explicit protected behavior: Maps resolver unchanged; Brand Dictionary/coupons retained on location delete
```

- [ ] **Step 7: Wait for GitHub CI and inspect every job**

Require Feature tests, Browser E2E, and Firestore Rules to pass before merge.

- [ ] **Step 8: Perform final code review before merge**

If a code-review subagent is available, use `superpowers:requesting-code-review`. In this ChatGPT harness no subagent tool is currently available, so perform a strict inline PR diff review against this spec/plan and do not merge with any Critical/Important issue unresolved.

- [ ] **Step 9: Merge only after all checks are green**

Use squash merge to `main`, preserving the project’s recent merge style.

- [ ] **Step 10: Verify post-merge `main`**

Confirm the merge commit triggers and passes:

```text
Feature tests: success
GitHub Pages build/deployment: success
```

Do not claim completion until both are confirmed.
