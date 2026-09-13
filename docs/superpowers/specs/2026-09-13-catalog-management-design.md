# Catalog Management Completion Design

## Goal

Complete the administrator-maintained payment catalog so an administrator can
manage merchants, payment methods, and the payment methods accepted by each
merchant. The public recommendation page must load the full merchant catalog
without an administrator credential.

This makes the existing merchant-first recommendation flow usable beyond its
seed data: a newly created merchant can be configured with accepted payment
methods and reward rules, then queried from the public page.

## Scope

In scope:

- Public, read-only merchant catalog access for the recommendation page.
- Create, edit, and protected deletion of merchants.
- Create, edit, and protected deletion of payment methods.
- Management of merchant-to-payment-method acceptance relationships.
- Compatibility with existing reward-rule creation and legacy payment method
  identifiers.
- API and service test coverage for the new management flow and validation.

Out of scope:

- User accounts, favorites, transaction history, and personalization.
- Payment processing or storage of payment credentials.
- Importing reward data from bank or payment-provider feeds.
- Bulk replacement of the whole catalog.

## Existing Data Model

No new database table is needed. The existing Prisma models already represent
the required structure:

- `Merchant` stores each merchant.
- `PaymentMethod` stores each payment method and its type.
- `MerchantPaymentAcceptance` joins a merchant to a payment method.
- `RewardRule` associates a merchant and payment method with a valid reward.

`MerchantPaymentAcceptance` and `RewardRule` remain independent. A merchant
may accept a payment method with no current reward rule; this reflects a valid
way to pay that is not currently recommendable.

## API Design

### Public catalog

Add `GET /api/merchants`, without an administrator API key. It returns the
merchant catalog needed by the public recommendation form. The endpoint is
read-only and exposes only the data necessary to select a merchant.

The public page uses this endpoint instead of `/api/admin/merchants`, which
correctly remains protected by `X-Admin-API-Key`.

### Administrator catalog

Keep all catalog mutations under the existing `/api/admin` authentication
middleware.

- Merchant management gains update and delete endpoints in addition to the
  existing list and create endpoints.
- Payment method management provides list, create, update, and delete
  endpoints. A method has a unique name and a type.
- Acceptance management provides read, add, and remove operations for a
  merchant/payment-method pair.

The browser UI sends resource identifiers supplied by the catalog API rather
than relying on a hard-coded payment-method list. Reward-rule creation accepts
the current legacy payment method identifiers as well as a catalog payment
method identifier, preserving current API consumers while allowing newly
created payment methods to be selected.

## Management UI Flow

The administration page has three ordered catalog areas:

1. Merchants: create, rename, and delete a merchant.
2. Payment methods: create with a name and type, edit either field, and
   delete a method.
3. Accepted payment methods: select a merchant and check or uncheck the
   payment methods that it accepts.

An administrator can therefore configure a new merchant in this order:

1. Create the merchant if needed.
2. Create any missing payment methods.
3. Mark the payment methods the merchant accepts.
4. Create reward rules for the applicable accepted payment methods.

The public form loads the public merchant catalog. It displays only valid,
reward-bearing payment recommendations for the selected merchant, amount, and
date. If a merchant has no valid reward rules, it displays the existing clear
empty state rather than presenting payment methods without rewards as
recommendations.

## Integrity and Error Handling

All editable names are trimmed and normalized according to the existing
normalization rules. Duplicate merchant names and duplicate payment-method
names return `409 Conflict`. Invalid or incomplete input returns `400`; a
missing resource returns `404`; existing administrator authentication behavior
remains `401` for a missing key and `403` for an invalid key.

Deletion is protective rather than cascading:

- A merchant cannot be deleted while it has acceptance relationships or reward
  rules.
- A payment method cannot be deleted while it has acceptance relationships or
  reward rules.
- An acceptance relationship cannot be removed while reward rules reference
  that merchant/payment-method pair.

Each rejected deletion returns `409 Conflict` with a readable explanation, so
the administrator can remove or modify dependent reward rules intentionally.
No operation silently deletes promotions or makes them ineligible for
recommendations.

## Component Boundaries

- Routes perform request parsing, authorization-bound HTTP responses, and
  status-code mapping.
- Repositories provide merchant, payment-method, and acceptance CRUD plus the
  dependency checks required for protected deletion.
- The recommendation service continues to combine accepted payment methods
  with valid reward rules. It does not contain administration behavior.
- The public and administrator browser scripts call their respective public or
  authenticated APIs and render returned catalog data.

## Testing

Add or extend tests to cover:

- Public merchant-list access without an administrator key.
- Merchant and payment-method create, update, and delete behavior.
- Duplicate-name, missing-resource, invalid-input, and authentication errors.
- Protected deletion for merchants, payment methods, and acceptance
  relationships with dependent data.
- The full positive path: create merchant, create or select payment method,
  add acceptance, create reward rule, and receive a recommendation.
- A supported payment method without a reward rule is accepted in the catalog
  but omitted from recommendations.
- JavaScript syntax checks after browser script changes.

## Success Criteria

- Administrators can maintain merchants, payment methods, and merchant
  acceptance mappings without direct database access.
- Newly configured merchants can appear in the public selector and produce
  recommendations once their valid reward rules are entered.
- Dependent catalog data cannot be accidentally deleted through the UI or API.
- Existing recommendation behavior and existing legacy reward-rule inputs
  remain functional.
