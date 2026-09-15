# Maps API Usage Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Google Places requests and accidental spend, make Maps credential handling safer, and make category/location complete filters accessible from the leftmost `全部 ▼` chip.

**Architecture:** Keep the existing static HTML + ES module + Firebase architecture. Add one pure Places usage-policy/cache helper module so threshold, TTL, coordinate freshness, error classification, and credential normalization are deterministic and testable. UI modules consume those helpers; Browser API keys remain in authenticated user preferences and are never committed to source.

**Tech Stack:** Browser ES modules, Node 22 `node:test`, Firebase Auth/Firestore, Google Maps JavaScript API Places library (New), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-maps-api-usage-hardening-design.md`

## Global Constraints

- One-character store names must remain manually searchable.
- Two or more characters auto-query only after 450 ms debounce.
- Use one fresh `AutocompleteSessionToken` per typing/selection session and never reuse it after `Place.fetchFields()` concludes the session.
- Persist `storeName` and `storePlaceId`; treat `storeLat`/`storeLng` as a maximum 30-day cache.
- Do not build a durable local database of Google Places result content.
- Opening the Distance sheet must not call Text Search; only Search/Enter may do so.
- Nearby repeated-search cache is memory-only, approximately 5 minutes, and invalidates on account/key changes.
- Backup key is for credential/bootstrap failure recovery only; quota/billing errors must stop and must not rotate credentials.
- Browser keys are never hard-coded or committed to GitHub.
- Google Cloud quota changes remain manual in Cloud Console; the app only provides instructions and runtime fail-safe messaging.
- Preserve trip isolation, photo/auth behavior, item status semantics, and pagination semantics.

---

### Task 1: `全部 ▼` complete-filter entry

**Files:**
- Modify: `src/client/app/filter-picker.js`
- Modify: `tests/app/filter-picker.test.mjs`

**Interfaces:**
- Consumes: existing `.cat-btn[data-cat]` and `.loc-btn[data-loc]` filter buttons.
- Produces: user activation of native `all` chip opens picker; `selectAllWithoutPicker(type)` performs internal no-filter selection without opening modal.

- [ ] **Step 1: Write failing regression tests**

Add assertions that no `.filter-picker-open` / `全部選項` button is created, the `all` source chip gains a chevron/marker, user activation opens the picker, and internal trip reset uses a non-picker reset path.

- [ ] **Step 2: Run focused test to verify RED**

Run: `node --test tests/app/filter-picker.test.mjs`
Expected: FAIL only on the new `全部 ▼` behavior assertions.

- [ ] **Step 3: Implement minimal picker integration**

Replace `makeOpenButton`/right-edge append logic with enhancement of the existing `all` source buttons. Intercept trusted user activation before the original filter handler, open the picker, and delegate modal selection back to the source buttons. Add an explicit internal reset helper that invokes the original no-filter behavior without opening the modal.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test tests/app/filter-picker.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: move complete filters into all chips`

---

### Task 2: Pure Places usage policy and cache rules

**Files:**
- Create: `src/client/location/places-usage-policy.js`
- Create: `tests/location/places-usage-policy.test.mjs`

**Interfaces:**
- Produces:
  - `autocompleteMode(input)` -> `'none' | 'manual' | 'auto'`
  - `AUTOCOMPLETE_DEBOUNCE_MS = 450`
  - `isCoordinateCacheFresh(resolvedAt, now?)` -> boolean using 30 days
  - `makeNearbyCacheKey({ query, origin, credentialGeneration })` -> string/null using ~200 m quantization
  - `NearbySearchCache` with 5-minute TTL and `clear()`
  - `normalizeMapsApiKeys(settings)` -> `{ primary, backup, source }` with legacy `mapsBrowserApiKey` fallback
  - `classifyMapsError(error)` -> `'credential' | 'quota' | 'billing' | 'network' | 'generic'`

- [ ] **Step 1: Write failing pure tests**

Cover 0/1/2-character modes, 450 ms constant, exact 30-day coordinate boundary, nearby cell stability for close points, TTL expiration, legacy-key normalization, and quota/credential classification.

- [ ] **Step 2: Run focused test to verify RED**

Run: `node --test tests/location/places-usage-policy.test.mjs`
Expected: FAIL because module/functions do not exist.

- [ ] **Step 3: Implement pure module**

Use deterministic string normalization, a 30-day millisecond constant, a 5-minute cache TTL, and latitude/longitude quantization chosen to approximate 200 m without storing live GPS outside memory.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test tests/location/places-usage-policy.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add Places usage policy helpers`

---

### Task 3: Primary/backup Browser API settings and legacy compatibility

**Files:**
- Modify: `src/client/app/account-settings.js`
- Modify: `tests/app/maps-settings.test.mjs`
- Consume: `src/client/location/places-usage-policy.js`

**Interfaces:**
- Firestore preferences:
  - read legacy `mapsBrowserApiKey`
  - write `mapsApiKeys: { primary, backup }` on explicit Save
- Runtime publication:
  - `window.shoppingListMapsApiKeys = { primary, backup, generation }`
  - retain `window.shoppingListMapsBrowserApiKey = primary` for backward compatibility during this rollout
  - event `shopping-list:maps-settings-changed` includes normalized keys and generation.

- [ ] **Step 1: Write failing settings tests**

Assert two masked Browser Key inputs, legacy-read compatibility, save shape `mapsApiKeys`, no hard-coded `AIza...` credential, explanatory security/quota copy, and no Cloud management credential fields.

- [ ] **Step 2: Run focused test to verify RED**

Run: `node --test tests/app/maps-settings.test.mjs`
Expected: FAIL on new UI/data-model assertions.

- [ ] **Step 3: Implement API Settings UI/data flow**

Rename the Maps account sub-view to API Settings, add primary/backup fields, save the new nested map, increment a runtime credential generation whenever effective keys change, preserve legacy primary fallback, and add links/copy for HTTP referrer restrictions, API restrictions, and Cloud Console quota setup.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test tests/app/maps-settings.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add primary and backup Maps API settings`

---

### Task 4: Conservative Maps loader failover

**Files:**
- Modify: `src/client/location/google-places-loader.js`
- Modify: `tests/location/google-places-loader.test.mjs`
- Consume: `classifyMapsError` / normalized key data from usage policy.

**Interfaces:**
- Preserve `loadPlacesLibrary({ apiKey, ... })`.
- Add `loadPlacesLibraryWithFailover({ primaryKey, backupKey, credentialGeneration, ... })` returning `{ library, keySlot }`.
- Backup may be tried at most once only when primary bootstrap fails before a usable global Places library exists and the failure is credential/bootstrap-like.
- Quota/billing-class errors never try backup.

- [ ] **Step 1: Write failing loader tests**

Cover primary success, primary bootstrap failure then backup success, no backup on quota/billing classification, one backup attempt maximum, and no source-embedded credential.

- [ ] **Step 2: Run focused test to verify RED**

Run: `node --test tests/location/google-places-loader.test.mjs`
Expected: FAIL on the failover API.

- [ ] **Step 3: Implement conservative failover**

Reuse existing per-window script-load cache. Never claim hot swap if `google.maps.importLibrary` is already initialized under a prior key. Return the active slot so UI/status can report it accurately.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test tests/location/google-places-loader.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add conservative Maps key failover`

---

### Task 5: Autocomplete request/session hardening and selected-place persistence

**Files:**
- Modify: `src/client/app/store-location-enhancements.js`
- Modify: `src/client/location/store-places.js` only if session/request contract requires it
- Modify: `tests/app/store-location-enhancements.test.mjs`
- Modify: `tests/location/store-places.test.mjs`
- Consume: `autocompleteMode`, `AUTOCOMPLETE_DEBOUNCE_MS`, runtime Maps key set.

**Interfaces:**
- Two characters: automatic request after 450 ms.
- One character: suggestion panel exposes explicit Search action; no automatic request.
- Session token created on first actual request, reused within session, cleared after successful prediction resolution/modal cancel/account or key change.
- Stale request id can never render over newer input.
- Selected place writes long-lived `storeName` and `storePlaceId`; Google display/address compatibility fields are not authoritative for new selections.

- [ ] **Step 1: Write failing autocomplete/session tests**

Assert the 450 ms constant is used, one-char input does not schedule automatic request, manual one-char search exists, selection resets session token, account/key change invalidates request id/session, and selected-store patch keeps Place ID plus coordinate timestamp without depending on resolved display/address as permanent identity.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test tests/app/store-location-enhancements.test.mjs tests/location/store-places.test.mjs`
Expected: FAIL only on the new contracts.

- [ ] **Step 3: Implement minimal behavior**

Wire usage policy into suggestion scheduling; add manual suggestion search for one-character names; rotate session tokens only at session boundaries; preserve `storeName`, `storePlaceId`, `storeLat`, `storeLng`, `storeResolvedAt`; retain legacy fields only for old-item compatibility.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --test tests/app/store-location-enhancements.test.mjs tests/location/store-places.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: reduce autocomplete Places requests`

---

### Task 6: Explicit nearby search, duplicate suppression, and short-lived cache

**Files:**
- Modify: `src/client/app/store-location-enhancements.js`
- Modify: `tests/app/store-location-enhancements.test.mjs`
- Consume: `NearbySearchCache`, `makeNearbyCacheKey`, credential generation.

**Interfaces:**
- `openBranchModal(item)` only prefills and shows a passive Search hint.
- `runBranchSearch()` is the only Text Search trigger.
- Concurrent identical `(query, location cell, credential generation)` requests are coalesced/ignored.
- Successful results may live in memory for 5 minutes; cache is cleared on account/key changes.

- [ ] **Step 1: Write failing nearby-search tests**

Assert opening the modal contains no automatic `runBranchSearch()` invocation, Search/Enter are the explicit callers, duplicate in-flight keys do not issue a second search, cache hit bypasses Places, and cache invalidates on maps/account changes.

- [ ] **Step 2: Run focused test to verify RED**

Run: `node --test tests/app/store-location-enhancements.test.mjs`
Expected: FAIL on explicit-search/cache contracts.

- [ ] **Step 3: Implement nearby request cache**

Add one module-local memory cache and one in-flight map. Quantize only for cache keys; never persist user origin. Classify quota/billing errors and show actionable Cloud Console guidance without key rotation loops.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test tests/app/store-location-enhancements.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: cache explicit nearby branch searches`

---

### Task 7: 30-day coordinate freshness in nearby sorting/backfill

**Files:**
- Modify: `src/client/app/nearby-sort.js`
- Modify: `tests/app/nearby-sort.test.mjs`
- Consume: `isCoordinateCacheFresh`.

**Interfaces:**
- Fresh cached coordinates contribute to distance sorting.
- Coordinates older than 30 days are treated as missing and refreshed only through the existing lazy backfill path when nearby mode actually needs them.
- Place ID remains untouched when coordinates expire.

- [ ] **Step 1: Write failing freshness tests**

Cover fresh vs expired coordinates and source markers proving expired coordinates are excluded before distance calculation/backfill eligibility.

- [ ] **Step 2: Run focused test to verify RED**

Run: `node --test tests/app/nearby-sort.test.mjs`
Expected: FAIL on 30-day freshness behavior.

- [ ] **Step 3: Implement freshness gate**

Use the pure helper wherever item coordinates are consumed. Do not persist live origin and do not clear `storePlaceId` when the coordinate cache expires.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test tests/app/nearby-sort.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: expire stale cached store coordinates`

---

### Task 8: Full regression, security review, PR, merge, deployment verification

**Files:**
- Review all changed files only.

- [ ] **Step 1: Run full feature workflow equivalent**

Run in GitHub Actions on exact branch head:
`find . -path './.git' -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`, syntax checks, integration markers, Firestore schema guard.
Expected: all success.

- [ ] **Step 2: Security/source scan**

Confirm no `AIza...` credential was committed, no service-account/IAM credential UI exists, no live user location is persisted, and backup rotation is not triggered by quota/billing errors.

- [ ] **Step 3: Focused diff review**

Compare branch against `main`; fix any Critical/Important findings with RED regression tests before continuing.

- [ ] **Step 4: Create PR and review exact PR head**

PR must list behavior changes, legacy compatibility, Google policy constraints, and CI evidence.

- [ ] **Step 5: Merge exact reviewed head**

Use expected head SHA. Merge only when GitHub reports mergeable and final CI is green.

- [ ] **Step 6: Verify deployment**

Confirm `main` points to merge SHA and GitHub Pages build/deploy succeeds. Do not manually deploy Vercel.
