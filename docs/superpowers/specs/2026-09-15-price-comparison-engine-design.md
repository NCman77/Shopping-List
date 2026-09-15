# Price Comparison Engine Design

Date: 2026-09-15
Branch: `feature/price-comparison-engine`
Base: `main` @ `231e3792469909c23f8c40276d5e22f0573ef223`

## 1. Scope

This change adds a reusable price-comparison subsystem to the existing shopping-list application while preserving current trip, category, location, shopping-status, Maps, and photo flows.

In scope:

1. Change item `哪裡買` from a single location to a multi-select location picker.
2. Keep backward compatibility with existing single-string `location` items.
3. Make item detail/view photos use the same desktop sizing as edit mode; mobile sizing remains unchanged.
4. Add optional Taiwan reference price and trip-local reference price to add/edit item UI, each supporting either one amount or a min/max range.
5. Add trip currency (`currencyCode`) derived from country but editable while safe.
6. Add no-key exchange-rate conversion to TWD with caching and stale fallback.
7. Add a dedicated `比價` action/modal on each product card.
8. Add on-site price, coupon discount, date/country-aware tax-free estimation, estimated final price, TWD conversion, and Taiwan savings comparison.
9. Add a country/date tax-rule registry, initially implementing Japan rules and leaving other countries without a tax-free toggle until an explicit rule is defined.
10. Preserve existing category/location homepage behavior: a category/location appears in homepage filters only after a product in the active trip actually uses it.

Out of scope:

- Changing homepage category/location visibility rules.
- Building purchase-history or multi-store price-history timelines.
- Automatically scraping store prices.
- Automatically determining whether a user or basket is legally tax-free eligible.
- Modeling every country's tourist tax/refund scheme in this first version.
- Persisting derived TWD conversions or derived percentage savings.

## 2. Existing Behavior to Preserve

- Homepage filter chips are trip-scoped and hide category/location values not used by products in the active trip.
- Shopping status remains `wanted`, `not_wanted`, or `purchased` with legacy `purchased` compatibility.
- Item detail opens in view mode first and has an explicit Edit action.
- Maps/Places ON/OFF behavior from PR #22 remains unchanged.
- Existing items with one `location` string continue to render, filter, edit, copy, and save correctly.

## 3. Multi-select `哪裡買`

### 3.1 Data model

New canonical field:

```text
locations: string[]
```

Legacy compatibility field remains:

```text
location: string
```

Normalization rule:

- If `locations` is a non-empty array, normalize/trim/dedupe it and use it as canonical.
- Otherwise, if legacy `location` is non-empty, canonical locations are `[location]`.
- Otherwise canonical locations are `[]`.

Write rule:

- Save `locations` as the full selected set.
- Save `location` as `locations[0] || ''` for compatibility with older code and older clients.

### 3.2 UI

Replace the native single `<select id="item-location">` experience with a compact multi-select control:

- collapsed field shows selected locations as chips;
- tapping opens a searchable picker;
- picker lists current saved location options;
- multiple values can be toggled;
- Done closes the picker;
- no selection is valid.

The control is used in both add and edit mode.

### 3.3 Homepage/filter behavior

- Homepage location filtering matches when the selected filter is included in normalized item locations.
- Product cards render multiple location chips when multiple values are selected.
- `trip-filter-options` extracts every normalized location used by active-trip products.
- The existing rule remains: unused saved locations do not appear as homepage filter chips.

### 3.4 Copy behavior

Cross-trip item copy copies normalized `locations` plus compatibility `location`, matching the application's existing behavior of copying location metadata.

## 4. Photo sizing

Current view mode has detail-photo CSS that forces the photo grid/image to full width, overriding the desktop cap used in edit mode.

Target behavior:

- under 1024 px: leave current mobile sizing unchanged;
- 1024 px and above: view-mode photo content uses the same effective max width and centering as edit mode (`lg:max-w-md`, centered);
- natural aspect ratio remains intact;
- photo upload/edit/delete behavior is unchanged.

## 5. Trip currency

### 5.1 Trip field

Add:

```text
currencyCode: ISO-4217 string
```

Examples:

- 日本 -> JPY
- 加拿大 -> CAD
- 美國 -> USD
- 英國 -> GBP
- 韓國 -> KRW
- 泰國 -> THB
- common Eurozone countries / broad custom label `歐洲` -> EUR

Country-to-currency inference is a convenience, not the sole source of truth.

### 5.2 Trip UI

Trip add/edit form adds `使用幣別` below country.

- Selecting/changing country suggests a currency.
- User can correct the suggestion.
- New trip persists `currencyCode`.
- Existing trips without `currencyCode` derive a value at runtime from country.
- Currency remains editable until an item in the trip has a non-empty local reference price or on-site comparison price. Once monetary local-currency data exists, currency is locked to prevent silently reinterpreting stored amounts.
- Existing country locking rules remain unchanged.

### 5.3 Currency metadata

Maintain a focused metadata module for:

- ISO code
- display label
- symbol/prefix (`¥`, `CA$`, `US$`, `€`, etc.)
- number of minor digits (JPY/KRW/TWD = 0; most CAD/USD/EUR = 2)
- common country-name aliases used by this app.

Unknown/custom countries must still allow the user to choose a currency manually.

## 6. Reference prices in add/edit item

### 6.1 Fields

All optional:

```text
priceTwdMin: number | null
priceTwdMax: number | null
priceLocalMin: number | null
priceLocalMax: number | null
priceLocalCurrency: string
```

`priceLocalCurrency` is written when a local reference price is present and should normally equal the active trip currency.

### 6.2 Compact UI

Add a `價格參考` section.

Taiwan row:

```text
台灣價  NT$ [amount] [範圍]
```

Trip-local row is dynamic:

```text
日本價 ¥ [amount] [範圍]
加拿大價 CA$ [amount] [範圍]
美國價 US$ [amount] [範圍]
```

Default is one input. `範圍` expands a second max input:

```text
NT$ [399] ～ [699]
```

Rules:

- both rows are optional;
- min only = single known price;
- min + max = range;
- if max < min, validation fails with a clear message;
- clearing the range max returns the row to single-price semantics;
- values use the currency's supported decimal precision.

No derived conversion is persisted.

## 7. Exchange-rate service

### 7.1 Provider

Use ExchangeRate-API Open Access endpoint:

```text
https://open.er-api.com/v6/latest/TWD
```

Rationale:

- no API key;
- supports ISO 4217 currencies needed by the app;
- provider explicitly permits caching;
- Open endpoint updates once per day;
- attribution is required.

### 7.2 Cache

Browser-local versioned cache, not Firestore:

```text
shopping-list:fx:v1:TWD
```

Store:

- `rates`
- `time_last_update_unix`
- `time_next_update_unix`
- local fetch timestamp
- provider identifier

Refresh rules:

- normally fetch at most once per 24 hours / provider update cycle;
- reuse cached rates throughout the day;
- coalesce duplicate in-flight requests;
- on network/provider failure, use last successful cache if present;
- stale rates remain usable but UI displays their age;
- if stale > 7 days, show a stronger stale warning;
- if no cache and fetch fails, show local prices but suppress TWD conversion and percentage comparison.

### 7.3 Conversion

The provider table is based on TWD. If `rates[LOCAL]` means `1 TWD = X LOCAL`, then:

```text
LOCAL -> TWD = localAmount / rates[LOCAL]
```

All conversion logic lives in pure tested helpers.

### 7.4 Attribution

Any comparison/detail UI that displays provider-derived FX conversion includes a discreet link/text equivalent to `Rates By Exchange Rate API` as required by the provider.

## 8. Product card actions

For an ordinary wanted item, the action row becomes conceptually:

```text
比價 | 不想買 | 還沒買/購買狀態控制
```

Exact existing shopping-status labels/controls remain authoritative; the new requirement is that `比價` is an independent action placed before them.

Rules:

- `比價` is available independent of wanted/not-wanted/purchased state.
- `比價` does not itself change shopping status.
- Card remains compact; reference prices and savings calculations live inside the comparison modal rather than being permanently expanded on the card.

## 9. Comparison modal

### 9.1 Reference section

Show saved research values:

```text
台灣參考價
NT$399 ～ 699

日本參考價
¥1,280 ～ 1,680
約合台幣 NT$275 ～ 361
```

If only a single amount exists, show a single amount.

If local reference price and FX are available, calculate a reference comparison headline against Taiwan.

### 9.2 On-site comparison section

Editable and persisted as the item's latest comparison snapshot:

```text
onsitePriceLocal: number | null
couponDiscountPct: number | null
selectedTaxRuleId: string
comparisonUpdatedAt: number | null
```

UI:

```text
目前店價   ¥ [1480]
優惠券     [10] %
免稅       [country/date appropriate choices]
```

No history is stored in this version; reopening the item restores the latest snapshot.

### 9.3 Calculation order

Default estimate assumes the entered store price is tax-inclusive where the active country rule says prices are normally tax-inclusive.

1. Start with on-site displayed price.
2. Apply coupon discount:

```text
discountedGross = price * (1 - couponPct / 100)
```

3. If a tax-free option is selected and applicable, remove the included tax component:

```text
estimatedNet = discountedGross / (1 + taxRate)
```

Do **not** calculate 10% tax-free as `gross * 0.90`; for a tax-inclusive 10% price, the tax-exclusive value is `gross / 1.10`.

4. Convert `estimatedNet` to TWD using cached FX.
5. Calculate Taiwan comparison metrics.

The UI explicitly labels the result `預估到手價` because store coupon stacking, exclusions, service fees, rounding, and tax-free counter procedures can differ.

### 9.4 Coupon validation

- optional;
- numeric 0 to 100 exclusive of 100;
- default blank/0;
- no attempt to infer coupon eligibility;
- user can leave coupon blank if the store coupon cannot be combined with tax-free treatment.

## 10. Taiwan savings comparison

### 10.1 Baseline

Taiwan research price baseline:

- single TWD price -> that amount;
- TWD range -> midpoint `(min + max) / 2`.

Headline uses this midpoint when a range exists.

### 10.2 Price source priority

Comparison source:

1. If on-site price exists, use estimated final TWD after coupon/tax-free calculation.
2. Otherwise, if local reference price exists, use the midpoint of the local reference range converted to TWD.
3. Otherwise, no savings percentage is shown.

### 10.3 Headline

Examples:

```text
✅ 比台灣常見價便宜 31%
⚠️ 比台灣常見價貴 12%
≈ 與台灣常見價接近
```

Percentage formula:

```text
savingsPct = (taiwanBaseline - comparedTwd) / taiwanBaseline * 100
```

Round for display; calculations retain full numeric precision.

### 10.4 Range detail

When Taiwan price is a range, detailed view additionally compares the result with both range endpoints, so the user can see whether the overseas price is cheaper even than Taiwan's low end or only cheaper than the typical midpoint/high end.

Example:

```text
台灣範圍 NT$399 ～ 699
比台灣最低價便宜 18%
比台灣最高價便宜 53%
```

If the result is higher than an endpoint, wording changes to `貴` rather than producing a confusing negative `便宜` percentage.

## 11. Country/date tax-rule registry

Tax logic is isolated from comparison math.

Interface concept:

```text
rulesFor({ country, currencyCode, purchaseDate }) -> {
  options,
  notices,
  calculationMode
}
```

Each rule option has a stable id, label, rate, validity range, and explanatory notice.

### 11.1 Japan: current trip / purchases through 2026-10-31

For Japan purchases before 2026-11-01, expose:

- `不套用免稅`
- `免稅 · 10% 標準稅率`
- `免稅 · 8% 輕減稅率`

The UI notes:

- standard consumption tax total rate is 10%; reduced rate is 8% for qualifying food/drink and certain other reduced-rate categories;
- the app does not decide product tax classification for the user;
- tax-free eligibility is not guaranteed by checking the box;
- current system generally requires tax-excluded daily purchases at the same tax-free store of at least JPY 5,000; consumables have a JPY 500,000 upper limit under the pre-November-2026 system;
- basket/store/day aggregation is outside the app's knowledge, so this is an estimate only.

### 11.2 Japan: purchases from 2026-11-01

Japan's refund-method rules become active for purchases on/after 2026-11-01.

The comparison math can still estimate the post-refund effective net amount by removing the relevant tax component, but UI wording changes to make cash-flow timing clear:

```text
先支付含稅價；符合資格並完成出境確認後，再退還相當於消費稅的金額。
```

Additional rule note:

- purchased goods must be confirmed for export on departure within 90 days;
- revised minimum tax-free purchase amount is JPY 5,000 tax-excluded per store/day without the prior general/consumable category split;
- actual refund process/timing is handled by the tax-free shop/refund operator.

### 11.3 Other countries

Version 1 provides currency conversion everywhere the currency is supported, but tax-free controls appear only where the registry contains a researched rule.

For Canada, US, Eurozone, etc. without a configured rule, comparison still supports:

- Taiwan reference;
- local reference;
- on-site price;
- coupon percentage;
- FX conversion;
- savings percentage.

No generic/fake tourist-tax percentage is shown.

Future country tax rules can be added independently without modifying core comparison math.

## 12. Purchase date used for rules

Tax rules need a date.

Resolution order:

1. If today's date is within active trip dates, use today.
2. If trip is upcoming, use trip start date as the planning-rule date.
3. If trip is past, use trip end date for displaying the applicable historical rule set.
4. The comparison modal labels the rule date context when a future regime is being previewed.

This makes the user's September 21-27, 2026 Japan trip use the pre-November refund rules, while a November 2026+ Japan trip uses the refund-method UI.

## 13. Persistence and derived data

Persist user-entered research/input values only.

Item fields added:

```text
locations: string[]
priceTwdMin: number | null
priceTwdMax: number | null
priceLocalMin: number | null
priceLocalMax: number | null
priceLocalCurrency: string
onsitePriceLocal: number | null
couponDiscountPct: number | null
selectedTaxRuleId: string
comparisonUpdatedAt: number | null
```

Trip field added:

```text
currencyCode: string
```

Do not persist:

- converted TWD amounts;
- exchange-rate-derived local/TWD values;
- `比台灣便宜 X%` values;
- tax-free estimated net amount.

These are recomputed from current inputs + cached rate + applicable rule.

## 14. Copy semantics

When copying an item to another trip:

- copy Taiwan reference price (`priceTwdMin/Max`);
- copy normalized locations according to existing copy behavior;
- if target trip currency equals source `priceLocalCurrency`, local reference price may be retained;
- if currency differs, clear local reference price and set target local currency;
- always clear on-site price, coupon discount, selected tax rule, and comparison timestamp because these represent a specific in-store comparison snapshot;
- derived values are never copied because they are never persisted.

## 15. Error/offline handling

- FX fetch failure + cache exists: calculate using cache and show stale-rate status.
- FX fetch failure + no cache: keep all entered prices visible; hide/suppress TWD conversion and savings percentage; show `暫時無法取得匯率`.
- Unsupported currency: keep local price entry but show no conversion; currency can be corrected in trip settings if safe.
- Invalid price range: block item save and explain which range is invalid.
- Invalid coupon: block comparison save/calculation and explain 0-<100 requirement.
- Tax rule not available: no tax-free control is rendered; never guess a rate.

## 16. Security/privacy

- Exchange-rate endpoint requires no credential.
- FX cache contains only public exchange-rate data in browser local storage.
- No new secrets are introduced.
- No location/GPS data are involved in price comparison.
- Existing per-user Firestore item/trip isolation remains authoritative.

## 17. Testing requirements

TDD coverage must include at minimum:

### Multi-location

1. Legacy `location` normalizes to one-element `locations`.
2. Multiple locations trim/dedupe and preserve order.
3. Save writes both canonical `locations` and compatibility `location`.
4. Homepage location filter matches any selected location.
5. `trip-filter-options` includes all used item locations and still hides unused saved locations.
6. Copy behavior preserves normalized locations.

### Photo

7. Desktop view photo uses same max width as edit mode.
8. Mobile sizing remains untouched.

### Currency/trips

9. Common country -> currency inference.
10. Unknown country requires/accepts manual currency.
11. Legacy trip without `currencyCode` derives safely.
12. Currency locks after local monetary data exists.

### Reference prices

13. Empty, single, and range prices normalize correctly.
14. Max below min is rejected.
15. Currency decimal precision is respected.

### FX

16. TWD-base rate conversion math.
17. 24-hour/provider-update cache behavior.
18. Duplicate in-flight request coalescing.
19. Stale-cache fallback and >7-day warning.
20. No-cache failure suppresses derived comparison rather than blocking item use.
21. Attribution is rendered when provider rates are used.

### Comparison math

22. Coupon-only calculation.
23. 10% tax-inclusive removal uses division by 1.10.
24. 8% tax-inclusive removal uses division by 1.08.
25. Coupon then tax-free calculation order.
26. Taiwan single-price baseline.
27. Taiwan range midpoint headline baseline.
28. Endpoint comparison labels switch correctly between cheaper/more expensive.
29. On-site price takes priority over local reference for headline.
30. Local reference is used when no on-site price exists.
31. No Taiwan baseline means no savings percentage.

### Tax rules

32. Japan September 2026 resolves pre-refund rules.
33. Japan November 2026 resolves refund-method rules.
34. Other countries without registered tax rules show no tax-free percentage.
35. Trip-date rule-date resolution handles current/upcoming/past trips.

### Persistence/regression

36. Reopening comparison restores latest user-entered on-site/coupon/tax selection.
37. Derived TWD/percentage values are not stored in Firestore.
38. Cross-currency item copy clears local/on-site comparison values as specified.
39. Existing shopping status, pagination, Maps mode, and item photo tests remain green.
40. Homepage category/location visibility rule remains unchanged.

## 18. Likely implementation units

Prefer isolated modules rather than expanding the legacy inline script further:

- `src/client/app/item-locations.js` — normalize/save/filter multi-location data.
- `src/client/app/currency.js` — country/currency metadata and formatting.
- `src/client/app/item-pricing.js` — price-range normalization and item pricing fields.
- `src/client/app/exchange-rates.js` — fetch/cache/convert public FX data.
- `src/client/app/tax-rules.js` — date/country-specific tax-free registry.
- `src/client/app/price-comparison.js` — pure comparison calculations.
- `src/client/app/price-comparison-ui.js` — item form additions + comparison modal/card action.
- targeted updates to `trip-ui.js`, `travel-trip.js`, `trip-filter-options.js`, `item-workflow-enhancements.js`, `item-copy.js`, photo detail/layout modules, and bootstrap.

Exact file boundaries may be adjusted during implementation planning, but calculation/policy code must remain separately testable from DOM/Firebase code.

## 19. Acceptance criteria

The feature is accepted when:

1. User can select multiple `哪裡買` values on add/edit and old items still work.
2. Homepage continues showing only locations/categories actually used by active-trip items.
3. Desktop item view photo is the same practical size as edit photo; mobile is unchanged.
4. User can optionally record Taiwan and trip-local single/range reference prices.
5. Trip currency follows country by default and can be corrected before local monetary data locks it.
6. `比價` appears as an independent card action before existing shopping-status controls.
7. Comparison modal shows research prices, local->TWD conversion, and Taiwan cheaper/more-expensive assessment.
8. User can enter current store price and coupon percentage.
9. Japan September 2026 comparison offers researched 10%/8% tax-free estimate options with eligibility warnings; it never lets user invent a tax rate.
10. Japan purchase dates on/after 2026-11-01 show refund-method wording/rules.
11. Countries without registered tax-refund logic never receive a guessed tax-free percentage.
12. FX uses no API key, normally fetches no more than daily, supports stale offline cache, and renders required attribution.
13. Headline uses Taiwan single price or range midpoint as approved; range endpoint details are also shown.
14. No derived conversion/savings values are persisted.
15. Full existing regression suite plus new tests are green before PR/merge.

## 20. Research references

Authoritative/current references used for this design:

- Japan National Tax Agency — current tax-free eligibility and pre-November-2026 purchase thresholds: https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6559.htm
- Japan National Tax Agency — 10% standard / 8% reduced consumption-tax rates: https://www.nta.go.jp/english/taxes/consumption_tax/pdf/2025/general_00.pdf
- Japan National Tax Agency — refund method from 2026-11-01: https://www.nta.go.jp/publication/pamph/shohi/menzei/201805/format/002.htm
- Japan Tourism Agency / NTA — refund-method traveler material and 90-day departure confirmation: https://www.mlit.go.jp/kankocho/tax-free/content/001991234.pdf
- ExchangeRate-API Open Access docs — no key, daily updates, caching allowed, attribution required: https://www.exchangerate-api.com/docs/free
