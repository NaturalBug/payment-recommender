# Card Catalog and Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Admin-managed issuers/cards and recommend a specific card only when its network, issuer, and card satisfy merchant acceptance and promotion targeting.

**Architecture:** Keep `PaymentMethod` as the payment network and preserve non-card methods. Add additive issuer/card and many-to-many scope tables; Admin maintains catalog and merchant restrictions; recommendation service expands accepted networks into eligible cards and applies issuer/card promotion scopes, while legacy network-wide records remain valid.

**Tech Stack:** TypeScript, Express, Prisma, SQLite, Jest, dependency-free browser JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-24-card-model-design.md`

## Global Constraints

- Users do not choose a card; recommendations name the specific card.
- Crawled cards/promotions are to be reviewed before publishing; crawler and scheduler are separate later sub-projects.
- Existing network-only promotions/reward rules and non-card payment methods continue to work.
- Follow repository style: TypeScript, two-space indentation, single quotes, semicolons.

---

### Task 1: Persist issuer, card, merchant, and promotion card scopes

**Files:**
- Modify: `api/prisma/schema.prisma`
- Test: `api/src/tests/cardRepository.test.ts`

**Interfaces:**
- `Card` has `issuerId`, `networkId`, `name`, and `kind` (`credit`, `debit`, or `prepaid`).
- Merchant issuer restrictions are per accepted network; no restriction rows means all issuers are allowed.
- Promotion issuer/card scopes are optional; empty scopes preserve existing network-wide behavior.

- [ ] Add a failing schema integration test that creates an issuer and card linked to a card-network payment method.
- [ ] Run the focused card repository test; confirm it fails because the generated Prisma client/schema has no issuer/card models yet.
- [ ] Add additive Prisma models and relations for issuer/cards, merchant issuer restrictions/card exclusions, and issuer/card scopes on drafts and published promotions.
- [ ] Run `npx prisma format`, `npx prisma generate`, and the focused test file.
- [ ] Run `git diff --check`.

### Task 2: Implement card catalog and merchant card-rule repositories

**Files:**
- Create: `api/src/repositories/cardRepository.ts`
- Test: `api/src/tests/cardRepository.test.ts`

**Interfaces:**
- `listIssuers()`, `createIssuer(name)`, `deleteIssuer(id)`.
- `listCards()`, `createCard({name, kind, issuerId, networkId})`, `deleteCard(id)`.
- `getMerchantCardRules(merchantId)` returns issuer allowlists by network and excluded card IDs.
- `replaceMerchantCardRules(merchantId, rules)` validates accepted networks and referenced catalog IDs, then replaces atomically.

- [ ] Add tests for normalized duplicate issuer rejection, valid card creation, invalid card kind/network/issuer, empty issuer allowlist semantics, excluded cards, and restriction to unaccepted network rejection.
- [ ] Run the focused repository tests and confirm failures.
- [ ] Implement repository functions with explicit not-found/conflict/validation errors and transactional rule replacement.
- [ ] Run focused tests and API build.

### Task 3: Expose Admin APIs and maintain catalog/restrictions in Admin UI

**Files:**
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/tests/adminRoutes.test.ts`
- Modify: `web/admin.html`
- Modify: `web/admin.js`
- Modify: `web/styles.css`

**Interfaces:**
- `GET/POST/DELETE /api/admin/issuers`
- `GET/POST/DELETE /api/admin/cards`
- `GET/PUT /api/admin/merchants/:merchantId/card-rules`
- Card creation payload: `{ name, kind, issuerId, networkId }`.
- Card rules payload: `{ issuerIdsByNetwork: Record<number, number[]>, excludedCardIds: number[] }`.

- [ ] Add route tests for authentication, valid creation/listing/deletion, and rejected invalid rules.
- [ ] Add a Catalog section for issuer/card maintenance and merchant acceptance controls in the existing Admin page.
- [ ] Wire form loading, validation, save, and visible API errors following existing Admin patterns.
- [ ] Run API route tests, `node --check web/admin.js`, and `git diff --check`.

### Task 4: Apply issuer/card eligibility and return named card recommendations

**Files:**
- Modify: `api/src/services/recommendationService.ts`
- Modify: `api/src/repositories/cardRepository.ts`
- Modify: `api/src/tests/recommendationService.test.ts`
- Modify: `web/app.js`

**Interfaces:**
- A recommendation includes `cardId`, `issuerName`, `networkName`, and a payment display name that identifies the card.
- A merchant's accepted network yields its catalog cards, minus issuer restrictions and excluded cards.
- Existing non-card methods are emitted as before. A network with no catalog cards retains network-only legacy recommendation behavior.

- [ ] Add failing service tests for issuer-restricted networks, excluded cards, specific-card output, network-only legacy rewards, and non-card methods.
- [ ] Run focused service tests and confirm failures.
- [ ] Expand each eligible card into a recommendation; apply card acceptance rules before reward/promotion evaluation; preserve legacy no-card fallback.
- [ ] Render issuer/network/card identification in recommendation UI.
- [ ] Run focused service/route tests, `node --check web/app.js`, and API build.

### Task 5: Persist, review, and evaluate promotion issuer/card targeting

**Files:**
- Modify: `api/src/repositories/types.ts`
- Modify: `api/src/repositories/promotionRepository.ts`
- Modify: `api/src/repositories/promotionImportRepository.ts`
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/services/recommendationService.ts`
- Modify: `web/admin.js`
- Modify: `api/src/tests/promotionImportRepository.test.ts`
- Modify: `api/src/tests/recommendationService.test.ts`

**Interfaces:**
- Draft/published promotion records expose `issuerIds: number[]` and `cardIds: number[]`.
- Empty issuer/card arrays mean no card-specific restriction.
- Admin review saves these scopes and existing reviewed promotions can still be published unchanged.

- [ ] Add failing tests for draft scope round-trip, publish persistence, issuer-targeted promotion, card-targeted promotion, and legacy network-only promotion.
- [ ] Run the focused tests and confirm failures.
- [ ] Wire scope fields through draft validation, persistence, serialization, review form, and published promotion repository.
- [ ] Filter card-expanded promotion recommendations by optional issuer/card scopes.
- [ ] Run API tests covering promotion import and recommendation, then API build.

### Task 6: Verify end-to-end behavior and document the operator workflow

**Files:**
- Modify: `README.md`
- Test: `api/src/tests/recommendationService.test.ts`
- Test: `api/src/tests/adminRoutes.test.ts`

- [ ] Document creating issuers/cards, configuring merchant restrictions, and interpreting card-specific recommendation output.
- [ ] Run `npm run test:api`.
- [ ] Run `npm run build --workspace api`.
- [ ] Run `node --check web/app.js && node --check web/admin.js`.
- [ ] Run `git diff --check` and inspect `git status --short`.
