# Promotion Import and Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import official payment-promotion candidates as auditable drafts that an administrator can review and publish into existing reward rules.

**Architecture:** A source-specific adapter fetches and normalizes one official source into candidate promotions. A shared import service creates an `ImportRun`, upserts only pending drafts by fingerprint, and records success or failure. Protected Admin APIs and the existing dependency-free Admin page review drafts; publication atomically creates a regular `RewardRule` and marks the draft published.

**Tech Stack:** Node.js 20 built-in `fetch`, TypeScript, Express 5, Prisma 5, SQLite, Jest, Supertest, plain browser JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-14-promotion-import-review-design.md`

## Global Constraints

- Support exactly `line-pay`, `jko-pay`, and `ipass-money` as first-phase sources.
- Do not add automated publishing, account authentication, browser automation, LLM extraction, schedules, credentials, or retries.
- Use a normal identifiable user agent and never bypass access controls, CAPTCHAs, logins, robots restrictions, or published rate limits.
- Imported drafts never affect recommendations; only a successful publish creates a `RewardRule`.
- Import failures must be recorded in their `ImportRun`, exit non-zero, and leave existing rules/drafts for other sources untouched.
- Render captured source text with HTML escaping and only make `https:` source URLs clickable.
- Reward rules continue to use numeric database payment-method IDs and require an existing merchant acceptance mapping.
- Keep the current project style: TypeScript, two spaces, single quotes, semicolons, named domain exports, and thin routes.
- Use no new runtime dependency; Node 20 built-in `fetch` is the HTTP client.

---

## File Structure

| File | Responsibility |
|---|---|
| `api/prisma/schema.prisma` | Add immutable import-run and promotion-draft persistence models and relations. |
| `api/src/repositories/promotionImportRepository.ts` | Persist import runs, upsert pending drafts, list/read/update/reject drafts, and transactionally publish a reward rule. |
| `api/src/repositories/types.ts` | Define import, draft, review, and publish record/input types shared by repository, service, and routes. |
| `api/src/services/promotionImportService.ts` | Coordinate one adapter execution with import-run status transitions and draft persistence. |
| `api/src/importers/types.ts` | Define source keys, normalized candidates, and adapter contract. |
| `api/src/importers/linePayImporter.ts` | Fetch and conservatively extract LINE Pay candidates. |
| `api/src/importers/jkoPayImporter.ts` | Fetch and conservatively extract JKO Pay candidates. |
| `api/src/importers/ipassMoneyImporter.ts` | Fetch and conservatively extract iPASS MONEY candidates. |
| `api/src/importers/index.ts` | Map approved source keys to their adapter. |
| `api/src/scripts/importPromotions.ts` | Parse `--source`, invoke the shared service, report run result, and set process exit code. |
| `api/src/routes/admin.ts` | Add protected import-run/draft review, publish, and rejection endpoints. |
| `web/admin.html` | Add Imported promotions review controls. |
| `web/admin.js` | Fetch, safely render, edit, reject, and publish promotion drafts. |
| `web/styles.css` | Add readable source-content and draft-review layout styles. |
| `api/src/tests/promotionImportRepository.test.ts` | Test persistence, status transitions, idempotence, review, rejection, and atomic publication. |
| `api/src/tests/promotionImportService.test.ts` | Test adapter orchestration using fixture adapters without network calls. |
| `api/src/tests/promotionImportCli.test.ts` | Test CLI source selection and exit behavior with mocked service boundary. |
| `api/src/tests/adminRoutes.test.ts` | Test protected draft API contract, validation, and publication. |

## Task 1: Import and Draft Persistence

**Files:**
- Modify: `api/prisma/schema.prisma`
- Modify: `api/src/repositories/types.ts`
- Create: `api/src/repositories/promotionImportRepository.ts`
- Create: `api/src/tests/promotionImportRepository.test.ts`

**Interfaces:**
- Produces `ImportSource = 'line-pay' | 'jko-pay' | 'ipass-money'` and `ImportRunStatus = 'running' | 'completed' | 'failed'`.
- Produces `PromotionDraftStatus = 'pending_review' | 'published' | 'rejected'`.
- Produces `createImportRun(source: ImportSource): Promise<ImportRunRecord>`.
- Produces `completeImportRun(id: number, draftCount: number): Promise<void>`, `failImportRun(id: number, errorMessage: string): Promise<void>`, and `listImportRuns(): Promise<ImportRunRecord[]>`.
- Produces `upsertPendingDraft(input: ImportedPromotionDraft): Promise<PromotionDraftRecord>`.
- Produces `listPromotionDrafts(status?: PromotionDraftStatus): Promise<PromotionDraftRecord[]>`, `updatePromotionDraft(id, input): Promise<PromotionDraftRecord | null>`, `rejectPromotionDraft(id, reason): Promise<PromotionDraftRecord | null>`, and `publishPromotionDraft(id): Promise<PublishedDraftResult>`.
- `publishPromotionDraft` validates the pending state, all rule values, catalog IDs, and existing acceptance; it creates `RewardRule` and marks `PromotionDraft` published in one Prisma transaction.

- [ ] **Step 1: Write the failing persistence tests**

Create `api/src/tests/promotionImportRepository.test.ts` with tests that initialize a merchant, payment method, and acceptance, then assert:

```ts
test('updates a repeated pending draft without changing its identity', async () => {
  const first = await upsertPendingDraft({
    importRunId: run.id,
    source: 'line-pay',
    sourceFingerprint: 'line-pay:summer-offer',
    sourceUrl: 'https://example.com/summer',
    sourceTitle: 'Summer offer',
    sourceContent: '3% cashback',
    fetchedAt: new Date('2026-09-14T00:00:00.000Z')
  });
  const second = await upsertPendingDraft({ ...firstInput, importRunId: nextRun.id, sourceContent: '5% cashback' });

  expect(second).toMatchObject({ id: first.id, sourceContent: '5% cashback', status: 'pending_review' });
});

test('does not overwrite a published draft during a later import', async () => {
  await publishPromotionDraft(draft.id);

  await expect(upsertPendingDraft({ ...input, sourceContent: 'changed source text' }))
    .resolves.toMatchObject({ id: draft.id, status: 'published', sourceContent: originalContent });
});

test('publishes a reviewed draft only when its payment method is accepted', async () => {
  await updatePromotionDraft(draft.id, validReviewInput);

  await expect(publishPromotionDraft(draft.id)).resolves.toMatchObject({
    draft: expect.objectContaining({ status: 'published' }),
    rewardRule: expect.objectContaining({ merchantId, paymentMethodId })
  });
});
```

Also test `failImportRun` records `failed`, completion records `completed` and `draftCount`, missing draft returns `null`, rejection requires a non-empty reason, and publish rejects missing review values, non-pending status, missing catalog records, or a missing acceptance while leaving the draft pending.

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npm test --workspace api -- promotionImportRepository.test.ts`

Expected: FAIL because the import persistence types and repository do not exist.

- [ ] **Step 3: Add the Prisma models and shared types**

Add `ImportRun` and `PromotionDraft` models to `api/prisma/schema.prisma`. Use integer IDs and `DateTime @default(now())` timestamps. `ImportRun` has source, status, started/completed times, nullable error message, draft count defaulting to zero, and `drafts`.

`PromotionDraft` includes required source attribution and captured content, unique `sourceFingerprint`, fetched timestamp, optional parsed values, status defaulting to `pending_review`, nullable selected catalog IDs, nullable reward-rule ID with a unique relation, review timestamp, and rejection reason. Add `Merchant`, `PaymentMethod`, and `RewardRule` relations with `onDelete: Restrict`, so reviewed/published provenance cannot silently point to deleted catalog data.

Define exact TypeScript records/inputs in `types.ts`; represent `cashbackRate` as `number` at the repository boundary and dates as `Date`.

- [ ] **Step 4: Implement the repository**

Implement `promotionImportRepository.ts` with Prisma selects that map `Decimal` to `number`. Use the following state rules:

```ts
const editableDraftStatuses = ['pending_review'] as const;

if (draft.status !== 'pending_review') {
  throw new RepositoryConflictError('promotion draft is no longer pending review');
}
```

For repeated fingerprints, update `importRunId`, source URL/title/content, fetched time, and parsed fields only when the stored status is `pending_review`; return published/rejected records unchanged. Reject requires trimmed text and records `reviewedAt`. Publish uses `prisma.$transaction`, verifies linked merchant/payment method and acceptance, creates the reward rule, then updates the draft status, reward-rule ID, and reviewed time. Convert Prisma foreign-key and uniqueness errors to the existing repository error types.

- [ ] **Step 5: Generate Prisma client and run the repository test**

Run:

```bash
npx prisma generate --schema api/prisma/schema.prisma
npm test --workspace api -- promotionImportRepository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma api/src/repositories/types.ts api/src/repositories/promotionImportRepository.ts api/src/tests/promotionImportRepository.test.ts
git commit -m "feat(api): persist imported promotion drafts" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Source Adapter Contract and Import Service

**Files:**
- Create: `api/src/importers/types.ts`
- Create: `api/src/importers/linePayImporter.ts`
- Create: `api/src/importers/jkoPayImporter.ts`
- Create: `api/src/importers/ipassMoneyImporter.ts`
- Create: `api/src/importers/index.ts`
- Create: `api/src/services/promotionImportService.ts`
- Create: `api/src/tests/promotionImportService.test.ts`

**Interfaces:**
- Consumes `createImportRun`, `completeImportRun`, `failImportRun`, and `upsertPendingDraft` from Task 1.
- Produces `PromotionSourceAdapter` with `source: ImportSource` and `import(): Promise<ImportedPromotionCandidate[]>`.
- Produces `runPromotionImport(adapter: PromotionSourceAdapter): Promise<ImportRunRecord>`.
- Candidate fields are `sourceFingerprint`, `sourceUrl`, `sourceTitle`, `sourceContent`, `fetchedAt`, and optional parsed rule fields.

- [ ] **Step 1: Write failing import-service tests with fixture adapters**

Create `promotionImportService.test.ts`. Define an in-test `PromotionSourceAdapter` that returns deterministic candidates, without fetching a live URL:

```ts
const adapter: PromotionSourceAdapter = {
  source: 'line-pay',
  import: jest.fn().mockResolvedValue([candidate])
};

test('records a completed run and persists each adapter candidate', async () => {
  const run = await runPromotionImport(adapter);
  expect(run).toMatchObject({ source: 'line-pay', status: 'completed', draftCount: 1 });
  await expect(listPromotionDrafts()).resolves.toEqual([
    expect.objectContaining({ sourceFingerprint: candidate.sourceFingerprint })
  ]);
});

test('records a failed run and rethrows an adapter failure', async () => {
  const adapter = { source: 'jko-pay' as const, import: jest.fn().mockRejectedValue(new Error('source unavailable')) };
  await expect(runPromotionImport(adapter)).rejects.toThrow('source unavailable');
  await expect(listImportRuns()).resolves.toEqual([
    expect.objectContaining({ source: 'jko-pay', status: 'failed', errorMessage: 'source unavailable' })
  ]);
});
```

Add a unit test per concrete adapter that injects a fixture HTML string through a `fetchPage` constructor dependency and asserts it emits a candidate with an `https:` URL, non-empty title/content, and deterministic fingerprint. Include a fixture that has no parseable percentage/dates and assert it produces a candidate with undefined parsed values instead of guessing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace api -- promotionImportService.test.ts`

Expected: FAIL because the adapter contract and import service do not exist.

- [ ] **Step 3: Implement adapter contract and conservative source adapters**

Define `PromotionSourceAdapter` and a `FetchPage` dependency:

```ts
export type FetchPage = (url: string) => Promise<string>;

export type PromotionSourceAdapter = {
  source: ImportSource;
  import(): Promise<ImportedPromotionCandidate[]>;
};
```

Each adapter receives `fetchPage = fetchOfficialPage`, uses its source's configured official `https:` activity-list URL, and extracts only linked activity cards with text content. Construct fingerprints from source plus canonical URL, and preserve source text. Parse percentage, amount threshold, and ISO-compatible dates only when explicit source text matches; otherwise leave fields undefined. Validate that configured and discovered links are `https:` and on the source's official hostname.

`fetchOfficialPage` must supply an identifiable `User-Agent`, reject non-OK responses, and use no bypass mechanism. `index.ts` exports `getPromotionSourceAdapter(source)` and throws a validation error for unknown source keys.

- [ ] **Step 4: Implement import orchestration**

`runPromotionImport` creates the running record before calling `adapter.import()`, persists candidates sequentially or in a transaction-safe bounded flow, then completes the run with the number of returned candidates. If any step fails, call `failImportRun` with the error message and rethrow the original error. Do not create catalog records or reward rules.

- [ ] **Step 5: Run focused tests**

Run: `npm test --workspace api -- promotionImportService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/importers api/src/services/promotionImportService.ts api/src/tests/promotionImportService.test.ts
git commit -m "feat(api): import official promotion drafts" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Import CLI and Admin Draft APIs

**Files:**
- Modify: `api/package.json`
- Create: `api/src/scripts/importPromotions.ts`
- Modify: `api/src/routes/admin.ts`
- Create: `api/src/tests/promotionImportCli.test.ts`
- Modify: `api/src/tests/adminRoutes.test.ts`

**Interfaces:**
- Consumes `getPromotionSourceAdapter` and `runPromotionImport` from Task 2.
- Consumes list/update/reject/publish repository methods from Task 1.
- Produces `npm run import:promotions -- --source <source>`.
- Produces protected `GET /api/admin/import-runs`, `GET/PATCH /api/admin/promotion-drafts`, `POST /api/admin/promotion-drafts/:id/publish`, and `POST /api/admin/promotion-drafts/:id/reject`.

- [ ] **Step 1: Write failing CLI and route tests**

Add CLI tests for valid `--source line-pay`, a missing source, and unknown source. Extract parsing into an exported `parseImportSource(args: string[]): ImportSource` so the test does not spawn a process:

```ts
test('rejects an unsupported import source', () => {
  expect(() => parseImportSource(['--source', 'unknown'])).toThrow('unsupported source');
});
```

In `adminRoutes.test.ts`, create a pending draft through the repository and assert:

```ts
test('publishes a reviewed promotion draft through the protected API', async () => {
  const response = await request(app)
    .post(`/api/admin/promotion-drafts/${draft.id}/publish`)
    .set('X-Admin-API-Key', 'test-admin-key');

  expect(response.status).toBe(201);
  expect(response.body.data).toMatchObject({ status: 'published', rewardRuleId: expect.any(Number) });
});
```

Also assert missing key is `401`, unknown draft is `404`, invalid PATCH/publish fields are `400`, a rejected/published draft gets `409`, reject requires non-empty `reason`, and query filtering returns only the requested status.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test --workspace api -- promotionImportCli.test.ts adminRoutes.test.ts
```

Expected: FAIL because the CLI parser and draft endpoints do not exist.

- [ ] **Step 3: Implement CLI**

Add `"import:promotions": "ts-node src/scripts/importPromotions.ts"` to `api/package.json`. Parse exactly one `--source` option, obtain its adapter, call the service, and write a concise completed-run line to stdout. On error, write the message to stderr and set `process.exitCode = 1`; do not call `process.exit` before `failImportRun` completes.

- [ ] **Step 4: Implement thin protected Admin routes**

Add routes to the existing authenticated `admin.ts`. Parse positive draft IDs using the existing `parsePositiveIntId`. Serialize dates as ISO date strings and numbers as JSON numbers. For PATCH, accept only merchant/payment method IDs, cashback rate, amount threshold, validity dates, and promotion note; reject an empty request and invalid numeric/date ranges. For publish/reject, map `RepositoryValidationError` to `400`, missing record to `404`, and `RepositoryConflictError` to `409`. Never expose stack traces.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test --workspace api -- promotionImportCli.test.ts adminRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/src/scripts/importPromotions.ts api/src/routes/admin.ts api/src/tests/promotionImportCli.test.ts api/src/tests/adminRoutes.test.ts
git commit -m "feat(api): review imported promotion drafts" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Admin Draft Review Interface

**Files:**
- Modify: `web/admin.html`
- Modify: `web/admin.js`
- Modify: `web/styles.css`

**Interfaces:**
- Consumes authenticated Task 3 API endpoints using existing `requestJson`.
- Consumes existing in-memory `merchants` and `paymentMethods` arrays from catalog refresh.
- Produces an Imported promotions section with pending drafts, safe source display, editable review fields, publish/reject controls, and refresh behavior.

- [ ] **Step 1: Confirm the API contract consumed by the UI**

```bash
npm test --workspace api -- adminRoutes.test.ts
```

Expected: PASS, including the Task 3 assertion that the draft list returns an
ID, source, HTTPS URL, captured source content, parsed values, status, and
review fields required by the UI.

- [ ] **Step 2: Add review markup and safe rendering**

Add an `Imported promotions` section below reward rules with a status filter and `#promotion-drafts` container. In `admin.js`, fetch pending drafts as part of `refreshCatalog`, render source strings and content with `escapeHtml`, and build source links only through:

```js
function safeHttpsUrl(value) {
  const url = new URL(value);
  return url.protocol === 'https:' ? url.href : null;
}
```

Render non-HTTPS/invalid values as escaped plain text, never as an `href`. Per pending draft, provide existing merchant/payment-method select controls, numeric/date inputs prefilled from parsed data, a note textarea, Reject reason input, Publish, and Reject buttons. Do not write the Admin API key to browser storage.

- [ ] **Step 3: Wire review actions and refresh state**

On Save, PATCH review values. On Publish, PATCH current form values first, then POST publish; on Reject, POST a trimmed non-empty reason. Reuse `setCatalogStatus` for server errors and refresh catalog data after each success. Disable action buttons while the request is pending to prevent double publication. Render published/rejected drafts read-only if the filter requests them.

- [ ] **Step 4: Add responsive styles and run browser syntax checks**

Style source text with preserved line breaks, constrain long URLs/content, and make each draft form usable at narrow widths. Run:

```bash
node --check web/admin.js
npm test --workspace api -- adminRoutes.test.ts
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add web/admin.html web/admin.js web/styles.css api/src/routes/admin.ts api/src/tests/adminRoutes.test.ts
git commit -m "feat(web): review imported promotions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Documentation and End-to-End Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-14-promotion-import-review-design.md` only if implementation required an approved, material clarification.

**Interfaces:**
- Documents setup and operational use of Task 2 CLI and Task 3/4 review process.

- [ ] **Step 1: Document the manual beta operation**

Add README instructions that use a local database initialized by existing commands, invoke each supported source one at a time, explain that runs create drafts rather than recommendations, and document the review/publish flow. State that source availability and terms can change, import errors are recorded, and only allowed official public pages are supported.

- [ ] **Step 2: Run the complete verification suite**

Run:

```bash
npx prisma generate --schema api/prisma/schema.prisma
npm run test:api
npm run build --workspace api
node --check web/app.js
node --check web/admin.js
npm audit --omit=dev
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/superpowers/specs/2026-09-14-promotion-import-review-design.md
git commit -m "docs: explain promotion import review workflow" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
