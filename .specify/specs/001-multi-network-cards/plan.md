# Implementation Plan: Multi-Network Cards

**Spec**: [spec.md](spec.md) | **Branch**: `feature/multi-network-cards`

## Approach

Replace `Card.networkId` with a `CardNetwork` join table (`cardId`, `networkId`, composite PK, FK to
`PaymentMethod` with `Restrict`, FK to `Card` with `Cascade`). Cards expose `networkIds: number[]`.
The recommender already works per (payment method, card) pair, so it expands a card into one entry
per accepted network; existing promotion/rule filtering by payment method is unchanged.

## Boundaries (Constitution IV / Delivery Workflow)

- **Persistence**: `api/prisma/schema.prisma`; new pre-push migration `api/prisma/migrateCardNetworks.ts`
  that creates `CardNetwork`, copies each card's `networkId`, and rebuilds `Card` without the column.
  `db:push` runs it after the existing payment-method backfill. Provider-specific SQL stays confined
  to this one-off SQLite migration script, as with the existing backfill.
- **API**: `cardRepository` (validation: >=1 network, unique, credit-card only; list returns `networkIds`),
  `POST /api/admin/cards` accepts `networkIds`.
- **Service**: `recommendationService` builds `cardsByNetworkId` by iterating `card.networkIds`;
  `networkName` comes from the line's network, not the card.
- **UI**: Admin card form uses a multi-select/checkbox list of credit-card networks; card table lists
  all network names. Merchant card-rules UI is per network already and only needs the card list shape.

## Decisions

- Recommendation output format is unchanged: `${issuer} ${card} (${network})`, one line per network.
- Network removal from an existing card is out of scope (no card update endpoint exists today).
- Docs: README card-model section updated.

## Verification

`npm run test:api`, `npm run build --workspace api`, `node --check web/app.js && node --check web/admin.js`,
migration test against a legacy-shaped temporary DB.
