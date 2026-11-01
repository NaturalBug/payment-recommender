# Card Model Design (Draft for review)

Status: approved for phase 1 implementation.

## Problem

`PaymentMethod` is flat ("VISA"). It cannot express issuers, merchants that accept
a card network only for certain issuers, cards a merchant refuses, or promotions
tied to an issuer/card. Wallet (JKOPAY, iPASS MONEY) bank/card-binding promotions
are out of scope for phase 1 but must fit the model later.

## Model

- `Issuer`: bank name (unique).
- `PaymentMethod` continues to represent a card network (VISA, Mastercard, JCB, UnionPay).
- `Card`: issuer, network (`PaymentMethod`), name, kind (credit | debit | prepaid); unique (issuer, name).
- Non-card methods (cash, wallets) stay as `PaymentMethod`.
- `PaymentMethod` of type card-network is kept as the coarse "VISA" entry for
  backward compatibility with existing acceptance rows and promotions.

## Acceptance rules (merchant)

A merchant accepts a network (existing acceptance row) plus optional:
- `allowedIssuers` (default: all issuers),
- `excludedCards` (default: none).
A card is accepted iff its network is accepted, its issuer is allowed, and it is not excluded.

## Promotion targeting

Promotion payment scope gets optional issuer and card filters, same semantics:
network (existing) AND issuer in set (if set) AND card in set (if set).
Phase 2 reuses this for wallet bank/card binding (wallet method + required issuer/card).

## Recommendation flow

1. User does not pick a card; they choose the merchant and amount.
2. Candidate methods are the merchant's accepted cards and non-card payment methods.
3. Promotions apply when the card satisfies the scope above.
4. Legacy network-only reward rules/promotions apply to every eligible card of that network.

## Admin

New Catalog sections: Issuers, Cards. Merchant acceptance editor gains issuer allowlist
and excluded cards per network. Promotion review gains issuer/card filters.

## Migration

Additive tables only; existing PaymentMethod rows, acceptance rows, and promotions
keep working unchanged (no issuer filter = all issuers).

## Testing

Service tests: issuer allowlist, excluded card, promotion issuer/card filter, legacy
network-only behavior. Repository/route tests for the new catalog endpoints.

## Confirmed decisions (2026-10-24)

- Users do NOT pick a card. They pick merchant (and amount); the system recommends
  which card/wallet to pay with. Recommendation output names a specific card.
- Card catalog and card promotions are populated by crawling major banks (not hand-seeded).
- A scheduled job re-crawls promotions periodically.

## Sub-projects (each gets its own plan)

1. Card model + acceptance/promotion filters + recommendation returning cards (this spec).
2. Bank card catalog crawler (Issuer/Card ingestion, reviewed via existing import-review flow).
3. Scheduled promotion crawl job (reuses draft/review pipeline, adds scheduler and change detection).
4. Wallet bank/card-binding promotions (JKOPAY, iPASS MONEY).

## Confirmed decisions

- Crawled cards/promotions enter Admin review before publication, reusing the existing review workflow.
- Initial card records may be entered manually to validate recommendation behavior before bank crawling is implemented.
- The initial bank list and crawler sources are decided in the bank-crawler sub-project.
- Card-level cashback is represented as a promotion scoped to an issuer or card.
