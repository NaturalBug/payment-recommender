# Promotion Scope and Venue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate shopping Outlets from Merchant branches and support Merchant- or Outlet-origin promotions, structured exclusions, safe draft recovery, and context-aware recommendations without losing existing data.

**Architecture:** Preserve the existing SQLite `MerchantOutlet` table and foreign-key columns through Prisma mappings while exposing them as Merchant branches in application code. Add physical Outlet and Promotion records plus explicit join tables for payment methods, eligible branches, and exclusions; keep import adapters as draft-only and create Promotions only on publish. Recommendations continue returning legacy reward rules and additionally evaluate Promotions against explicitly supplied Merchant, branch, and Outlet IDs.

**Tech Stack:** TypeScript, Express 5, Prisma 5, SQLite, Jest, Supertest, dependency-free browser JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-16-promotion-scope-design.md`

## Global Constraints

- Preserve the existing `MerchantOutlet` SQLite table and foreign-key columns using Prisma `@@map`/`@map`; do not copy, renumber, or discard its rows.
- Do not require deleting `dev.db` or rejecting/re-importing existing drafts as part of the schema update.
- Keep existing `RewardRule` rows and API response fields compatible.
- Use stable Outlet and branch IDs, not names or addresses, in catalog and recommendation contracts.
- This phase uses explicit user selection only; it does not infer a user's location or automatically select a likely branch.
- All catalog writes, draft review, reopen, and publish operations require the Admin API key.
- Import adapters create drafts only; only reviewed and published drafts create Promotions.
- Free-text notes are explanatory only; structured exclusions control eligibility.

---

## File Map

| File | Responsibility |
|---|---|
| `api/prisma/schema.prisma` | Map legacy branch storage and define Outlets, Promotions, review selections, and exclusion relations. |
| `api/src/repositories/types.ts` | Typed records and review inputs for branches, Outlets, Promotions, and draft state. |
| `api/src/repositories/merchantOutletRepository.ts` | Rename/rework as `merchantBranchRepository.ts` while preserving the old table mapping. |
| `api/src/repositories/outletRepository.ts` | Outlet CRUD and stable-ID lookup. |
| `api/src/repositories/promotionRepository.ts` | Persist and retrieve published Promotion records and their scope joins. |
| `api/src/repositories/promotionImportRepository.ts` | Save draft scope selections, reopen rejected drafts, and atomically publish Promotions. |
| `api/src/routes/admin.ts` | Protected Outlet/branch catalog, draft review/reopen, and publication endpoints. |
| `api/src/routes/merchants.ts` | Public Outlet/branch catalog reads. |
| `api/src/routes/outlets.ts` | Public Outlet catalog and branches-in-Outlet reads. |
| `api/src/routes/recommendations.ts` | Validate and pass `branch_id`/`outlet_id` context. |
| `api/src/services/recommendationService.ts` | Combine legacy RewardRules and eligible Promotions, enforce exclusions, and rank benefits. |
| `api/src/tests/promotionScopeMigration.test.ts` | Verify new schema push preserves a legacy SQLite catalog, branch IDs, rules, and drafts. |
| `api/src/tests/adminRoutes.test.ts` | Outlet/branch APIs, scope validation, publish, and reopen behavior. |
| `api/src/tests/promotionImportRepository.test.ts` | Scope persistence, publication transaction, and safe state transitions. |
| `api/src/tests/recommendationService.test.ts` | Merchant/branch/Outlet eligibility, exclusions, and legacy compatibility. |
| `api/src/tests/recommendationRoutes.test.ts` | Recommendation context validation and HTTP behavior. |
| `web/admin.html`, `web/admin.js`, `web/styles.css` | Manage physical Outlets and merchant branches, review scopes/exclusions, and reopen drafts. |
| `web/index.html`, `web/app.js`, `web/styles.css` | Explicit Merchant, branch, and Outlet context plus source/scope rendering. |
| `README.md` | Explain the corrected Outlet/branch terms, promotion behavior, recovery, and setup. |
| `docs/superpowers/specs/2026-10-16-promotion-scope-design.md` | Source of truth for expected behavior. |

Keep repository responsibilities separated: catalog repositories validate/persist catalog records, promotion persistence owns scope joins and state transitions, route handlers parse HTTP values, and the recommendation service applies business eligibility.

## Task 1: Preserve Existing Branch Storage and Add Outlet Schema

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/src/tests/promotionScopeMigration.test.ts`
- Create: `api/src/tests/fixtures/promotion-scope-legacy.prisma`

**Interfaces:**
- `MerchantBranch` exposes `id`, `merchantId`, `name`, `normalizedName`, optional `location`, and optional `outletId`.
- Existing physical table remains `MerchantOutlet` through `@@map("MerchantOutlet")`.
- Existing `RewardRule.outletId` and `PromotionDraft.outletId` columns remain mapped to the new application property `branchId` with `@map("outletId")`.
- `Outlet` has stable `id`, `name`, `normalizedName`, optional `location`, and relations to branches/promotions.

- [ ] **Step 1: Write the legacy database preservation test**

Create a temporary database from a fixture copy of the current pre-promotion-scope `schema.prisma`. Seed one Merchant, PaymentMethod, acceptance, MerchantOutlet with a known ID, RewardRule referencing that row, and PromotionDraft referencing the same row. Use raw SQL through a temporary `PrismaClient` so the test does not need to regenerate or replace the workspace client.

```ts
test('preserves existing merchant branch IDs and references when adding Outlet schema', async () => {
  const result = await migrateLegacyFixture();
  expect(result).toEqual({
    branch: { id: 41, merchantId: 7, name: 'Nangang branch' },
    rewardBranchId: 41,
    draftBranchId: 41,
    outletCount: 0
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the intended schema mismatch**

Run: `cd api && npm test -- --runInBand src/tests/promotionScopeMigration.test.ts`
Expected: FAIL because the current Prisma model has no `Outlet`/`MerchantBranch` mapped schema expected by the migration fixture.

- [ ] **Step 3: Implement mapped branch and Outlet Prisma models**

Rename the Prisma model to `MerchantBranch`, add `@@map("MerchantOutlet")`, and map application `branchId` fields back to existing `outletId` columns where legacy RewardRules and drafts reference branches. Add an optional `outletId` on a branch for the physical shopping venue, using a distinct physical column (for example `venueId`) to avoid confusing the legacy branch-reference column. Add Outlet relations and address/location text; do not add Outlet grouping or geospatial columns.

- [ ] **Step 4: Run the migration preservation test**

Run: `cd api && npm test -- --runInBand src/tests/promotionScopeMigration.test.ts`
Expected: PASS; branch primary keys and RewardRule/PromotionDraft references remain `41`, no Outlet rows are fabricated, and the new schema is additive.

- [ ] **Step 5: Verify schema generation and build**

Run: `cd api && npx prisma validate && npm run build`
Expected: schema validates and TypeScript build passes.

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma api/src/tests/promotionScopeMigration.test.ts
git commit -m "feat(api): model venues and merchant branches"
```

## Task 2: Add Outlet and Merchant Branch Catalog APIs

**Files:**
- Create: `api/src/repositories/merchantBranchRepository.ts`
- Create: `api/src/repositories/outletRepository.ts`
- Modify: `api/src/repositories/types.ts`
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/routes/merchants.ts`
- Create: `api/src/routes/outlets.ts`
- Modify: `api/src/app.ts`
- Modify: `api/src/tests/adminRoutes.test.ts`

**Interfaces:**
- `listMerchantBranches(merchantId: number): Promise<MerchantBranchRecord[]>`
- `createMerchantBranch(input: { merchantId: number; name: string; location?: string; outletId?: number | null }): Promise<MerchantBranchRecord>`
- `listOutlets(): Promise<OutletRecord[]>`
- `createOutlet(input: { name: string; location?: string }): Promise<OutletRecord>`
- Public reads: `GET /api/outlets`, `GET /api/outlets/:outletId/branches`, and `GET /api/merchants/:merchantId/branches`.
- Admin reads: `GET /api/admin/outlets` and `GET /api/admin/merchants/:merchantId/branches`.
- Admin writes: `POST /api/admin/outlets` and `POST /api/admin/merchants/:merchantId/branches`.

- [ ] **Step 1: Write API tests for multiple merchants in one Outlet and same-brand physical venues**

Add tests that create distinct Nangang and Taichung LaLaport Outlet records, add branches from two merchants to Nangang, and assert the venue list and branch associations use IDs and do not merge by brand/name similarity.

```ts
test('lists branches from multiple merchants under one physical Outlet', async () => {
  const response = await request(app).get(`/api/outlets/${outlet.id}/branches`);
  expect(response.body.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ merchantId: firstMerchant.id, outletId: outlet.id }),
    expect.objectContaining({ merchantId: secondMerchant.id, outletId: outlet.id })
  ]));
});
```

- [ ] **Step 2: Run the catalog tests and confirm the missing API behavior**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts`
Expected: FAIL because Outlet and Merchant branch routes/repositories are not implemented.

- [ ] **Step 3: Implement repositories and routes**

Enforce normalized Outlet name uniqueness across the catalog and Merchant branch name uniqueness within each Merchant. Validate that an optional Outlet exists and that branch creation references an existing Merchant. Return explicit `400`, `404`, and `409` responses following current route patterns. Keep the existing `/:merchantId/outlets` endpoint as a deprecated alias returning Merchant branches during this release; new Admin and public UI code uses the `/branches` paths.

- [ ] **Step 4: Run catalog tests**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts`
Expected: PASS for Outlet/branch catalog behavior and existing Merchant APIs.

- [ ] **Step 5: Commit**

```bash
git add api/src/repositories/merchantBranchRepository.ts api/src/repositories/outletRepository.ts api/src/repositories/types.ts api/src/routes/admin.ts api/src/routes/merchants.ts api/src/routes/outlets.ts api/src/app.ts api/src/tests/adminRoutes.test.ts
git commit -m "feat(api): add outlet and branch catalogs"
```

## Task 3: Persist Promotion Draft Scope and Restore Rejected Drafts

**Files:**
- Modify: `api/prisma/schema.prisma`
- Modify: `api/src/repositories/types.ts`
- Modify: `api/src/repositories/promotionImportRepository.ts`
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/tests/promotionImportRepository.test.ts`
- Modify: `api/src/tests/adminRoutes.test.ts`

**Interfaces:**
- Draft review fields: `originType: 'merchant' | 'outlet'`, `originMerchantId`, `originOutletId`, `eligibilityType: 'merchant_wide' | 'selected_branches' | 'outlet'`, `eligibleBranchIds: number[]`, `excludedMerchantIds: number[]`, `excludedBranchIds: number[]`, and `paymentMethodIds: number[]`.
- `reopenPromotionDraft(id: number): Promise<PromotionDraftRecord | null>` reopens only rejected drafts, preserving `rejectionReason` as reviewer context and clearing the active `reviewedAt`.
- Admin endpoint: `POST /api/admin/promotion-drafts/:id/reopen`.

- [ ] **Step 1: Write tests for saving draft scope and reopening**

Test persisting eligible branches/exclusion lists across list/reload, reopening a rejected draft without changing source identity or benefit fields, conflict on published/pending drafts, and re-import of a rejected fingerprint remaining rejected.

```ts
test('reopens a rejected draft without losing its rejection reason or source fingerprint', async () => {
  const reopened = await reopenPromotionDraft(draft.id);
  expect(reopened).toMatchObject({
    status: 'pending_review',
    rejectionReason: 'Rejected by mistake',
    sourceFingerprint: draft.sourceFingerprint,
    reviewedAt: null
  });
});
```

- [ ] **Step 2: Run tests to verify they fail for missing relations and transition**

Run: `cd api && npm test -- --runInBand src/tests/promotionImportRepository.test.ts src/tests/adminRoutes.test.ts`
Expected: FAIL because the draft has no persisted scope relations and no reopen operation.

- [ ] **Step 3: Add draft origin, eligibility, payment-method, and exclusion relations**

Use explicit join models for eligible branches, excluded merchants, excluded branches, and payment methods. Validate uniqueness and ownership at the repository boundary. Imported drafts keep origin and eligibility unset until an administrator selects and saves them; never infer trusted scope from scraped prose.

- [ ] **Step 4: Implement `reopenPromotionDraft` and protected route**

Use a conditional update requiring `status = 'rejected'`; return 404 for missing drafts and 409 when status is not rejected. Keep the rejection reason visible until the administrator edits/rejects again. Re-import logic remains unchanged and does not automatically reopen rejected records.

- [ ] **Step 5: Run draft persistence and route tests**

Run: `cd api && npm test -- --runInBand src/tests/promotionImportRepository.test.ts src/tests/adminRoutes.test.ts`
Expected: PASS, including existing import idempotency tests.

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma api/src/repositories/types.ts api/src/repositories/promotionImportRepository.ts api/src/routes/admin.ts api/src/tests/promotionImportRepository.test.ts api/src/tests/adminRoutes.test.ts
git commit -m "feat(api): persist promotion review scope"
```

## Task 4: Publish Drafts as Canonical Promotions

**Files:**
- Create: `api/src/repositories/promotionRepository.ts`
- Modify: `api/prisma/schema.prisma`
- Modify: `api/src/repositories/types.ts`
- Modify: `api/src/repositories/promotionImportRepository.ts`
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/tests/promotionImportRepository.test.ts`
- Modify: `api/src/tests/adminRoutes.test.ts`

**Interfaces:**
- `PromotionRecord` exposes origin, eligibility mode, benefits, dates, user-facing terms, source attribution, payment method IDs, eligible branch IDs, excluded Merchant IDs, and excluded branch IDs.
- `publishPromotionDraft(id: number): Promise<{ draft: PromotionDraftRecord; promotion: PromotionRecord }>` creates one Promotion and changes the draft to published atomically.

- [ ] **Step 1: Add publish tests for Merchant branches and Outlet exclusions**

Test a Merchant-origin campaign limited to a positive list of Sanyou branch IDs and an Outlet-origin LaLaport campaign excluded from a specified Merchant. Verify a Merchant outside the exclusions can receive the promotion only in the selected Outlet, while the excluded Merchant cannot.

- [ ] **Step 2: Run the publication tests and verify the current RewardRule-only path fails**

Run: `cd api && npm test -- --runInBand src/tests/promotionImportRepository.test.ts`
Expected: FAIL because publication currently creates only a Merchant-bound RewardRule and cannot persist origin/scope joins.

- [ ] **Step 3: Add Promotion and published-scope join models/repository**

Add Promotion fields for source draft, origin, benefit, threshold, validity, terms, and source URL. Add payment-method, eligible-branch, excluded-Merchant, and excluded-branch joins. Enforce unique source-draft linkage so publication cannot create duplicate Promotions.

- [ ] **Step 4: Change publish transaction**

In one Prisma transaction, validate draft state, one origin, scope ownership, benefit values, and that every selected payment method exists; create Promotion and all joins; then mark the draft published. Any error must roll back both promotion and status change. At recommendation time, require the selected Merchant/payment method acceptance mapping. Existing RewardRules remain untouched.

- [ ] **Step 5: Run publish tests and API build**

Run: `cd api && npm test -- --runInBand src/tests/promotionImportRepository.test.ts src/tests/adminRoutes.test.ts && npm run build`
Expected: PASS; failed validation leaves the draft pending and creates no Promotion.

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma api/src/repositories/promotionRepository.ts api/src/repositories/types.ts api/src/repositories/promotionImportRepository.ts api/src/routes/admin.ts api/src/tests/promotionImportRepository.test.ts api/src/tests/adminRoutes.test.ts
git commit -m "feat(api): publish scoped promotions"
```

## Task 5: Evaluate Promotions in Recommendations

**Files:**
- Modify: `api/src/services/recommendationService.ts`
- Modify: `api/src/routes/recommendations.ts`
- Modify: `api/src/repositories/promotionRepository.ts`
- Modify: `api/src/repositories/types.ts`
- Modify: `api/src/tests/recommendationService.test.ts`
- Create: `api/src/tests/recommendationRoutes.test.ts`

**Interfaces:**
- Recommendation input adds `branch_id?: number` and `outlet_id?: number`.
- Existing Merchant/amount/date fields and legacy RewardRule response fields remain compatible.
- Promotion evaluation requires Merchant payment acceptance and filters scope/exclusions before amount/date checks and savings ranking.

- [ ] **Step 1: Write tests for all three scopes and structured exclusions**

Cover Merchant-wide eligibility without location context, selected-branch eligibility only for an eligible `branch_id`, Outlet eligibility only for the selected physical Outlet, excluded Merchant and branch suppression, branch/Outlet mismatch `400`, and multiple physical LaLaport records not sharing campaigns implicitly.

```ts
test('omits an Outlet promotion when its Merchant is excluded', async () => {
  const results = await getRecommendations({
    merchant_name: 'Sanyou Cosmetics',
    amount: 500,
    date: validDate,
    outlet_id: nangang.id
  });
  expect(results.map((item) => item.sourceUrl)).not.toContain(venuePromotion.sourceUrl);
});
```

- [ ] **Step 2: Run recommendation tests and confirm they fail**

Run: `cd api && npm test -- --runInBand src/tests/recommendationService.test.ts src/tests/recommendationRoutes.test.ts`
Expected: FAIL because the current service only queries RewardRules and the HTTP route rejects/ignores new location context.

- [ ] **Step 3: Implement context validation and eligibility evaluation**

Resolve the Merchant by existing normalization, verify branch ownership and Outlet consistency, load Promotions for candidate payment methods, enforce selected Outlet/branch scope and exclusions, then apply dates, threshold, acceptance, and benefit calculation. A selected branch with a saved Outlet association supplies that Outlet context; do not infer an Outlet from names or user location. Malformed or mismatched IDs return `400`; well-formed IDs for missing catalog records return `404`.

- [ ] **Step 4: Preserve existing response compatibility and deduplicate**

Return the current `Recommendation` fields for legacy RewardRules. For Promotion results, include origin type/name, applicable Outlet/branch context, note, source URL, benefit and threshold. Publication creates a Promotion only, never both a Promotion and RewardRule for the same source draft; the unique source-draft relation prevents duplicate publication.

- [ ] **Step 5: Run targeted recommendation tests**

Run: `cd api && npm test -- --runInBand src/tests/recommendationService.test.ts src/tests/recommendationRoutes.test.ts`
Expected: PASS for scoped and legacy recommendations.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/recommendationService.ts api/src/routes/recommendations.ts api/src/repositories/promotionRepository.ts api/src/repositories/types.ts api/src/tests/recommendationService.test.ts api/src/tests/recommendationRoutes.test.ts
git commit -m "feat(api): recommend venue-scoped promotions"
```

## Task 6: Update Admin Catalog and Draft Review UI

**Files:**
- Modify: `web/admin.html`
- Modify: `web/admin.js`
- Modify: `web/styles.css`
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/tests/adminRoutes.test.ts`

**Interfaces:**
- Admin can create/list physical Outlets and Merchant branches; branch form includes optional Outlet and free-form location/address.
- Draft review saves origin, eligibility, payment methods, eligible branches, excluded Merchants, and excluded branches.
- Rejected drafts display the rejection reason and a **Reopen for review** action.

- [ ] **Step 1: Add API tests for saving and reopening reviewed scope**

Add route-level tests proving the draft review accepts exact origin, eligibility, branch, exclusion, and payment-method fields; assert reloaded draft data contains those selections. Cover the protected reopen action for rejected drafts and conflicts for other statuses. The browser scripts do not have a DOM test framework, so validate their syntax and test their API contracts at the route layer.

- [ ] **Step 2: Run focused tests and confirm new review controls/API fields are absent**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts`
Expected: FAIL for new scope payload and reopen route until implemented.

- [ ] **Step 3: Implement admin UI**

Replace the ambiguous “Merchant outlets” form with distinct **Shopping Outlets** and **Merchant branches** sections. Keep one Outlet record per physical location; do not group same-brand LaLaport locations in this phase. Branch entry accepts optional free-form location/address and optional Outlet association. Draft review includes scope-specific controls: Merchant-wide or selected branch list for Merchant-origin promotions; selected Outlet and explicit excluded Merchant/branch lists for Outlet-origin promotions. Display text notes alongside structured exclusions.

- [ ] **Step 4: Add rejected draft recovery controls**

Render rejected drafts with the existing rejection reason and a button that calls `POST /api/admin/promotion-drafts/:id/reopen`; refresh the pending-review list after success and show API errors explicitly. Do not make re-import the recovery mechanism.

- [ ] **Step 5: Verify syntax and route tests**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts`
Run: `node --check web/admin.js`
Expected: all focused tests pass and script syntax check exits zero.

- [ ] **Step 6: Commit**

```bash
git add web/admin.html web/admin.js web/styles.css api/src/routes/admin.ts api/src/tests/adminRoutes.test.ts
git commit -m "feat(web): review promotion venue scope"
```

## Task 7: Update Public Recommendation UI for Explicit Location Context

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`
- Modify: `api/src/routes/outlets.ts`
- Modify: `api/src/routes/merchants.ts`

**Interfaces:**
- Merchant remains required; branch and physical Outlet are optional selectors whose option values are stable IDs.
- Selecting a Merchant loads only its branches; selecting a branch shows its associated Outlet/location.
- Selecting an Outlet allows venue promotion lookup even when the exact branch is unknown.

- [ ] **Step 1: Implement explicit selectors and source presentation**

Add Merchant branch and Outlet controls. Display optional address/location text to distinguish similar branch names, but do not geocode, request location permissions, rank likely branches, or auto-select a branch. Render promotion origin, venue/branch scope, savings, user-facing exclusions, and official source link with existing escaping/HTTPS checks.

- [ ] **Step 2: Validate UI and API**

Run: `node --check web/app.js && node --check web/admin.js`
Run: `cd api && npm test -- --runInBand src/tests/recommendationRoutes.test.ts`
Expected: PASS with no implicit location inference.

- [ ] **Step 3: Commit**

```bash
git add web/index.html web/app.js web/styles.css api/src/routes/outlets.ts api/src/routes/merchants.ts
git commit -m "feat(web): select merchant branch and venue"
```

## Task 8: Documentation, Full Verification, and Final Review

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-16-promotion-scope-design.md`
- Review all implementation files in Tasks 1–7.

- [ ] **Step 1: Document local setup and behavior**

Update README so schema updates preserve local branch and draft data, define Outlet versus Merchant branch, explain promotion origin/scope and structured exclusions, explain how to reopen a rejected draft, and state that the current UI requires explicit location selection. Do not recommend deleting `dev.db`.

- [ ] **Step 2: Run the complete API suite and build**

Run: `npm run test:api`
Expected: all API suites and tests pass, including schema migration preservation.

Run: `npm run build --workspace api`
Expected: TypeScript build exits zero.

- [ ] **Step 3: Run frontend and whitespace checks**

Run: `node --check web/app.js && node --check web/admin.js && git diff --check`
Expected: all checks exit zero.

- [ ] **Step 4: Review compatibility and data safety**

Inspect `git diff -- api/prisma/schema.prisma api/src` and confirm: no destructive database commands; old `MerchantOutlet` rows remain addressable as branches; legacy RewardRule API output remains; source fingerprint re-import behavior remains; rejected drafts reopen only through the protected endpoint; no venue promotion bypasses acceptance or structured exclusions; no generated database is staged.

- [ ] **Step 5: Commit documentation and any final focused corrections**

```bash
git add README.md docs/superpowers/specs/2026-10-16-promotion-scope-design.md
git commit -m "docs: describe venue promotion workflows"
```
