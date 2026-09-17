# Coupon Management Design

Date: 2026-09-17
Status: Proposed for user review
Scope: Coupon management, coupon-to-brand/product association, coupon display in item workflows, expiry cleanup, and synchronized location deletion from existing items.

## 1. Goals

Add a centralized coupon system for tourist/store coupons without duplicating coupon URLs into every item. Coupons are associated with Brand Dictionary identities, while items continue to keep their existing raw location values.

The design must support:

- A new `優惠券管理` entry immediately above `個人化` in account settings. With the existing Brand Dictionary entry, the intended order is `品牌字典` → `優惠券管理` → `個人化`.
- Coupon controls in both `新增商品` and `編輯商品`.
- One coupon maximum per brand/store.
- A store coupon automatically becoming visible to all existing and future items whose selected locations resolve to that brand.
- Items with multiple selected locations showing all matching coupons, not only the first location's coupon.
- Brand matching against every populated Brand Dictionary alias, regardless of whether the user originally entered Chinese, local-language, English, or another alias.
- User-visible store names following the existing brand display priority: Chinese first, then destination-local language, then secondary/default language, then other aliases.
- Coupon pages opening the original web URL so store staff can operate the live official coupon page when screenshots are not accepted.
- Expired coupons being automatically removed on login/data load rather than archived.
- Deleting a location from homepage location management also removing that raw location from every existing item that uses it.
- Deleting a homepage location must never delete or modify its Brand Dictionary entry, and must not directly delete its coupon.

## 2. Non-goals / protected behavior

This change must not:

- Change Google Maps query resolution or `resolveLocationMapQuery()` behavior.
- Change the current rule that Maps uses destination/local-language names rather than Chinese display names.
- Re-enable retired Store / Google Places / nearby-branches functionality.
- Change Brand Dictionary alias storage or brand display-language priority.
- Rename or migrate existing raw item location strings.
- Store a copied coupon URL in every item document.
- Keep coupon history or expired coupon archives.
- Change category-deletion semantics; only location deletion receives the new item-synchronization behavior.

## 3. Core identity model

### 3.1 Brand is the canonical store identity

Brand Dictionary remains the source of truth for store identity. A brand has a stable `brandId` and one or more aliases.

Example:

```text
brandId: brand_123
country: 日本
aliases:
- 中文: 松本清
- 日文: マツモトキヨシ
- 英文: Matsumoto Kiyoshi
```

All populated aliases refer to the same brand. The coupon system never relies on one specific language field as the key.

### 3.2 Matching an item location to a brand

For every raw location selected on an item:

1. Limit candidate brands to the item's/active trip's country.
2. Match the raw location against all populated aliases using the existing brand matching rules, including normalized exact/certain matching and the existing Kana/Romaji equivalence behavior.
3. If exactly one brand matches, use that brand's `brandId`.
4. If no brand matches, no coupon is auto-associated. The UI may indicate that the location needs a Brand Dictionary entry before a coupon can be attached.
5. If more than one brand matches, do not guess or select the first match. Treat the location as ambiguous and do not auto-associate a coupon until the brand data is corrected.

The implementation should reuse the existing `findBrandForLocation()` behavior per candidate brand rather than create a second independent normalization system.

### 3.3 Display name is separate from identity

Coupon identity uses `brandId` only. User-visible store names are derived dynamically from the current Brand Dictionary aliases.

Display priority remains the existing country-aware policy:

- Japan: Chinese → Japanese → English → other.
- Spain: Chinese → Spanish → English → other.
- Germany: Chinese → German → English → other.
- Canada: Chinese → English → French → other.
- Other countries: Chinese → destination primary/default language(s) → other populated languages.

Therefore, if a brand later gains a Chinese name, all coupon-related UI immediately begins displaying that Chinese name without rewriting coupon or item data.

## 4. Coupon data model

Use the already owner-authorized settings-document pattern rather than introduce a new Firestore collection that would require a separate rules deployment.

Document:

```text
artifacts/japan-shopping-app/users/{uid}/settings/couponDictionary
```

Shape:

```js
{
  coupons: [
    {
      brandId: 'brand_123',
      country: '日本',
      couponUrl: 'https://example.jp/coupon/...',
      validFrom: '2026-09-01',
      validUntil: '2026-09-30',
      createdAt: 1780000000000,
      updatedAt: 1780000000000
    }
  ]
}
```

Rules:

- `brandId` is the unique key. There can be at most one coupon per `brandId`.
- Saving another coupon for the same brand updates/replaces that brand's existing coupon rather than adding a second record.
- `country` is stored for country filtering and integrity checks but is not the identity key.
- Store names are not duplicated into coupon records; they are always derived from Brand Dictionary.
- `couponUrl`, `validFrom`, and `validUntil` are required.
- URL must be an absolute `http://` or `https://` URL. Query parameters and fragments must be preserved.
- `validFrom` must not be after `validUntil`.
- A coupon whose `validUntil` is earlier than today's local device calendar date is expired.
- The `validUntil` date itself remains valid through that calendar day.
- A coupon with a future `validFrom` remains stored but is treated as not yet active.

Coupon writes should use a Firestore transaction against the single coupon document so concurrent browser tabs do not overwrite unrelated coupon changes from stale snapshots.

## 5. Expiry and stale-data cleanup

Every time the signed-in user's coupon data is initially loaded or reloaded:

1. Read current coupons.
2. Remove records where `validUntil < today`.
3. Also remove orphan coupon records whose `brandId` no longer exists in the current Brand Dictionary, because they can no longer be associated with a store and the user explicitly prefers not to retain useless data.
4. Persist cleanup only when the filtered set differs from the stored set.

If cleanup persistence fails because the client is offline or Firestore is temporarily unavailable:

- expired/orphan coupons are still treated as unavailable in the current UI;
- the rest of the shopping app remains usable;
- cleanup is retried the next time coupon data loads.

No expired-coupon archive is maintained.

## 6. Coupon Management UI

### 6.1 Settings entry

Add `優惠券管理` immediately above `個人化`. The existing `品牌字典` remains above it.

### 6.2 Country view

Like Brand Dictionary, Coupon Management is country-scoped. Opening it first shows the user's travel countries and coupon counts.

Example:

```text
日本       4 張優惠券
加拿大     1 張優惠券
```

### 6.3 Coupon list

Selecting a country shows one card per coupon. Each card displays:

- current Brand Dictionary display name;
- validity period;
- status when useful (`尚未生效` for a future start date).

Expired coupons should not appear because they are cleaned on load.

Clicking a card opens its editor.

### 6.4 Coupon editor

Fields:

- `商店名稱`
- `優惠券網址`
- `開始日期`
- `截止日期`

`商店名稱` is not an unrestricted text key. It is a searchable Brand Dictionary picker for the selected country.

The search matches all populated aliases. For example, the same Matsumoto Kiyoshi brand can be found by searching `松本清`, `マツモトキヨシ`, or `Matsumoto Kiyoshi`.

Search-result display uses the normal Chinese-first display priority, with secondary alias text shown only as useful context.

Selecting a brand stores only its stable `brandId` association.

Editor actions:

- New brand coupon: `儲存` creates the one coupon for that brand.
- Existing brand coupon: `儲存` updates it.
- Existing coupon: `刪除優惠券` removes it.
- If the chosen brand already has a coupon, the editor switches to editing that existing coupon rather than allowing a duplicate.

## 7. Add/Edit Item Coupon UI

Add a `優惠券` section to both `新增商品` and `編輯商品`, positioned after the location selection/chips and before price research because coupons are derived from selected purchase locations.

This is a derived UI; coupon IDs/URLs are not written into the item document.

For every selected raw location:

1. Resolve its brand.
2. Deduplicate resolved results by `brandId`.
3. Look up the centralized coupon for each brand.

Example with three selected locations:

```text
優惠券
松本清        已設定優惠券 · 編輯
鶴羽藥妝      ＋新增優惠券
唐吉訶德      ＋新增優惠券
```

If a location cannot resolve to a Brand Dictionary brand, show the location as unresolved rather than attaching a coupon to a guessed brand.

### 7.1 Opening coupon editor from an item

Clicking `＋新增優惠券` or `編輯` opens the same Coupon Management editor used by settings, with the brand preselected.

The item form underneath must remain intact. Unsaved product name, photos, locations, price research, notes, and other edits must not be cleared or rebuilt simply because the coupon editor was opened.

After coupon save/delete/cancel, return to the item form and refresh only the coupon section.

This avoids a single inline URL field, which would be ambiguous for items with multiple selected stores.

## 8. Item detail coupon display

When viewing an item from the homepage:

1. Resolve every selected raw location to a brand.
2. Deduplicate by `brandId`.
3. Show every coupon that is currently active (`validFrom <= today <= validUntil`).
4. Do not show future or expired coupons as usable coupons.

If no active coupons match, omit the coupon section.

Each coupon card shows:

- store display name;
- validity period;
- an `開啟優惠券` button.

The full raw URL does not need to be printed as long visible text. `開啟優惠券` opens the exact stored coupon URL in a new browser context with safe external-link behavior (`noopener,noreferrer`).

No screenshot, cached barcode, QR reproduction, or static preview is generated. This preserves official live-page behavior for coupons that require store staff to operate the customer's phone.

## 9. Location deletion behavior change

Current behavior removes a location from the shared location list but intentionally leaves the text on existing items. This design changes that behavior for `location` only.

When the user confirms deletion of a location from homepage `地點` management:

1. Remove the raw location from `settings/preferences.locations`.
2. Find every existing item whose resolved raw locations contain that exact raw location.
3. Remove only that raw location from each affected item's location selection using the existing `locationWritePatch()` compatibility helper.
4. If an item had multiple locations, preserve all other locations.
5. If an item had only the deleted location, the item remains and simply has no purchase location.
6. Do not delete or modify any Brand Dictionary record.
7. Do not directly delete or modify any coupon record.

The confirmation UI must explain this new behavior, including that Brand Dictionary and Coupon Management data are retained.

For safety and atomicity, use one Firestore batch containing the preferences update plus all affected item updates. Because Firestore batches have a write limit, if the operation would exceed the safe single-batch limit (settings write + more than 499 item writes), block the deletion and make no partial changes. Show a clear warning instead.

Category deletion keeps its existing behavior and is outside this change.

## 10. Data-flow examples

### 10.1 Add coupon centrally

```text
Coupon Management
→ select 日本
→ search `Matsumoto`
→ resolves Brand Dictionary brand_123
→ enter URL + date range
→ transaction upserts coupon for brand_123
→ every existing/new item whose location resolves to brand_123 now derives that coupon automatically
```

### 10.2 Brand gains Chinese alias later

```text
Before:
日文: マツモトキヨシ
英文: Matsumoto Kiyoshi
Coupon: brandId = brand_123

Later add:
中文: 松本清

Result:
Coupon Management / item coupon rows / item detail immediately display `松本清`.
No coupon or item rewrite is required.
```

### 10.3 Multi-location item

```text
Item locations:
- Matsumoto Kiyoshi
- ツルハドラッグ TSURUHA
- ドン・キホーテ

Resolved brands:
- brand_123 (coupon exists)
- brand_456 (coupon exists)
- brand_789 (no coupon)

Item detail:
- 松本清 coupon
- 鶴羽藥妝 coupon
```

### 10.4 Delete homepage location

```text
Item locations before:
- Matsumoto Kiyoshi
- ツルハドラッグ TSURUHA

Delete raw location:
ツルハドラッグ TSURUHA

Item locations after:
- Matsumoto Kiyoshi

Unchanged:
- Brand Dictionary entry for 鶴羽藥妝
- Coupon associated with that brandId
```

## 11. Implementation boundaries

Expected new modules are isolated around coupon responsibilities, for example:

- coupon core/data helpers: validation, active/expired logic, brand association and deduplication;
- coupon management UI: settings entry, country/list/editor views, Firestore subscription and transactions;
- item coupon integration: derived add/edit rows and item-detail display.

Existing modules should only be touched where integration is necessary:

- feature bootstrap to initialize coupon features;
- item modal/detail layout hooks to place coupon UI;
- homepage location management to change confirmed location deletion from retain-on-item to remove-from-item.

Do not refactor unrelated item, Maps, pricing, photo, trip, category, or Brand Dictionary behavior.

## 12. Tests / acceptance criteria

Tests must cover at minimum:

1. One coupon per `brandId`; saving again updates instead of duplicates.
2. Coupon URL accepts only absolute HTTP(S) URLs and preserves query/fragment.
3. Date validation rejects invalid ranges.
4. `validUntil === today` is active; `validUntil < today` is expired.
5. Expired coupons are filtered immediately and removed on data load.
6. Orphan coupons are filtered/cleaned when their brand no longer exists.
7. Brand search finds a brand through any populated alias.
8. Coupon display name is Chinese-first and falls back to local/secondary languages using existing priority.
9. Item with multiple locations resolves and displays coupons for every distinct matching brand.
10. Duplicate aliases/locations resolving to the same brand show one coupon only.
11. An ambiguous brand match never silently chooses the first brand.
12. Add/edit item coupon editor preserves unsaved item-form state.
13. Item detail opens the exact stored live coupon URL.
14. Item detail hides coupons before `validFrom` and after `validUntil`.
15. Deleting a location removes that exact raw location from every affected item and preserves other locations.
16. Location deletion does not delete Brand Dictionary or coupon data.
17. Category deletion semantics remain unchanged.
18. Google Maps resolver and local-language Maps query behavior remain unchanged/regression-tested.
19. Existing Feature tests, Browser E2E, Firestore rules integration, and Pages build remain green.
