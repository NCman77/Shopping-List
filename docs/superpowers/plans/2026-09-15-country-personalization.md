# Country Selection and Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent travel-country isolation and Drive-backed customizable image/GIF/video backgrounds to the existing shopping-list app.

**Architecture:** Keep the existing Firestore path and settings document, add pure country/personalization helper modules, then wire them into the inline renderer and a separately bootstrapped account-settings enhancement. Extend the Drive service with a generic file upload primitive while preserving its photo API. Legacy items without a country resolve to Japan.

**Tech Stack:** Vanilla ES modules, Firebase Auth/Firestore 11.6.1, Google Drive API `appDataFolder`, Tailwind CDN, Node 22 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-country-personalization-design.md`

## Global Constraints

- Keep production data under `artifacts/japan-shopping-app/users/{uid}/...`.
- Existing items without `country` resolve to `日本`; no bulk migration.
- Independent enhancements must continue using `runEnhancementsIndependently(...)`.
- Settings writes must use merge semantics so unrelated preference fields survive.
- A failed required test or CI check blocks merge.

---

### Task 1: Country domain helpers

**Files:**
- Create: `src/client/app/travel-country.js`
- Create: `tests/app/travel-country.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_COUNTRY`, `normalizeCountries(values)`, `resolveItemCountry(item)`, `filterItemsForCountry(items, country)`, `activeCountryCacheKey(userId)`, `readCachedActiveCountry(storage, userId)`, `writeCachedActiveCountry(storage, userId, country)`.

- [ ] Write tests proving Japan fallback, trimming/de-duplication, strict country filtering, and user-scoped cache behavior.
- [ ] Run `node --test tests/app/travel-country.test.mjs` and confirm the test fails because the module does not yet exist.
- [ ] Implement the pure helpers with `日本` as the fallback.
- [ ] Re-run the test and confirm it passes.
- [ ] Commit with `feat: add travel country helpers`.

### Task 2: Persist and apply active country in the core renderer

**Files:**
- Modify: `index.html`
- Create: `tests/app/country-integration.test.mjs`

**Interfaces:**
- Consumes Task 1 helpers.
- Produces runtime `state.countries` / `state.activeCountry`, Firestore settings fields `countries` / `activeCountry`, and item field `country`.

- [ ] Add static regression tests verifying: the country helper import exists; settings use `{ merge: true }`; item rendering filters by active country; map search uses resolved item country; base item save includes `country`.
- [ ] Run `node --test tests/app/country-integration.test.mjs` and confirm failure against current `index.html`.
- [ ] Update state defaults to `countries:['日本']` and a cached/fallback active country.
- [ ] Update settings listener to normalize countries, resolve active country, cache it, and keep category/location rendering intact.
- [ ] Update `saveSettings()` to merge `categories`, `locations`, `countries`, and `activeCountry` instead of replacing the settings document.
- [ ] Filter the item list by active country before existing status/category/location filters.
- [ ] Replace the hard-coded `日本` map suffix with the resolved item country.
- [ ] Ensure base add/edit save assigns current country for new items and preserves the resolved country on edits.
- [ ] Re-run the integration test.
- [ ] Commit with `feat: isolate shopping items by travel country`.

### Task 3: Country-aware enhanced save path

**Files:**
- Modify: `src/client/app/app-enhancements.js`
- Create: `tests/app/app-country-save.test.mjs`

**Interfaces:**
- Consumes: `readCachedActiveCountry()` and `resolveItemCountry()`.
- Produces: enhanced `window.saveItem()` writes the correct `country`.

- [ ] Add regression tests proving a `country:` field is present in the enhanced item payload and existing item country wins over the active-country fallback.
- [ ] Run the targeted test and confirm failure.
- [ ] Import country helpers and resolve the active country using authenticated user id plus local cache.
- [ ] Add `country: existing ? resolveItemCountry(existing) : activeCountry` to `itemData`.
- [ ] Re-run the targeted test.
- [ ] Commit with `feat: persist country in enhanced item saves`.

### Task 4: Generic Drive background media support

**Files:**
- Modify: `src/client/photos/drive-photo-service.js`
- Modify: `tests/photos/drive-photo-service.test.mjs`

**Interfaces:**
- Produces: `uploadFile({ blob, fileName, appProperties })`; existing `uploadPhoto({ blob, fileName, itemId })` delegates to it and remains backward compatible.

- [ ] Extend Drive-service tests to verify generic app properties, multipart upload, and the existing photo wrapper.
- [ ] Run the Drive-service test and confirm failure for missing `uploadFile`.
- [ ] Implement `uploadFile` and refactor `uploadPhoto` into a compatibility wrapper.
- [ ] Re-run Drive-service tests.
- [ ] Commit with `feat: support generic Drive app-data files`.

### Task 5: Personalization preference helpers

**Files:**
- Create: `src/client/app/personalization-preferences.js`
- Create: `tests/app/personalization-preferences.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_PERSONALIZATION`, `normalizePersonalization(value)`, `positionPreset(name)`, `buildPanStyle(preferences)`.

- [ ] Write tests for clamping X/Y to 0-100, scale to 1-3, valid direction/iteration values, and center/left/right/top/bottom presets.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement normalization/preset/style helpers.
- [ ] Re-run targeted tests.
- [ ] Commit with `feat: add personalization preference helpers`.

### Task 6: In-page avatar account settings and country management

**Files:**
- Create: `src/client/app/account-settings.js`
- Modify: `src/client/app/home-ui-enhancements.js`
- Modify: `src/client/app/auth-session.js`
- Create: `tests/app/account-settings.test.mjs`
- Modify: `tests/app/auth-session-independent-enhancements.test.mjs`

**Interfaces:**
- Produces: `initAccountSettings()` enhancement; avatar opens a modal containing Travel Country, Personalization, and Sign Out.
- Country selection writes Firestore `countries`/`activeCountry` with merge semantics and updates the user-scoped local cache.

- [ ] Add static/behavioral regression tests for the three account actions, custom-country control, merge writes, and independent bootstrap import.
- [ ] Run targeted tests and confirm failure.
- [ ] Remove the old one-button account-menu listener from `home-ui-enhancements.js` while retaining avatar styling and category/location management.
- [ ] Implement `account-settings.js` modal/panel shell, Firestore listener, country selection, custom-country add, and sign-out delegation to the existing hidden button.
- [ ] Add `initAccountSettings()` as its own `runEnhancementsIndependently(...)` task in `auth-session.js` and report its failure independently.
- [ ] Dispatch a `shopping-list:active-country-changed` browser event after country selection so the page can re-render immediately without reload.
- [ ] Re-run targeted tests.
- [ ] Commit with `feat: add avatar account and country settings`.

### Task 7: Background personalization editor and renderer

**Files:**
- Create: `src/client/app/background-personalization.js`
- Modify: `src/client/app/account-settings.js`
- Modify: `src/client/app/auth-session.js`
- Create: `tests/app/background-personalization.test.mjs`

**Interfaces:**
- Produces: `initBackgroundPersonalization()` and UI hooks consumed by the account settings Personalization action.
- Uses Drive `uploadFile` / `downloadPhoto` / `deletePhoto` plus Firestore `settings/preferences.personalization`.

- [ ] Add tests/static markers for accepted image/GIF/video MIME types, preview drag/scale/position controls, left/right pan, once/infinite iteration, muted `playsinline` video, and independent bootstrap.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement a background layer behind the app content, rendering `<img>` for images/GIF and muted `<video playsinline>` for MP4/WebM.
- [ ] Implement an in-page personalization editor with file input, preview viewport, drag position, zoom slider, five position presets, pan enable/direction/iteration controls, Save and Cancel.
- [ ] Upload replacement media first; write Firestore personalization metadata with merge semantics; only then delete/queue cleanup for the previous Drive file.
- [ ] On load/settings changes, normalize preferences, download the Drive blob when authorized, create/revoke object URLs safely, and apply the persisted layout.
- [ ] Wire the Personalization account action to open the editor.
- [ ] Bootstrap this feature independently in `auth-session.js`.
- [ ] Re-run targeted tests.
- [ ] Commit with `feat: add Drive-backed background personalization`.

### Task 8: Immediate country re-render and compatibility polish

**Files:**
- Modify: `index.html`
- Modify: `src/client/app/account-settings.js`
- Modify: `tests/app/country-integration.test.mjs`

**Interfaces:**
- Consumes browser event `shopping-list:active-country-changed` with `detail.country`.

- [ ] Add a regression test requiring `index.html` to listen for the country-change event.
- [ ] Run the targeted test and confirm failure.
- [ ] Add a listener that normalizes/caches the new active country, resets category/location filters to `all`, re-renders filter tabs/form selects/item list, and does not reload the page.
- [ ] Ensure custom-country selection dispatches only after a successful Firestore write.
- [ ] Re-run the targeted test.
- [ ] Commit with `fix: refresh list immediately when country changes`.

### Task 9: Full verification and PR

**Files:**
- No feature files unless verification finds a defect.

- [ ] Run the same unit/regression command as CI: `find . -path './.git' -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`.
- [ ] Run syntax checks: `find src/client -name '*.js' -print0 | xargs -0 -r -n1 node --check` and `node --check auth-session.js`.
- [ ] Run the workflow integration markers and Firestore schema guard from `.github/workflows/feature-tests.yml`.
- [ ] Compare branch to `main` and review every changed file for unintended scope.
- [ ] Open a PR summarizing country isolation, legacy fallback, account modal, background media behavior, and test evidence.
- [ ] Wait for GitHub Actions checks; if any required check fails, fix it on the branch and re-run verification.
- [ ] Merge only after required checks are green and the branch has no known regression.