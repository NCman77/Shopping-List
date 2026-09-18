# Firestore personalization images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; or use superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the three personalization backgrounds as compressed static images in per-user Firestore media documents, so opening the site no longer needs Google Drive authorization for those backgrounds.

**Architecture:** Add a Firestore-backed media service that compresses browser-selected images to at most 900,000 bytes and stores each image as a `Bytes` field in its own document. Reuse the existing background save/load and legacy migration transaction boundaries, changing only the media backend and accepted file types; product photo Drive code remains untouched.

**Tech Stack:** Browser ES modules, Firebase Web SDK Firestore, existing canvas compression helpers, Node test runner, Firestore emulator rules tests.

**Spec:** `docs/superpowers/specs/2026-09-18-firestore-personalization-images-design.md`

## Global Constraints

- Accept only JPEG, PNG, and WebP static photos; reject GIF, MP4, and WebM.
- Never upload the original file; compress to at most 900,000 bytes before persistence.
- Store bytes in `artifacts/japan-shopping-app/users/{userId}/personalizationMedia/{mediaId}`.
- Only the authenticated owner may read, create, or delete personalization media.
- Do not modify product photo Google Drive behavior or unrelated features.
- Deploy only Firestore rules for this feature; never commit credentials.

---

### Task 1: Add compression and Firestore media primitives

**Files:**
- Create: `src/client/app/firestore-personalization-media.js`
- Test: `tests/app/firestore-personalization-media.test.mjs`

**Interfaces:**
- Produces `compressPersonalizationImage(file, options)`, `createFirestorePersonalizationMediaService({ firestoreSdk, db, userId, compress })`, `isFirestorePersonalizationId(id)`, and `personalizationMediaPath({ userId, mediaId })`.
- Service methods: `hasAccessToken()`, `uploadFile({ blob, fileName, appProperties })`, `downloadPhoto(fileId)`, `deletePhoto(fileId)`, `queueCleanup(fileId)`, and `retryQueuedCleanup()`.

- [ ] Write tests for MIME validation, the 900,000-byte cap, Firestore `Bytes.fromUint8Array` writes, owner-scoped path parsing, and cleanup queue behavior.
- [ ] Run `node --test tests/app/firestore-personalization-media.test.mjs` and observe the new tests fail before implementation.
- [ ] Implement the compressor with injected `compressImage` attempts and the Firestore service using `setDoc/getDoc/deleteDoc`; encode only the compressed blob bytes.
- [ ] Run the focused test again and require all tests to pass.
- [ ] Commit as `feat: add firestore personalization media service`.

### Task 2: Switch personalization flows to the Firestore service and static-photo input

**Files:**
- Modify: `src/client/app/firebase-background-storage.js`
- Modify: `src/client/app/background-personalization.js`
- Modify: `src/client/app/header-background-personalization.js`
- Modify: `src/client/app/item-card-personalization.js`
- Modify: `src/client/app/background-playlist.js`
- Modify: `src/client/app/personalization-preferences.js`
- Test: `tests/app/background-personalization.test.mjs`
- Test: `tests/app/firebase-background-storage.test.mjs`
- Test: `tests/app/item-card-personalization-core.test.mjs`

**Interfaces:**
- Keep existing transaction function signatures and UI state shape.
- Replace new-upload media calls with the Firestore service; use `firestore:` IDs.
- Preserve legacy Drive IDs for one-time migration, but never create new `storage:` IDs.
- Update file pickers and validators to JPEG/PNG/WebP only.

- [ ] Add failing tests for static-only validation, Firestore IDs, and saving/loading without a Drive token.
- [ ] Run the focused tests and confirm failures.
- [ ] Replace Storage service construction with Firestore service construction while keeping legacy Drive fallback for old IDs and cleanup ordering.
- [ ] Update all three pickers and media validation to static images; use compressed previews for pending files.
- [ ] Run focused app tests and confirm all pass.
- [ ] Commit as `feat: store personalization photos in firestore`.

### Task 3: Enforce Firestore media rules and emulator coverage

**Files:**
- Modify: `firebase/firestore.rules`
- Test: `tests/integration/firestore-rules.test.mjs`

**Interfaces:**
- Firestore rules expose owner-only access to `personalizationMedia/{mediaId}`, constrain fields, kind, MIME, and `bytes.size()` <= 900,000.

- [ ] Add failing emulator cases for anonymous reads, cross-user reads/writes, unsupported MIME, oversized bytes, and owner create/read/delete.
- [ ] Run the focused emulator test and confirm the new cases fail.
- [ ] Add the owner-scoped rule with exact allowed fields and value constraints.
- [ ] Run `npm run test:rules` and require Firestore and Storage suites to pass.
- [ ] Commit as `feat: secure firestore personalization media`.

### Task 4: Full verification and handoff

**Files:**
- No production code changes unless verification exposes a scoped defect.

- [ ] Run `npm test` from the isolated worktree.
- [ ] Run `npm run test:rules` from the isolated worktree.
- [ ] Run `git diff --check` and verify `git status` contains only intended commits.
- [ ] Report the isolated branch, tests, and the required deployment step: Firebase CLI login, then Firestore rules only.

