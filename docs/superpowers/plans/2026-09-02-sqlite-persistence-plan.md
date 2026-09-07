# SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory merchant and reward-rule store with SQLite-backed persistence without breaking the current recommendation and admin API contracts.

**Architecture:** Use Prisma as the database access layer, keep the app behind a small repository boundary, and leave the REST API contract stable while moving stored data to SQLite. The recommendation logic remains merchant-centric and date-aware, but now reads from durable data rather than the in-memory arrays.

**Tech Stack:** Node.js, TypeScript, Express, Prisma, SQLite, Jest, Supertest.

## Global Constraints
- MVP remains Taiwan-focused and anonymous.
- No user accounts, login, or admin UI in this phase.
- Recommendation logic stays merchant-first and date-aware.
- Database configuration must use `DATABASE_URL` and avoid SQLite-specific SQL in business logic.
- Existing API response shapes remain backward compatible.
- SQLite is the baseline for local development; the code must be ready to migrate to PostgreSQL later.

---

### Task 1: Install Prisma and define the SQLite schema

**Files:**
- Modify: `api/package.json`
- Create: `api/prisma/schema.prisma`
- Create: `api/.env.example`
- Modify: `.gitignore`
- Test: `api/src/tests/repository.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var from the local shell or `.env`
- Produces: Prisma models for `Merchant`, `PaymentMethod`, `MerchantPaymentAcceptance`, and `RewardRule`

- [ ] **Step 1: Add Prisma dependencies and scripts**

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc -p .",
    "start": "node dist/server.js",
    "test": "jest --runInBand",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.6.0",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.12",
    "@types/supertest": "^7.2.1",
    "jest": "^29.7.0",
    "prisma": "^5.6.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Define Prisma schema**

```prisma
// api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Merchant {
  id   Int    @id @default(autoincrement())
  name String @unique

  chainName String?
  category  String?
  location  String?
  notes     String?

  acceptedMethods MerchantPaymentAcceptance[]
  rewardRules     RewardRule[]
}

model PaymentMethod {
  id   Int    @id @default(autoincrement())
  name String @unique
  type String

  acceptedBy MerchantPaymentAcceptance[]
  rewardRules RewardRule[]
}

model MerchantPaymentAcceptance {
  id Int @id @default(autoincrement())

  merchant   Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  merchantId Int

  paymentMethod   PaymentMethod @relation(fields: [paymentMethodId], references: [id], onDelete: Cascade)
  paymentMethodId Int

  @@unique([merchantId, paymentMethodId])
}

model RewardRule {
  id Int @id @default(autoincrement())

  merchant   Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  merchantId Int

  paymentMethod   PaymentMethod @relation(fields: [paymentMethodId], references: [id], onDelete: Cascade)
  paymentMethodId Int

  cashbackRate    Decimal
  amountThreshold Int
  validityStart   DateTime
  validityEnd     DateTime
  promotionNote   String?
}
```

- [ ] **Step 3: Add environment and ignore settings**

```env
# api/.env.example
DATABASE_URL="file:./prisma/dev.db"
PORT=4000
```

```gitignore
# .gitignore
.env
api/.env
api/prisma/dev.db
api/prisma/*.db
```

- [ ] **Step 4: Write failing repository test for schema access**

```ts
// api/src/tests/repository.test.ts
import { PrismaClient } from '@prisma/client';

describe('prisma schema access', () => {
  test('can create and read a merchant row', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: 'file:./prisma/test.db' } } });

    await prisma.merchant.create({
      data: { name: 'TestMart', chainName: 'TestMart' }
    });

    const merchant = await prisma.merchant.findUnique({ where: { name: 'TestMart' } });
    expect(merchant?.name).toBe('TestMart');

    await prisma.$disconnect();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd api && npm test -- --runInBand src/tests/repository.test.ts`
Expected: FAIL because Prisma client and schema are not yet generated.

- [ ] **Step 6: Generate Prisma client and commit**

```bash
cd /home/cyli/payment-recommender/api
npx prisma generate
```

```bash
cd /home/cyli/payment-recommender && git add .gitignore api/package.json api/prisma/schema.prisma api/.env.example api/src/tests/repository.test.ts && git commit -m "feat(api): add prisma sqlite schema"
```

### Task 2: Add repository layer and Prisma client

**Files:**
- Create: `api/src/lib/prisma.ts`
- Create: `api/src/repositories/merchantRepository.ts`
- Create: `api/src/repositories/rewardRuleRepository.ts`
- Create: `api/src/repositories/types.ts`
- Test: `api/src/tests/repository.test.ts`

**Interfaces:**
- Consumes: Prisma client from `api/src/lib/prisma.ts`
- Produces: repository methods for list/create/delete and reward-rule lookups

- [ ] **Step 1: Create the Prisma singleton**

```ts
// api/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

- [ ] **Step 2: Write repository types**

```ts
// api/src/repositories/types.ts
export type MerchantRecord = {
  id: number;
  name: string;
  chainName?: string | null;
  category?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type RewardRuleRecord = {
  id: number;
  merchantId: number;
  paymentMethodId: number;
  cashbackRate: number;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string | null;
};
```

- [ ] **Step 3: Implement merchant repository**

```ts
// api/src/repositories/merchantRepository.ts
import prisma from '../lib/prisma';
import type { MerchantRecord } from './types';

export async function listMerchants(): Promise<MerchantRecord[]> {
  return prisma.merchant.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      chainName: true,
      category: true,
      location: true,
      notes: true
    }
  });
}

export async function createMerchant(name: string, chainName?: string): Promise<MerchantRecord> {
  return prisma.merchant.create({
    data: { name, chainName: chainName ?? name },
    select: {
      id: true,
      name: true,
      chainName: true,
      category: true,
      location: true,
      notes: true
    }
  });
}
```

- [ ] **Step 4: Implement reward-rule repository**

```ts
// api/src/repositories/rewardRuleRepository.ts
import prisma from '../lib/prisma';
import type { RewardRuleRecord } from './types';

export async function listRewardRules(): Promise<RewardRuleRecord[]> {
  return prisma.rewardRule.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      merchantId: true,
      paymentMethodId: true,
      cashbackRate: true,
      amountThreshold: true,
      validityStart: true,
      validityEnd: true,
      promotionNote: true
    }
  });
}

export async function createRewardRule(input: {
  merchantId: number;
  paymentMethodId: number;
  cashbackRate: number;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string;
}): Promise<RewardRuleRecord> {
  return prisma.rewardRule.create({
    data: {
      merchantId: input.merchantId,
      paymentMethodId: input.paymentMethodId,
      cashbackRate: input.cashbackRate,
      amountThreshold: input.amountThreshold,
      validityStart: input.validityStart,
      validityEnd: input.validityEnd,
      promotionNote: input.promotionNote ?? null
    },
    select: {
      id: true,
      merchantId: true,
      paymentMethodId: true,
      cashbackRate: true,
      amountThreshold: true,
      validityStart: true,
      validityEnd: true,
      promotionNote: true
    }
  });
}

export async function deleteRewardRule(id: number): Promise<boolean> {
  const deleted = await prisma.rewardRule.delete({ where: { id } }).catch(() => null);
  return deleted !== null;
}
```

- [ ] **Step 5: Add failing repository integration test**

```ts
// api/src/tests/repository.test.ts
import { createMerchant, listMerchants } from '../repositories/merchantRepository';
import { createRewardRule, listRewardRules } from '../repositories/rewardRuleRepository';

describe('repository layer', () => {
  test('creates and reads persisted merchant data', async () => {
    const merchant = await createMerchant('SQLite Mart', 'SQLite Mart');
    const merchants = await listMerchants();

    expect(merchants.some((item) => item.name === merchant.name)).toBe(true);
  });

  test('creates and reads persisted reward rules', async () => {
    const merchant = await createMerchant('Rule Mart', 'Rule Mart');
    const rule = await createRewardRule({
      merchantId: merchant.id,
      paymentMethodId: 1,
      cashbackRate: 0.05,
      amountThreshold: 100,
      validityStart: new Date('2026-09-01'),
      validityEnd: new Date('2026-09-30'),
      promotionNote: 'Five percent back'
    });

    const rules = await listRewardRules();
    expect(rules.some((item) => item.id === rule.id)).toBe(true);
  });
});
```

- [ ] **Step 6: Run repository tests to verify they fail**

Run: `cd api && npm test -- --runInBand src/tests/repository.test.ts`
Expected: FAIL because repository modules do not exist yet.

- [ ] **Step 7: Implement the repository code and rerun**

Run: `cd api && npm test -- --runInBand src/tests/repository.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd /home/cyli/payment-recommender && git add api/src/lib/prisma.ts api/src/repositories api/src/tests/repository.test.ts && git commit -m "feat(api): add persistence repository layer"
```

### Task 3: Migrate recommendation service to repository-backed data

**Files:**
- Modify: `api/src/services/recommendationService.ts`
- Modify: `api/src/routes/recommendations.ts`
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/data.ts`
- Test: `api/src/tests/recommendationService.test.ts`

**Interfaces:**
- Consumes: repository methods `listMerchants()`, `listRewardRules()`, `createMerchant()`, `createRewardRule()`, `deleteRewardRule()`
- Produces: the same recommendation payload and admin payload contracts as before

- [ ] **Step 1: Add a shared service contract**

```ts
// api/src/services/recommendationService.ts
export type Recommendation = {
  paymentMethod: string;
  cashbackRate: number;
  estimatedCashback: number;
  promotionNote?: string;
};

export type GetRecommendationsInput = {
  merchant_name: string;
  amount: number;
  date: Date;
};
```

- [ ] **Step 2: Replace the in-memory lookup with repository-backed data**

```ts
import { listMerchants } from '../repositories/merchantRepository';
import { listRewardRules } from '../repositories/rewardRuleRepository';

export async function getRecommendations({
  merchant_name,
  amount,
  date
}: GetRecommendationsInput): Promise<Recommendation[]> {
  const merchants = await listMerchants();
  const rewardRules = await listRewardRules();
  const normalizedMerchant = merchant_name.trim();

  const merchantExists = merchants.some((merchant) =>
    merchant.name.toLowerCase() === normalizedMerchant.toLowerCase()
  );

  if (!merchantExists) {
    return [];
  }

  const relevantRules = rewardRules.filter((rule) => {
    const validityStart = new Date(rule.validityStart);
    const validityEnd = new Date(rule.validityEnd);
    const sameMerchant = rule.merchantId === merchants.find((m) => m.name.toLowerCase() === normalizedMerchant.toLowerCase())?.id;
    const validDate = date >= validityStart && date <= validityEnd;
    const validAmount = amount >= rule.amountThreshold;
    return sameMerchant && validDate && validAmount;
  });

  return relevantRules
    .map((rule) => ({
      paymentMethod: paymentMethodsById[rule.paymentMethodId] ?? 'Unknown',
      cashbackRate: Number(rule.cashbackRate),
      estimatedCashback: Number((amount * Number(rule.cashbackRate)).toFixed(2)),
      promotionNote: rule.promotionNote ?? undefined
    }))
    .sort((a, b) => b.cashbackRate - a.cashbackRate);
}
```

- [ ] **Step 3: Update the recommendation route to await async results**

```ts
// api/src/routes/recommendations.ts
router.get('/', async (req, res) => {
  const merchant_name = String(req.query.merchant_name || '');
  const amount = Number(req.query.amount || 0);
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();

  if (!merchant_name || Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'merchant_name and positive amount are required'
    });
  }

  const results = await getRecommendations({ merchant_name, amount, date });
  return res.json({ success: true, data: results });
});
```

- [ ] **Step 4: Update admin routes to use repository methods**

```ts
// api/src/routes/admin.ts
router.get('/merchants', async (_req, res) => {
  const merchants = await listMerchants();
  return res.json({ success: true, data: merchants.map((merchant) => merchant.name) });
});

router.post('/merchants', async (req, res) => {
  const merchantName = String(req.body?.merchantName ?? req.body?.name ?? '').trim();
  if (!merchantName) {
    return res.status(400).json({ success: false, message: 'merchantName is required' });
  }

  const merchant = await createMerchant(merchantName, merchantName);
  return res.status(201).json({ success: true, data: { merchantName: merchant.name } });
});
```

- [ ] **Step 5: Preserve compatibility for existing tests**

Keep the current recommendation logic assertions unchanged, but convert them to async calls because the service becomes repository-backed.

- [ ] **Step 6: Run the targeted service tests**

Run: `cd api && npm test -- --runInBand src/tests/recommendationService.test.ts src/tests/adminRoutes.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/cyli/payment-recommender && git add api/src/services/recommendationService.ts api/src/routes/recommendations.ts api/src/routes/admin.ts api/src/data.ts api/src/tests/recommendationService.test.ts api/src/tests/adminRoutes.test.ts && git commit -m "feat(api): persist recommendations via repository"
```

### Task 4: Add Prisma seed and persistence tests

**Files:**
- Create: `api/prisma/seed.ts`
- Create: `api/src/tests/persistence.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Consumes: SQLite `DATABASE_URL`
- Produces: deterministic seeded merchant and reward data, plus verification that data survives restart/reinitialization

- [ ] **Step 1: Write the seed script**

```ts
// api/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const familyMart = await prisma.merchant.upsert({
    where: { name: 'FamilyMart' },
    update: {},
    create: { name: 'FamilyMart', chainName: 'FamilyMart' }
  });

  const linePay = await prisma.paymentMethod.upsert({
    where: { name: 'LINE Pay' },
    update: {},
    create: { name: 'LINE Pay', type: 'mobile_payment' }
  });

  const visa = await prisma.paymentMethod.upsert({
    where: { name: 'VISA' },
    update: {},
    create: { name: 'VISA', type: 'credit_card' }
  });

  await prisma.merchantPaymentAcceptance.upsert({
    where: { merchantId_paymentMethodId: { merchantId: familyMart.id, paymentMethodId: linePay.id } },
    update: {},
    create: { merchantId: familyMart.id, paymentMethodId: linePay.id }
  });

  await prisma.merchantPaymentAcceptance.upsert({
    where: { merchantId_paymentMethodId: { merchantId: familyMart.id, paymentMethodId: visa.id } },
    update: {},
    create: { merchantId: familyMart.id, paymentMethodId: visa.id }
  });

  await prisma.rewardRule.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      merchantId: familyMart.id,
      paymentMethodId: linePay.id,
      cashbackRate: 0.03,
      amountThreshold: 0,
      validityStart: new Date('2026-01-01'),
      validityEnd: new Date('2026-12-31'),
      promotionNote: '3% cashback at FamilyMart'
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add persistence test**

```ts
// api/src/tests/persistence.test.ts
import { PrismaClient } from '@prisma/client';

describe('data persistence', () => {
  test('persists merchant records across a new Prisma client', async () => {
    const clientA = new PrismaClient({ datasources: { db: { url: 'file:./prisma/test.db' } } });
    const clientB = new PrismaClient({ datasources: { db: { url: 'file:./prisma/test.db' } } });

    await clientA.merchant.create({
      data: { name: 'Persist Mart', chainName: 'Persist Mart' }
    });

    const persisted = await clientB.merchant.findUnique({
      where: { name: 'Persist Mart' }
    });

    expect(persisted?.name).toBe('Persist Mart');

    await clientA.$disconnect();
    await clientB.$disconnect();
  });
});
```

- [ ] **Step 3: Add seed command to package.json**

```json
"db:seed": "ts-node prisma/seed.ts"
```

- [ ] **Step 4: Run the persistence test and seed script**

Run: `cd api && npx prisma db push && npm run db:seed && npm test -- --runInBand src/tests/persistence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/cyli/payment-recommender && git add api/prisma/seed.ts api/src/tests/persistence.test.ts api/package.json && git commit -m "feat(api): add sqlite seed and persistence checks"
```

### Task 5: Documentation and final validation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-31-sqlite-persistence-design.md`
- Test: full backend test suite

**Interfaces:**
- Consumes: finished repository-backed API and seeds
- Produces: final developer instructions and validated working state

- [ ] **Step 1: Update README with setup instructions**

```md
## Database setup

```bash
cd api
cp .env.example .env
npx prisma db push
npm run db:seed
```

Use `DATABASE_URL="file:./prisma/dev.db"` for local SQLite development.
```

- [ ] **Step 2: Update the design doc if implementation introduces constraints**

Check the spec for mismatches and adjust wording only where implementation truly changes the original plan.

- [ ] **Step 3: Run the full backend suite**

Run: `cd api && npm test -- --runInBand`
Expected: all tests pass, including recommendation, admin API, and persistence coverage.

- [ ] **Step 4: Final commit**

```bash
cd /home/cyli/payment-recommender && git add README.md docs/superpowers/specs/2026-08-31-sqlite-persistence-design.md && git commit -m "docs: finalize sqlite persistence setup"
```

---

## Implementation Risk Notes

- Database schema changes must be tested with a clean SQLite file to avoid cross-test contamination.
- The `cashbackRate` field should be stored as a decimal-friendly value and converted to `number` when computing recommendation payloads.
- If an admin route creates a new merchant with a duplicate normalized name, the repository and route should return a clear conflict error instead of silently modifying the original row.
- Do not introduce SQLite-specific SQL into route or service code; keep all data access in repository files.

## Exit Criteria

The task is complete only when:

- the recommendation API still returns the same examples as before,
- admin-created merchants and reward rules persist after restart,
- the seed is idempotent,
- all tests pass,
- the design doc and developer README explain the SQLite-first setup and future migration strategy.
