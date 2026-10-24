# Promotion Scope and Venue Design

## Status

Approved direction: replace the overloaded merchant-outlet concept with
separate shopping venues and merchant branches, and introduce a canonical
promotion model that can represent campaigns issued by either a merchant or a
venue. This document defines the design for user review before implementation
planning.

## Context and Goals

The current model uses `MerchantOutlet` for a merchant's branch. This does not
represent a shopping venue such as Nangang LaLaport, which can contain branches
from many merchants. It also cannot express a venue-issued promotion with
merchant exclusions or a merchant-issued promotion limited to named branches.

The system must distinguish:

- **Outlet / venue**: a shopping location such as Nangang LaLaport.
- **Merchant**: a participating business such as Sanyou Cosmetics.
- **Merchant branch**: one location operated by a merchant, optionally located
  in an Outlet, such as Sanyou Cosmetics Nangang LaLaport branch.
- **Promotion origin**: the Merchant or Outlet that issues the campaign.
- **Promotion eligibility**: the Merchant or branches where the campaign
  applies, including structured exclusions.

The implementation must preserve existing cashback and fixed-discount
recommendations, imported draft history, and catalog data. An administrator
must be able to recover a draft rejected by mistake without re-importing it.
The model must also allow multiple physical Outlets to share a brand or
operator, such as the several LaLaport locations in Taiwan, without conflating
their promotion scope.

## Examples and Required Behavior

### Merchant-origin, branch-limited campaign

The iPASS MONEY text for Sanyou Cosmetics says that its stored-value-card
feature is available only at nine named branches and that other branches are
excluded. This is a positive eligible-branch list:

- The origin is Sanyou Cosmetics.
- The eligibility mode is selected branches.
- The nine named Merchant branches are eligible.
- Other Sanyou branches do not receive the recommendation.
- A branch may be associated with an Outlet, for example Sanyou Cosmetics
  Nangang LaLaport branch with Nangang LaLaport.

### Outlet-origin campaign with exclusions

An Outlet may issue a campaign for activity at its venue and list merchants or
branches that are excluded:

- The origin is Nangang LaLaport.
- The eligibility mode is that Outlet.
- The promotion can be considered for a merchant when the user selects that
  Outlet or a Merchant branch associated with it.
- A Merchant or branch in the structured exclusion list is never recommended
  for that campaign.
- The administrator-authored terms note can also show the official exclusion
  wording; free text is not the mechanism used to enforce exclusions.

### Existing general campaign

A Merchant-wide campaign remains applicable to the Merchant when no branch is
selected. Existing reward rules continue to be returned as before.

## Data Model

### Outlet and MerchantBranch

Add `Outlet` as the shopping venue catalog. Each physical venue has its own
stable identity, normalized unique name, and optional free-form address/location.
For example, Nangang LaLaport and Taichung LaLaport are separate Outlet
records, even if they share a brand.

Rename the current `MerchantOutlet` concept to `MerchantBranch`. A branch
belongs to exactly one Merchant and can optionally reference one Outlet. Its
name is unique within that Merchant after normalization. An Outlet can contain
branches from many Merchants.

Existing `MerchantOutlet` rows represent branches, not venues. Preserve their
physical SQLite table and foreign-key columns with Prisma `@@map`/`@map`
annotations while exposing the corrected `MerchantBranch`/`branchId` names in
application code. This avoids copying or renumbering existing branch records.
Existing `RewardRule.outletId` and `PromotionDraft.outletId` values continue to
refer to those same branch records.

Branch and Outlet records retain optional location/address text so a future UI
can distinguish similarly named branches. This phase does not add structured
address validation, geocoding, distance search, location permissions, or
automatic branch selection.

### Promotion

Add a canonical `Promotion` entity created only when an imported draft is
published. A Promotion stores:

- Origin kind and exactly one origin reference: Merchant or Outlet.
- Benefit kind and value: percentage cashback or fixed cash discount.
- Minimum spend, validity period, reviewer-authored terms, source URL, and
  source attribution.
- Eligibility mode:
  - Merchant-wide;
  - an explicit list of Merchant branches; or
  - an Outlet venue.
- Structured excluded Merchants and excluded Merchant branches.
- The link to its source draft. Its lifecycle is represented by the draft's
  `published` state; an unpublished draft does not create a Promotion.

The scope and origin are separate. A Merchant-origin promotion can be
Merchant-wide or limited to an explicit branch list. An Outlet-origin
promotion applies at that Outlet, subject to structured Merchant and branch
exclusions. The source text remains available for human verification.

### Payment methods and legacy rules

A Promotion can identify one or more payment methods supported by its terms.
When recommending a payment method for a selected Merchant, the existing
merchant-payment-acceptance mapping remains mandatory. A venue campaign does
not imply that every Merchant accepts every payment method.

Existing `RewardRule` rows remain valid and are still included in
recommendations. Publishing a new imported draft creates a Promotion rather
than a standalone Merchant-only RewardRule. A source draft may produce exactly
one published record: existing drafts already linked to a legacy RewardRule
remain legacy records, while newly published drafts link to one Promotion and
do not also create a RewardRule.

## Import and Review Flow

Source adapters continue to create `PromotionDraft` records and must not
publish directly. An administrator reviews the source and explicitly sets:

- Origin kind and Merchant or Outlet.
- Benefit type/value, threshold, validity, note, and source URL.
- Eligibility mode, eligible branches if branch-limited, and excluded
  Merchants/branches for Outlet-origin campaigns.
- Payment methods to which the terms apply.

Publishing validates that:

- The draft is pending review.
- Exactly one valid origin exists.
- A Merchant-origin branch list contains only branches of that Merchant.
- An Outlet-origin campaign references a valid Outlet; any explicitly selected
  excluded branch belongs to that Outlet.
- The benefit values and dates are valid.
- For each recommended Merchant/payment-method combination, the Merchant
  acceptance mapping exists.
- Excluded Merchants/branches always override the Promotion's broad venue
  scope.

Publishing creates the Promotion and marks the draft published atomically. A
validation error leaves the draft pending.

### Recovering rejected drafts

Add an explicit **Reopen for review** action for rejected drafts. Reopening
changes the state to `pending_review`, does not create a Promotion, keeps the
previous rejection reason visible as context, and clears the finalized review
timestamp. Published drafts cannot be reopened. Re-importing the same source
fingerprint continues to update pending drafts only and does not silently
reopen rejected drafts.

## Recommendation Behavior and API

The recommendation request continues to require a Merchant, amount, and date.
It gains optional branch and Outlet context, using stable IDs rather than
ambiguous display-name matching:

- `branch_id`: the Merchant branch where the user plans to pay.
- `outlet_id`: the shopping venue where the user plans to pay.

If both are provided, the branch must belong to the selected Merchant and its
associated Outlet must match the supplied Outlet. Invalid or mismatched context
returns `400`.

Eligibility rules:

- Merchant-wide Promotions can be recommended without a branch or Outlet.
- Branch-limited Merchant Promotions are considered only when the selected
  `branch_id` is in the eligible branch list.
- Outlet Promotions are considered only when the selected `outlet_id` matches
  the Promotion's Outlet, either directly or through the selected branch's
  saved Outlet association. This association is catalog data, not inferred
  from the branch name or user's location.
- Excluded Merchants and branches are filtered before payment method
  acceptance, amount, date, and savings ranking.
- When branch or Outlet context is insufficient to prove eligibility, omit the
  scoped Promotion; do not assume it applies.
- Existing RewardRules continue to follow their current behavior, with the
  current merchant-specific `outletId` interpreted as a Merchant branch ID.

The public UI retains Merchant selection and adds explicit branch and venue
context. Selecting a branch displays its associated venue and makes
branch-specific and venue-specific eligibility unambiguous. A user may select
an Outlet directly when the exact Merchant branch is unknown; venue promotions
can then be evaluated using the selected Outlet and Merchant exclusion list.
Results show the origin, eligibility scope, benefit estimate, terms note, and
official source link. This phase uses explicit user selection only; it does
not infer a user's location or automatically select a likely branch.

Public catalog APIs expose Outlets and Merchant branches. Admin APIs provide
create/list/update operations for both catalogs. Deletion is allowed only when
the catalog record is not referenced by a branch, draft, or Promotion;
otherwise it returns `409`. Draft review APIs accept the origin, eligibility,
payment method, and exclusion fields.

### Future extensibility (not in this phase)

- A future `OutletGroup` (or equivalent) can associate distinct physical
  Outlets with a shared brand or operator. Promotions remain attached to a
  specific Outlet unless a later requirement explicitly introduces
  group-wide eligibility.
- Optional branch/Outlet location fields and stable IDs provide a path to
  richer structured addresses, geocoding, nearby-branch candidate lists, and
  user-confirmed suggestions. Any suggestions must remain explicit selections
  before scoped rewards are applied; location-based inference is not part of
  this phase.
- Catalog and recommendation contracts use stable Outlet and branch IDs, not
  names or addresses, so these future capabilities will not require changing
  promotion identity or eligibility semantics.

## Migration and Compatibility

The current schema has no distinct Outlet entity. The change is an additive,
data-preserving schema update:

1. Create the new `Outlet` model/table.
2. Expose the existing `MerchantOutlet` table as `MerchantBranch` using Prisma
   table/column mappings; do not copy, renumber, or discard its rows.
3. Create Promotion tables and relationships without deleting existing
   RewardRules, ImportRuns, or PromotionDrafts.
4. Keep legacy RewardRule rows and their API response fields compatible.

Do not require deleting `dev.db` or rejecting/re-importing existing drafts as
part of the schema update. Validate the migration against a copy of a database
containing existing merchants, rules, and pending/rejected drafts.

## Error Handling and Safety

- Malformed IDs, mismatched Merchant/branch/Outlet relationships, invalid scope
  combinations, and unsupported benefit values return explicit `400` errors.
- Well-formed IDs for missing drafts/catalog items return `404`; invalid state
  transitions return `409`.
- Outlet exclusions are structured and enforced in recommendation logic.
  Display notes are explanatory only.
- Source URLs must remain HTTPS and rendered source text and names must be HTML
  escaped.
- Existing unauthenticated recommendation access remains read-only. All
  catalog writes, draft review, reopen, and publish operations require the
  Admin API key.

## Testing

Tests must cover:

- Preserving the existing `MerchantOutlet` table rows, branch IDs, Merchant
  relations, rule scope, and draft state through mapped schema changes.
- Creating Outlets and Merchant branches, including a branch associated with
  an Outlet and branches from multiple Merchants in one Outlet.
- Keeping physical Outlets with the same brand as distinct venue records.
- Publishing Merchant-wide, selected-branch, and Outlet-origin Promotions.
- Enforcing structured Merchant and branch exclusions.
- Requiring the Merchant's payment acceptance mapping.
- Recommendations with no context, branch context, Outlet context, and
  mismatched branch/Outlet context.
- Backwards compatibility for existing cashback and fixed-discount RewardRules.
- Reopening a rejected draft, preserving its rejection reason, refusing to
  reopen a published draft, and not reopening rejected drafts on re-import.
- Admin authorization, validation errors, duplicate recommendations, and
  source-link/terms rendering.

## Out of Scope

- Automatically discovering every Merchant or branch inside an Outlet.
- Treating free-text exclusions as machine-readable rules.
- Automatically parsing a source page's eligibility/exclusion text into
  trusted structured data. Administrators verify and enter those lists.
- Authenticated source scraping or automatic publication.
- Geospatial or proximity-based venue matching.
- Outlet brand grouping, address normalization/geocoding, location-permission
  flows, and automatic branch suggestions.
