# Country Brand Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a country-scoped brand dictionary and use it with local exact/Kana-Romaji matching to block or warn about duplicate location names.

**Architecture:** Keep normalization and matching in a pure `brand-dictionary-core.js` module. Keep Firestore-backed dictionary CRUD/UI in `brand-dictionary-ui.js`, and wrap the existing `window.handleAddLocation` from a separate `location-duplicate-guard.js` so location saving remains owned by the legacy flow. Brand documents are stored in a user-owned `brands` collection while small country language templates remain in `settings/preferences`.

**Tech Stack:** Vanilla ES modules, Firebase Auth/Firestore 11.6.1 browser SDK, Node `node:test`, GitHub Actions, Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-09-17-country-brand-dictionary-design.md`

## Global Constraints

- Only modify brand dictionary, location duplicate detection, the minimum bootstrap wiring, and the necessary Firestore rule/test coverage.
- Do not change item data, trip behavior, price comparison, photos, category behavior, Maps/Places settings, retired store features, or location rename/delete semantics.
- Existing location text remains stored exactly as entered; normalization is comparison-only.
- Han/Chinese text is never cross-language guessed unless aliases are explicitly linked in a brand record.
- Country brand matching uses the active trip country.

---

### Task 1: Pure brand dictionary and duplicate-matching core

**Files:**
- Create: `src/client/app/brand-dictionary-core.js`
- Create: `tests/app/brand-dictionary-core.test.mjs`

**Interfaces:**
- Produces: `defaultLanguageFieldsForCountry(country): string[]`
- Produces: `effectiveLanguageFields(country, savedFields): string[]`
- Produces: `parseAliasValues(value): string[]`
- Produces: `normalizeBrandAliases(aliases): Array<{language:string,value:string}>`
- Produces: `findBrandAliasConflict(brands, candidateNames, excludeId): object|null`
- Produces: `detectLocationDuplicate({input, existingLocations, brands, country}): {kind:'exact'|'dictionary'|'similar'|'none', existing?:string, brand?:object}`
- Produces: `kanaToRomaji(value): string`

- [ ] **Step 1: Write failing tests**

Test Japan/Canada/Spain presets, fallback templates, alias splitting, exact duplicates, bilingual order changes, dictionary-linked Han/English aliases, country isolation, Han non-match without dictionary data, and Kana/Romaji similarity.

- [ ] **Step 2: Run `node --test tests/app/brand-dictionary-core.test.mjs`**

Expected: FAIL because `brand-dictionary-core.js` does not exist.

- [ ] **Step 3: Implement minimal pure matching logic**

Use NFKC normalization, script-aware name chunks, exact chunk-subset rules for bilingual labels, and local kana transliteration. Do not call an API.

- [ ] **Step 4: Run the focused test again**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add country brand matching core`

### Task 2: Brand dictionary settings UI and Firestore CRUD

**Files:**
- Create: `src/client/app/brand-dictionary-ui.js`
- Create: `tests/app/brand-dictionary-ui.test.mjs`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- Consumes core helpers from Task 1.
- Reads: `settings/preferences.countries`
- Reads/writes: `settings/preferences.brandLanguageFields`
- Reads/writes: `artifacts/japan-shopping-app/users/{uid}/brands/{brandId}`

- [ ] **Step 1: Write failing UI/source regression tests**

Require a `品牌字典` account-settings entry, country list, country-specific dictionary view, `＋新增語言`, brand editor, `主要顯示名稱`, add/edit/delete controls, and bootstrap loading.

- [ ] **Step 2: Run focused UI tests**

Expected: FAIL because the module and bootstrap wiring do not exist.

- [ ] **Step 3: Implement the dedicated brand dictionary modal**

Inject the entry into `#account-settings-root`, hide the account modal while the dictionary modal is open, return to account settings on Back, and keep the feature self-contained instead of restructuring `account-settings.js`.

- [ ] **Step 4: Implement country templates and brand CRUD**

Listen to preferences and brands. Render only configured travel countries. Persist customized language fields per country. Refuse same-country alias conflicts. Preserve independent dictionaries across countries.

- [ ] **Step 5: Run focused tests**

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add country scoped brand dictionary UI`

### Task 3: Location duplicate guard

**Files:**
- Create: `src/client/app/location-duplicate-guard.js`
- Create: `tests/app/location-duplicate-guard.test.mjs`
- Modify: `src/client/app/feature-bootstrap.js`

**Interfaces:**
- Consumes: `detectLocationDuplicate` from Task 1.
- Wraps: existing `window.handleAddLocation(loc)` without replacing its storage logic.
- Reads: `settings/preferences.locations` and user brand documents.

- [ ] **Step 1: Write failing guard tests**

Verify the module preserves the original handler, blocks `exact`, warns for `dictionary`/`similar`, offers `取消 / 仍然新增`, and uses the active trip country.

- [ ] **Step 2: Run focused guard tests**

Expected: FAIL because the guard module does not exist.

- [ ] **Step 3: Implement the wrapper and warning modal**

On `exact`, notify and do not call the original handler. On `dictionary` or `similar`, show the possible existing location and only call the original handler after `仍然新增`. On `none`, delegate immediately.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: guard duplicate location aliases`

### Task 4: Firestore brand security

**Files:**
- Modify: `firebase/firestore.rules`
- Modify: `tests/integration/firestore-rules.test.mjs`

**Interfaces:**
- Adds owner-only read/write access for `/brands/{brandId}`.

- [ ] **Step 1: Add failing Firestore rules integration test**

Alice can create/read/update/delete her brand; Bob cannot read or write Alice's brand.

- [ ] **Step 2: Run `npm run test:rules`**

Expected: FAIL because `/brands` has no allow rule.

- [ ] **Step 3: Add only the owner rule for brands**

Add:

```rules
match /brands/{brandId} {
  allow read, write: if isOwner();
}
```

- [ ] **Step 4: Run rules tests again**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: secure user brand dictionary`

### Task 5: Full verification and merge

**Files:**
- No new production scope.

- [ ] **Step 1: Run full unit/regression suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Run syntax/integration/schema checks through repository CI**

Expected: all checks PASS.

- [ ] **Step 3: Run Browser E2E through repository CI**

Expected: PASS with no bootstrap/runtime errors.

- [ ] **Step 4: Run Firestore rules integration through repository CI**

Expected: PASS.

- [ ] **Step 5: Review changed-file scope**

Only the core/UI/guard modules, bootstrap wiring, Firestore brand rule/test coverage, and the approved spec/plan documents may be changed.

- [ ] **Step 6: Open PR and merge only after green CI**

PR title: `Add country scoped brand dictionary and location duplicate guard`
