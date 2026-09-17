# Brand Dictionary Store Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Brand Dictionary the canonical store source for item purchase-location selection and coupon/store naming while preserving existing item-location compatibility and the homepage's used-store-only behavior.

**Architecture:** Keep `settings/brandDictionary.brands` as the canonical store identity and keep `settings/preferences.locations` only as a compatibility/index list required by the existing item-location controls. Every brand must have one represented raw location in `preferences.locations`, while item-form choices are filtered to brands belonging to the active trip country. Reuse the existing Brand Dictionary editor for store creation from the item form, and keep homepage location management derived from actually used item locations.

**Tech Stack:** Vanilla JavaScript ES modules, Firebase Auth/Firestore listeners, Node test runner, Playwright regression suite.

**Spec:** User-approved scope in the 2026-09-17 conversation, extending `docs/superpowers/specs/2026-09-17-country-brand-dictionary-design.md` without reviving retired Places/nearby-store features.

## Global Constraints

- Do not restore a homepage add-store flow; store creation lives under Add Item → Where to buy → Add.
- Do not modify unrelated item fields, category behavior, trip behavior, pricing, photos, Maps settings, background personalization, or authentication.
- Coupon records stay linked by stable `brandId`; do not add a second coupon/store synchronization data model.
- Preserve existing raw item location strings; display-name localization stays resolver-driven.
- Existing items with legacy locations must remain editable and visible.

---

### Task 1: Define brand-to-location compatibility synchronization

**Files:**
- Modify: `src/client/app/brand-driven-location-management.js`
- Test: `tests/app/brand-driven-location-management.test.mjs`

**Interfaces:**
- Consumes: brand records with `id`, `country`, `displayName`, `aliases`; existing `preferences.locations` strings.
- Produces: `ensureBrandLocationDefinitions(preferredLocations, brands)` returning an ordered, deduplicated location list containing at least one location resolvable to every valid brand.

- [ ] **Step 1: Write a failing test** covering missing-brand insertion, alias-equivalent non-duplication, stable ordering, and blank-brand rejection.
- [ ] **Step 2: Run the focused test** with `node --test tests/app/brand-driven-location-management.test.mjs` and confirm failure because `ensureBrandLocationDefinitions` does not exist.
- [ ] **Step 3: Implement the minimal helper** using `findBrandForLocation` to detect whether an existing location already represents each brand and using `displayName` then first non-empty alias as the fallback raw location.
- [ ] **Step 4: Re-run the focused test** and confirm it passes.

### Task 2: Reuse Brand Dictionary editor as the only add-store editor

**Files:**
- Modify: `src/client/app/brand-dictionary-ui.js`
- Modify: `src/client/app/item-modal-layout.js`
- Modify: `index.html`
- Test: `tests/app/brand-dictionary-ui.test.mjs`
- Test: `tests/app/item-modal-layout.test.mjs`

**Interfaces:**
- Produces: `window.shoppingListBrandDictionaryManager.openCreate({ country, returnContext })`.
- `returnContext: 'item'` opens the existing brand editor over the item modal and returns to the item modal after save/cancel.

- [ ] **Step 1: Add failing wiring tests** asserting that item `＋新增` calls the Brand Dictionary manager instead of `openInputModal(...handleAddLocation)`, and that the homepage location row has no add-location button.
- [ ] **Step 2: Run the focused tests** and confirm the old inline/homepage add-location wiring fails them.
- [ ] **Step 3: Expose a narrowly scoped Brand Dictionary manager** that opens the existing editor for the active country without opening Account Settings, tracks the caller context, and closes back to the item modal after a successful new-brand save.
- [ ] **Step 4: Replace only the item location inline-create handler** so Add Item → Where to buy → `＋新增` invokes the shared Brand Dictionary editor.
- [ ] **Step 5: Remove the stale homepage location `＋` button** from `index.html` so the previously removed homepage creation path is not accidentally revived.
- [ ] **Step 6: Re-run the focused tests** and confirm they pass.

### Task 3: Keep item location definitions synchronized with Brand Dictionary

**Files:**
- Modify: `src/client/app/brand-dictionary-ui.js`
- Modify: `src/client/app/location-picker-chips.js`
- Test: `tests/app/brand-location-flow-wiring.test.mjs`
- Test: `tests/app/location-picker-chips.test.mjs`

**Interfaces:**
- Brand Dictionary persistence writes `brandLanguageFields`, `brandDictionary.brands`, and compatibility `preferences.locations` in the same batch when required.
- The item picker accepts only locations that resolve to a brand in the active trip country, while preserving currently selected legacy locations as removable legacy chips.

- [ ] **Step 1: Add failing tests** for adding a brand to location definitions, not duplicating an existing alias, excluding another country's brand from the active-country picker, and preserving selected legacy values.
- [ ] **Step 2: Run focused tests** and confirm they fail under the current preference-only picker behavior.
- [ ] **Step 3: Update Brand Dictionary persistence** to merge missing canonical brand locations into `preferences.locations` atomically with brand saves and to idempotently repair existing dictionary entries after both settings and dictionary snapshots load.
- [ ] **Step 4: Update the item location picker** to subscribe to the Brand Dictionary and filter selectable definitions to the active country using brand resolution; do not change the stored raw location format.
- [ ] **Step 5: Re-run focused tests** and confirm they pass.

### Task 4: Fix duplicate-brand warning layering without changing global alerts

**Files:**
- Modify: `src/client/app/brand-dictionary-ui.js`
- Test: `tests/app/brand-dictionary-ui.test.mjs`

**Interfaces:**
- Produces a Brand-Dictionary-specific conflict dialog above the dictionary modal with a single confirmation action.

- [ ] **Step 1: Add a failing test** asserting the Brand Dictionary owns a conflict overlay above its editor instead of relying on the lower global `msg-modal` for alias conflicts.
- [ ] **Step 2: Run the focused test** and confirm failure.
- [ ] **Step 3: Add the scoped conflict dialog** and route only duplicate brand-name/alias conflicts through it; leave global `showMsg` behavior unchanged.
- [ ] **Step 4: Re-run the focused test** and confirm it passes.

### Task 5: Verify coupon synchronization remains brand-ID driven and run regression suites

**Files:**
- Test only unless regression reveals a defect: `tests/app/coupon-management-ui.test.mjs`, `tests/app/coupon-core.test.mjs`

**Interfaces:**
- Coupons continue to consume `settings/brandDictionary` and stable `brandId` links.

- [ ] **Step 1: Add/adjust regression assertions** that coupon store search consumes Brand Dictionary state and that changing a brand display name does not change coupon identity.
- [ ] **Step 2: Run `npm test`** and resolve only failures caused by this feature scope.
- [ ] **Step 3: Run Playwright/browser regression tests configured by the repository** and confirm Add Item, Brand Dictionary, homepage filters, and coupon flows remain operational.
- [ ] **Step 4: Review the final diff** and remove any unrelated changes before merge.
