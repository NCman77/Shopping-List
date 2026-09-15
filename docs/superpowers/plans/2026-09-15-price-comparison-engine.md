# Price Comparison Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-location items, trip-aware currencies, optional reference prices, no-key FX conversion, Japan-aware tax-free estimation, and an independent `比價` workflow without changing existing homepage category/location visibility rules.

**Architecture:** Keep policy/calculation logic in small pure modules (`item-locations`, `currency`, `item-pricing`, `exchange-rates`, `tax-rules`, `price-comparison`) and keep Firebase/DOM work in enhancement modules. Extend the existing form/save wrappers rather than adding another competing persistence path, and keep all derived FX/tax/savings values ephemeral.

**Tech Stack:** Browser JavaScript ES modules, Firebase 11.6.1 Auth/Firestore, Node 22 `node:test`, Tailwind utility classes already used by the static app, ExchangeRate-API Open Access endpoint.

**Spec:** `docs/superpowers/specs/2026-09-15-price-comparison-engine-design.md`

## Global Constraints

- Do not change the rule that homepage category/location chips appear only after an active-trip item actually uses them.
- Keep legacy `location` readable/writable while making `locations: string[]` canonical.
- Do not persist derived TWD conversion, savings percentage, or tax-free net estimates.
- FX endpoint must require no credential; cache only public rate data in browser storage.
- Existing Maps/Places ON/OFF behavior, trip isolation, shopping status, pagination, photo storage, and Google Drive flows must remain green.
- View-photo sizing changes apply at `lg`/1024px and above only; phone sizing must remain unchanged.
- Japan tax-free UI may only expose researched date-scoped rules; other countries must not receive guessed tax percentages.
- Run the repository's exact CI-equivalent test command before each merge gate: `find . -path './.git' -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test` plus syntax/integration/schema checks from `.github/workflows/feature-tests.yml`.

---

### Task 1: Multi-location data model and filtering

**Files:**
- Create: `src/client/app/item-locations.js`
- Modify: `src/client/app/trip-filter-options.js`
- Modify: `src/client/app/item-copy.js`
- Test: `tests/app/item-locations.test.mjs`
- Test: `tests/app/trip-filter-options.test.mjs`
- Test: `tests/app/item-copy.test.mjs`

**Interfaces:**
- Produces `normalizeItemLocations(item): string[]`.
- Produces `buildLocationWritePatch(values): { locations: string[], location: string }`.
- Produces `itemMatchesLocation(item, selected): boolean`.
- Produces `usedLocationsForTrip(items, tripId): string[]`.
- Later UI tasks consume the same normalization/write helpers.

- [ ] **Step 1: Write failing pure-model tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItemLocations,
  buildLocationWritePatch,
  itemMatchesLocation,
  usedLocationsForTrip
} from '../../src/client/app/item-locations.js';

test('legacy location becomes one canonical location', () => {
  assert.deepEqual(normalizeItemLocations({ location: ' 新宿 ' }), ['新宿']);
});

test('locations trim, dedupe, and preserve order', () => {
  assert.deepEqual(normalizeItemLocations({ locations: ['新宿', ' 澀谷 ', '新宿', ''] }), ['新宿', '澀谷']);
});

test('write patch preserves legacy first location', () => {
  assert.deepEqual(buildLocationWritePatch(['新宿', '澀谷']), {
    locations: ['新宿', '澀谷'],
    location: '新宿'
  });
});

test('filter matches any selected item location', () => {
  assert.equal(itemMatchesLocation({ locations: ['新宿', '澀谷'] }, '澀谷'), true);
  assert.equal(itemMatchesLocation({ location: '新宿' }, '澀谷'), false);
});

test('used locations flatten all active-trip item locations only', () => {
  const items = [
    { tripId: 'a', locations: ['新宿', '澀谷'] },
    { tripId: 'a', location: '池袋' },
    { tripId: 'b', locations: ['銀座'] }
  ];
  assert.deepEqual(usedLocationsForTrip(items, 'a'), ['新宿', '澀谷', '池袋']);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/app/item-locations.test.mjs
```

Expected: FAIL because `src/client/app/item-locations.js` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

```js
function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeItemLocations(item = {}) {
  const source = Array.isArray(item.locations) && item.locations.length
    ? item.locations
    : [item.location];
  const seen = new Set();
  const values = [];
  for (const raw of source) {
    const value = clean(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

export function buildLocationWritePatch(values = []) {
  const locations = normalizeItemLocations({ locations: values });
  return { locations, location: locations[0] || '' };
}

export function itemMatchesLocation(item = {}, selected = 'all') {
  const target = clean(selected);
  return !target || target === 'all' || normalizeItemLocations(item).includes(target);
}

export function usedLocationsForTrip(items = [], tripId = '') {
  const id = clean(tripId);
  const seen = new Set();
  const values = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (clean(item?.tripId) !== id) continue;
    for (const value of normalizeItemLocations(item)) {
      if (seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}
```

- [ ] **Step 4: Update trip-filter extraction without changing unused-chip hiding**

Use `usedLocationsForTrip()` for location extraction while leaving category extraction and `applyButtons()` visibility logic unchanged. Add/adjust tests proving unused saved locations remain hidden.

- [ ] **Step 5: Update item copy normalization**

`buildCopiedItemData()` must copy `locations` plus compatibility `location`. Do not yet change local-currency price copy rules; Task 7 will extend copy semantics once currency helpers exist.

- [ ] **Step 6: Run focused tests GREEN**

```bash
node --test tests/app/item-locations.test.mjs tests/app/trip-filter-options.test.mjs tests/app/item-copy.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/client/app/item-locations.js src/client/app/trip-filter-options.js src/client/app/item-copy.js tests/app/item-locations.test.mjs tests/app/trip-filter-options.test.mjs tests/app/item-copy.test.mjs
git commit -m "feat: add multi-location item model"
```

---

### Task 2: Currency metadata and trip currency persistence

**Files:**
- Create: `src/client/app/currency.js`
- Modify: `src/client/app/travel-trip.js`
- Modify: `src/client/app/trip-ui.js`
- Test: `tests/app/currency.test.mjs`
- Test: `tests/app/travel-trip.test.mjs`
- Test: `tests/app/trip-ui-currency.test.mjs`

**Interfaces:**
- Produces `currencyForCountry(country): string`.
- Produces `currencyMeta(code): { code, label, symbol, digits }`.
- Produces `formatMoney(amount, code): string`.
- Produces `tripHasLocalMoney(items, tripId): boolean`.
- `normalizeTrip()` returns a resolved `currencyCode` while preserving persisted values.

- [ ] **Step 1: Write failing country/currency tests**

```js
test('common countries infer expected currencies', () => {
  assert.equal(currencyForCountry('日本'), 'JPY');
  assert.equal(currencyForCountry('加拿大'), 'CAD');
  assert.equal(currencyForCountry('美國'), 'USD');
  assert.equal(currencyForCountry('歐洲'), 'EUR');
  assert.equal(currencyForCountry('韓國'), 'KRW');
});

test('currency metadata controls symbols and minor digits', () => {
  assert.deepEqual(currencyMeta('JPY'), { code: 'JPY', label: '日圓', symbol: '¥', digits: 0 });
  assert.equal(formatMoney(1280, 'JPY'), '¥1,280');
  assert.equal(formatMoney(18.99, 'CAD'), 'CA$18.99');
});

test('legacy trip derives currency while persisted currency wins', () => {
  assert.equal(normalizeTrip({ country: '日本' }).currencyCode, 'JPY');
  assert.equal(normalizeTrip({ country: '日本', currencyCode: 'USD' }).currencyCode, 'USD');
});
```

- [ ] **Step 2: Run focused tests RED**

```bash
node --test tests/app/currency.test.mjs tests/app/travel-trip.test.mjs
```

Expected: FAIL on missing currency helpers/field.

- [ ] **Step 3: Implement currency metadata and safe normalization**

Include a focused alias table for approved/common countries plus a complete selectable code list for at least TWD, JPY, CAD, USD, EUR, GBP, KRW, THB, CHF, AUD, NZD, SGD, HKD, CNY. Unknown countries return `''` from inference but the trip UI still offers manual currency selection.

- [ ] **Step 4: Add currency field to trip form**

Add `<select id="trip-form-currency">` below country. Country changes suggest a currency only when creating a trip or while currency is still editable. Saving a trip writes `currencyCode`.

- [ ] **Step 5: Lock currency when trip has local monetary data**

Use current item snapshots in `trip-ui.js`. A trip is currency-locked when any item in that trip has non-null `priceLocalMin`, `priceLocalMax`, or `onsitePriceLocal`. Country locking remains independent and unchanged.

- [ ] **Step 6: Add UI contract tests**

Assert the source contains `trip-form-currency`, writes `currencyCode`, and disables the field when local-money data exists. Also test country change suggestion and persisted override in pure helpers.

- [ ] **Step 7: Run focused tests GREEN and commit**

```bash
node --test tests/app/currency.test.mjs tests/app/travel-trip.test.mjs tests/app/trip-ui-currency.test.mjs
git add src/client/app/currency.js src/client/app/travel-trip.js src/client/app/trip-ui.js tests/app/currency.test.mjs tests/app/travel-trip.test.mjs tests/app/trip-ui-currency.test.mjs
git commit -m "feat: add trip currency metadata"
```

---

### Task 3: Reference-price model and add/edit form integration

**Files:**
- Create: `src/client/app/item-pricing.js`
- Create: `src/client/app/item-form-pricing-locations.js`
- Modify: `src/client/app/app-enhancements.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/app/item-pricing.test.mjs`
- Test: `tests/app/item-form-pricing-locations.test.mjs`

**Interfaces:**
- Produces `normalizePriceRange(min, max, currencyCode)`.
- Produces `readReferencePriceFields(item)` and `buildReferencePricePatch(...)`.
- UI module exposes `window.shoppingListItemFormFields.read()` returning `{ locations, priceTwdMin, priceTwdMax, priceLocalMin, priceLocalMax, priceLocalCurrency }` and `populate(item, trip)`.
- `app-enhancements.js` consumes that API during save/open.

- [ ] **Step 1: Write failing price normalization tests**

Cover empty, single, range, max<min rejection, negative rejection, and currency precision. Example:

```js
assert.deepEqual(normalizePriceRange('399', '', 'TWD'), { min: 399, max: null });
assert.deepEqual(normalizePriceRange('399', '699', 'TWD'), { min: 399, max: 699 });
assert.throws(() => normalizePriceRange('699', '399', 'TWD'), /最高價不能低於最低價/);
assert.deepEqual(normalizePriceRange('18.99', '', 'CAD'), { min: 18.99, max: null });
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/app/item-pricing.test.mjs tests/app/item-form-pricing-locations.test.mjs
```

Expected: FAIL because the modules are missing.

- [ ] **Step 3: Implement the compact form enhancement**

Replace the visible single-location selector experience with a button/chip field backed by the original control only for compatibility. Add a searchable modal with checkboxes and a Done button. Add `價格參考` rows after store/location fields:

```text
台灣價  NT$ [min] [範圍]
旅遊地價 <dynamic symbol> [min] [範圍]
```

Clicking `範圍` reveals/hides the max input without requiring it.

- [ ] **Step 4: Integrate save/open with existing app-enhancements path**

During `window.saveItem`, read the enhancement API, validate ranges before Drive upload starts, and merge:

```js
{
  ...buildLocationWritePatch(form.locations),
  priceTwdMin,
  priceTwdMax,
  priceLocalMin,
  priceLocalMax,
  priceLocalCurrency
}
```

On `openAddModal`, populate empty values from active trip currency. On `openEditModal`, populate legacy/current location and price fields from the item. No price is required.

- [ ] **Step 5: Ensure view mode disables the new controls**

Extend `setDetailMode()` field handling or expose a `setReadonly(view)` method so multi-location and reference-price controls cannot mutate while viewing.

- [ ] **Step 6: Run focused tests GREEN and commit**

```bash
node --test tests/app/item-pricing.test.mjs tests/app/item-form-pricing-locations.test.mjs
git add src/client/app/item-pricing.js src/client/app/item-form-pricing-locations.js src/client/app/app-enhancements.js src/client/app/feature-bootstrap.js tests/app/item-pricing.test.mjs tests/app/item-form-pricing-locations.test.mjs
git commit -m "feat: add multi-location and reference-price form"
```

---

### Task 4: Exchange-rate cache and conversion service

**Files:**
- Create: `src/client/app/exchange-rates.js`
- Test: `tests/app/exchange-rates.test.mjs`

**Interfaces:**
- Produces `convertLocalToTwd(amount, localCode, rateTable): number | null`.
- Produces `createExchangeRateService({ fetchImpl, storage, now }): { getRates({ force? }), getStatus() }`.
- Cache key exactly `shopping-list:fx:v1:TWD`.
- Returns `{ rates, fetchedAt, providerUpdatedAt, stale, veryStale, source }`.

- [ ] **Step 1: Write failing conversion/cache tests**

Test: TWD-base conversion, fresh cache bypasses fetch, provider next-update/24h refresh, duplicate concurrent calls share one request, network failure uses stale cache, >7d sets `veryStale`, and no-cache failure returns an unavailable state rather than throwing into item UI.

Representative conversion assertion:

```js
assert.equal(convertLocalToTwd(2200, 'JPY', { JPY: 4.4 }), 500);
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/app/exchange-rates.test.mjs
```

- [ ] **Step 3: Implement fetch/cache/coalescing**

Fetch only `https://open.er-api.com/v6/latest/TWD`. Validate payload `result === 'success'` and finite positive rates. Write only public provider data plus local fetch timestamp to localStorage. Keep one module-level/service-level `inFlight` promise.

- [ ] **Step 4: Make failure states explicit**

Return stale cached rates when available. With no cache, return `{ rates: null, unavailable: true, ... }`; comparison UI must remain usable without conversion.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test tests/app/exchange-rates.test.mjs
git add src/client/app/exchange-rates.js tests/app/exchange-rates.test.mjs
git commit -m "feat: add cached exchange-rate service"
```

---

### Task 5: Date-scoped tax rules and pure comparison math

**Files:**
- Create: `src/client/app/tax-rules.js`
- Create: `src/client/app/price-comparison.js`
- Test: `tests/app/tax-rules.test.mjs`
- Test: `tests/app/price-comparison.test.mjs`

**Interfaces:**
- Produces `resolveRuleDate(trip, today): string`.
- Produces `rulesFor({ country, currencyCode, purchaseDate }): { options, notices, mode }`.
- Produces `calculateComparison({ onsitePriceLocal, couponDiscountPct, selectedTaxRule, localReference, taiwanReference, localToTwdRate }): ComparisonResult`.
- Result includes entered/gross/discounted/net local amounts, derived TWD amount, Taiwan midpoint baseline, headline percentage/label, and endpoint comparisons; none of these are persistence fields.

- [ ] **Step 1: Write failing Japan rule tests**

Assert September 2026 Japan provides none/10%/8% pre-refund options; 2026-11-01+ provides refund-method wording with equivalent 10%/8% estimation; Canada/US return no tax-free options beyond `none`.

- [ ] **Step 2: Write failing comparison tests**

Cover coupon-only, 10% division by `1.10`, 8% division by `1.08`, coupon-before-tax order, Taiwan single baseline, range midpoint baseline, endpoint cheaper/more-expensive wording, onsite priority, local-reference fallback, and no-Taiwan/no-FX suppression.

Example:

```js
const result = calculateComparison({
  onsitePriceLocal: 1480,
  couponDiscountPct: 10,
  selectedTaxRule: { rate: 0.10 },
  taiwanReference: { min: 399, max: 699 },
  localToTwdRate: 0.215
});
assert.equal(Math.round(result.discountedGross), 1332);
assert.equal(Math.round(result.estimatedNetLocal), 1211);
assert.equal(Math.round(result.estimatedTwd), 260);
```

- [ ] **Step 3: Run RED**

```bash
node --test tests/app/tax-rules.test.mjs tests/app/price-comparison.test.mjs
```

- [ ] **Step 4: Implement rule registry and calculator**

Use explicit stable IDs such as `none`, `jp-pre-std-10`, `jp-pre-reduced-8`, `jp-refund-std-10`, `jp-refund-reduced-8`. Coupon must be `>=0 && <100`; tax component is removed with division, not percentage subtraction.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test tests/app/tax-rules.test.mjs tests/app/price-comparison.test.mjs
git add src/client/app/tax-rules.js src/client/app/price-comparison.js tests/app/tax-rules.test.mjs tests/app/price-comparison.test.mjs
git commit -m "feat: add tax rules and comparison math"
```

---

### Task 6: Comparison modal, card action, and latest snapshot persistence

**Files:**
- Create: `src/client/app/price-comparison-ui.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Modify: `src/client/app/item-workflow-enhancements.js`
- Test: `tests/app/price-comparison-ui.test.mjs`
- Test: `tests/app/item-workflow-comparison-action.test.mjs`

**Interfaces:**
- `initPriceComparisonUi()` subscribes to current user items and active-trip changes.
- Exposes/uses `data-price-compare-item-id` card action hook.
- Persists only `{ onsitePriceLocal, couponDiscountPct, selectedTaxRuleId, comparisonUpdatedAt }` to the item.
- Reads reference prices/currency from item/trip and derived FX from `exchange-rates.js`.

- [ ] **Step 1: Write failing UI contracts**

Assert every enhanced card gets a `比價` button independent of shopping status; modal contains Taiwan/local reference sections, onsite/coupon inputs, tax-rule choices, `預估到手價`, Taiwan comparison headline/detail, stale/unavailable FX messaging, and ExchangeRate-API attribution when FX-derived values are shown.

- [ ] **Step 2: Run RED**

```bash
node --test tests/app/price-comparison-ui.test.mjs tests/app/item-workflow-comparison-action.test.mjs
```

- [ ] **Step 3: Implement the modal and card action**

Keep the card compact: add only a `比價` action before status actions. Opening the modal loads the latest item snapshot, active trip, resolved rule date, applicable tax options, and rates. The initial calculation may use saved local-reference midpoint if onsite price is empty.

- [ ] **Step 4: Implement latest-snapshot save safely**

Capture `userId` and `itemId` before `await updateDoc`. Validate coupon and onsite amount first. Persist only user-entered snapshot fields and timestamp. If account/item changes while saving, do not apply old async completion UI to the new session.

- [ ] **Step 5: Render comparison semantics**

Use approved labels:

```text
✅ 比台灣常見價便宜 31%
⚠️ 比台灣常見價貴 12%
≈ 與台灣常見價接近
```

For Taiwan ranges, show endpoint comparisons in the detailed section. If rates are unavailable, keep raw local prices and inputs visible while hiding TWD/savings-derived values.

- [ ] **Step 6: Run GREEN and commit**

```bash
node --test tests/app/price-comparison-ui.test.mjs tests/app/item-workflow-comparison-action.test.mjs
git add src/client/app/price-comparison-ui.js src/client/app/feature-bootstrap.js src/client/app/item-workflow-enhancements.js tests/app/price-comparison-ui.test.mjs tests/app/item-workflow-comparison-action.test.mjs
git commit -m "feat: add product price comparison workflow"
```

---

### Task 7: Copy semantics and homepage/card multi-location integration

**Files:**
- Modify: `src/client/app/item-copy.js`
- Modify: `src/client/app/item-copy-ui.js` only if target-trip currency must be supplied to the pure copy builder
- Modify: `src/client/app/app-enhancements.js`
- Modify: legacy homepage filtering/card rendering source if still authoritative for `.loc-btn` filtering
- Test: `tests/app/item-copy.test.mjs`
- Test: `tests/app/multi-location-homepage.test.mjs`

**Interfaces:**
- `buildCopiedItemData()` receives target trip including `currencyCode`.
- Cross-currency copy retains Taiwan prices, copies normalized locations, clears local reference and onsite snapshot; same-currency copy may retain local reference but still clears onsite/coupon/tax/timestamp.

- [ ] **Step 1: Write failing copy/homepage tests**

Assert same-currency and cross-currency semantics exactly match the spec; assert homepage filtering matches any location and card presentation renders every selected location without changing category/location chip visibility policy.

- [ ] **Step 2: Run RED**

```bash
node --test tests/app/item-copy.test.mjs tests/app/multi-location-homepage.test.mjs
```

- [ ] **Step 3: Implement copy semantics**

Never carry `onsitePriceLocal`, `couponDiscountPct`, `selectedTaxRuleId`, or `comparisonUpdatedAt` to a copied item. Set target `priceLocalCurrency` to target trip currency whenever the target carries local-price semantics.

- [ ] **Step 4: Replace single-location homepage equality checks**

Use `itemMatchesLocation()` rather than `item.location === selected`. Render one location chip per normalized location. Do not make saved-but-unused locations visible.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test tests/app/item-copy.test.mjs tests/app/multi-location-homepage.test.mjs
git add src/client/app/item-copy.js src/client/app/item-copy-ui.js src/client/app/app-enhancements.js tests/app/item-copy.test.mjs tests/app/multi-location-homepage.test.mjs
git commit -m "feat: integrate multi-location and copy pricing semantics"
```

---

### Task 8: Desktop detail-photo parity

**Files:**
- Modify: `src/client/photos/photo-detail-layout.js`
- Test: `tests/photos/photo-detail-natural-layout.test.mjs`
- Test: `tests/photos/photo-detail-view-mode.test.mjs`

**Interfaces:**
- No new public runtime API; only CSS/layout behavior changes.

- [ ] **Step 1: Write/adjust failing layout tests**

Assert view mode does not force unbounded desktop width, includes a `@media (min-width: 1024px)` rule that caps/centers `#photo-preview-grid` to the same practical `max-width: 28rem` used by `lg:max-w-md`, and keeps the base/mobile rule at width 100% with no smaller breakpoint cap.

- [ ] **Step 2: Run RED**

```bash
node --test tests/photos/photo-detail-natural-layout.test.mjs tests/photos/photo-detail-view-mode.test.mjs
```

- [ ] **Step 3: Implement responsive CSS**

Keep natural image dimensions and hide view-only upload controls as today. Add desktop-only max-width/centering to the grid, not image distortion.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test tests/photos/photo-detail-natural-layout.test.mjs tests/photos/photo-detail-view-mode.test.mjs
git add src/client/photos/photo-detail-layout.js tests/photos/photo-detail-natural-layout.test.mjs tests/photos/photo-detail-view-mode.test.mjs
git commit -m "fix: match detail and edit photo sizing on desktop"
```

---

### Task 9: Full integration/regression verification

**Files:**
- Modify tests only if an existing contract legitimately needs migration to `locations[]` or `currencyCode`; do not weaken unrelated assertions.
- Review all files changed by Tasks 1-8.

**Interfaces:**
- Final public runtime surfaces must remain isolated through `feature-bootstrap.js` and current user-scoped Firestore paths.

- [ ] **Step 1: Add final regression guards**

Add contracts proving:

```text
- homepage unused category/location visibility rule remains unchanged
- derived TWD/savings/net values are absent from Firestore write patches
- Maps runtime/settings behavior is untouched
- comparison UI never stores FX cache in Firestore
- ExchangeRate-API attribution exists when conversion is rendered
- active-user/item guards protect async comparison saves
```

- [ ] **Step 2: Run the complete unit/regression suite**

```bash
find . -path './.git' -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
```

Expected: all tests pass.

- [ ] **Step 3: Run syntax checks**

```bash
find src/client -name '*.js' -print0 | xargs -0 -r -n1 node --check
node --check auth-session.js
```

Expected: no syntax errors.

- [ ] **Step 4: Run integration/schema guards**

```bash
APP_FILE="src/client/app/app-enhancements.js"
DRIVE_FILE="src/client/photos/drive-photo-service.js"
grep -q "item-website" "$APP_FILE"
grep -q "觀看介紹" "$APP_FILE"
grep -q "drive.appdata" "$APP_FILE"
grep -q "itemPhotos" "$APP_FILE"
grep -q "appDataFolder" "$DRIVE_FILE"
grep -q 'match /artifacts/{appId}/users/{userId}/' firebase/firestore.rules
grep -q 'japan-shopping-app' src/client/app/app-enhancements.js
grep -q 'japan-shopping-app' src/client/photos/photo-visibility-enhancements.js
! grep -q 'match /users/{userId}/' firebase/firestore.rules
```

Expected: success.

- [ ] **Step 5: Review changed diff for correctness/security**

Check specifically:

```text
- no API keys/secrets introduced
- no live location data added
- no derived money values persisted
- user/account async guards are captured before awaits
- Japan rule boundary is exactly 2026-11-01
- 10%/8% removal divides by 1.10/1.08
- cross-currency copy cannot reinterpret stored numbers
- legacy items with only location still work
- phone photo sizing is unchanged
```

- [ ] **Step 6: Push exact head, require green GitHub Actions, open PR, review exact PR head, and merge only if clean**

Record final branch head SHA, CI run ID/status, PR number, merge SHA, GitHub Pages deployment status, and Vercel automatic status. Do not manually deploy Vercel.
