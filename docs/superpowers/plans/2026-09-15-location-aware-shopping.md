# Location-Aware Shopping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Places-backed store discovery, current-location nearest-store ordering, and expandable category/location pickers without regressing the existing trip, status, pagination, copy, photo, or PWA workflows.

**Architecture:** Add a small `src/client/location/` domain for pure distance/location/Places behavior and three independent app enhancement modules loaded by the existing feature bootstrap. Existing item workflow remains authoritative for trip/status/filter eligibility and pagination; location ordering is supplied through a narrowly scoped sort contract rather than replacing the workflow.

**Tech Stack:** Static ES modules, browser Geolocation API, Google Maps JavaScript API Places library, Firebase Auth/Firestore 11.6.1, Node `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-location-aware-shopping-design.md`

## Global Constraints

- Do not use OpenAI API.
- Never persist the user's live latitude/longitude.
- Never hard-code a Google Maps browser key in repository source.
- Maps/Places failures must not break existing shopping-list behavior.
- Preserve trip isolation, status groups, 10-item pagination, item copy, Drive photos, current Google Maps address action, category/location management, Firebase paths/rules, and PWA behavior.
- Do not manually deploy Vercel.

---

### Task 1: Pure distance and store-place model

**Files:**
- Create: `src/client/location/distance.js`
- Create: `src/client/location/store-place.js`
- Test: `tests/location/distance.test.mjs`
- Test: `tests/location/store-place.test.mjs`

**Interfaces:**
- Produces: `haversineMeters(a, b)`, `formatDistance(meters)`, `movedBeyondThreshold(previous, next, thresholdMeters = 150)`, `sortItemsByStatusAndDistance(items, origin)`, `normalizePlace(place)`, `dedupeAndSortPlaces(places, origin)`.

- [ ] **Step 1: Write failing pure tests** covering Tokyo coordinate distance, meter/km formatting, unknown-coordinate placement, status preservation, 150 m threshold, Place normalization and duplicate Place IDs.
- [ ] **Step 2: Run the new tests** with `node --test tests/location/distance.test.mjs tests/location/store-place.test.mjs`; expect missing-module failures.
- [ ] **Step 3: Implement the pure modules** with no browser/Firebase dependencies. `sortItemsByStatusAndDistance` must keep `wanted → not_wanted → purchased`; known coordinates sort nearest-first within status, unknown coordinates follow, and ties fall back to newest `createdAt`.
- [ ] **Step 4: Run the new tests and existing item-workflow tests**; expect pass.
- [ ] **Step 5: Commit** as `feat: add location distance and place model`.

### Task 2: Maps configuration and lazy Places loader

**Files:**
- Create: `src/client/location/google-places-loader.js`
- Modify: `src/client/app/account-settings.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/location/google-places-loader.test.mjs`
- Test: `tests/app/account-settings.test.mjs`
- Test: `tests/app/feature-bootstrap.test.mjs`

**Interfaces:**
- Consumes: authenticated preferences document `artifacts/japan-shopping-app/users/{uid}/settings/preferences`.
- Produces: `loadPlacesLibrary({ apiKey, documentImpl, windowImpl })`, global account event `shopping-list:maps-settings-changed` with `{ mapsBrowserApiKey }`.

- [ ] **Step 1: Add failing tests** asserting no repository hard-coded key, lazy script creation only after `loadPlacesLibrary`, and account UI fields for a Maps browser key stored with `setDoc(..., { merge: true })`.
- [ ] **Step 2: Run focused tests** and confirm RED.
- [ ] **Step 3: Implement loader** using `https://maps.googleapis.com/maps/api/js?key=...&libraries=places&v=weekly&loading=async`; memoize same-key loads, reject missing keys, and isolate script errors.
- [ ] **Step 4: Add an account setting view** labelled `Google Maps / Places`, password-style key input, save/remove actions, and restriction guidance. Keep existing account settings unchanged.
- [ ] **Step 5: Run focused + full tests**, then commit `feat: add lazy Google Places configuration`.

### Task 3: Store selection, persisted place metadata, and nearby branch modal

**Files:**
- Create: `src/client/location/browser-location.js`
- Create: `src/client/location/store-places.js`
- Create: `src/client/app/store-location-enhancements.js`
- Modify: `src/client/app/app-enhancements.js`
- Modify: `src/client/app/item-copy.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/location/browser-location.test.mjs`
- Test: `tests/location/store-places.test.mjs`
- Test: `tests/app/store-location-enhancements.test.mjs`
- Test: `tests/app/item-copy.test.mjs`

**Interfaces:**
- Produces: `getCurrentPosition()`, `watchPosition()`, `searchStoresByText({ query, origin, placesLibrary })`, `resolveAddressPlace({ address, country, placesLibrary })`.
- Item fields: `storeName`, `storePlaceId`, `storeDisplayName`, `storeAddress`, `storeLat`, `storeLng`, `storeResolvedAt`.

- [ ] **Step 1: Add failing tests** for geolocation wrappers, Places field requests/normalization, duplicate/closed-place filtering, store metadata copy, and source markers showing both `[地址]` and `[距離]` actions.
- [ ] **Step 2: Run focused tests** and confirm RED.
- [ ] **Step 3: Implement browser location wrapper** with one-shot and watch/clear APIs; no persistence.
- [ ] **Step 4: Implement Places adapter** using the New Places `Place.searchByText` contract, requesting only `id`, `displayName`, `formattedAddress`, `location`, `businessStatus` and biasing to current position.
- [ ] **Step 5: Extend item add/edit form** with optional `商店` field and suggestion UI. Selecting a Place writes canonical store fields and synchronizes `address`; manually editing address clears stale coordinates unless a new Place is selected.
- [ ] **Step 6: Add branch modal and `[距離]` action**. On click, request current position, query store name, dedupe/sort locally, and open Google Maps with `query_place_id` when available. If no key/location/results, show a recoverable message and do not mutate the item.
- [ ] **Step 7: Preserve/copy store metadata** in `buildCopiedItemData` and ensure edit-without-touching-store preserves existing fields.
- [ ] **Step 8: Run focused + full tests**, then commit `feat: add store Places and nearby branches`.

### Task 4: Nearby homepage sorting before pagination

**Files:**
- Create: `src/client/app/nearby-sort.js`
- Modify: `src/client/app/item-workflow-enhancements.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/app/nearby-sort.test.mjs`
- Modify: `tests/app/item-workflow-enhancements.test.mjs`

**Interfaces:**
- Produces global state/event: `window.shoppingListNearbySort = { enabled, origin, distancesByItemId }` and `shopping-list:nearby-sort-changed`.
- Item workflow consumes that state only for ordering; eligibility and pagination remain owned by item workflow.

- [ ] **Step 1: Add failing tests** for `附近排序` control, permission-denied fallback, 150 m movement threshold, event contract, status-preserving nearest sort, and “sort before paginate”.
- [ ] **Step 2: Run focused tests** and confirm RED.
- [ ] **Step 3: Implement nearby-sort controller**. Persist only `nearbySortEnabled`; hold origin in memory; start/stop watch on toggle/auth/trip lifecycle; use local item coordinates and never write origin.
- [ ] **Step 4: Integrate ordering into item workflow**. When nearby state is active with an origin, call status+distance sort; otherwise execute the existing ordering byte-for-byte-equivalent path. Reset page to 1 on meaningful reorder events.
- [ ] **Step 5: Add distance labels** to eligible cards without changing click/edit/status controls.
- [ ] **Step 6: Run focused + full tests**, then commit `feat: add nearby homepage sorting`.

### Task 5: Expandable category/location filter picker

**Files:**
- Create: `src/client/app/filter-picker.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/app/filter-picker.test.mjs`

**Interfaces:**
- Consumes existing category/location filter buttons and active-trip visibility classes.
- Produces no new persisted schema; delegates selection by clicking the existing filter control.

- [ ] **Step 1: Add failing tests** for expand buttons, active-trip-only options, local search, selected highlighting, `全部`, and delegation to existing controls.
- [ ] **Step 2: Run focused tests** and confirm RED.
- [ ] **Step 3: Implement reusable bottom-sheet/modal** for category and location. Keep horizontal chips intact; append `全部選項`; use visible/eligible existing buttons as source of truth.
- [ ] **Step 4: Handle trip/filter option changes** by rebuilding picker content and closing stale sheets safely.
- [ ] **Step 5: Run focused + full tests**, then commit `feat: add complete filter picker`.

### Task 6: Focused integration regression review and repairs

**Files:**
- Modify only files implicated by findings from this feature branch.
- Add regression tests beside the affected modules.

**Interfaces:**
- Final branch must preserve all Global Constraints and acceptance scenarios from the spec.

- [ ] **Step 1: Run full CI-equivalent suite**: all `*.test.mjs`, JS syntax checks, integration markers, Firestore schema guard.
- [ ] **Step 2: Compare `main...feature/location-aware-shopping`** and review every changed file for accidental loss of trip/status/pagination/copy/photo/address/filter behavior.
- [ ] **Step 3: Verify negative/failure paths**: missing key, bad key, denied location, timeout, no Places results, Firestore save failure, sign-out, account switch, trip switch.
- [ ] **Step 4: For each finding, write a regression test first**, confirm it fails, apply the smallest fix, rerun focused tests, and repeat until no findings remain.
- [ ] **Step 5: Run the full suite again on the exact final head** and inspect final diff.
- [ ] **Step 6: Open PR**, verify mergeable and CI green for the final head, review PR diff, then merge to `main` under standing authorization.
- [ ] **Step 7: Verify `main` points to the merge commit and GitHub Pages deployment completes successfully. Do not manually deploy Vercel.**
