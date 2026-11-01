import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrateCardNetworks } from '../../prisma/migrateCardNetworks';

describe('migrateCardNetworks', () => {
  let databasePath: string;
  let prisma: PrismaClient;

  beforeEach(async () => {
    databasePath = path.join(os.tmpdir(), `card-network-migration-${process.pid}-${Date.now()}.db`);
    prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } });
    await prisma.$executeRawUnsafe('CREATE TABLE "Issuer" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL)');
    await prisma.$executeRawUnsafe('CREATE TABLE "PaymentMethod" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "type" TEXT NOT NULL)');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Card" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "issuerId" INTEGER NOT NULL,
        "networkId" INTEGER NOT NULL,
        CONSTRAINT "Card_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "Card_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "Card_issuerId_name_key" ON "Card"("issuerId", "name")');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "MerchantCardExclusion" (
        "cardId" INTEGER NOT NULL PRIMARY KEY,
        CONSTRAINT "MerchantCardExclusion_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRaw`INSERT INTO "Issuer" ("name") VALUES ('Taishin')`;
    await prisma.$executeRaw`INSERT INTO "PaymentMethod" ("name", "type") VALUES ('Visa', 'credit_card'), ('JCB', 'credit_card')`;
    await prisma.$executeRaw`INSERT INTO "Card" ("name", "kind", "issuerId", "networkId") VALUES ('Rose', 'credit', 1, 1), ('Gold', 'credit', 1, 2)`;
    await prisma.$executeRaw`INSERT INTO "MerchantCardExclusion" ("cardId") VALUES (2)`;
  });

  afterEach(async () => {
    await prisma.$disconnect();
    await fs.rm(databasePath, { force: true });
  });

  test('copies each legacy card network into CardNetwork and drops Card.networkId', async () => {
    await migrateCardNetworks(prisma);

    const memberships = await prisma.$queryRaw<Array<{ cardId: number; networkId: number }>>`
      SELECT "cardId", "networkId" FROM "CardNetwork" ORDER BY "cardId"
    `;
    expect(memberships).toEqual([
      { cardId: 1, networkId: 1 },
      { cardId: 2, networkId: 2 }
    ]);

    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Card")');
    expect(columns.map((column) => column.name)).toEqual(['id', 'name', 'kind', 'issuerId']);

    const cards = await prisma.$queryRaw<Array<{ id: number; name: string }>>`SELECT "id", "name" FROM "Card" ORDER BY "id"`;
    expect(cards).toEqual([{ id: 1, name: 'Rose' }, { id: 2, name: 'Gold' }]);
    expect(await prisma.$queryRawUnsafe('PRAGMA foreign_key_check')).toEqual([]);
    const exclusions = await prisma.$queryRaw<Array<{ cardId: number }>>`SELECT "cardId" FROM "MerchantCardExclusion"`;
    expect(exclusions).toEqual([{ cardId: 2 }]);
  });

  test('is a no-op when the database is already migrated or has no Card table', async () => {
    await migrateCardNetworks(prisma);
    await expect(migrateCardNetworks(prisma)).resolves.toBeUndefined();

    const empty = new PrismaClient({ datasources: { db: { url: `file:${databasePath}-empty` } } });
    try {
      await expect(migrateCardNetworks(empty)).resolves.toBeUndefined();
    } finally {
      await empty.$disconnect();
      await fs.rm(`${databasePath}-empty`, { force: true });
    }
  });
});
