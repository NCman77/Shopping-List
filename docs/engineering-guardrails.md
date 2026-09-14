# Engineering Guardrails

These rules are mandatory for future changes to the shopping-list app.

## 1. Core UI must not depend on feature initialization order

- Critical visible shell changes must be applied before any Firebase, Google Drive, or other asynchronous enhancement initialization.
- A failure in one enhancement must never block unrelated UI or data features.
- Independent enhancements must boot through `runEnhancementsIndependently(...)` / `Promise.allSettled(...)`, not a single chained `.then(...)` pipeline.
- The core shell regression test must stay green: subtitle removal, fixed add button, and avatar-only signed-in header.

## 2. User-visible data must never fail silently

- If a record says a photo exists, the UI must not silently render the same state as “no photo”.
- Missing or expired Drive authorization must display an explicit reconnect state saying the photo is still in Drive.
- Successfully loaded Drive cover photos should be backfilled with a small persistent Firestore thumbnail so the list remains visually useful when a Drive access token is unavailable.
- Photo deletion is allowed only from explicit delete flows; display/auth failures must never delete Drive files or photo metadata.

## 3. Repository boundaries are stable

- Browser application code belongs under `src/client/` and is grouped by domain (`app`, `filters`, `photos`, `utils`).
- Unit/regression tests belong under `tests/` and must not be added back to the repository root.
- Firestore rules belong under `firebase/`; root `firebase.json` is the Firebase CLI entrypoint and must keep pointing at `firebase/firestore.rules`.
- The only root JavaScript compatibility entrypoint is `auth-session.js`; it must remain a thin re-export/import bridge into `src/client/app/auth-session.js`, not grow application logic.
- Do not add a `server/` directory and assume it is private. Secrets must live in deployment environment variables, and truly private logic must execute server-side.

## 4. Firestore schema is frozen until an explicit migration project

- Existing production data remains under `artifacts/japan-shopping-app/users/{uid}/...`.
- A refactor, UI change, or file move must never introduce a new top-level `/users/{uid}` schema implicitly.
- Any future Firestore migration requires its own design, backup/rollback strategy, dual-read/write or cutover plan, and explicit user approval.

## 5. Regression tests before merge

Before merging to `main`, CI must pass:

- all `*.test.mjs` unit/regression tests;
- JavaScript syntax checks for all `src/client/**/*.js` modules and the root bootstrap;
- existing integration markers;
- boot isolation tests;
- photo visibility state tests;
- repository structure/import-resolution tests;
- user-visible static smoke tests;
- Firestore schema guard.

A known regression or a failed required check blocks merge.

## 6. Production verification

After merge, verify the deployment was created from the expected `main` commit. When a change touches authentication, photo storage, bootstrapping, or file paths, verify both the feature branch CI and the production Vercel / GitHub Pages deployment statuses before declaring completion.
