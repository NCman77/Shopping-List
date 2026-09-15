# Price Comparison and Multi-Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-location item support, pre-trip price research, country-aware live price comparison, cached TWD exchange-rate conversion, and capped comparison history without regressing existing shopping-list features.

**Architecture:** Keep all calculation and compatibility logic in focused pure modules under `src/client/pricing/`. Add one independently bootstrapped `price-comparison-enhancements.js` module that augments the existing form/cards and performs post-save Firestore patches using the established `shoppingListLastItemSave` contract. Update only narrow integration points for active-trip location option discovery, detail-mode locking, copy compatibility, and bootstrap loading.

**Tech Stack:** Vanilla ES modules, Firebase Auth/Firestore 11.6.1, Tailwind utility classes, Node `node:test`, GitHub Actions, browser Fetch/localStorage.

**Spec:** `docs/superpowers/specs/2026-09-15-price-comparison-design.md`

## Global Constraints

- Keep Firestore under `artifacts/japan-shopping-app/users/{uid}/...`; no bulk migration.
- Keep legacy `location` synchronized to the first `locations[]` value.
- Unknown countries never inherit Japan tax-free rules.
- Japan pre-refund-method rules end on 2026-10-31; refund-method wording starts 2026-11-01.
- Tax-inclusive removal uses division by `1 + taxRate`, never simple percentage subtraction.
- Taiwan range headline uses midpoint; detailed low/high comparisons remain visible.
- ExchangeRate-API Open Access is on-demand, cached 24h, allows stale fallback, and displays attribution when used.
- Comparison history is capped at 20 newest entries.
- Pricing initialization failure must not break status, trips, Maps, photos, nearby sort, pagination, copy, or PWA.
- Existing mobile/desktop photo behavior is unchanged.

---

### Task 1: Pure multi-location and price-range compatibility helpers

**Files:**
- Create: `src/client/pricing/location-selection.js`
- Create: `src/client/pricing/price-range.js`
- Create: `tests/pricing/location-selection.test.mjs`
- Create: `tests/pricing/price-range.test.mjs`
- Modify: `src/client/app/trip-filter-options.js`
- Modify: `tests/app/trip-filter-options.test.mjs`
- Modify: `src/client/filters/filter-management.js`
- Modify: `tests/filters/filter-management.test.mjs`

**Interfaces:**
- Produces: `normalizeLocations(values)`, `resolveItemLocations(item)`, `locationWritePatch(values)`, `itemMatchesLocation(item, location)`, `normalizePriceRange(min,max)`, `normalizePriceResearch(research)`, `rangeMidpoint(range)`, `compareValueToRange(value, range)`.

- [ ] **Step 1: Write failing tests** for legacy fallback, dedupe/order, synchronized write patch, any-location match, active-trip location option discovery, delete-impact lookup across `locations[]`, one-sided ranges, reversed effective bounds, midpoint and invalid values.
- [ ] **Step 2: Commit tests only** with `test: define price and multi-location behavior` and confirm GitHub Actions fails because pricing modules/behavior are missing.
- [ ] **Step 3: Implement minimal pure helpers** and wire `valuesUsedByTrip(...,'location')` plus filter-management usage detection to `resolveItemLocations` while leaving category behavior unchanged.
- [ ] **Step 4: Confirm GitHub Actions green** for the new pure tests and all existing tests.
- [ ] **Step 5: Commit** with `feat: add multi-location and price range helpers`.

---

### Task 2: Price calculator, Japan effective-date rules, FX cache, and history helper

**Files:**
- Create: `src/client/pricing/price-calculator.js`
- Create: `src/client/pricing/country-rules.js`
- Create: `src/client/pricing/exchange-rate.js`
- Create: `src/client/pricing/comparison-history.js`
- Create: `tests/pricing/price-calculator.test.mjs`
- Create: `tests/pricing/country-rules.test.mjs`
- Create: `tests/pricing/exchange-rate.test.mjs`
- Create: `tests/pricing/comparison-history.test.mjs`

**Interfaces:**
- Produces: `normalizeCouponPercent(value)`, `calculateLocalPrice({storePrice,couponPercent,taxRate})`, `buildTaiwanComparison({estimatedTwd,research})`, `resolveCountryPricingRule(country,date)`, `currencyCodeForCountry(country)`, `taxModeById(rule,id)`, `normalizeRatePayload(payload,baseCurrency)`, `readRateCache(storage,currency,now)`, `writeRateCache(storage,currency,data)`, `fetchRateToTwd({...})`, `convertToTwd(value,rate)`, `appendComparisonHistory(existing,entry,limit=20)`.

- [ ] **Step 1: Write failing tests** for coupon clamp, JPY 1100/10%=1000, JPY 1080/8%=1000, coupon-before-tax order, NT$399–699 midpoint 549, Japan 2026-10-31 vs 2026-11-01 wording/rules, unsupported-country no tax modes, fresh/stale rate cache, provider normalization, and newest-20 history.
- [ ] **Step 2: Commit tests only** with `test: define price calculation and country rules` and confirm expected RED workflow.
- [ ] **Step 3: Implement minimal modules**. Recognized currency mapping initially includes Japan/JPY, Taiwan/TWD, United States/USD, Canada/CAD, Euro-area common labels/EUR, United Kingdom/GBP, South Korea/KRW, Thailand/THB, Australia/AUD, Singapore/SGD, Hong Kong/HKD; unsupported custom countries return no tax modes.
- [ ] **Step 4: Confirm GitHub Actions green**.
- [ ] **Step 5: Commit** with `feat: add price calculator country rules and FX cache`.

---

### Task 3: Add/edit pricing fields and multi-location UI with backward-compatible post-save patch

**Files:**
- Create: `src/client/app/price-comparison-enhancements.js`
- Create: `tests/app/price-comparison-enhancements.test.mjs`
- Modify: `src/client/app/feature-bootstrap.js`
- Modify: `src/client/app/item-workflow-enhancements.js`
- Modify: `src/client/app/item-copy.js`
- Modify: `tests/app/item-copy.test.mjs`

**Interfaces:**
- Produces: `initPriceComparisonEnhancements()`.
- Consumes: Tasks 1–2 helpers and the existing `window.shoppingListLastItemSave` result produced by `trip-save-guard.js`.

- [ ] **Step 1: Write failing integration/source tests** requiring `價格功課` fields, a multi-location checkbox/pill selector backed by the existing location definitions, legacy hidden/select compatibility, post-save `updateDoc` using stable saved item ID/user ID, priceResearch persistence, copied `locations`/`priceResearch`, bootstrap isolation, and detail-mode disabling of pricing/multi-location controls.
- [ ] **Step 2: Commit tests only** with `test: define price research form integration` and confirm RED.
- [ ] **Step 3: Implement form enhancement**. Keep `#item-location` available for legacy/store modules but visually replace it with a multi-select surface; on open/edit populate from `resolveItemLocations`; on successful base save patch `locations`, synchronized `location`, and normalized `priceResearch` to the exact saved item/user. New controls use `.price-edit-control` / `.multi-location-control` markers so item workflow can lock/unlock them with existing view/edit state.
- [ ] **Step 4: Extend copy helper** to copy normalized location choices and price research while still resetting status/photos/trip membership.
- [ ] **Step 5: Confirm workflow green** and commit with `feat: add price research and multi-location form`.

---

### Task 4: Live comparison modal, card action, FX failure handling, and history save

**Files:**
- Extend: `src/client/app/price-comparison-enhancements.js`
- Extend: `tests/app/price-comparison-enhancements.test.mjs`

**Interfaces:**
- Card action class: `.price-compare-action`.
- Modal id: `price-comparison-modal`.
- History save uses `updateDoc(itemRef, { priceComparisons: appendComparisonHistory(...) })` and must remain non-blocking for calculations.

- [ ] **Step 1: Add failing tests** requiring `比價` injection independent of shopping status, modal fields for store price/coupon/tax mode, ExchangeRate-API attribution, stale/unavailable FX messages, current vs refund-method Japan notice, estimated-result wording, no `shoppingStatus` writes, and capped history save.
- [ ] **Step 2: Commit tests only** with `test: define live price comparison UI` and confirm RED.
- [ ] **Step 3: Implement modal/card behavior**. Observe `.enhanced-item-actions`/item snapshots, inject one stable `比價` button without replacing address/distance/website actions, open selected item, resolve trip start date when available (fallback current date), load FX on demand, calculate continuously, and leave local-currency result available when FX fails.
- [ ] **Step 4: Implement optional history save** with non-blocking error UI; calculation itself never requires Firestore mutation.
- [ ] **Step 5: Confirm workflow green** and commit with `feat: add live travel price comparison`.

---

### Task 5: Full regression review, PR, exact-head CI, and merge

**Files:**
- Modify only files required by regression findings.
- Test: all `*.test.mjs` plus syntax/integration/schema checks in `.github/workflows/feature-tests.yml`.

- [ ] **Step 1: Run/review full feature-branch GitHub Actions** and inspect failures with job logs.
- [ ] **Step 2: For every discovered bug, add a failing regression test first**, then apply the minimal fix and re-run CI.
- [ ] **Step 3: Compare `main...feature/price-comparison`** and reject unrelated refactors, secrets, API keys, Firestore root-path changes, and photo-layout changes.
- [ ] **Step 4: Open PR** titled `Add travel price comparison and multi-location shopping` with a summary of data compatibility, calculation rules, and tests.
- [ ] **Step 5: Verify the exact PR head SHA has successful required workflow checks** and that the PR is mergeable.
- [ ] **Step 6: Merge to `main`** using the repository-supported merge method only after the final exact head is green.
