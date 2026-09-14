# Multi-Trip Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class trips so repeated travel to the same country keeps independent shopping lists, preserves history, selects the right trip automatically, and supports copying products to another trip.

**Architecture:** Keep the existing user-level `items` and `itemPhotos` collections. Add a user-level `trips` collection and make `tripId` authoritative for list membership while retaining `country` as a compatibility field. Introduce one trip-context source of truth that owns active-trip resolution, legacy migration, and active-country mirroring; UI, save, filtering, and copy workflows consume that context instead of stacking independent filters.

**Tech Stack:** Static ES modules, Firebase Auth + Firestore 11.6.1, Google Drive appDataFolder API, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-trip-management-design.md`

## Global Constraints

- Existing products/photos/statuses must not be deleted or rewritten during migration except adding `tripId`.
- Normal trips require `country`, `startDate`, and `endDate`; `endDate >= startDate`.
- `tripId` is authoritative membership; `country` remains for compatibility.
- One active trip at a time; active country mirrors the selected trip country.
- Active-trip startup order: ongoing trip, persisted future/ongoing trip, nearest upcoming, most recently ended past, legacy, onboarding.
- Existing items without `tripId` migrate idempotently into deterministic country-specific legacy trips.
- New items cannot save without an active trip.
- Editing an existing item must not silently move it to another trip.
- Copy creates a new independent item; copied state resets to wanted/unpurchased.
- Copied photos must use new Drive file IDs; source and target must never share a physical Drive photo file.
- If copy fails after creating Drive files, clean those copies and do not leave a partial target item.
- Production changes stay in GitHub only; do not alter Vercel configuration.

---

### Task 1: Pure trip model and active-trip resolution

**Files:**
- Create: `src/client/app/travel-trip.js`
- Test: `tests/app/travel-trip.test.mjs`

**Interfaces:**
- Produces: `validateTripDraft`, `normalizeTrip`, `tripDisplayTitle`, `classifyTrip`, `sortTripsForPicker`, `resolveActiveTrip`, `legacyTripIdForCountry`, `groupUnassignedItemsByCountry`, `itemMatchesActiveTrip`, `activeTripCacheKey`, `readCachedActiveTripId`, `writeCachedActiveTripId`.
- Consumes: `DEFAULT_COUNTRY` and `resolveItemCountry` from `travel-country.js`.

- [ ] **Step 1: Write failing tests** for normal date validation, optional-title fallback, ongoing/upcoming/past/legacy classification, required active-trip precedence, deterministic legacy IDs, migration grouping, `tripId` eligibility, and cache round-trip.

Example active resolution assertion:

```js
assert.equal(resolveActiveTrip({
  trips,
  persistedTripId: 'future-manual',
  today: '2026-09-15'
}).id, 'ongoing-trip');
```

- [ ] **Step 2: Run** `node --test tests/app/travel-trip.test.mjs` and verify RED because the module does not exist.
- [ ] **Step 3: Implement the pure helpers** with ISO `YYYY-MM-DD` comparison only; legacy trips have `kind:'legacy'` and null dates; deterministic legacy IDs use a stable slug/hash-safe encoding of country rather than random IDs.
- [ ] **Step 4: Run** `node --test tests/app/travel-trip.test.mjs` and verify GREEN.
- [ ] **Step 5: Commit** `feat: add trip model and selection rules`.

### Task 2: Trip context, Firestore subscription, and idempotent legacy migration

**Files:**
- Create: `src/client/app/trip-context.js`
- Test: `tests/app/trip-context.test.mjs`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- Consumes Task 1 helpers.
- Produces browser globals/events:
  - `window.shoppingListActiveTrip`
  - `window.shoppingListTrips`
  - `window.shoppingListTripContextReady`
  - `shopping-list:active-trip-changed` event `{ trip }`
  - `shopping-list:trips-changed` event `{ trips }`
  - `window.shoppingListSelectTrip(tripId)` async function.

- [ ] **Step 1: Write failing source/integration tests** asserting the module subscribes to `trips`, `items`, and `settings/preferences`; migrates only items missing `tripId`; uses deterministic legacy trip IDs; persists `activeTripId`; mirrors trip country to `activeCountry`; dispatches active-trip and country events; and blocks ready state until trip context is resolved.
- [ ] **Step 2: Run** `node --test tests/app/trip-context.test.mjs` and verify RED.
- [ ] **Step 3: Implement migration** using Firestore `writeBatch`: group unassigned items by resolved country, `set` deterministic legacy trip docs with merge semantics, and `update` only each missing item with `{tripId}`. Re-run migration when unassigned items remain; do not trust a one-time completion flag.
- [ ] **Step 4: Implement active selection** from Firestore trips/settings plus local cache. `selectTrip` persists `activeTripId`, mirrors `activeCountry`, updates existing local country cache, and dispatches both trip and compatibility country events.
- [ ] **Step 5: Add independent bootstrap task** in `feature-bootstrap.js`; initialization failure logs a trip-context error and must not cause all items to be shown.
- [ ] **Step 6: Run** targeted tests and syntax check `node --check src/client/app/trip-context.js`.
- [ ] **Step 7: Commit** `feat: add trip context and legacy migration`.

### Task 3: Homepage trip selector and account travel-record management

**Files:**
- Create: `src/client/app/trip-ui.js`
- Test: `tests/app/trip-ui.test.mjs`
- Modify: `src/client/app/account-settings.js`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- Consumes `shopping-list:trips-changed`, `shopping-list:active-trip-changed`, `window.shoppingListSelectTrip`.
- Writes normal trip docs in `.../trips/{tripId}`.

- [ ] **Step 1: Write failing tests** for homepage selector presence, active title/date, grouped picker sections, `新增旅程`, `管理旅遊紀錄`, account-menu entry, date validation, country lock when trip has items, delete prevention when items exist, and empty onboarding state.
- [ ] **Step 2: Run** targeted tests and verify RED.
- [ ] **Step 3: Implement compact homepage selector** before shopping filters. Render `旅行中`, `即將出發`, `過去旅程`, and `既有清單`; selecting calls `shoppingListSelectTrip`.
- [ ] **Step 4: Implement travel-record management modal** with only title, country, start date, end date. Empty title renders fallback title. Normal-trip country can change only when item count is zero. Deleting an occupied trip is blocked with a clear message.
- [ ] **Step 5: Add `旅遊紀錄` to account settings** and keep country screen as country management, not list selection.
- [ ] **Step 6: Add trip UI bootstrap task**, run tests + syntax checks.
- [ ] **Step 7: Commit** `feat: add trip selector and travel records UI`.

### Task 4: Make trip membership authoritative for visibility and saving

**Files:**
- Create: `src/client/app/trip-save-guard.js`
- Test: `tests/app/trip-save-guard.test.mjs`
- Test: `tests/app/trip-isolation.test.mjs`
- Modify: `src/client/app/item-workflow-enhancements.js`
- Modify: `src/client/app/country-isolation.js`
- Modify: `src/client/app/country-save-guard.js`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- New saves read `window.shoppingListActiveTrip`.
- Existing edits preserve persisted membership.

- [ ] **Step 1: Write failing tests** proving item eligibility requires `item.tripId === activeTrip.id`; secondary status/pagination is applied only after trip eligibility; save with no active trip is blocked; new save writes active `tripId` + country; edit preserves original membership; country-isolation no longer acts as an independent item visibility filter when trip context is active.
- [ ] **Step 2: Run targeted tests and verify RED.**
- [ ] **Step 3: Implement `trip-save-guard.js`** around `window.saveItem`: generate/preserve ID the same way current country guard does, call original save, then merge `{tripId,country}` for a new item; for edits, read persisted item and retain membership. If no active trip for a new item, show warning and do not invoke original save.
- [ ] **Step 4: Update item workflow eligibility** to use active trip, reset page/filter state on `shopping-list:active-trip-changed`, and fail closed before trip context is ready.
- [ ] **Step 5: Narrow country modules** so they continue compatibility/background behavior but do not hide/show item cards or own new-item country membership once trip context is present.
- [ ] **Step 6: Run targeted tests, all app tests, syntax checks.**
- [ ] **Step 7: Commit** `feat: isolate shopping lists by active trip`.

### Task 5: Active-trip category/location filters

**Files:**
- Create: `src/client/app/trip-filter-options.js`
- Test: `tests/app/trip-filter-options.test.mjs`
- Modify: `src/client/app/home-ui-enhancements.js`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- Pure helper `valuesUsedByTrip(items, tripId, field)` returns unique non-empty values in encounter/config order.
- Consumes active trip events and the existing items snapshot/DOM filter rendering.

- [ ] **Step 1: Write failing tests** that categories/locations from another trip do not appear in homepage filter chips, while global management lists remain unchanged.
- [ ] **Step 2: Run targeted tests and verify RED.**
- [ ] **Step 3: Implement pure option helper** and an enhancement that hides homepage filter buttons not used by active-trip items, always preserving `全部` and management entry points.
- [ ] **Step 4: Reset category/location selection to `全部` when switching trips.**
- [ ] **Step 5: Run targeted tests + regression suite.**
- [ ] **Step 6: Commit** `feat: scope homepage filters to active trip`.

### Task 6: Copy an item to another trip with independent photos

**Files:**
- Create: `src/client/app/item-copy.js`
- Create: `src/client/app/item-copy-ui.js`
- Test: `tests/app/item-copy.test.mjs`
- Test: `tests/photos/item-copy-photos.test.mjs`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- `buildCopiedItemData({source,targetTrip,newItemId,now})` copies content, sets new membership, resets status, and sets `copiedFromItemId`.
- Copy UI reads current source item, available trips, `itemPhotos`, and Drive service behavior.

- [ ] **Step 1: Write failing pure tests** proving copied payload preserves name/category/location/address/website/description, resets `shoppingStatus:'wanted'` and `purchased:false`, uses target trip country/tripId, new timestamps, and mandatory `copiedFromItemId`.
- [ ] **Step 2: Write failing integration/source tests** proving duplicate-copy warning checks `copiedFromItemId + target tripId`; photos are downloaded and re-uploaded to new Drive file IDs; target photo metadata uses target item ID; source photo metadata/file IDs are untouched; failure cleans newly uploaded target files and avoids a partial target item.
- [ ] **Step 3: Run targeted tests and verify RED.**
- [ ] **Step 4: Implement `item-copy.js` pure payload/duplicate helpers.**
- [ ] **Step 5: Implement copy UI** in product detail view with target-trip picker. No-photo copy writes a new item directly. Photo copy requires Drive token, downloads each source blob, uploads independent copies using target item ID, then commits target item + new `itemPhotos` in one Firestore batch. If any upload or Firestore commit fails, delete all newly uploaded Drive files best-effort and report failure.
- [ ] **Step 6: Preserve thumbnail/cover behavior** by using existing thumbnail generation/persistence helpers for the copied cover photo.
- [ ] **Step 7: Run copy/photo tests + syntax checks.**
- [ ] **Step 8: Commit** `feat: copy products between trips`.

### Task 7: Full integration, migration regression, and merge readiness

**Files:**
- Modify tests under `tests/app/` and `tests/photos/` only as needed for explicit integration markers.
- Modify: `.github/workflows/feature-tests.yml` only if the existing test glob does not already include the new files.

**Interfaces:**
- End-to-end behavior from Tasks 1–6.

- [ ] **Step 1: Add regression tests** for three Japan trips with isolated products, smart reload selection, safe legacy migration, switching resets filters/page, existing country personalization follows trip country, and copy independence.
- [ ] **Step 2: Run local-equivalent commands**: `node --test tests/**/*.test.mjs` (or the repository workflow’s exact command), plus `node --check` on every new/modified JS module.
- [ ] **Step 3: Push final branch head and require GitHub Actions GREEN** for unit/regression, syntax, integration markers, and Firestore schema guard.
- [ ] **Step 4: Compare branch vs `main`** and review every production diff for unintended Vercel/Firebase schema/homepage/photo regressions.
- [ ] **Step 5: Open PR** describing data model, migration safety, active-trip rules, and independent photo copy cleanup.
- [ ] **Step 6: Verify PR mergeability and CI at exact head SHA.**
- [ ] **Step 7: Merge to `main`** under the user’s standing authorization only after clean review/CI.
- [ ] **Step 8: Verify `main` points to merge commit and GitHub Pages deployment succeeds.**
