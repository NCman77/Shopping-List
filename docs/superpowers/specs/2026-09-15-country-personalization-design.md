# Country Selection and Personalization Design

## Goal

Extend the shopping-list app so one Google account can maintain shopping items for multiple travel countries, remember the active country across sessions/devices, and personalize the app background with an image, GIF, or video without leaving the current page.

## Existing constraints

- Keep all production Firestore data under `artifacts/japan-shopping-app/users/{uid}/...`.
- Reuse the existing Firebase Auth, Firestore settings document, and Google Drive `appDataFolder` authorization.
- Do not make unrelated enhancements depend on one another during bootstrap.
- Existing items must remain readable without a migration.
- Existing category/location management, Drive photos, and avatar-only signed-in header must keep working.

## Travel country model

User settings in `settings/preferences` gain:

- `countries: string[]`
- `activeCountry: string`

Default/fallback country is `日本`.

Items gain:

- `country: string`

Legacy items without `country` are treated as `日本`. Existing documents are not batch rewritten. New items use the currently active country. Editing an existing item preserves its stored country; a legacy item preserves the fallback `日本` identity.

The active country is persisted to Firestore and cached in `localStorage` under a user-scoped key. Firestore is authoritative; the cache is only used to avoid a visual flash during startup.

Home filtering becomes: active country first, then status/category/location. A selected country therefore isolates the visible list from every other country. Google Maps search text uses each item's resolved country instead of hard-coding Japan.

## Avatar settings UI

Clicking the Google avatar opens an in-page account settings modal instead of navigating away. The top-level modal contains:

- Travel country
- Personalization
- Sign out

Travel country opens a nested in-page panel that lets the user select an active country and add a custom country. Country names are trimmed, de-duplicated, and empty values are rejected. Selecting a country saves immediately.

## Personalization model

`settings/preferences.personalization` contains:

- `backgroundFileId`
- `backgroundFileName`
- `backgroundMimeType`
- `positionX` (0-100)
- `positionY` (0-100)
- `scale` (1-3)
- `panEnabled`
- `panDirection` (`left` or `right`)
- `panIteration` (`once` or `infinite`)

No destructive crop is performed. The preview uses a fixed viewport plus CSS `object-fit`, transform/scale, and object-position values. This preserves animation for GIF and playback for video while still giving the user crop-like framing controls.

Quick position controls set center/left/right/top/bottom presets. A scale slider controls zoom. Dragging the preview adjusts X/Y position.

## Background media storage

The existing Google Drive `appDataFolder` transport is extended with a generic file-upload primitive while preserving the existing photo methods. Background media accepts common image types, GIF, MP4, and WebM. Firestore stores only the Drive file id plus personalization metadata.

When the background is replaced, the new file is uploaded first and settings are committed before cleanup of the old file. If cleanup fails, it is queued using the existing Drive cleanup mechanism so settings never point at a deleted file.

Background media playback rules:

- static image/GIF: rendered as an image layer;
- MP4/WebM: rendered as a muted `playsinline` video layer;
- `panEnabled=false`: no horizontal pan animation;
- `panDirection=left/right`: CSS pan animation direction;
- `panIteration=once`: one animation cycle;
- `panIteration=infinite`: infinite animation cycles; video also loops only in this mode.

## Bootstrap and isolation

Country state needed by the core inline renderer remains in `index.html`, backed by pure helpers in `src/client/app/travel-country.js`.

The account/personalization UI is implemented as a separate enhancement module and initialized through `runEnhancementsIndependently(...)`, so failure to load Drive background media cannot block categories, product photos, or other homepage functionality.

## Testing

Add regression tests for:

- country normalization and duplicate removal;
- legacy item fallback to Japan;
- filtering strictly by active country;
- active-country local cache key/value behavior;
- item save path containing/resolving `country`;
- settings writes using merge semantics so personalization is not erased;
- generic Drive file upload preserving existing photo behavior;
- personalization normalization and pan/position values;
- account modal/static UI markers;
- independent bootstrap marker for the personalization enhancement;
- all existing repository/boot/photo/schema tests.

## Merge criteria

Do not merge to `main` if any required test, syntax check, structure guard, boot isolation check, or Firestore schema guard fails.