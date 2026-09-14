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

## 3. Regression tests before merge

Before merging to `main`, CI must pass:

- all `*.test.mjs` unit/regression tests;
- JavaScript syntax checks;
- existing integration markers;
- boot isolation tests;
- photo visibility state tests.

A known regression or a failed required check blocks merge.

## 4. Production verification

After merge, verify the deployment was created from the expected `main` commit. When a change touches authentication, photo storage, or bootstrapping, verify both the feature branch CI and the production deployment status before declaring completion.
