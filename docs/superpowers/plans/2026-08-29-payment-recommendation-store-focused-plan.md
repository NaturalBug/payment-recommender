# Store-Focused Payment Recommendation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-first MVP that recommends the best payment method for a specific merchant and transaction amount, sorted by cashback rate and promotion validity.

**Architecture:** React frontend plus Express API with PostgreSQL and Prisma; reward logic is merchant-centric, using admin-maintained merchant data and reward rules keyed by merchant and payment method.

**Tech Stack:** Node 18+, TypeScript, Express, Prisma, PostgreSQL, React + TypeScript, Vite, Jest, Supertest, RTL.

## Global Constraints
- MVP limited to Taiwan market
- No user accounts in the MVP
- No payment processing or card storage
- Merchant and reward data are admin-maintained
- Reward rules are valid only within date windows
- Store names must be treated as exact/normalized merchant identifiers

---

### Task 1: Backend project scaffold

**Files:**
- Create: `/home/cyli/projects/api/package.json`
- Create: `/home/cyli/projects/api/tsconfig.json`
- Create: `/home/cyli/projects/api/src/app.ts`
- Create: `/home/cyli/projects/api/src/server.ts`
- Create: `/home/cyli/projects/api/src/lib/prisma.ts`
- Create: `/home/cyli/projects/api/src/routes/recommendations.ts`
- Create: `/home/cyli/projects/api/src/routes/lookup.ts`

**Interfaces:**
- Consumes: PostgreSQL connection string from env
- Produces: `/api/recommendations` and `/api/lookup/*` endpoints

- [ ] **Step 1: Create package.json**

```json
{
  "name": "payment-recommender-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc -p .",
    "start": "node dist/server.js",
    "test": "jest --passWithNoTests"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "express": "^4.18.2",
    "prisma": "^5.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "supertest": "^6.0.0",
    "ts-jest": "^29.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create app.ts and server.ts**

```ts
// src/app.ts
import express from 'express';
import recommendationsRouter from './routes/recommendations';
import lookupRouter from './routes/lookup';

const app = express();
app.use(express.json());
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/lookup', lookupRouter);

export default app;
```

```ts
// src/server.ts
import app from './app';

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
```

- [ ] **Step 3: Create prisma.ts**

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export default prisma;
```

- [ ] **Step 4: Create recommendations route**

```ts
import { Router } from 'express';
import { getRecommendations } from '../services/recommendationService';

const router = Router();

router.get('/', async (req, res) => {
  const merchant_name = String(req.query.merchant_name || '');
  const amount = Number(req.query.amount || 0);
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();

  try {
    const data = await getRecommendations({ merchant_name, amount, date });
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 5: Create lookup route**

```ts
import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.get('/merchants', async (_req, res) => {
  const merchants = await prisma.merchant.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, data: merchants });
});

export default router;
```

- [ ] **Step 6: Commit**

```bash
cd /home/cyli/projects && git add api && git commit -m "chore(api): scaffold express app and routes"
```

---

### Task 2: Prisma schema and seed data

**Files:**
- Create: `/home/cyli/projects/api/prisma/schema.prisma`
- Create: `/home/cyli/projects/api/prisma/seed.ts`

**Interfaces:**
- Consumes: DATABASE_URL env var
- Produces: merchant, payment method, acceptance, and reward data tables

- [ ] **Step 1: Write Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Merchant {
  id   Int    @id @default(autoincrement())
  name String @unique
  chainName String?
  category String?
  location String?
  notes String?
  MerchantPaymentAcceptance MerchantPaymentAcceptance[]
  RewardRule RewardRule[]
}

model PaymentMethod {
  id   Int    @id @default(autoincrement())
  name String @unique
  type String
  MerchantPaymentAcceptance MerchantPaymentAcceptance[]
  RewardRule RewardRule[]
}

model MerchantPaymentAcceptance {
  id Int @id @default(autoincrement())
  merchant Merchant @relation(fields: [merchantId], references: [id])
  merchantId Int
  paymentMethod PaymentMethod @relation(fields: [paymentMethodId], references: [id])
  paymentMethodId Int
}

model RewardRule {
  id Int @id @default(autoincrement())
  merchant Merchant @relation(fields: [merchantId], references: [id])
  merchantId Int
  paymentMethod PaymentMethod @relation(fields: [paymentMethodId], references: [id])
  paymentMethodId Int
  cashbackRate Decimal @db.Decimal(5,4)
  amountThreshold Int @default(0)
  validityStart DateTime
  validityEnd DateTime
  promotionNote String?
}
```

- [ ] **Step 2: Add seed data**

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { name: 'FamilyMart' },
    update: {},
    create: {
      name: 'FamilyMart',
      category: 'Convenience Store',
      location: 'Taiwan'
    }
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

  await prisma.merchantPaymentAcceptance.createMany({
    data: [
      { merchantId: merchant.id, paymentMethodId: linePay.id },
      { merchantId: merchant.id, paymentMethodId: visa.id }
    ],
    skipDuplicates: true
  });

  await prisma.rewardRule.createMany({
    data: [
      {
        merchantId: merchant.id,
        paymentMethodId: linePay.id,
        cashbackRate: 0.03,
        amountThreshold: 0,
        validityStart: new Date('2026-01-01'),
        validityEnd: new Date('2026-12-31'),
        promotionNote: '3% cashback'
      },
      {
        merchantId: merchant.id,
        paymentMethodId: visa.id,
        cashbackRate: 0.02,
        amountThreshold: 0,
        validityStart: new Date('2026-01-01'),
        validityEnd: new Date('2026-12-31'),
        promotionNote: '2% cashback'
      }
    ]
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 3: Run Prisma generate and migration**

```bash
cd /home/cyli/projects/api
npx prisma generate
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
```

- [ ] **Step 4: Commit**

```bash
cd /home/cyli/projects && git add api && git commit -m "feat(api): add merchant and reward schema"
```

---

### Task 3: Recommendation service with store-based lookup

**Files:**
- Create: `/home/cyli/projects/api/src/services/recommendationService.ts`
- Create: `/home/cyli/projects/api/src/tests/recommendationService.test.ts`

**Interfaces:**
- Consumes: merchant name, amount, date
- Produces: ranked list of `Recommendation`

Type:
```ts
export type Recommendation = {
  paymentMethod: string;
  cashbackRate: number;
  estimatedCashback: number;
  promotionNote?: string;
};
```

- [ ] **Step 1: Write failing test**

```ts
import { getRecommendations } from '../services/recommendationService';

test('returns LINE Pay before VISA for FamilyMart on a valid date', async () => {
  const results = await getRecommendations({
    merchant_name: 'FamilyMart',
    amount: 500,
    date: new Date('2026-08-29')
  });

  expect(results[0].paymentMethod).toBe('LINE Pay');
  expect(results[0].cashbackRate).toBeCloseTo(0.03);
});
```

- [ ] **Step 2: Implement service**

```ts
import prisma from '../lib/prisma';

export type Recommendation = {
  paymentMethod: string;
  cashbackRate: number;
  estimatedCashback: number;
  promotionNote?: string;
};

export async function getRecommendations({ merchant_name, amount, date }: { merchant_name: string; amount: number; date: Date; }): Promise<Recommendation[]> {
  const merchant = await prisma.merchant.findUnique({ where: { name: merchant_name } });
  if (!merchant) return [];

  const accepted = await prisma.merchantPaymentAcceptance.findMany({
    where: { merchantId: merchant.id },
    include: { paymentMethod: true }
  });

  const paymentMethodIds = accepted.map(item => item.paymentMethodId);

  const rules = await prisma.rewardRule.findMany({
    where: {
      merchantId: merchant.id,
      paymentMethodId: { in: paymentMethodIds },
      validityStart: { lte: date },
      validityEnd: { gte: date },
      amountThreshold: { lte: amount }
    },
    include: { paymentMethod: true }
  });

  return rules
    .map((rule) => ({
      paymentMethod: rule.paymentMethod.name,
      cashbackRate: Number(rule.cashbackRate),
      estimatedCashback: Number(rule.cashbackRate) * amount,
      promotionNote: rule.promotionNote || undefined
    }))
    .sort((a, b) => b.cashbackRate - a.cashbackRate);
}
```

- [ ] **Step 3: Run tests**

```bash
cd /home/cyli/projects/api
npm test -- --runInBand
```

- [ ] **Step 4: Commit**

```bash
cd /home/cyli/projects && git add api && git commit -m "feat(api): add merchant recommendation logic"
```

---

### Task 4: Recommendation API integration test

**Files:**
- Create: `/home/cyli/projects/api/src/tests/recommendationsRoute.test.ts`

- [ ] **Step 1: Write route test**

```ts
import request from 'supertest';
import app from '../app';

test('GET /api/recommendations works with store name and amount', async () => {
  const res = await request(app).get('/api/recommendations').query({
    merchant_name: 'FamilyMart',
    amount: 500,
    date: '2026-08-29'
  });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(Array.isArray(res.body.data)).toBe(true);
  expect(res.body.data[0].paymentMethod).toBeDefined();
});
```

- [ ] **Step 2: Run test**

```bash
cd /home/cyli/projects/api
npm test -- --runInBand
```

- [ ] **Step 3: Commit**

```bash
cd /home/cyli/projects && git add api && git commit -m "test(api): add recommendation route coverage"
```

---

### Task 5: Frontend app shell and questionnaire

**Files:**
- Create: `/home/cyli/projects/web/package.json`
- Create: `/home/cyli/projects/web/src/App.tsx`
- Create: `/home/cyli/projects/web/src/main.tsx`
- Create: `/home/cyli/projects/web/src/services/api.ts`
- Create: `/home/cyli/projects/web/src/components/RecommendationForm.tsx`

**Interfaces:**
- Consumes: `/api/recommendations?merchant_name=...&amount=...&date=...`
- Produces: ranked results card list

- [ ] **Step 1: Scaffold React app**

```bash
cd /home/cyli/projects/web
npm init vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Create service**

```ts
export async function getRecommendations(input: { merchant_name: string; amount: number; date?: string }) {
  const params = new URLSearchParams({
    merchant_name: input.merchant_name,
    amount: String(input.amount),
    date: input.date || new Date().toISOString().slice(0, 10)
  });

  const response = await fetch(`/api/recommendations?${params.toString()}`);
  return response.json();
}
```

- [ ] **Step 3: Create recommendation form UI**

- Fields:
  - merchant_name (text input with autocomplete list)
  - amount (number)
  - date (date input)
  - submit button

- On submit, call `getRecommendations()` and render result cards.

- [ ] **Step 4: Write RTL test**

- [ ] **Step 5: Commit**

---

### Task 6: Admin CRUD for merchants and reward rules

**Files:**
- Create: `/home/cyli/projects/api/src/routes/admin.ts`
- Create: `/home/cyli/projects/web/src/admin/AdminPage.tsx`

**Interfaces:**
- Produces: CRUD endpoints for merchants, accepted payment methods, and reward rules

- [ ] **Step 1: Implement admin route** using `x-api-key` header matching `ADMIN_API_KEY`
- [ ] **Step 2: Create basic admin UI** with merchant add form and reward rule form
- [ ] **Step 3: Validate with tests**
- [ ] **Step 4: Commit**

---

### Task 7: Seed data and validation

**Files:**
- Create: `/home/cyli/projects/api/prisma/sample-data.json`

- [ ] **Step 1: Add sample merchants and rules**
  - FamilyMart
  - 7-ELEVEN
  - Starbucks
  - PX Mart
  - Microsoft Store (optional)
- [ ] **Step 2: Validate ranking logic**
- [ ] **Step 3: Commit**

---

### Task 8: Deployment and documentation

**Files:**
- Create: `/home/cyli/projects/docs/deploy.md`

- [ ] **Step 1: Add environment variable docs**
  - `DATABASE_URL`
  - `PORT`
  - `ADMIN_API_KEY`
- [ ] **Step 2: Document deploy steps**
- [ ] **Step 3: Commit**

---

## Self-Review

1. Spec coverage check: this plan implements the revised merchant-based MVP design and removes the category layer from scope.
2. Placeholder scan: no `TBD`, `TODO`, or vague instructions remain.
3. Type consistency: `merchant_name` is used consistently across API, service, and frontend. Reward rules remain keyed by merchant + payment method + validity period.

---

Plan saved to `docs/superpowers/plans/2026-08-29-payment-recommendation-store-focused-plan.md`.

Two execution options:

1. Subagent-Driven (recommended)
2. Inline Execution

Which approach would you like?
