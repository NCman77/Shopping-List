# Multi-Trip Shopping List Design

Date: 2026-09-15
Status: Proposed for implementation after user review

## 1. Goal

Extend the shopping list from a country-only model to a trip-aware model so one account can keep multiple independent shopping lists for repeated travel to the same country without deleting old products.

The design must keep the app simple:

- a user can have many trips to the same country;
- products from one trip never appear in another trip unless explicitly copied;
- the app automatically opens the most sensible trip without a separate "default trip" setting;
- the currently active trip is always visible on the homepage to prevent editing the wrong trip;
- past trips remain readable as history;
- repeat-purchase products can be copied into another trip without re-entering all fields;
- existing products, photos, statuses, and country data are preserved during migration.

## 2. Product model

The app will use a hierarchy of:

`Account -> Trip -> Items`

Firestore items remain in the existing user-level `items` collection to avoid a destructive database restructure. Each item gains a `tripId`.

### Trip collection

New collection:

`artifacts/japan-shopping-app/users/{uid}/trips/{tripId}`

A normal trip contains:

```js
{
  title: "東京 2026 秋",
  country: "日本",
  startDate: "2026-09-21",
  endDate: "2026-09-27",
  createdAt: 0,
  updatedAt: 0,
  kind: "trip"
}
```

Rules:

- `country`, `startDate`, and `endDate` are required for a normal trip.
- `title` is optional when creating a trip. If omitted, generate a display title such as `日本 · 2026/09/21`.
- `endDate` cannot be before `startDate`.
- title and dates may be edited later.
- country may be changed only while the trip has no items. Once items exist, country is locked to prevent item/trip country divergence.
- a trip containing items cannot be deleted. The UI explains that its products must first be deleted or moved by a future explicit move feature. This prevents accidental bulk data loss.

### Item additions

Each item gains:

```js
{
  tripId: "...",
  country: "日本"
}
```

`country` remains on the item for backward compatibility and existing country-aware features, but `tripId` becomes the authoritative list-membership field.

For a newly created item:

- `tripId` = active trip ID;
- `country` = active trip country.

Editing an existing item preserves its `tripId` and `country`.

## 3. Active trip and automatic selection

There will be one active trip at a time.

The active trip is persisted in the existing preferences document as `activeTripId` and cached locally for fast startup. Firestore remains the cross-device source of truth.

No user-facing "default trip" setting will be added.

On startup, after trips are loaded, resolve the active trip in this order:

1. If a trip is currently in progress (`startDate <= today <= endDate`), use it. This prevents the app from opening a future planning list while the user is actually travelling.
2. Otherwise, if the persisted manually selected trip still exists and is today or in the future, keep it. This allows planning a later trip without being reset on every reload.
3. Otherwise, choose the nearest upcoming trip by `startDate`.
4. Otherwise, choose the most recently ended past trip.
5. Otherwise, choose the legacy migrated list, if one exists.
6. If there are no trips at all, show an empty onboarding state with `新增第一趟旅程`.

When the active trip changes:

- expose it through a single trip-context module;
- update `activeTripId` in preferences;
- mirror its country into the existing `activeCountry` compatibility state;
- dispatch `shopping-list:active-trip-changed`;
- dispatch/update existing country-dependent behavior so country-specific background/personalization continues to work;
- reset status/category/location pagination/filter state to a safe default.

The country is therefore derived from the selected trip during normal use. The user does not have to select country and trip separately on every launch.

## 4. Country management compatibility

The existing account-level country list remains useful as the list of countries available when creating trips.

The account menu's country screen becomes country management rather than the primary shopping-list switcher.

Normal shopping-list navigation is trip-first:

- selecting a trip implicitly selects its country;
- `activeCountry` remains as a compatibility mirror for existing background and country-aware features;
- a second independent country filter must not compete with the active trip.

This avoids a state such as "Japan selected, but a Thailand trip selected".

## 5. Homepage UX

A compact active-trip selector will be visible on the homepage, near the top and before the shopping filters.

Example:

```text
🇯🇵 東京 2026 秋
9/21 – 9/27        ▼
```

Tapping it opens the trip switcher.

Trips are grouped for clarity:

- 旅行中
- 即將出發
- 過去旅程
- 既有清單

Within groups:

- upcoming trips sort by nearest start date first;
- past trips sort by most recent end date first;
- legacy lists sort last.

The switcher also exposes:

- `＋ 新增旅程`
- `管理旅遊紀錄`

The active trip must remain visually obvious at all times so users do not accidentally add products to the wrong trip.

## 6. Account menu: 旅遊紀錄

Add `旅遊紀錄` to the avatar/account-settings menu.

This is the management surface, not the only switching surface.

It supports:

- create trip;
- edit trip title;
- edit start/end dates;
- view country;
- change country only for an empty trip;
- delete an empty trip;
- open/select a trip.

Creating a trip intentionally stays minimal:

1. Trip title — optional.
2. Country — required; default to the current/most recently used country when appropriate.
3. Start date and end date — required.

No hotel, flight, companions, notes, itinerary, or other travel-planner fields are part of this feature.

## 7. Trip isolation and filtering

`tripId` is the primary visibility condition.

A homepage item is eligible only when:

```text
item.tripId === activeTrip.id
```

All existing secondary filters run only inside that eligible set:

- status: all / wanted / purchased / not wanted;
- category;
- location;
- pagination.

This prevents a product from another trip appearing because it happens to share the same country, category, or location.

### Category and location behavior

Category and location definitions remain account-level reusable values. They are not duplicated per trip, because requiring the user to rebuild the same category list for every Japan trip would add unnecessary configuration.

However, homepage category/location filter chips should only show values that are actually present in the active trip, plus `全部`. This prevents old trips from cluttering the current trip's filters.

The existing category/location management behavior remains global and backward compatible. Deleting a category/location still does not rewrite old item text.

## 8. Legacy-data migration

Existing data must never be deleted or guessed into a dated trip.

On first use of the trip feature, find items without `tripId` and group them by their existing resolved country.

For each country group, create one deterministic legacy trip, for example:

```text
日本 · 既有清單
```

Legacy trip characteristics:

```js
{
  title: "日本 · 既有清單",
  country: "日本",
  startDate: null,
  endDate: null,
  kind: "legacy"
}
```

Then merge only `tripId` onto each unassigned item. Do not rewrite:

- item ID;
- name;
- category;
- location;
- address;
- website;
- description;
- shopping status;
- timestamps;
- country;
- photo metadata;
- Google Drive files.

Migration must be idempotent and safe if two devices run it or a device stops midway:

- use deterministic legacy trip IDs per country;
- only update items missing `tripId`;
- rerunning migration produces the same result rather than duplicate legacy trips;
- no global "migration complete" flag is trusted unless no unassigned items remain.

Legacy trips are displayed under `既有清單` rather than being assigned fake travel dates.

## 9. Copy item to another trip

Product detail view gains a `複製到其他旅程` action.

The target picker excludes the current trip and groups eligible trips so upcoming trips are easiest to choose. Past trips may still be shown in a separate section for deliberate historical correction.

After choosing a target, create a new independent item. This is a snapshot copy, not a shared reference.

Copied fields:

- name;
- category;
- location;
- address;
- website;
- description;
- photos.

Target-derived/reset fields:

- new item ID;
- `tripId` = target trip ID;
- `country` = target trip country;
- `shoppingStatus` = `wanted`;
- `purchased` = `false`;
- `createdAt` = now;
- `updatedAt` = now;
- optional `copiedFromItemId` for duplicate-copy detection/audit.

### Photo-copy rule

Copied items must not share the same Google Drive file IDs with the source item. Existing photo deletion physically deletes the Drive file, so shared file IDs would allow deleting a photo in one trip to break another trip.

If the source has photos:

1. ensure Google Drive authorization before creating the copy;
2. download each source photo blob;
3. upload a new independent Drive file associated with the new target item ID;
4. create new `itemPhotos` metadata documents for the target item;
5. generate/persist the copied item's cover thumbnail using the existing photo persistence rules;
6. only commit the target item and photo metadata after all required Drive uploads succeed;
7. if a Drive upload fails, clean up already-created copied Drive files and do not leave a partial target item.

This costs more storage than shared references but preserves historical independence and matches the existing deletion model.

If the source has no photos, copying does not require Drive authorization.

If the same source item has already been copied to the same target trip, warn the user and require explicit confirmation before creating another duplicate.

## 10. Architecture boundaries

Do not implement trip support by stacking another independent DOM filter on top of the existing country filter. The current app already has several enhancement modules, so trip membership needs one authoritative context to avoid race conditions.

Introduce a focused trip subsystem:

- `travel-trip.js` — pure trip normalization, sorting, date/status classification, active-trip resolution, cache keys.
- `trip-context.js` — Firestore trip/settings subscription, migration coordination, active-trip state, events, compatibility mirroring to active country.
- `trip-ui.js` — homepage selector and trip-management modal.
- `trip-save-guard.js` — ensures newly created items receive the active `tripId` and matching country; preserves existing membership on edit.
- `item-copy.js` / `item-copy-ui.js` — pure copy payload rules and the copy workflow, including independent photo duplication.

Existing modules should be adjusted rather than allowed to compete:

- `country-isolation.js`: retire country as the primary visibility filter once trip context is authoritative; keep only compatibility helpers if still needed.
- `country-save-guard.js`: replace or narrow it so trip-save logic owns new-item membership.
- `item-workflow-enhancements.js`: filter eligible cards by active `tripId`, then status/pagination.
- `account-settings.js`: add `旅遊紀錄`; country UI becomes country management.
- background/personalization behavior: continue receiving the active trip's mirrored country.

The goal is one source of truth for "which list am I editing?": active trip.

## 11. Error handling

- If trip loading fails, do not silently fall back to showing all items. Show a retry/error state to prevent cross-trip leakage.
- If active-trip persistence fails after an in-memory switch, notify the user but keep the visible selection for the current session; retry on the next settings update.
- If an item save occurs with no resolved active trip, block the save and prompt the user to create/select a trip rather than producing an unassigned item.
- If legacy migration partially fails, leave already assigned items intact and retry only unassigned items later.
- If a copied photo operation fails, clean up newly uploaded Drive files and leave the source item untouched.
- Never delete source products/photos as part of copy.

## 12. Testing strategy

Add pure unit tests for:

- trip date validation;
- trip grouping/sorting;
- active-trip resolution for ongoing, persisted future, nearest future, past, and legacy scenarios;
- item eligibility by `tripId`;
- copy payload resets status and timestamps while preserving content;
- migration grouping and deterministic legacy IDs.

Add regression/source/integration tests for:

- startup does not show products until trip context is resolved;
- switching trips resets secondary filters and pagination;
- selecting a trip mirrors the correct active country;
- new-item save gets active `tripId` and matching country;
- editing an item does not silently move it to the active trip;
- category/location chips do not leak unused values from another trip;
- copy to another trip creates a new independent item;
- copied photo metadata points to newly uploaded Drive file IDs;
- deleting/removing a copied photo cannot affect the source photo;
- legacy migration preserves all existing item/photo data;
- two migration attempts do not create duplicate legacy trips.

Run the full existing GitHub Actions suite before merge, not only the new trip tests.

## 13. Explicit non-goals

This feature does not add:

- itinerary planning;
- flight/hotel storage;
- shared trips or multi-user collaboration;
- a permanent master product catalog;
- automatic recurring purchases;
- cross-trip live-linked products;
- bulk move of existing products between trips;
- a user-facing "default trip" settings page.

These can be considered later only if real usage shows they are needed.

## 14. Acceptance criteria

The feature is complete when:

1. A user can create three Japan trips and each trip shows only its own products.
2. Reload/login chooses an appropriate trip without repeatedly opening an obsolete past trip.
3. The active trip is always visible on the homepage and can be switched quickly.
4. Past trips remain accessible without deleting their products.
5. New products cannot be saved without a valid active trip.
6. Existing products are migrated safely into country-specific legacy lists without losing or rewriting content/photos.
7. A product can be copied to another trip without re-entering fields.
8. The copied product starts as wanted/unpurchased and can be edited independently.
9. Copied photos are independent Drive files, so removing a photo from one trip does not damage another trip.
10. Category/location management remains simple and reusable, while homepage filters only expose values relevant to the active trip.
11. Existing country-based personalization continues to follow the country of the active trip.
12. Full CI passes and the implementation is reviewed before merge to `main`.
