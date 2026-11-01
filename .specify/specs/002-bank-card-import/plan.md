# Implementation Plan: Bank Card Catalog and Reward Import

**Spec**: [spec.md](spec.md) | **Branch**: `feature/bank-card-import` | **Status**: Draft, awaiting product-owner decisions

## Source feasibility (checked 2026-11-01, unauthenticated GET, no script execution)

| Bank | Result | Implication |
|------|--------|-------------|
| Taishin | Server-rendered. Overview `/TSB/personal/credit/intro/overview/` links every card detail page (`.../cgNNN/cardNNN/`); detail page has the card name in `<h1>`/`og:title`. Networks appear only in free text (Visa/Mastercard/JCB). | Automated import is feasible. Networks are a heuristic suggestion that the reviewer confirms (FR-003). |
| First Bank | The credit-card URL returns an access-denied (WAF) page to automated clients. | Cannot be imported automatically without bypassing an access control, which the spec forbids (Assumptions, FR-009). |
| Far Eastern (FEIB) | Page is a script-rendered shell; card data is loaded by JavaScript from endpoints that are not documented. | A plain fetch yields no cards. Needs a decision (below); not scraped via undocumented endpoints without approval. |
| Cathay / CTBC / E.SUN (proposed) | Cathay and CTBC are script-rendered shells; E.SUN's guessed URL returned 404 (right URL not yet found). | Not first-release candidates; revisit per bank. |

## Proposed approach

1. **Adapter model**: a `BankSourceAdapter` (per bank: issuer name, allowed hosts/paths, `listCards()`, `listPromotions()`) mirroring the existing `PromotionSourceAdapter`, so runs, fingerprints, and failures reuse `ImportRun`.
2. **Card drafts**: new `CardDraft` (+ `CardDraftNetwork`) with status, fingerprint, source URL/time, and review fields, parallel to `PromotionDraft`. Publishing creates/matches the `Issuer` and creates the `Card` with `CardNetwork` rows in one transaction; unmatched networks block publishing. Dedup by `(issuer, normalized card name)`; rejected fingerprints are not resurfaced; changed fields on an existing card become a reviewable "update" draft.
3. **Card-scoped promotions**: adapter output feeds the existing `PromotionDraft` with `issuerIds`/`cardIds` pre-filled; unresolved card names stay flagged and block publishing; reviewer picks the network payment method for multi-network cards (already supported by promotion scopes).
4. **Manual file import (fallback for blocked or script-rendered banks)**: an Admin-authenticated endpoint/CLI that accepts a reviewed JSON file of cards and promotions with the same shape the adapters emit, creating the same drafts. Works for any bank without touching its site, and keeps First Bank and FEIB in scope.
5. **Admin UI**: a Cards review tab beside the existing promotion drafts, reusing its layout and patterns; CLI `import:cards --bank <bank>` mirroring `import:promotions`.
6. **Boundaries**: persistence (Prisma + `cardDraftRepository`), service (`cardImportService`), importers (`importers/banks/*`), routes (`/api/admin/card-drafts*`, thin), UI (`web/admin.*`). Tests: saved HTML fixtures per bank, red-green per task; targeted tests, API build, `node --check` before review.

## Decisions needed before tasks.md

1. **First Bank**: accept the manual-file path (approach 4) instead of automated fetching? (Recommended.) Alternative: skip First Bank this round.
2. **Far Eastern**: choose manual-file import (recommended), or approve using the site's own JSON endpoints discovered from its pages (fragile and not officially documented).
3. **Extra banks**: keep first release to the three named banks (recommended), or add Cathay / CTBC / E.SUN via manual file.

## Constitution check

Typed layered API, admin-auth endpoints, explicit failures, no committed DB/secrets, catalog IDs in contracts: satisfied by the approach. Delivery: Spec Kit artifacts first, then Superpowers worktree TDD; `/speckit-implement` is not used.
