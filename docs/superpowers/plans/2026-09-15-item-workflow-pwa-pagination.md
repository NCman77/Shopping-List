# Item Workflow, Pagination, and PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add homepage-only purchase status control, reversible not-wanted state, 10-item pagination with mobile swipe gestures, read-only product detail mode, and PWA installation support.

**Architecture:** Add a pure `item-workflow.js` domain helper for status resolution, ordering, and pagination. Add `item-workflow-enhancements.js` for DOM/status writes/detail mode, loaded independently by `feature-bootstrap.js`. Add relative-path PWA assets and a small `pwa-registration.js` module so both GitHub Pages subpath and Vercel root work without deployment-specific code.

**Tech Stack:** Vanilla ES modules, Firebase Auth/Firestore 11.6.1, Tailwind utility classes, Node `node:test`, GitHub Actions, Web App Manifest, Service Worker.

**Spec:** `docs/superpowers/specs/2026-09-15-item-workflow-pwa-pagination-design.md`

## Global Constraints

- Keep old Firestore documents valid; do not bulk-migrate.
- Preserve legacy `purchased` compatibility when writing new status values.
- Status filters are ordered `全部`, `想買`, `到手`, `不想買`.
- Page size is exactly 10 after all filters and ordering.
- Approved swipe mapping is left => previous page, right => next page.
- Product open is read-only; explicit `編輯` is required before saving.
- New product opens editable and starts wanted.
- PWA URLs must be relative so GitHub Pages `/Shopping-List/` and Vercel root both work.
- Do not modify Vercel configuration.

---

### Task 1: Status and pagination domain helper

**Files:**
- Create: `src/client/app/item-workflow.js`
- Test: `tests/app/item-workflow.test.mjs`

**Interfaces:**
- Produces: `resolveShoppingStatus(item)`, `statusWritePatch(status)`, `filterByShoppingStatus(items, filter)`, `sortForHomepage(items)`, `paginateItems(items, page, pageSize = 10)`, `nextPageForSwipe({ direction, page, totalPages })`.

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveShoppingStatus,
  statusWritePatch,
  filterByShoppingStatus,
  sortForHomepage,
  paginateItems,
  nextPageForSwipe
} from '../../src/client/app/item-workflow.js';

test('legacy purchased items resolve without migration', () => {
  assert.equal(resolveShoppingStatus({ purchased: true }), 'purchased');
  assert.equal(resolveShoppingStatus({ purchased: false }), 'wanted');
});

test('not wanted overrides legacy purchased flag', () => {
  assert.equal(resolveShoppingStatus({ shoppingStatus: 'not_wanted', purchased: true }), 'not_wanted');
});

test('status patches keep purchased boolean compatible', () => {
  assert.deepEqual(statusWritePatch('purchased'), { shoppingStatus: 'purchased', purchased: true });
  assert.deepEqual(statusWritePatch('wanted'), { shoppingStatus: 'wanted', purchased: false });
  assert.deepEqual(statusWritePatch('not_wanted'), { shoppingStatus: 'not_wanted', purchased: false });
});

test('homepage sorting puts purchased last', () => {
  const items = [
    { id: 'p', createdAt: 30, purchased: true },
    { id: 'w', createdAt: 10, purchased: false },
    { id: 'n', createdAt: 20, shoppingStatus: 'not_wanted', purchased: false }
  ];
  assert.deepEqual(sortForHomepage(items).map((item) => item.id), ['w', 'n', 'p']);
});

test('pagination returns ten records and clamps page', () => {
  const items = Array.from({ length: 23 }, (_, index) => ({ id: String(index) }));
  assert.equal(paginateItems(items, 2).items.length, 10);
  assert.equal(paginateItems(items, 99).page, 3);
});

test('approved swipe mapping is left previous and right next', () => {
  assert.equal(nextPageForSwipe({ direction: 'left', page: 2, totalPages: 4 }), 1);
  assert.equal(nextPageForSwipe({ direction: 'right', page: 2, totalPages: 4 }), 3);
});
```

- [ ] **Step 2: Run test and verify RED**

Run via the repository GitHub Actions workflow after committing only the test. Expected failure: module or exports do not exist.

- [ ] **Step 3: Implement minimal helper**

```js
export function resolveShoppingStatus(item = {}) {
  if (['wanted', 'purchased', 'not_wanted'].includes(item.shoppingStatus)) return item.shoppingStatus;
  return item.purchased ? 'purchased' : 'wanted';
}

export function statusWritePatch(status) {
  if (!['wanted', 'purchased', 'not_wanted'].includes(status)) throw new TypeError('Invalid shopping status');
  return { shoppingStatus: status, purchased: status === 'purchased' };
}
```

Implement filtering, stable group ordering, clamped pagination, and non-wrapping swipe page changes using the same pure module.

- [ ] **Step 4: Run workflow and verify GREEN**

Expected: `tests/app/item-workflow.test.mjs` passes and existing tests remain green.

- [ ] **Step 5: Commit**

Commit message: `feat: add shopping status and pagination helpers`

---

### Task 2: Homepage status actions and pagination UI

**Files:**
- Create: `src/client/app/item-workflow-enhancements.js`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/app/item-workflow-enhancements.test.mjs`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `initItemWorkflowEnhancements()`.

- [ ] **Step 1: Write failing structural/behavior tests**

Tests must assert that the module:

```js
assert.match(source, /shoppingStatus/);
assert.match(source, /不想買/);
assert.match(source, /恢復/);
assert.match(source, /confirm/);
assert.match(source, /touchstart/);
assert.match(source, /touchend/);
assert.match(source, /10/);
```

And test exported small helpers for gesture interpretation and status button labels rather than depending only on source syntax.

- [ ] **Step 2: Run workflow and verify RED**

Expected failure: module missing from source/bootstrap.

- [ ] **Step 3: Implement enhancement module**

Key behavior:

```js
const PAGE_SIZE = 10;

async function writeStatus(itemId, status) {
  const ref = doc(db, 'artifacts', APP_ID, 'users', userId, 'items', itemId);
  await updateDoc(ref, statusWritePatch(status));
}
```

The module independently subscribes to items, tracks current homepage status filter/page, augments the fourth filter button, injects left-side `不想買`/`恢復` card actions, uses a confirmation modal for `不想買`, sorts purchased items last in `全部`, and hides cards outside the current 10-item page without mutating item data. Filter/country changes reset page to 1. Touch gesture handling ignores predominantly vertical movement and does not wrap pages.

- [ ] **Step 4: Run workflow and verify GREEN**

Expected: new tests and all prior regression tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add not-wanted status and homepage pagination`

---

### Task 3: Remove purchase control from form and add detail/edit mode

**Files:**
- Modify: `src/client/app/app-enhancements.js`
- Extend: `src/client/app/item-workflow-enhancements.js`
- Test: `tests/app/item-detail-mode.test.mjs`

**Interfaces:**
- Product card click remains `window.openEditModal(id)` for compatibility, but the enhancement converts an existing-item open into read-only mode.
- New-item open remains editable.

- [ ] **Step 1: Write failing tests**

Tests assert:

```js
assert.equal(detailStateForOpen({ itemId: 'abc' }).mode, 'view');
assert.equal(detailStateForOpen({ itemId: '' }).mode, 'edit');
```

And source integration checks require labels/buttons `編輯`, `儲存`, and removal/hiding of the visible `買到了嗎？` block.

- [ ] **Step 2: Run workflow and verify RED**

Expected failure because detail-state helper/view-mode UI does not yet exist.

- [ ] **Step 3: Implement minimal behavior**

- Hide/remove the form status block after enhancement initialization.
- New saves always force wanted status unless editing an existing item, in which case status remains managed by homepage actions.
- Existing item open sets inputs/selects/textarea/file/photo removal controls disabled or read-only and hides save.
- Header gets an `編輯` button next to the save area.
- Clicking `編輯` enables controls and reveals save.
- Closing the modal resets the mode.

- [ ] **Step 4: Run workflow and verify GREEN**

Expected: detail mode tests and all existing save/photo tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add read-only product detail mode`

---

### Task 4: PWA installability

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `src/client/app/pwa-registration.js`
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`
- Modify: `index.html`
- Modify: `src/client/app/feature-bootstrap.js`
- Test: `tests/app/pwa-installability.test.mjs`

**Interfaces:**
- Produces: `registerShoppingListServiceWorker()`.

- [ ] **Step 1: Write failing tests**

Read manifest and source files and assert:

```js
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
assert.match(indexHtml, /manifest\.webmanifest/);
assert.match(registrationSource, /serviceWorker\.register/);
assert.match(registrationSource, /\.\/sw\.js/);
```

- [ ] **Step 2: Run workflow and verify RED**

Expected failure because manifest/service worker/icons do not exist.

- [ ] **Step 3: Implement PWA assets**

Manifest uses only relative icon URLs:

```json
{
  "name": "旅行購物清單",
  "short_name": "購物清單",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#FAFAFA",
  "theme_color": "#FCD5CE",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Service worker caches the relative app shell and handles navigation with network-first/cache-fallback. Registration resolves `./sw.js` relative to `document.baseURI`/current module-safe base rather than `/sw.js`.

- [ ] **Step 4: Run workflow and verify GREEN**

Expected: PWA tests pass and syntax/integration checks remain green.

- [ ] **Step 5: Commit**

Commit message: `feat: make shopping list installable as PWA`

---

### Task 5: Full integration and compatibility review

**Files:**
- Modify only files required by failing integration checks.
- Test: all `tests/**/*.test.mjs` through `.github/workflows/feature-tests.yml`.

**Interfaces:**
- Verifies country isolation, photo persistence, settings merge guards, and new workflow coexist.

- [ ] **Step 1: Add regression assertions for integration boundaries**

Check that `feature-bootstrap.js` loads the new workflow independently, `country-save-guard.js` still runs after app enhancements, and no new write replaces the full settings document.

- [ ] **Step 2: Run full GitHub Actions workflow**

Expected: all unit/regression tests, syntax checks, integration markers, and Firestore schema guard succeed.

- [ ] **Step 3: Review changed-file diff**

Reject accidental broad reformatting of `index.html` or unrelated files. Confirm no Vercel configuration was added.

- [ ] **Step 4: Open PR and merge only after green CI**

PR title: `Add item workflow, pagination, detail mode, and PWA installability`.

Merge only if branch is up to date with `main`, PR is mergeable, and the latest workflow run for the head SHA is successful.
