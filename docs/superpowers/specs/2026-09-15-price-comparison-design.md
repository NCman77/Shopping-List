# Price Comparison and Multi-Location Design

Date: 2026-09-15
Repository: `NCman77/Shopping-List`
Branch: `feature/price-comparison`

## Goal

Add a reusable price-comparison subsystem for travel shopping while preserving every existing shopping-list behavior. The feature must let users save pre-trip price research, select multiple candidate purchase locations, calculate an estimated in-store final price using coupon/tax-free rules and exchange rates, compare the result with Taiwan pricing, and retain a small recent comparison history.

The change must preserve current trip isolation, status workflow, pagination, nearby sorting, Google Maps behavior, Google Drive photos, PWA behavior, Firebase Authentication, and the existing Firestore root schema.

## Approved UX

### Product add/edit

The add/edit form keeps product metadata responsibilities and adds a compact `價格功課` section:

- Taiwan reference price: minimum and optional maximum in TWD.
- Travel-country reference price: minimum and optional maximum in the active trip currency.
- `哪裡買` becomes multi-select rather than a single select.

The form does not contain the full live price calculator. The live calculation remains a separate `比價` action from product cards.

### Homepage card actions

A product card exposes `比價` independently from purchase status. Conceptually:

`比價 ｜ 不想買 / 恢復 ｜ 還沒買 / 已買`

`比價` must remain usable for wanted, not-wanted, and purchased items. It must not mutate `shoppingStatus`.

### Price comparison modal

The modal shows saved research first, then a live calculator:

- current store price;
- coupon percentage;
- country-specific tax-free option when supported;
- estimated post-coupon price;
- estimated tax-free/final price;
- converted TWD amount;
- headline comparison with Taiwan common price;
- detailed comparison against Taiwan low/high bounds;
- comparison with the saved local-country reference range when available.

The modal must clearly label the result as an estimate because retailer coupon exclusions, brand restrictions, tax-free eligibility, and retailer rounding can change the actual register total.

## Data Model and Backward Compatibility

No bulk Firestore migration is allowed. Existing production data remains under:

`artifacts/japan-shopping-app/users/{uid}/...`

### Purchase locations

Keep the legacy field:

```text
location string
```

Add:

```text
locations string[]
```

Read rules:

1. If `locations` is a non-empty array, normalize/dedupe it and use it.
2. Otherwise, if legacy `location` is non-empty, expose `[location]`.
3. Otherwise expose `[]`.

Write rules:

- `locations` stores all selected locations in UI order.
- `location` remains synchronized to the first selected location, or `''` if none, preserving old code/data compatibility.

Filtering rule:

- A product matches a location filter when any normalized entry in `locations` equals the selected filter.
- Legacy products continue to match through the fallback from `location`.

The visible homepage category/location filter behavior itself must not otherwise change.

### Price research

Add optional product field:

```text
priceResearch {
  taiwanMinTwd number|null
  taiwanMaxTwd number|null
  localMin number|null
  localMax number|null
  currencyCode string
  updatedAt number
}
```

Normalization rules:

- Empty/non-finite/non-positive values become `null`.
- If only one value is supplied for a range, that value is treated as both the effective low and high for comparison while preserving `null` for the omitted UI field.
- If min > max, normalize by swapping effective comparison bounds rather than saving an invalid ordered range.
- `currencyCode` follows the active trip country mapping and is stored with the research so historical interpretation remains stable.

### Price comparison history

Store at most the newest 20 entries per product in:

```text
priceComparisons [
  {
    createdAt number
    country string
    currencyCode string
    storePrice number
    couponPercent number
    taxMode string
    taxRate number|null
    exchangeRateToTwd number|null
    rateUpdatedAt number|null
    postCouponPrice number
    estimatedFinalPrice number
    estimatedTwd number|null
  }
]
```

The array is capped at 20 newest records. Saving history is optional from the comparison modal; calculations themselves must work without writing Firestore. A history write failure must not invalidate the visible calculation.

## Pricing Calculation Rules

Pure pricing logic must be isolated from DOM and Firestore.

### Coupon

For store price `P` and coupon percentage `c`:

```text
postCoupon = P * (1 - c / 100)
```

Coupon input is clamped to 0–100 for calculation. Invalid values resolve to 0.

### Removing included consumption tax

When a displayed price includes tax rate `r`, estimated tax-exclusive/tax-free value is:

```text
final = postCoupon / (1 + r)
```

Examples:

- JPY 1,100 at 10% => JPY 1,000.
- JPY 1,080 at 8% => JPY 1,000.

The system must never model 10% tax-free as simply subtracting 10% from a tax-inclusive total.

### Taiwan headline comparison

If Taiwan research contains one price, compare directly with it.

If it contains a range, the headline baseline is the midpoint:

```text
midpoint = (low + high) / 2
percentDifference = (baseline - estimatedTwd) / baseline * 100
```

Headline language uses `比台灣常見價便宜 X%` or `比台灣常見價貴 X%`.

The detailed view separately reports the relationship to the Taiwan minimum and maximum so midpoint use never hides the true range.

## Country and Currency Rules

Country rules live in a dedicated pure configuration module. Unknown/custom countries must not inherit Japan rules.

Each recognized country may define:

```text
{
  country,
  currencyCode,
  taxModes,
  effectiveFrom,
  effectiveUntil,
  notice
}
```

At minimum, the initial implementation supports Japan explicitly and provides currency-only fallback behavior for countries where tax-free rules are not defined.

### Japan through 2026-10-31

Verified rules used by the estimator:

- standard consumption tax: 10%;
- reduced rate: 8% for eligible categories such as qualifying food/drink;
- current tax-free purchase threshold: same eligible purchaser, same tax-free store, same day, tax-exclusive total of at least JPY 5,000;
- under the current system, consumables have a JPY 500,000 tax-exclusive upper bound and special handling requirements.

The calculator offers:

- no tax-free;
- tax-free · 10% standard;
- tax-free · 8% reduced.

It displays an eligibility notice rather than deciding eligibility from a single item's price because qualification can depend on same-store/day aggregate purchases.

### Japan from 2026-11-01

The National Tax Agency states the Refund Method begins on 2026-11-01. The rules module must therefore select a distinct effective-period rule set from that date. The UI must not present the pre-November 2026 direct-tax-free wording for later trips.

For the new method, the estimate may still calculate the tax-equivalent refundable amount, but wording must explain that the purchaser pays tax-inclusive price first and refund depends on departure/customs confirmation and retailer processing.

### Unknown or unsupported country

- Currency conversion may still be available when the country has a recognized currency mapping.
- No tax-free mode is shown unless that country's rule is explicitly defined.
- The application must never silently reuse Japan's 8%/10% options for another country.

## Exchange Rates

Use ExchangeRate-API Open Access endpoint via HTTPS.

Requirements verified from provider documentation:

- no API key;
- attribution required;
- rates update once per day;
- caching is permitted;
- rate limiting exists.

Implementation behavior:

1. Fetch only on demand when the comparison modal needs conversion.
2. Cache successful rate data for 24 hours in local storage with provider update timestamp when available.
3. Reuse cached data during the TTL.
4. If refresh fails and stale cached data exists, allow conversion with the stale rate and visibly label its timestamp/stale state.
5. If no usable rate exists, keep all local-currency calculations working and show TWD conversion as unavailable.
6. Include discreet `Rates By Exchange Rate API` attribution in the comparison modal wherever rates are displayed.

## Architecture

Follow the repository's existing native ES module pattern and enhancement isolation rules.

### New pure pricing modules

`src/client/pricing/price-range.js`

- normalize optional min/max ranges;
- midpoint and boundary comparison helpers;
- product research normalization.

`src/client/pricing/price-calculator.js`

- coupon normalization;
- tax-inclusive divisor calculation;
- local final-price calculation;
- TWD comparison metrics.

`src/client/pricing/country-rules.js`

- country/currency mapping;
- effective-date Japan rule selection;
- tax-mode lookup;
- no-rule fallback.

`src/client/pricing/exchange-rate.js`

- provider response normalization;
- cache keys/TTL logic;
- conversion helper;
- browser fetch wrapper with stale-cache fallback.

`src/client/pricing/location-selection.js`

- normalize/dedupe `locations`;
- legacy `location` fallback;
- write patch that keeps both schemas synchronized;
- location-filter matching.

### New UI enhancement

`src/client/app/price-comparison-enhancements.js`

Responsibilities:

- add price-research fields to add/edit form without rewriting core `index.html` application logic;
- replace/enhance the single purchase-location control with a multi-select UI while preserving underlying compatibility fields;
- inject `比價` into product card actions;
- open/render the comparison modal;
- resolve active item and active-trip country;
- load exchange rates only when needed;
- optionally append capped comparison history;
- expose clear error/stale-rate/eligibility messages;
- fail independently from status, location, photo, trip, and PWA features.

### Existing files changed only at integration points

`src/client/app/feature-bootstrap.js`

- lazy-load/init the new enhancement as an independent task;
- add a matching failure label.

`src/client/app/item-workflow-enhancements.js`

- preserve existing status semantics and pagination;
- only add the smallest stable hook necessary for the independent comparison action if DOM injection alone is insufficient;
- `比價` must not participate in status state transitions.

`index.html`

- core legacy save/read logic may require a compatibility hook for `locations` and `priceResearch` if enhancement wrapping cannot safely capture the data;
- changes must be minimal and covered by regression tests;
- do not move the pricing engine into this file.

## Read/Edit Mode Integration

Existing product detail mode disables fields until the user presses `編輯`. New price-research and location-selection controls must follow the same mode:

- view mode: read-only/disabled;
- edit mode: editable;
- new product mode: editable;
- photo behavior remains unchanged.

The existing product image desktop/mobile sizing fixes are outside feature scope and must remain intact.

## Failure Isolation

- Exchange-rate provider unavailable: local currency calculation still works.
- No cached exchange rate: TWD conversion becomes unavailable without blocking the modal.
- Country rule unavailable: hide tax-free controls; keep coupon/local calculation.
- Firestore history update fails: show non-blocking save error; keep calculation result.
- New location fields missing/malformed on old items: fall back to legacy `location`.
- Pricing enhancement initialization fails: shopping status, trip filtering, Maps, photos, PWA, and base list remain operational.

## Security and Privacy

- No new secret or API key is committed.
- ExchangeRate-API Open endpoint needs no credential.
- No user live location is touched by this feature.
- Existing Firestore authentication and per-user paths remain unchanged.

## Testing Strategy

### Pure tests

Create focused tests for:

- location normalization/deduplication/fallback;
- multi-location filter matching;
- synchronized `location` + `locations` writes;
- price range one-value/range/reversed-range handling;
- midpoint calculation;
- 0%, 10%, 100%, invalid coupon normalization;
- JPY 1,100 / 10% => JPY 1,000;
- JPY 1,080 / 8% => JPY 1,000;
- coupon then tax-removal ordering;
- TWD headline midpoint percentage;
- Taiwan low/high detailed comparison;
- Japan date boundary at 2026-10-31 / 2026-11-01;
- unsupported country does not expose Japan tax modes;
- exchange-rate cache fresh/stale behavior;
- provider response normalization;
- capped history keeps newest 20.

### UI/integration regression tests

Verify:

- `比價` is available for wanted/not-wanted/purchased cards;
- comparison never changes `shoppingStatus`;
- detail/view mode locks pricing/location controls;
- multi-location UI persists old `location` compatibility;
- legacy location-only items still render/filter/edit;
- category/location homepage presentation is otherwise unchanged;
- price research survives edit/reopen;
- modal works with no exchange rate;
- stale cached exchange rate is labeled;
- ExchangeRate-API attribution is present when rates are used;
- Japan tax notice changes at 2026-11-01;
- no Maps, Drive, photo, trip, nearby-sort, pagination, or PWA regression.

### Full repository verification

Before merge:

- run every existing `*.test.mjs` test;
- run JS syntax checks used by the repository workflow;
- run structure/import-resolution checks;
- run Firestore schema guard;
- inspect final branch diff against `main`;
- ensure the exact final PR head passes required GitHub Actions checks.

A failing required check or known regression blocks merge.

## Acceptance Scenarios

1. A legacy product with only `location: '藥妝店'` still displays, filters, and edits normally.
2. A new product can select two or more purchase locations; filtering by any selected location shows it.
3. Existing homepage category/location chip rules look and behave the same except for correct multi-location matching.
4. Taiwan reference NT$399–699 produces headline baseline NT$549 and also shows separate low/high comparisons.
5. Japan store price JPY 1,480 with 10% coupon produces JPY 1,332 before tax-free estimation.
6. Applying 10% tax removal after that yields approximately JPY 1,210.91 before display rounding.
7. Japan trip dated before 2026-11-01 uses current-system wording; a trip on/after 2026-11-01 uses Refund Method wording.
8. A single JPY 3,000 item is not declared ineligible; the UI explains same-store/day aggregate requirements.
9. Without network but with cached FX, comparison uses the cached rate and marks it stale when outside TTL.
10. Without any FX rate, local-currency comparison remains usable and TWD conversion is clearly unavailable.
11. Wanted, not-wanted, and purchased products all retain a functional `比價` action.
12. Saving a comparison retains no more than the 20 newest records.
13. If the pricing feature fails to initialize, the rest of the shopping list still works.
14. Mobile layout remains usable and the existing photo behavior is unchanged.

## Source Basis for Regulatory/Provider Rules

Implementation rule values must be traceable to authoritative/provider documentation current at implementation time:

- Japan National Tax Agency, consumption tax rate documentation: standard 10%, reduced 8%.
- Japan National Tax Agency, tax-free purchase eligibility documentation: current JPY 5,000 minimum and consumable JPY 500,000 current upper bound.
- Japan National Tax Agency, FY2025 tax reform tax-free shopping documentation: Refund Method effective 2026-11-01.
- ExchangeRate-API Open Access documentation: no key, attribution required, daily update, caching allowed.

If a later implementation occurs after these rules change, update `country-rules.js` effective periods and tests rather than silently changing historical behavior.