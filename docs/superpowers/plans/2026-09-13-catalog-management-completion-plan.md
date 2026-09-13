# Catalog Management Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators maintain merchants, payment methods, and merchant payment acceptance mappings, while the public recommendation form loads the merchant catalog without an API key.

**Architecture:** Preserve the existing Prisma schema and repository boundary. Add focused repository operations for catalog CRUD and dependency checks, expose them through authenticated admin routes plus a separate public merchant-list route, and make the browser interfaces consume catalog data instead of hard-coded payment methods. Reward rules require an existing acceptance relationship so the catalog remains explicit.

**Tech Stack:** Node.js, TypeScript, Express, Prisma with SQLite, Jest, Supertest, browser JavaScript, CSS.

**Spec:** `docs/superpowers/specs/2026-09-13-catalog-management-design.md`

## Global Constraints

- No new database tables: use `Merchant`, `PaymentMethod`, `MerchantPaymentAcceptance`, and `RewardRule`.
- Keep `/api/admin/*` protected by `X-Admin-API-Key`; `GET /api/merchants` is public and read-only.
- Names are trimmed and normalized before persistence; duplicate merchant or payment-method names return HTTP 409.
- Deletion is protective: never cascade-delete acceptance mappings or reward rules.
- Removing an acceptance mapping that still has reward rules returns HTTP 409.
- Preserve support for legacy payment-method identifiers when creating reward rules.
- A payment method without a reward rule is accepted catalog data but is omitted from recommendations.
- Run `npm run test:api`, `npm run build --workspace api`, `node --check web/app.js`, and `node --check web/admin.js` before handoff.

---

## File Structure

- `api/src/repositories/types.ts`: shared record and input types for catalog operations.
- `api/src/repositories/errors.ts`: precise duplicate and dependency conflict errors.
- `api/src/repositories/merchantRepository.ts`: merchant CRUD and merchant dependency-aware deletion.
- `api/src/repositories/paymentMethodRepository.ts`: payment method CRUD, lookup, and dependency-aware deletion.
- `api/src/repositories/merchantPaymentAcceptanceRepository.ts`: list, add, and protected removal of acceptance pairs.
- `api/src/repositories/rewardRuleRepository.ts`: validates that an acceptance pair exists before creating a reward rule.
- `api/src/routes/merchants.ts`: public merchant-list endpoint.
- `api/src/routes/admin.ts`: authenticated catalog CRUD and acceptance routes.
- `api/src/app.ts`: mounts the public merchant router.
- `api/src/tests/repository.test.ts`: repository behavior and dependency safety tests.
- `api/src/tests/adminRoutes.test.ts`: public and authenticated HTTP contract tests.
- `web/admin.html`, `web/admin.js`, `web/styles.css`: catalog-management controls and rendering.
- `web/app.js`: public merchant-catalog fetch.
- `README.md`: endpoint and setup documentation.

### Task 1: Add catalog repository operations and integrity checks

**Files:**
- Create: `api/src/repositories/merchantPaymentAcceptanceRepository.ts`
- Modify: `api/src/repositories/types.ts`
- Modify: `api/src/repositories/errors.ts`
- Modify: `api/src/repositories/merchantRepository.ts`
- Modify: `api/src/repositories/paymentMethodRepository.ts`
- Modify: `api/src/repositories/rewardRuleRepository.ts`
- Test: `api/src/tests/repository.test.ts`

**Interfaces:**
- Consumes: Prisma models and `normalizeMerchantName` / `normalizePaymentMethodKey`.
- Produces: `updateMerchant(id, name)`, `deleteMerchant(id)`, `listPaymentMethods()`, `createPaymentMethod(input)`, `updatePaymentMethod(id, input)`, `deletePaymentMethod(id)`, `listAcceptedPaymentMethods(merchantId)`, `addAcceptance(merchantId, paymentMethodId)`, and `removeAcceptance(merchantId, paymentMethodId)`.
- Produces: `RepositoryConflictError` for duplicates and dependent-record conflicts; `RepositoryValidationError` when `createRewardRule` receives a merchant/payment-method pair without an acceptance mapping.

- [ ] **Step 1: Extend the repository test fixture and write failing catalog tests**

```ts
import {
  createPaymentMethod,
  deletePaymentMethod,
  updatePaymentMethod
} from '../repositories/paymentMethodRepository';
import {
  addAcceptance,
  removeAcceptance
} from '../repositories/merchantPaymentAcceptanceRepository';
import { deleteMerchant, updateMerchant } from '../repositories/merchantRepository';

test('updates a merchant and rejects deletion while it has an acceptance', async () => {
  const merchant = await createMerchant('Old Mart');
  const method = await createPaymentMethod({ name: 'Test Pay', type: 'mobile_payment' });
  await addAcceptance(merchant.id, method.id);

  await expect(updateMerchant(merchant.id, 'New Mart')).resolves.toMatchObject({ name: 'New Mart' });
  await expect(deleteMerchant(merchant.id)).rejects.toThrow('accepted payment methods');
});

test('updates a payment method and rejects deletion while it is accepted', async () => {
  const merchant = await createMerchant('Test Mart');
  const method = await createPaymentMethod({ name: 'Old Pay', type: 'credit_card' });
  await addAcceptance(merchant.id, method.id);

  await expect(updatePaymentMethod(method.id, { name: 'New Pay', type: 'mobile_payment' }))
    .resolves.toMatchObject({ name: 'New Pay', type: 'mobile_payment' });
  await expect(deletePaymentMethod(method.id)).rejects.toThrow('accepted by merchants');
});

test('rejects removing an acceptance that has a reward rule', async () => {
  const merchant = await createMerchant('Reward Mart');
  const method = await createPaymentMethod({ name: 'Reward Pay', type: 'credit_card' });
  await addAcceptance(merchant.id, method.id);
  await createRewardRule({
    merchantId: merchant.id, paymentMethodId: method.id, cashbackRate: 0.01,
    amountThreshold: 0, validityStart: new Date('2026-09-01'),
    validityEnd: new Date('2026-09-30')
  });

  await expect(removeAcceptance(merchant.id, method.id)).rejects.toThrow('reward rules');
});
```

- [ ] **Step 2: Run the focused repository test to verify it fails**

Run: `cd api && npm test -- --runInBand src/tests/repository.test.ts`

Expected: FAIL because the catalog repository exports do not exist.

- [ ] **Step 3: Define focused types and errors**

Add these types to `api/src/repositories/types.ts` and use `RepositoryConflictError` with the exact human-readable messages below:

```ts
export type PaymentMethodInput = {
  name: string;
  type: string;
};

export type MerchantPaymentAcceptanceRecord = {
  merchantId: number;
  paymentMethodId: number;
  paymentMethod: PaymentMethodRecord;
};
```

Use `RepositoryConflictError` messages in repository code: `merchant has accepted payment methods`, `merchant has reward rules`, `payment method is accepted by merchants`, `payment method has reward rules`, and `acceptance has reward rules`.

- [ ] **Step 4: Implement merchant and payment-method CRUD with protected deletion**

Use unique numeric IDs for updates and deletes. Trim names, normalize merchant names, map Prisma `P2002` duplicate errors to `RepositoryConflictError`, return `null` for a missing row, and query dependents before deleting:

```ts
export async function deleteMerchant(id: number): Promise<boolean> {
  const [acceptanceCount, rewardRuleCount] = await Promise.all([
    prisma.merchantPaymentAcceptance.count({ where: { merchantId: id } }),
    prisma.rewardRule.count({ where: { merchantId: id } })
  ]);
  if (acceptanceCount > 0) throw new RepositoryConflictError('merchant has accepted payment methods');
  if (rewardRuleCount > 0) throw new RepositoryConflictError('merchant has reward rules');
  try {
    await prisma.merchant.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return false;
    throw error;
  }
}
```

Implement the payment-method equivalent with `paymentMethodId` count filters. `listPaymentMethods()` must return records sorted by `name` ascending; `createPaymentMethod` and `updatePaymentMethod` select `id`, `name`, and `type`. Update `findPaymentMethodByLegacyIdOrName` so it also returns a method when `String(paymentMethod.id) === value.trim()`; this lets the catalog UI submit database IDs while retaining legacy-name matching.

- [ ] **Step 5: Implement the acceptance repository and require acceptance when creating reward rules**

Create `merchantPaymentAcceptanceRepository.ts`. `addAcceptance` must use `upsert` on `merchantId_paymentMethodId`; `listAcceptedPaymentMethods` must return payment method records sorted by name. `removeAcceptance` counts matching reward rules first, throws `RepositoryConflictError('acceptance has reward rules')` when any exist, otherwise deletes and returns `true` or `false` for a missing pair.

Before `rewardRule.create`, replace the current automatic acceptance `upsert` in `createRewardRule` with:

```ts
const acceptance = await transaction.merchantPaymentAcceptance.findUnique({
  where: {
    merchantId_paymentMethodId: {
      merchantId: input.merchantId,
      paymentMethodId: input.paymentMethodId
    }
  }
});

if (!acceptance) {
  throw new RepositoryValidationError('payment method is not accepted by this merchant');
}
```

- [ ] **Step 6: Run repository tests and commit the repository layer**

Run: `cd api && npm test -- --runInBand src/tests/repository.test.ts`

Expected: PASS.

```bash
git add api/src/repositories api/src/tests/repository.test.ts
git commit -m "feat(api): add catalog repository management"
```

### Task 2: Expose public and admin catalog APIs

**Files:**
- Create: `api/src/routes/merchants.ts`
- Modify: `api/src/app.ts`
- Modify: `api/src/routes/admin.ts`
- Test: `api/src/tests/adminRoutes.test.ts`

**Interfaces:**
- Consumes: repository functions from Task 1 and existing `requireAdminApiKey` middleware.
- Produces: public `GET /api/merchants`; authenticated merchant and payment-method CRUD; authenticated acceptance list/add/remove operations.

- [ ] **Step 1: Write failing HTTP contract tests**

Add these cases to `api/src/tests/adminRoutes.test.ts`:

```ts
test('lists public merchants without an admin API key', async () => {
  const response = await request(app).get('/api/merchants');
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'FamilyMart' })])
  );
});

test('manages a payment method and merchant acceptance', async () => {
  const key = { 'X-Admin-API-Key': 'test-admin-key' };
  const method = await request(app).post('/api/admin/payment-methods').set(key)
    .send({ name: 'Taiwan Pay', type: 'mobile_payment' });
  const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });

  const acceptance = await request(app).put(`/api/admin/merchants/${merchant.id}/payment-methods/${method.body.data.id}`).set(key);
  expect(acceptance.status).toBe(201);
  await expect(request(app).delete(`/api/admin/merchants/${merchant.id}`).set(key))
    .resolves.toMatchObject({ status: 409 });
});

test('rejects removal of an accepted payment method with reward rules', async () => {
  const key = { 'X-Admin-API-Key': 'test-admin-key' };
  const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
  const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
  await prisma.merchantPaymentAcceptance.create({ data: { merchantId: merchant.id, paymentMethodId: method.id } });
  await prisma.rewardRule.create({
    data: {
      merchantId: merchant.id, paymentMethodId: method.id, cashbackRate: 0.01, amountThreshold: 0,
      validityStart: new Date('2026-09-01'), validityEnd: new Date('2026-09-30')
    }
  });

  const response = await request(app)
    .delete(`/api/admin/merchants/${merchant.id}/payment-methods/${method.id}`).set(key);
  expect(response).toMatchObject({
    status: 409,
    body: { success: false, message: 'acceptance has reward rules' }
  });
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts`

Expected: FAIL with 404 responses because the new public and admin routes are not mounted.

- [ ] **Step 3: Create the public merchant route and mount it before protected admin routes**

Create `api/src/routes/merchants.ts`:

```ts
import { Router } from 'express';
import { listMerchants } from '../repositories/merchantRepository';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const merchants = await listMerchants();
    return res.json({ success: true, data: merchants.map(({ id, name }) => ({ id, name })) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list merchants'
    });
  }
});

export default router;
```

In `api/src/app.ts`, import it and mount `app.use('/api/merchants', merchantsRouter);` before the admin router.

- [ ] **Step 4: Add authenticated resource routes and consistent response mapping**

Use these paths and response rules in `api/src/routes/admin.ts`:

```text
GET    /payment-methods                         -> 200 { success, data: PaymentMethodRecord[] }
POST   /payment-methods                         -> 201 { success, data: PaymentMethodRecord }
PATCH  /payment-methods/:id                     -> 200 or 404
DELETE /payment-methods/:id                     -> 200 { success, data: { deleted: true } } or 404/409
PATCH  /merchants/:id                           -> 200 or 404
DELETE /merchants/:id                           -> 200 { success, data: { deleted: true } } or 404/409
GET    /merchants/:merchantId/payment-methods  -> 200 { success, data: PaymentMethodRecord[] }
PUT    /merchants/:merchantId/payment-methods/:paymentMethodId -> 201
DELETE /merchants/:merchantId/payment-methods/:paymentMethodId -> 200 or 404/409
```

Parse route IDs with `Number`, require positive integers, and return `404` for invalid IDs. Parse merchant and payment-method request bodies as `{ merchantName }` and `{ name, type }`. Map `RepositoryConflictError` to 409, `RepositoryValidationError` to 400, a missing repository result to 404, and unexpected errors to the established 500 response shape.

Update the existing admin merchant list to return `MerchantRecord[]` so the management page receives IDs. Update its existing create response to return the complete created record. Preserve legacy reward-rule `paymentMethodId` lookup through `findPaymentMethodByLegacyIdOrName`.

- [ ] **Step 5: Run API route tests and commit**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts`

Expected: PASS.

```bash
git add api/src/app.ts api/src/routes api/src/tests/adminRoutes.test.ts
git commit -m "feat(api): expose catalog management endpoints"
```

### Task 3: Replace hard-coded catalog controls in both browser pages

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/admin.html`
- Modify: `web/admin.js`
- Modify: `web/styles.css`

**Interfaces:**
- Consumes: public `GET /api/merchants` and Task 2's authenticated catalog endpoints.
- Produces: a public merchant selector populated without an API key, plus administrator controls for merchant/payment-method CRUD and acceptance mappings.

- [ ] **Step 1: Add the catalog-management DOM structure**

In `web/admin.html`, change the heading to `Manage merchants, payment methods, and reward rules`. Add a payment-method form with fields `payment-method-name` and `payment-method-type`, a merchant-management table container `merchants`, a payment-method table container `payment-methods`, and an acceptance section containing select `acceptance-merchant` plus container `accepted-payment-methods`.

Replace the hard-coded `<option>` elements inside `#payment-method` with an empty select. Keep its `name="paymentMethodId"` so the current reward-rule request contract remains valid.

- [ ] **Step 2: Update public-page tests by checking syntax before behavior changes**

Run: `node --check web/app.js && node --check web/admin.js`

Expected: PASS before the browser script changes.

- [ ] **Step 3: Implement public merchant loading**

In `web/app.js`, replace the protected admin fetch with the public endpoint and render `{ id, name }` records safely:

```js
async function fetchMerchants() {
  const response = await fetch(`${apiBaseUrl}/api/merchants`);
  if (!response.ok) throw new Error('merchant catalog unavailable');
  const json = await response.json();
  return json.data || [];
}

merchantSelect.innerHTML = merchants.length
  ? merchants.map((merchant) => `<option value="${merchant.name}">${merchant.name}</option>`).join('')
  : '<option value="">No merchants available</option>';
```

Keep the existing fallback and recommendation empty state.

- [ ] **Step 4: Implement admin catalog rendering and actions**

Maintain in-memory `merchants` and `paymentMethods` arrays populated by `refreshCatalog`. Render each resource as a table row with edit and delete buttons whose data attributes carry the numeric ID. For editing, use `window.prompt` with the current value; reject empty prompt values before making a `PATCH` request.

For acceptance, request `GET /api/admin/merchants/${merchantId}/payment-methods` whenever `#acceptance-merchant` changes. Render every payment method as a labelled checkbox. On checkbox activation, call `PUT` when checked and `DELETE` when unchecked, then refresh the acceptance list. Use `escapeHtml` for all API-provided text and `encodeURIComponent` for path identifiers.

Populate the reward-rule payment-method select from the same catalog array, with each option value set to the payment method's ID. This uses Task 2's legacy-compatible lookup while allowing administrator-created methods.

- [ ] **Step 5: Add focused layout rules and verify browser syntax**

Add only the CSS necessary for checkbox rows and management tables, following the existing responsive table and form styles. Then run:

```bash
node --check web/app.js
node --check web/admin.js
```

Expected: PASS.

- [ ] **Step 6: Commit the browser catalog UI**

```bash
git add web/index.html web/app.js web/admin.html web/admin.js web/styles.css
git commit -m "feat(web): manage payment catalog"
```

### Task 4: Add end-to-end coverage, update documentation, and verify the release

**Files:**
- Modify: `api/src/tests/adminRoutes.test.ts`
- Modify: `api/src/tests/recommendationService.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all repository, route, and browser contracts from Tasks 1–3.
- Produces: documented setup and verification evidence for the completed catalog flow.

- [ ] **Step 1: Write the full positive-path integration test**

Add a test that creates a merchant and payment method through the admin API, creates their acceptance pair, adds a reward rule using the returned payment-method ID, and obtains a recommendation:

```ts
test('recommends a newly managed catalog payment method', async () => {
  const key = { 'X-Admin-API-Key': 'test-admin-key' };
  const merchant = await request(app).post('/api/admin/merchants').set(key)
    .send({ merchantName: 'Catalog Mart' });
  const method = await request(app).post('/api/admin/payment-methods').set(key)
    .send({ name: 'Catalog Pay', type: 'mobile_payment' });

  await request(app).put(`/api/admin/merchants/${merchant.body.data.id}/payment-methods/${method.body.data.id}`).set(key);
  await request(app).post('/api/admin/reward-rules').set(key).send({
    merchantName: 'Catalog Mart', paymentMethodId: String(method.body.data.id), cashbackRate: 0.06,
    amountThreshold: 0, validityStart: '2026-09-01', validityEnd: '2026-09-30'
  });

  const recommendation = await request(app).get('/api/recommendations')
    .query({ merchant_name: 'Catalog Mart', amount: 500, date: '2026-09-15' });
  expect(recommendation.body.data[0]).toMatchObject({ paymentMethod: 'Catalog Pay', cashbackRate: 0.06 });
});
```

Add a recommendation-service test that adds an accepted method without a reward rule and expects it to be absent from the result list.

- [ ] **Step 2: Run focused tests to verify the end-to-end behavior**

Run: `cd api && npm test -- --runInBand src/tests/adminRoutes.test.ts src/tests/recommendationService.test.ts`

Expected: PASS.

- [ ] **Step 3: Document catalog endpoints and ordering**

Add a `Catalog management` section to `README.md` listing the public `GET /api/merchants` endpoint and the protected merchant, payment-method, and acceptance endpoint groups. State the required configuration order: merchant, payment method, acceptance mapping, then reward rule. State that destructive operations return 409 while dependencies exist.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm run test:api
npm run build --workspace api
node --check web/app.js
node --check web/admin.js
git status --short
```

Expected: all tests and checks PASS; `git status --short` contains no generated database files or unintended changes.

- [ ] **Step 5: Commit tests and documentation**

```bash
git add api/src/tests/adminRoutes.test.ts api/src/tests/recommendationService.test.ts README.md
git commit -m "test: cover managed payment catalog flow"
```
