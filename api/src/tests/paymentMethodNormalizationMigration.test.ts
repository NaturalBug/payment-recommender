import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { backfillPaymentMethodNormalizedNames } from '../../prisma/backfillPaymentMethodNormalizedNames';

describe('backfillPaymentMethodNormalizedNames', () => {
  let databasePath: string;
  let prisma: PrismaClient;

  beforeEach(async () => {
    databasePath = path.join(os.tmpdir(), `payment-method-backfill-${process.pid}-${Date.now()}.db`);
    prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } });
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "PaymentMethod" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL UNIQUE,
        "type" TEXT NOT NULL
      )
    `);
    await prisma.$executeRaw`INSERT INTO "PaymentMethod" ("name", "type") VALUES ('AMEX Gold', 'credit_card')`;
    await prisma.$executeRaw`INSERT INTO "PaymentMethod" ("name", "type") VALUES ('LINE Pay', 'mobile_payment')`;
  });

  afterEach(async () => {
    await prisma.$disconnect();
    await fs.rm(databasePath, { force: true });
  });

  test('backfills normalized names for existing payment methods without losing rows', async () => {
    await backfillPaymentMethodNormalizedNames(prisma);

    const methods = await prisma.$queryRaw<Array<{ id: number; name: string; normalizedName: string }>>`
      SELECT "id", "name", "normalizedName" FROM "PaymentMethod" ORDER BY "id"
    `;

    expect(methods).toEqual([
      { id: 1, name: 'AMEX Gold', normalizedName: 'amexgold' },
      { id: 2, name: 'LINE Pay', normalizedName: 'linepay' }
    ]);

    await expect(backfillPaymentMethodNormalizedNames(prisma)).resolves.toBeUndefined();
  });

  test('rejects normalized-name collisions instead of overwriting existing rows', async () => {
    await prisma.$executeRaw`INSERT INTO "PaymentMethod" ("name", "type") VALUES ('amexgold', 'credit_card')`;

    await expect(backfillPaymentMethodNormalizedNames(prisma)).rejects.toThrow(/duplicate normalized names/i);

    const methods = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT "id", "name" FROM "PaymentMethod" ORDER BY "id"
    `;
    expect(methods).toHaveLength(3);
  });
});
