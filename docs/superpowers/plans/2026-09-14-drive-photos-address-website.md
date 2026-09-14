# Drive Photos, Address, and Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe website links, Google Maps address links, and cross-device multi-photo storage in Google Drive `appDataFolder` with automatic browser compression.

**Architecture:** Keep Firebase Auth and Firestore as the identity and realtime-data layers. Add small testable modules for URL handling, image compression, Drive API access, and photo metadata; `index.html` coordinates those modules and owns UI state. Store one Firestore metadata document per Drive photo so the UI does not impose a per-item count limit.

**Tech Stack:** Static HTML, Tailwind CDN, browser ES modules, Firebase Web SDK 11.6.1, Google Drive REST API v3, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-14-drive-photos-address-website-design.md`

## Global Constraints

- Photos use Google Drive `appDataFolder`; do not add Firebase Storage.
- Request only the additional OAuth scope `https://www.googleapis.com/auth/drive.appdata`.
- Keep Drive access tokens in memory or `sessionStorage`, never Firestore or persistent `localStorage`.
- No UI photo-count limit; actual capacity remains limited by Drive quota, API quota, browser memory, and network conditions.
- Compress to a longest edge of 1600px, WebP quality 0.82 with JPEG quality 0.82 fallback, and never upscale.
- Accept only `http:` and `https:` website URLs and open external pages with `noopener,noreferrer`.
- Preserve legacy `photoUrl` rendering.
- Do not add photo drag sorting, video storage, public photo sharing, or Maps JavaScript API.

---

### Task 1: Safe Website and Google Maps URLs

**Files:**
- Create: `url-utils.js`
- Create: `url-utils.test.mjs`

**Interfaces:**
- Produces: `normalizeWebsiteUrl(value: string): string`, throwing `TypeError` for unsafe/invalid URLs.
- Produces: `createGoogleMapsUrl(address: string): string`, returning an empty string for blank addresses.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleMapsUrl, normalizeWebsiteUrl } from './url-utils.js';

test('normalizes a website without a scheme', () => {
  assert.equal(normalizeWebsiteUrl(' youtube.com/watch?v=123 '), 'https://youtube.com/watch?v=123');
});

test('keeps explicit HTTP and HTTPS URLs', () => {
  assert.equal(normalizeWebsiteUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(normalizeWebsiteUrl('https://example.com/a'), 'https://example.com/a');
});

test('rejects executable and malformed URLs', () => {
  assert.throws(() => normalizeWebsiteUrl('javascript:alert(1)'), TypeError);
  assert.throws(() => normalizeWebsiteUrl('https://'), TypeError);
});

test('allows an empty optional website', () => {
  assert.equal(normalizeWebsiteUrl('  '), '');
});

test('creates an encoded Google Maps search URL', () => {
  assert.equal(
    createGoogleMapsUrl('東京都 千代田区 1-1'),
    'https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%83%BD%20%E5%8D%83%E4%BB%A3%E7%94%B0%E5%8C%BA%201-1'
  );
  assert.equal(createGoogleMapsUrl(''), '');
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test url-utils.test.mjs`

Expected: FAIL because `url-utils.js` does not exist.

- [ ] **Step 3: Implement the URL helpers**

```js
export function normalizeWebsiteUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try { parsed = new URL(candidate); } catch { throw new TypeError('請輸入有效的網站網址。'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new TypeError('網站網址只能使用 http 或 https。');
  }
  return parsed.href;
}

export function createGoogleMapsUrl(address) {
  const trimmed = String(address ?? '').trim();
  return trimmed ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}` : '';
}
```

- [ ] **Step 4: Run the tests and verify success**

Run: `node --test url-utils.test.mjs`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add url-utils.js url-utils.test.mjs
git commit -m "feat: add safe external URL helpers"
```

### Task 2: Automatic Image Compression

**Files:**
- Create: `image-compression.js`
- Create: `image-compression.test.mjs`

**Interfaces:**
- Produces: `calculateContainedSize(width: number, height: number, maxEdge?: number): {width: number, height: number}`.
- Produces: `compressImage(file: Blob, options?: object): Promise<{blob: Blob, mimeType: string, width: number, height: number, size: number, previewUrl: string}>`.
- Produces: `revokeCompressedImage(photo): void`.

- [ ] **Step 1: Write failing dimension tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateContainedSize } from './image-compression.js';

test('shrinks a landscape image to a 1600px longest edge', () => {
  assert.deepEqual(calculateContainedSize(4000, 3000), { width: 1600, height: 1200 });
});

test('shrinks a portrait image and does not upscale small images', () => {
  assert.deepEqual(calculateContainedSize(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(calculateContainedSize(800, 600), { width: 800, height: 600 });
});

test('rejects invalid dimensions', () => {
  assert.throws(() => calculateContainedSize(0, 100), RangeError);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test image-compression.test.mjs`

Expected: FAIL because `image-compression.js` does not exist.

- [ ] **Step 3: Implement dimension calculation and browser compression**

Implement `calculateContainedSize` with `Math.min(1, maxEdge / Math.max(width, height))`. Implement `compressImage` by decoding with `createImageBitmap(file, { imageOrientation: 'from-image' })`, drawing to a canvas, attempting `canvas.toBlob(..., 'image/webp', 0.82)`, falling back to `image/jpeg`, and returning an `URL.createObjectURL(blob)` preview. If `createImageBitmap` is unavailable, decode through an `Image` backed by a temporary object URL. Always close the bitmap and revoke temporary URLs in `finally`; throw `TypeError('無法讀取這張照片。')` when decode or encoding fails.

The exported implementation must use these defaults:

```js
const DEFAULTS = { maxEdge: 1600, quality: 0.82 };
```

- [ ] **Step 4: Run the unit tests and syntax-check the module**

Run: `node --test image-compression.test.mjs && node --check image-compression.js`

Expected: 3 tests pass and syntax check exits 0.

- [ ] **Step 5: Commit**

```bash
git add image-compression.js image-compression.test.mjs
git commit -m "feat: add browser photo compression"
```

### Task 3: Google Drive Photo Service

**Files:**
- Create: `drive-photo-service.js`
- Create: `drive-photo-service.test.mjs`

**Interfaces:**
- Produces: `DriveAuthorizationError extends Error` with `code === 'drive-authorization-required'`.
- Produces: `createDrivePhotoService({ fetchImpl, sessionStorageImpl, getUserId }): DrivePhotoService`.
- Service methods: `setAccessToken(token)`, `clearAccessToken()`, `hasAccessToken()`, `uploadPhoto({blob, fileName, itemId})`, `downloadPhoto(fileId)`, `deletePhoto(fileId)`, `queueCleanup(fileId)`, `retryQueuedCleanup()`.

- [ ] **Step 1: Write failing service tests**

Create deterministic fetch and storage fakes and assert:

```js
test('uploads multipart metadata into appDataFolder', async () => {
  const calls = [];
  const service = createDrivePhotoService({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'drive-1', name: 'photo.webp' }), { status: 200 });
    },
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('token-1');
  const result = await service.uploadPhoto({ blob: new Blob(['x'], { type: 'image/webp' }), fileName: 'photo.webp', itemId: 'item-1' });
  assert.equal(result.id, 'drive-1');
  assert.match(calls[0].url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
  assert.match(await calls[0].options.body.text(), /"parents":\["appDataFolder"\]/);
});

test('turns 401 into an authorization error and clears the token', async () => {
  const service = createDrivePhotoService({
    fetchImpl: async () => new Response('', { status: 401 }),
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('expired');
  await assert.rejects(() => service.downloadPhoto('file-1'), DriveAuthorizationError);
  assert.equal(service.hasAccessToken(), false);
});

test('keeps cleanup IDs per user and retries them', async () => {
  const deleted = [];
  const storage = memoryStorage();
  const service = createDrivePhotoService({
    fetchImpl: async (url) => { deleted.push(url); return new Response('', { status: 204 }); },
    sessionStorageImpl: storage,
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('token');
  service.queueCleanup('orphan-1');
  await service.retryQueuedCleanup();
  assert.equal(deleted.length, 1);
  assert.deepEqual(service.getQueuedCleanup(), []);
});
```

Also test `downloadPhoto` uses `files/{id}?alt=media`, `deletePhoto` uses `DELETE`, and 403 is treated like 401.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test drive-photo-service.test.mjs`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the Drive REST service**

Use these endpoints:

```text
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size
GET  https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
DELETE https://www.googleapis.com/drive/v3/files/{fileId}
```

Build upload bodies as `FormData` with a JSON metadata Blob containing `{name, parents:['appDataFolder'], appProperties:{itemId}}` and a media Blob. Validate file IDs with `/^[A-Za-z0-9_-]+$/`. Treat 401/403 as `DriveAuthorizationError`; for other non-2xx responses throw an error containing status and parsed Google error message. Store the token in session storage under `shopping-list:drive-token:{uid}` and cleanup IDs under `shopping-list:drive-cleanup:{uid}`. Never write the token to local storage or Firestore.

- [ ] **Step 4: Run tests and verify success**

Run: `node --test drive-photo-service.test.mjs`

Expected: all upload, download, delete, authorization, and cleanup tests pass.

- [ ] **Step 5: Commit**

```bash
git add drive-photo-service.js drive-photo-service.test.mjs
git commit -m "feat: add hidden Google Drive photo service"
```

### Task 4: Photo Metadata and View-State Helpers

**Files:**
- Create: `photo-metadata.js`
- Create: `photo-metadata.test.mjs`

**Interfaces:**
- Produces: `groupActivePhotosByItem(photoDocs): Map<string, PhotoMetadata[]>`.
- Produces: `createPhotoMetadata({photoId, itemId, driveFile, compressed, order, now}): object`.
- Produces: `chooseCoverPhotoId(photos): string | null`.

- [ ] **Step 1: Write failing metadata tests**

```js
test('groups only active photos and sorts by order', () => {
  const grouped = groupActivePhotosByItem([
    { id: 'b', itemId: 'item-1', order: 2, status: 'active' },
    { id: 'gone', itemId: 'item-1', order: 1, status: 'deleting' },
    { id: 'a', itemId: 'item-1', order: 1, status: 'active' }
  ]);
  assert.deepEqual(grouped.get('item-1').map((photo) => photo.id), ['a', 'b']);
  assert.equal(chooseCoverPhotoId(grouped.get('item-1')), 'a');
});

test('creates a stable Firestore photo record', () => {
  assert.deepEqual(createPhotoMetadata({
    photoId: 'p1', itemId: 'i1', driveFile: { id: 'd1', name: 'p.webp' },
    compressed: { mimeType: 'image/webp', width: 1600, height: 1200, size: 123 }, order: 0, now: 10
  }), {
    id: 'p1', itemId: 'i1', driveFileId: 'd1', fileName: 'p.webp', mimeType: 'image/webp',
    width: 1600, height: 1200, size: 123, order: 0, status: 'active', createdAt: 10
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test photo-metadata.test.mjs`

Expected: FAIL because `photo-metadata.js` does not exist.

- [ ] **Step 3: Implement the pure metadata helpers**

Implement defensive grouping that ignores entries without `itemId`, accepts missing status as `active` for forward compatibility, sorts by numeric `order` then `createdAt`, and returns `null` when no cover exists.

- [ ] **Step 4: Run tests and verify success**

Run: `node --test photo-metadata.test.mjs`

Expected: all metadata tests pass.

- [ ] **Step 5: Commit**

```bash
git add photo-metadata.js photo-metadata.test.mjs
git commit -m "feat: add scalable photo metadata helpers"
```

### Task 5: Integrate Auth, Firestore, and the Item UI

**Files:**
- Modify: `index.html`
- Create: `index-integration.test.mjs`
- Modify: `auth-session.test.mjs`

**Interfaces:**
- Consumes: all exports from Tasks 1–4.
- Firebase imports add `reauthenticateWithPopup`, `writeBatch`, and Firestore `doc()` IDs.
- Produces browser globals used by inline controls: `openAddressInMaps`, `openWebsite`, `removePendingPhoto`, `removeExistingPhoto`, `connectGoogleDrive`, `openPhotoViewer`.

- [ ] **Step 1: Write failing static integration tests**

Read `index.html` with `readFile` and assert it contains:

```js
assert.match(html, /id="item-address"/);
assert.match(html, /id="item-website"/);
assert.match(html, /id="photo-preview-grid"/);
assert.match(html, /id="drive-connect-btn"/);
assert.match(html, /multiple/);
assert.match(html, /googleProvider\.addScope\(['"]https:\/\/www\.googleapis\.com\/auth\/drive\.appdata/);
assert.match(html, /collection\(db,[\s\S]*['"]itemPhotos['"]\)/);
assert.match(html, /normalizeWebsiteUrl/);
assert.match(html, /createGoogleMapsUrl/);
```

Also extend the auth-session sign-out test through injected cleanup to prove Drive session state is cleared on sign-out/account switch.

- [ ] **Step 2: Run the complete test suite and verify new tests fail**

Run: `node --test *.test.mjs`

Expected: existing auth tests pass; new index integration assertions fail.

- [ ] **Step 3: Add the form and photo viewer markup**

Replace the single circular photo input with:

- a multi-select `<input id="item-photo" type="file" accept="image/*" multiple>`;
- add-photo button;
- `#photo-preview-grid`;
- compression/upload status text;
- hidden `#drive-connect-btn`;
- a full-screen photo viewer modal.

Add `#item-address` plus a map icon button below the category/location row. Add `#item-website` immediately above the purchased checkbox. Keep all controls keyboard accessible with button types and useful `aria-label` text.

- [ ] **Step 4: Add Drive permission and token lifecycle**

Call:

```js
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');
```

Capture the access token after both `signInWithPopup` and `reauthenticateWithPopup`:

```js
const credential = GoogleAuthProvider.credentialFromResult(result);
drivePhotoService.setAccessToken(credential?.accessToken || '');
```

Clear the token and object URLs during sign-out/account switch. On 401/403 show the Drive connect button and a clear Chinese message; do not loop requests.

- [ ] **Step 5: Add a single photo-index listener and lazy image loading**

Listen once to `artifacts/{appId}/users/{uid}/itemPhotos`, populate `state.photoDocs`, derive `state.photosByItem`, and ignore stale callbacks when `state.userId !== sessionUserId`. Download only cover files for visible cards, cache object URLs by Drive file ID, and load remaining photos when the editor/viewer opens. Render `photoUrl` when no Drive cover is available.

- [ ] **Step 6: Implement photo selection and preview behavior**

For each selected file call `compressImage`, append a pending photo with a unique client ID, and render individual success/error cards. Preserve earlier selections when later files fail. Removing pending images calls `revokeCompressedImage`; removing existing images adds their metadata IDs to `state.removedPhotoIds`. Mark the first active preview as the cover.

- [ ] **Step 7: Implement create and edit saves**

Normalize the website before writes and stop with a warning on `TypeError`. Generate new item IDs with `doc(itemsRef).id`. Upload pending photos with concurrency two, create `itemPhotos` metadata documents, and use Firestore batches of at most 450 writes. Update `coverPhotoId`, `address`, `website`, `updatedAt`; preserve original `createdAt` on edits. On upload failure delete uploaded files; queue any cleanup failures. For removed existing photos, batch-set status to `deleting`, update the item, then delete Drive files and corresponding metadata documents.

- [ ] **Step 8: Implement deletion and safe links**

Delete Drive photos before the item. After each Drive deletion remove its photo index; if one fails, keep the item and remaining indexes and show a retryable error. Use `createGoogleMapsUrl(item.address)` for the map button; use the old location-based query only for legacy items without an address. Show a separate 「觀看介紹」 link when `item.website` exists and open it with `window.open(url, '_blank', 'noopener,noreferrer')`.

- [ ] **Step 9: Run tests and browser smoke check**

Run: `node --test *.test.mjs`

Expected: all tests pass.

Serve with `npx --yes serve . -l 4173`, open `http://localhost:4173`, and verify signed-out UI loads without console syntax errors. Sign in only if the local origin is authorized; otherwise complete authenticated behavior during the deployed manual check in Task 6.

- [ ] **Step 10: Commit**

```bash
git add index.html index-integration.test.mjs auth-session.test.mjs
git commit -m "feat: add addresses websites and Drive photos"
```

### Task 6: Setup Documentation, Verification, and Deployment

**Files:**
- Modify: `README.md`
- Modify: `firebase.json` only if cache headers are needed for new modules.

**Interfaces:**
- Consumes: the complete app from Tasks 1–5.
- Produces: user-facing Google Cloud setup and recovery instructions.

- [ ] **Step 1: Write README setup instructions**

Document these exact console actions:

1. Open Google Cloud Console for project `shopping-list-a6c1e`.
2. Go to APIs & Services → Library and enable Google Drive API.
3. Open Google Auth Platform / OAuth consent configuration and add `https://www.googleapis.com/auth/drive.appdata`.
4. If publishing status is Testing, add the intended Google accounts under Test users.
5. Keep Google sign-in enabled in Firebase Authentication.
6. Keep `shopping-list-tau-one.vercel.app` in Firebase Authentication → Settings → Authorized domains, adding any future custom domain there too.
7. Revoke and reconnect Drive access when consent or token state becomes stale.

Explain that photos are hidden from normal Drive, count against Drive quota, and are deleted if the user removes the app's hidden Drive data.

- [ ] **Step 2: Run automated verification**

Run:

```bash
node --test *.test.mjs
node --check auth-session.js
node --check url-utils.js
node --check image-compression.js
node --check drive-photo-service.js
node --check photo-metadata.js
git diff --check
```

Expected: all tests and syntax checks pass; `git diff --check` has no output.

- [ ] **Step 3: Inspect the final diff for secrets and scope**

Run:

```bash
git diff --stat HEAD~5..HEAD
git diff HEAD~5..HEAD -- . ':!docs/superpowers/plans/*' | rg -n "accessToken|Bearer|AIza|TODO|TBD"
```

Expected: the existing Firebase public web key may appear; no OAuth access token, Drive file content, TODO, or TBD is committed.

- [ ] **Step 4: Commit docs**

```bash
git add README.md firebase.json
git commit -m "docs: explain Google Drive photo setup"
```

- [ ] **Step 5: Request code review and address findings**

Invoke `superpowers:requesting-code-review`, review the feature against the spec, fix any High/Medium findings with tests first, and rerun Step 2.

- [ ] **Step 6: Push and verify deployment source**

Run:

```bash
git status --short
git push origin main
git ls-remote origin refs/heads/main
```

Expected: clean status and remote `main` matches local `HEAD`.

- [ ] **Step 7: Manual Vercel acceptance check**

After Vercel deploys the pushed commit, open `https://shopping-list-tau-one.vercel.app` and verify the production page contains the address, website, and multi-photo controls. Complete Google Drive API console setup before expecting upload/download to succeed, then test one item from two devices or two browser profiles.
