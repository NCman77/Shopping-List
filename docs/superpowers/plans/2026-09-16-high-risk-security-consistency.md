# High-Risk Security and Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stored DOM injection and make item/background persistence unable to cross item, modal, or authentication boundaries while guaranteeing cleanup of Drive uploads after failed Firestore persistence.

**Architecture:** Persisted text is rendered only through DOM text/property APIs. Item saves use one immutable snapshot shared by every save wrapper, background work uses generation-scoped operations, and Drive uploads remain rollback-eligible until their Firestore commit succeeds.

**Tech Stack:** Browser-native ES modules and DOM APIs, Firebase Auth/Firestore 11.6.1, Google Drive appDataFolder API, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-16-high-risk-security-consistency-design.md`

## Global Constraints

- Preserve the current visual design, Firestore document paths, Firebase version, Google Drive scope, and zero-build static deployment.
- Existing persisted strings remain unchanged and HTML-looking text is displayed literally.
- Do not add a frontend framework or runtime dependency.
- Every production behavior change starts with a regression test that is run and observed failing for the intended reason.
- A failed cleanup must retain the original error and queue the Drive file ID under the operation's originating user.
- Do not include `ACTIVE_SKILLS_INDEX.md` in any commit.

## File Structure

- Create `src/client/app/safe-rendering.js`: protocol allow-list for persisted image sources.
- Create `src/client/app/item-save-operation.js`: immutable save snapshots, extension-provider registry, current-operation checks, and explicit result objects.
- Create `src/client/app/session-operation.js`: UID/generation/request guards for background work.
- Modify `index.html`: DOM-safe filter, option, and item-card creation.
- Modify `src/client/app/app-enhancements.js`: snapshot-based base save and high-level Drive upload transaction.
- Modify `src/client/app/trip-save-guard.js`: capture before its first await and consume explicit results.
- Modify `src/client/app/price-comparison-enhancements.js`, `store-location-enhancements.js`, and `src/client/photos/photo-detail-preview-enhancements.js`: share the same save operation across nondeterministically ordered wrappers.
- Modify `src/client/photos/photo-upload-transaction.js`: keep successful uploads rollback-eligible through persistence.
- Modify `src/client/app/background-personalization.js`: captured-user Drive service and auth-generation guards.
- Add focused tests under `tests/app` and extend `tests/photos/photo-upload-transaction.test.mjs`.

---

### Task 1: Render persisted values without HTML interpretation

**Files:**
- Create: `src/client/app/safe-rendering.js`
- Modify: `index.html:562-698`
- Create: `tests/app/safe-rendering.test.mjs`

**Interfaces:**
- Produces: `safePersistedImageSource(value: unknown): string`.
- Consumes: Browser `URL`, `document.createElement`, `textContent`, DOM properties, and event listeners.

- [ ] **Step 1: Write the failing URL allow-list tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { safePersistedImageSource } from '../../src/client/app/safe-rendering.js';

test('allows only supported persisted image sources', () => {
  assert.equal(safePersistedImageSource('https://example.test/photo.webp'), 'https://example.test/photo.webp');
  assert.equal(safePersistedImageSource('blob:https://example.test/id'), 'blob:https://example.test/id');
  assert.equal(safePersistedImageSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safePersistedImageSource('javascript:alert(1)'), '');
  assert.equal(safePersistedImageSource('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(safePersistedImageSource('http://example.test/photo.jpg'), '');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/app/safe-rendering.test.mjs`

Expected: FAIL because `src/client/app/safe-rendering.js` does not exist.

- [ ] **Step 3: Implement the image-source allow-list**

```js
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;

export function safePersistedImageSource(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  if (SAFE_DATA_IMAGE.test(source)) return source;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' || url.protocol === 'blob:' ? source : '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Add a structural regression test for the scoped renderers**

Append to `tests/app/safe-rendering.test.mjs`:

```js
import { readFile } from 'node:fs/promises';

test('persisted filters, options and item cards use DOM text and listeners', async () => {
  const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const start = source.indexOf('function renderFilterTabs()');
  const end = source.indexOf('// 將互動函式掛載至 window');
  const rendering = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(rendering, /innerHTML\s*\+=/);
  assert.doesNotMatch(rendering, /onclick=/);
  assert.doesNotMatch(rendering, /onchange=/);
  assert.doesNotMatch(rendering, /\$\{item\.(?:name|category|location|description|id|photoUrl)\}/);
  assert.match(rendering, /textContent/);
  assert.match(rendering, /addEventListener/);
  assert.match(source, /safePersistedImageSource/);
});
```

- [ ] **Step 5: Run the test again and verify the structural assertion is RED**

Run: `node --test tests/app/safe-rendering.test.mjs`

Expected: the allow-list test passes and the renderer test fails because `index.html` still interpolates persisted values and inline handlers.

- [ ] **Step 6: Replace the unsafe renderers with DOM construction**

Add this local import to the module script in `index.html`:

```js
import { safePersistedImageSource } from './src/client/app/safe-rendering.js';
```

Implement small local builders and use them from `renderFilterTabs`, `renderFormSelects`, and `renderItemList`:

```js
function makeFilterButton({ kind, value, label, active, activeClasses, inactiveClasses }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset[kind] = value;
    button.className = `px-4 py-1.5 rounded-full border-2 border-warmBrown text-sm font-bold whitespace-nowrap transition-all ${active ? activeClasses : inactiveClasses}`;
    button.style.minWidth = 'fit-content';
    button.textContent = label;
    return button;
}

function appendTextOption(select, value, label = value) {
    const option = document.createElement('option');
    option.value = String(value ?? '');
    option.textContent = String(label ?? '');
    select.appendChild(option);
}
```

For each item card, create the outer nodes with `document.createElement`, assign item strings only with `textContent`, assign the validated image URL through `image.src`, and attach open/delete/toggle callbacks with `addEventListener`. Keep `.cat-btn`, `.loc-btn`, existing Tailwind classes, checkbox semantics, map URL generation, and current list ordering intact.

- [ ] **Step 7: Verify Task 1 GREEN and commit**

Run: `node --test tests/app/safe-rendering.test.mjs`

Expected: all focused tests PASS.

Run: `git diff --check`

Commit:

```bash
git add index.html src/client/app/safe-rendering.js tests/app/safe-rendering.test.mjs
git commit -m "fix: render persisted shopping data safely"
```

---

### Task 2: Create one immutable operation for every item save

**Files:**
- Create: `src/client/app/item-save-operation.js`
- Create: `tests/app/item-save-operation.test.mjs`
- Modify: `src/client/app/app-enhancements.js:80-110, 420-571`

**Interfaces:**
- Produces: `registerItemSaveSnapshotProvider(name, provider): () => void`.
- Produces: `captureRegisteredItemSaveExtensions(): Readonly<Record<string, unknown>>`.
- Produces: `createItemSaveOperation(input): Readonly<ItemSaveOperation>`.
- Produces: `isItemSaveOperationCurrent(operation, current): boolean`.
- Produces: `createItemSaveResult(operation, succeeded, reason?): Readonly<ItemSaveResult>`.
- Browser bridge: `window.beginShoppingListSaveOperation(): ItemSaveOperation | null` and `window.releaseShoppingListSaveOperation(operation): void`.

- [ ] **Step 1: Write failing immutable-operation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureRegisteredItemSaveExtensions,
  createItemSaveOperation,
  createItemSaveResult,
  isItemSaveOperationCurrent,
  registerItemSaveSnapshotProvider
} from '../../src/client/app/item-save-operation.js';

test('item operation keeps the original form and photo values', () => {
  const fields = { 'item-name': '商品 A', 'item-status': false };
  const pendingPhotos = [{ clientId: 'photo-a' }];
  const removedPhotoIds = new Set(['old-photo']);
  const extensions = { price: { amount: 100 } };
  const operation = createItemSaveOperation({
    operationId: 'op-a', userId: 'user-a', itemId: 'item-a', modalGeneration: 3,
    fields, pendingPhotos, removedPhotoIds, extensions
  });

  fields['item-name'] = '商品 B';
  pendingPhotos.push({ clientId: 'photo-b' });
  removedPhotoIds.add('another-photo');
  extensions.price.amount = 999;

  assert.equal(operation.fields['item-name'], '商品 A');
  assert.deepEqual(operation.pendingPhotos.map((photo) => photo.clientId), ['photo-a']);
  assert.deepEqual(operation.removedPhotoIds, ['old-photo']);
  assert.equal(operation.extensions.price.amount, 100);
  assert.equal(Object.isFrozen(operation), true);
});

test('operation currentness requires the same user and modal generation', () => {
  const operation = createItemSaveOperation({ operationId: 'op', userId: 'user-a', itemId: 'item-a', modalGeneration: 2 });
  assert.equal(isItemSaveOperationCurrent(operation, { userId: 'user-a', modalGeneration: 2 }), true);
  assert.equal(isItemSaveOperationCurrent(operation, { userId: 'user-b', modalGeneration: 2 }), false);
  assert.equal(isItemSaveOperationCurrent(operation, { userId: 'user-a', modalGeneration: 3 }), false);
});

test('snapshot providers run synchronously and explicit results retain ownership', () => {
  const unregister = registerItemSaveSnapshotProvider('price', () => ({ amount: 100 }));
  const extensions = captureRegisteredItemSaveExtensions();
  unregister();
  assert.deepEqual(extensions.price, { amount: 100 });

  const operation = createItemSaveOperation({ operationId: 'op', userId: 'user-a', itemId: 'item-a', extensions });
  assert.deepEqual(createItemSaveResult(operation, true), {
    operationId: 'op', itemId: 'item-a', userId: 'user-a', succeeded: true, reason: ''
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/app/item-save-operation.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the operation module**

Use a module-local `Map` for providers. Recursively copy and freeze arrays and plain records in fields and extensions; copy and freeze each pending-photo record while retaining immutable `Blob` references; convert removed-ID iterables to a frozen string array; then freeze the operation. `registerItemSaveSnapshotProvider` rejects empty or duplicate names and returns an unregister callback. `captureRegisteredItemSaveExtensions` calls every provider synchronously and returns a recursively frozen record.

The exact result constructor is:

```js
export function createItemSaveResult(operation, succeeded, reason = '') {
  return Object.freeze({
    operationId: operation.operationId,
    itemId: operation.itemId,
    userId: operation.userId,
    succeeded: Boolean(succeeded),
    reason: String(reason || '')
  });
}
```

- [ ] **Step 4: Run the operation tests and verify GREEN**

Run: `node --test tests/app/item-save-operation.test.mjs`

Expected: all operation tests PASS.

- [ ] **Step 5: Add failing base-save source-contract assertions**

Append this test:

```js
import { readFile } from 'node:fs/promises';

test('enhanced save begins before its first await and reads snapshot fields', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('window.saveItem = async function');
  const end = source.indexOf('const originalAskDelete', start);
  const save = source.slice(start, end);
  const capture = save.indexOf('beginShoppingListSaveOperation');
  const firstAwait = save.indexOf('await ');

  assert.ok(capture >= 0 && firstAwait > capture);
  assert.match(save, /operation\.fields/);
  assert.match(save, /operation\.pendingPhotos/);
  assert.match(save, /operation\.removedPhotoIds/);
  assert.match(save, /createItemSaveResult/);
  assert.doesNotMatch(save, /const saveSucceeded = Boolean\(modalContent/);
});
```

- [ ] **Step 6: Run the test and verify the save-contract assertion is RED**

Run: `node --test tests/app/item-save-operation.test.mjs`

Expected: the new assertion fails because the enhanced save still reads live DOM/state after asynchronous work.

- [ ] **Step 7: Integrate the operation into the enhanced save**

In `app-enhancements.js`:

- maintain `modalGeneration` and advance it in enhanced open-add, open-edit, and close wrappers;
- synchronously capture every input/select/textarea value inside `#add-modal`, using booleans for checkboxes;
- generate the new item ID during capture, before any await;
- copy `state.pendingPhotos` and `state.removedPhotoIds` into the operation;
- expose `window.beginShoppingListSaveOperation`, which synchronously rejects a second save while one operation is active, claims the save button, and returns the immutable snapshot;
- expose `window.releaseShoppingListSaveOperation`, which releases only the matching active operation and re-enables the button;
- accept an optional existing operation as the first `saveItem` argument;
- have the outermost wrapper disable the save button through `beginShoppingListSaveOperation` before the first await;
- use only `operation.fields`, `operation.pendingPhotos`, `operation.removedPhotoIds`, `operation.userId`, and `operation.itemId` for persistence;
- return `createItemSaveResult(operation, true)` after commit and `createItemSaveResult(operation, false, error.message)` for handled failures;
- publish the same explicit result to `window.shoppingListLastItemSave` for backward compatibility;
- close/reset the modal only when `isItemSaveOperationCurrent` is true;
- release the operation on every validation, handled-error, and success exit.

The base save must return a failure result for validation and authorization errors instead of returning `undefined`.

- [ ] **Step 8: Verify Task 2 GREEN and commit**

Run: `node --test tests/app/item-save-operation.test.mjs tests/app/item-save-drive-auth.test.mjs`

Expected: all focused tests PASS.

Commit:

```bash
git add src/client/app/item-save-operation.js src/client/app/app-enhancements.js tests/app/item-save-operation.test.mjs
git commit -m "fix: snapshot item saves before async work"
```

---

### Task 3: Make every save wrapper share the captured operation

**Files:**
- Modify: `src/client/app/trip-save-guard.js:48-145`
- Modify: `src/client/app/price-comparison-enhancements.js:600-630`
- Modify: `src/client/app/store-location-enhancements.js:358-390`
- Modify: `src/client/photos/photo-detail-preview-enhancements.js:260-285`
- Modify: `tests/app/trip-save-guard.test.mjs`
- Create: `tests/app/item-save-wrapper-operation.test.mjs`

**Interfaces:**
- Consumes: `window.beginShoppingListSaveOperation()` and `window.releaseShoppingListSaveOperation(operation)` from Task 2.
- Consumes: `registerItemSaveSnapshotProvider` and `operation.extensions` from Task 2.
- Produces: every wrapper forwards the same `ItemSaveOperation` object and consumes `ItemSaveResult`.

- [ ] **Step 1: Replace the old trip-guard expectation with a failing explicit-result test**

Replace the CSS-derived assertions in `tests/app/trip-save-guard.test.mjs` with:

```js
test('trip guard captures before getDoc and trusts the explicit base-save result', async () => {
  const source = await readFile(guardPath, 'utf8');
  const wrapper = source.slice(source.indexOf('window.saveItem = async function'), source.indexOf('window.__shoppingListTripSaveGuardReady'));
  assert.ok(wrapper.indexOf('beginShoppingListSaveOperation') < wrapper.indexOf('await getDoc'));
  assert.match(wrapper, /result\.succeeded/);
  assert.match(wrapper, /result\.operationId\s*===\s*operation\.operationId/);
  assert.doesNotMatch(wrapper, /classList\?\.contains\('translate-y-full'\)/);
});
```

- [ ] **Step 2: Add a failing contract test for all pre-save wrappers**

Create `tests/app/item-save-wrapper-operation.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../../src/client/app/trip-save-guard.js',
  '../../src/client/app/price-comparison-enhancements.js',
  '../../src/client/app/store-location-enhancements.js',
  '../../src/client/photos/photo-detail-preview-enhancements.js'
];

test('every wrapper captures or forwards one item-save operation before awaiting', async () => {
  for (const relative of files) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8');
    const start = source.indexOf('window.saveItem = async function');
    const wrapper = source.slice(start, source.indexOf('\n  };', start) + 5);
    const operationIndex = wrapper.indexOf('beginShoppingListSaveOperation');
    const firstAwait = wrapper.indexOf('await ');
    assert.ok(operationIndex >= 0, `${relative} must capture or reuse the operation`);
    assert.ok(firstAwait === -1 || operationIndex < firstAwait, `${relative} must capture before await`);
    assert.match(wrapper, /originalSave(?:Item)?\.apply\(this, \[operation/);
  }
});
```

- [ ] **Step 3: Run both tests and verify RED**

Run: `node --test tests/app/trip-save-guard.test.mjs tests/app/item-save-wrapper-operation.test.mjs`

Expected: FAIL because trip success is CSS-derived and wrappers do not forward a shared operation.

- [ ] **Step 4: Update trip membership and reservation ownership**

At the first line of the trip wrapper, reuse `args[0]` when it contains an operation ID or synchronously call `window.beginShoppingListSaveOperation()`. Return immediately when another operation already owns the save button. Use the operation UID and item ID for `getDoc`, reservation, cleanup, and result comparison. Pass the operation as the first argument to `originalSave`. If the wrapper exits before calling the base save, publish an explicit failure result and call `window.releaseShoppingListSaveOperation(operation)`.

Treat success only as:

```js
const succeeded = Boolean(
  result?.succeeded
  && result.operationId === operation.operationId
  && result.itemId === operation.itemId
  && result.userId === operation.userId
);
```

Delete a reserved item only when this condition is false and the reservation belongs to the same operation.

- [ ] **Step 5: Register synchronous price/store snapshot providers and forward operations**

In price comparison, register provider name `price-comparison` whose return value is `buildFormPatch()` after `syncLegacyLocation()`. In store location, register provider name `store-location` whose return value is `buildStorePatch()`.

Each wrapper obtains the operation before its first await, forwards `[operation, ...args.slice(1)]`, reads its saved patch from `operation.extensions`, and gates its post-save Firestore update on the explicit result plus current UID. Remove the store wrapper's modal CSS success check.

- [ ] **Step 6: Update the detail-preview wrapper**

Capture/reuse the operation before calling `listActivePhotos`, use `operation.itemId` and `operation.userId`, forward the same operation, and skip post-save work unless the explicit result belongs to that operation and succeeded.

- [ ] **Step 7: Verify Task 3 GREEN and commit**

Run: `node --test tests/app/trip-save-guard.test.mjs tests/app/item-save-wrapper-operation.test.mjs tests/app/live-price-comparison.test.mjs tests/app/store-location-enhancements.test.mjs`

Expected: wrapper-operation tests PASS. If the pre-existing attribution test still fails, record it as unrelated and verify no new failure appears in the other focused cases.

Commit:

```bash
git add src/client/app/trip-save-guard.js src/client/app/price-comparison-enhancements.js src/client/app/store-location-enhancements.js src/client/photos/photo-detail-preview-enhancements.js tests/app/trip-save-guard.test.mjs tests/app/item-save-wrapper-operation.test.mjs
git commit -m "fix: preserve item identity across save wrappers"
```

---

### Task 4: Keep Drive uploads rollback-eligible until Firestore succeeds

**Files:**
- Modify: `src/client/photos/photo-upload-transaction.js`
- Modify: `tests/photos/photo-upload-transaction.test.mjs`
- Modify: `src/client/app/app-enhancements.js:479-566`

**Interfaces:**
- Produces: `runPhotoUploadTransaction({ photos, concurrency, uploadPhoto, persist, deletePhoto, queueCleanup }): Promise<unknown>`.
- Consumes: the immutable operation from Task 2 and captured-user Drive service.

- [ ] **Step 1: Add failing persistence-rollback tests**

Append to `tests/photos/photo-upload-transaction.test.mjs`:

```js
import { runPhotoUploadTransaction } from './photo-upload-transaction.js';

test('rolls back every new Drive file when persistence fails after uploads', async () => {
  const deleted = [];
  await assert.rejects(() => runPhotoUploadTransaction({
    photos: [{ id: 'one' }, { id: 'two' }],
    uploadPhoto: async (photo) => ({ id: `drive-${photo.id}` }),
    persist: async () => { throw new Error('firestore failed'); },
    deletePhoto: async (id) => { deleted.push(id); },
    queueCleanup: () => {}
  }), /firestore failed/);
  assert.deepEqual(deleted.sort(), ['drive-one', 'drive-two']);
});

test('queues rollback IDs when deletion needs authorization', async () => {
  const queued = [];
  await assert.rejects(() => runPhotoUploadTransaction({
    photos: [{ id: 'one' }],
    uploadPhoto: async () => ({ id: 'drive-one' }),
    persist: async () => { throw new Error('firestore failed'); },
    deletePhoto: async () => { throw new Error('authorization required'); },
    queueCleanup: (id) => { queued.push(id); }
  }), /firestore failed/);
  assert.deepEqual(queued, ['drive-one']);
});

test('retains uploaded files after successful persistence', async () => {
  const deleted = [];
  const value = await runPhotoUploadTransaction({
    photos: [{ id: 'one' }],
    uploadPhoto: async () => ({ id: 'drive-one' }),
    persist: async (uploads) => uploads[0].id,
    deletePhoto: async (id) => { deleted.push(id); },
    queueCleanup: () => {}
  });
  assert.equal(value, 'drive-one');
  assert.deepEqual(deleted, []);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/photos/photo-upload-transaction.test.mjs`

Expected: FAIL because `runPhotoUploadTransaction` is not exported.

- [ ] **Step 3: Implement the high-level transaction**

```js
export async function runPhotoUploadTransaction(options) {
  const { persist, deletePhoto, queueCleanup } = options;
  if (typeof persist !== 'function') throw new TypeError('persist is required.');
  const uploads = await uploadPhotosWithRollback(options);
  try {
    return await persist(uploads);
  } catch (error) {
    await rollbackUploadedFiles(
      uploads.map((entry) => entry?.id).filter(Boolean),
      deletePhoto,
      queueCleanup
    );
    throw error;
  }
}
```

- [ ] **Step 4: Run the transaction tests and verify GREEN**

Run: `node --test tests/photos/photo-upload-transaction.test.mjs`

Expected: all transaction tests PASS.

- [ ] **Step 5: Add a failing integration contract for item persistence**

Add to `tests/app/item-save-operation.test.mjs`:

```js
test('enhanced item save commits through the high-level photo transaction', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('window.saveItem = async function');
  const end = source.indexOf('const originalAskDelete', start);
  const save = source.slice(start, end);
  assert.match(save, /runPhotoUploadTransaction/);
  assert.match(save, /persist:\s*async/);
  assert.match(save, /await batch\.commit\(\)/);
});
```

- [ ] **Step 6: Run the integration contract and verify RED**

Run: `node --test tests/app/item-save-operation.test.mjs`

Expected: FAIL because item save still uses `mapWithConcurrency` and does not own post-upload rollback.

- [ ] **Step 7: Integrate the transaction with a captured-user Drive service**

Create a local `driveServiceForUser(userId)` factory in `app-enhancements.js` using the existing `window.fetch` and `sessionStorage`, but with `getUserId: () => userId`. The operation uses this service for upload, rollback delete, and `queueCleanup` even if `state.userId` later changes.

Move upload, thumbnail creation, batch assembly, operation-current authentication validation, and `batch.commit()` into the `persist` callback. Return the committed photo data from that callback. Remove `mapWithConcurrency` from the item upload path.

The UI upload counter may update only while the operation's modal generation is current. On rollback, queue every delete failure, including `DriveAuthorizationError`.

- [ ] **Step 8: Verify Task 4 GREEN and commit**

Run: `node --test tests/photos/photo-upload-transaction.test.mjs tests/app/item-save-operation.test.mjs tests/app/item-save-drive-auth.test.mjs`

Expected: all focused tests PASS.

Commit:

```bash
git add src/client/photos/photo-upload-transaction.js src/client/app/app-enhancements.js tests/photos/photo-upload-transaction.test.mjs tests/app/item-save-operation.test.mjs
git commit -m "fix: roll back Drive uploads after persistence failure"
```

---

### Task 5: Guard background work by authentication generation

**Files:**
- Create: `src/client/app/session-operation.js`
- Create: `tests/app/session-operation.test.mjs`
- Modify: `src/client/app/background-personalization.js:210-315, 487-570`
- Modify: `tests/app/background-personalization.test.mjs`

**Interfaces:**
- Produces: `createSessionOperationTracker(): { advance(userId), capture(userId), nextRequest(channel, userId), isSessionCurrent(operation, userId), isLatestRequest(operation, userId) }`.
- Consumes: captured UID-specific `createDrivePhotoService` instances.

- [ ] **Step 1: Write failing generation and request-order tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionOperationTracker } from '../../src/client/app/session-operation.js';

test('auth changes invalidate older operations', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const oldOperation = tracker.capture('user-a');
  tracker.advance('user-b');
  assert.equal(tracker.isSessionCurrent(oldOperation, 'user-b'), false);
});

test('only the newest request in one channel and auth generation is current', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const save = tracker.capture('user-a');
  const first = tracker.nextRequest('background-load', 'user-a');
  const second = tracker.nextRequest('background-load', 'user-a');
  assert.equal(tracker.isLatestRequest(first, 'user-a'), false);
  assert.equal(tracker.isLatestRequest(second, 'user-a'), true);
  assert.equal(tracker.isSessionCurrent(save, 'user-a'), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/app/session-operation.test.mjs`

Expected: FAIL because the tracker module does not exist.

- [ ] **Step 3: Implement the session tracker**

Store a monotonically increasing auth generation, active UID, and a latest-request counter per channel. `advance(userId)` increments generation and clears channel counters. `capture(userId)` returns a frozen auth-only operation. `nextRequest(channel, userId)` increments that channel and returns a frozen operation containing the channel and request ID. `isSessionCurrent` requires exact UID and generation; `isLatestRequest` additionally requires the latest request ID for that operation's channel. A background load therefore cannot invalidate an in-progress background save in the same auth session.

- [ ] **Step 4: Run tracker tests and verify GREEN**

Run: `node --test tests/app/session-operation.test.mjs`

Expected: all tracker tests PASS.

- [ ] **Step 5: Add failing background source-contract assertions**

Append to `tests/app/background-personalization.test.mjs`:

```js
test('background downloads and saves use captured auth operations and references', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /createSessionOperationTracker/);
  assert.match(source, /tracker\.advance\(user\?\.uid\s*\|\|\s*''\)/);
  assert.match(source, /tracker\.nextRequest/);
  assert.match(source, /tracker\.isSessionCurrent/);
  assert.match(source, /tracker\.isLatestRequest/);
  assert.match(source, /const capturedSettingsRef/);
  assert.match(source, /driveServiceForUser/);
  assert.doesNotMatch(source, /await setDoc\(settingsRef\(\)/);
});
```

- [ ] **Step 6: Run background tests and verify RED**

Run: `node --test tests/app/background-personalization.test.mjs tests/app/session-operation.test.mjs`

Expected: the tracker tests pass and the integration contract fails because background operations still use mutable state.

- [ ] **Step 7: Guard background downloads**

In `background-personalization.js`, create the tracker and advance it at the start of every auth callback. `loadPersistedBackground` captures a newest request, preferences, UID, a UID-specific Drive service, and the current file ID before download.

After download, create the object URL locally. If `tracker.isLatestRequest` is false, revoke that local URL and return. Only the latest request may revoke/replace `state.objectUrl` and call `applyLayer`. A stale request's error handler must not hide the active user's layer.

- [ ] **Step 8: Guard background saves and rollback under the original UID**

At save start, capture the operation, `capturedSettingsRef`, normalized editor preferences, pending file, old file ID, and `driveServiceForUser(operation.userId)`. Check `tracker.isSessionCurrent` after Drive connection/upload and before Firestore persistence.

Call `setDoc(capturedSettingsRef, ...)`. If the operation becomes stale after an upload, delete with the captured-user service; on every delete failure call that same service's `queueCleanup`. Only a current operation may update shared preferences, close the editor, reload the layer, or re-enable a button that now belongs to another session. The auth callback itself always resets the background save button for the newly active session.

- [ ] **Step 9: Verify Task 5 GREEN and commit**

Run: `node --test tests/app/session-operation.test.mjs tests/app/background-personalization.test.mjs tests/photos/drive-photo-service.test.mjs`

Expected: all focused tests PASS.

Commit:

```bash
git add src/client/app/session-operation.js src/client/app/background-personalization.js tests/app/session-operation.test.mjs tests/app/background-personalization.test.mjs
git commit -m "fix: isolate background work by auth session"
```

---

### Task 6: Full regression and security verification

**Files:**
- Modify only if a new regression is proven to originate in Tasks 1-5.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified test, syntax, and diff evidence.

- [ ] **Step 1: Run the complete test suite**

Run: `node --test`

Expected: every newly added test passes. The existing FX attribution and CRLF-sensitive first-trip tests may remain as the two documented pre-existing failures; no additional failure is acceptable.

- [ ] **Step 2: Syntax-check every tracked JavaScript file**

Run in PowerShell:

```powershell
$verificationFailures = @()
$verificationFiles = @(git ls-files '*.js')
foreach ($verificationFile in $verificationFiles) {
  & node --check -- $verificationFile
  if ($LASTEXITCODE -ne 0) { $verificationFailures += $verificationFile }
}
$verificationFailures
if ($verificationFailures.Count) { exit 1 }
```

Expected: exit 0 and no file names printed.

- [ ] **Step 3: Re-scan the scoped stored-data sinks**

Run:

```powershell
rg -n "innerHTML|onclick=|onchange=" index.html
rg -n "safePersistedImageSource|textContent|addEventListener" index.html
```

Inspect every result in `renderFilterTabs`, `renderFormSelects`, and `renderItemList`. Static application templates may still use `innerHTML`; no persisted value or item ID may be interpolated into one.

- [ ] **Step 4: Review the complete change set**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors; `ACTIVE_SKILLS_INDEX.md` remains untracked and absent from every commit; only the approved design, plan, tests, and implementation files are changed.

- [ ] **Step 5: Perform completion verification and report**

Invoke `superpowers:verification-before-completion`, rerun the relevant verification commands fresh, and report exact pass/fail counts without claiming the two pre-existing failures were fixed.
