import { Prisma, PrismaClient } from '@prisma/client';
import { getDatabaseUrl } from '../src/config/env';
import { ensureDatabaseDirectory } from './ensureDatabaseDirectory';

type TableColumn = {
  name: string;
};

async function tableColumns(prisma: PrismaClient, table: string): Promise<string[]> {
  const columns = await prisma.$queryRawUnsafe<TableColumn[]>(`PRAGMA table_info("${table}")`);
  return columns.map((column) => column.name);
}

// One-off migration for databases created before cards could have several networks.
// Foreign keys are switched off for the table rebuild so cascades cannot delete dependent rows.
export async function migrateCardNetworks(prisma: PrismaClient): Promise<void> {
  const cardColumns = await tableColumns(prisma, 'Card');
  if (!cardColumns.includes('networkId')) {
    return;
  }

  await prisma.$queryRawUnsafe('PRAGMA foreign_keys=OFF');
  try {
    const [{ foreign_keys: foreignKeys }] = await prisma.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>(
      'PRAGMA foreign_keys'
    );
    if (Number(foreignKeys) !== 0) {
      throw new Error('unable to disable foreign keys for the card network migration');
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CardNetwork" (
        "cardId" INTEGER NOT NULL,
        "networkId" INTEGER NOT NULL,
        PRIMARY KEY ("cardId", "networkId"),
        CONSTRAINT "CardNetwork_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CardNetwork_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT OR IGNORE INTO "CardNetwork" ("cardId", "networkId")
      SELECT "id", "networkId" FROM "Card"
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Card_new" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "issuerId" INTEGER NOT NULL,
        CONSTRAINT "Card_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Card_new" ("id", "name", "kind", "issuerId")
      SELECT "id", "name", "kind", "issuerId" FROM "Card"
    `);
    await prisma.$executeRawUnsafe('DROP TABLE "Card"');
    await prisma.$executeRawUnsafe('ALTER TABLE "Card_new" RENAME TO "Card"');
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "Card_issuerId_name_key" ON "Card"("issuerId", "name")'
    );

    const violations = await prisma.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error('card network migration left foreign key violations');
    }
  } finally {
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys=ON');
  }
}

async function main(): Promise<void> {
  // A single connection keeps the foreign key pragma on the connection that rebuilds the table.
  const databaseUrl = getDatabaseUrl();
  ensureDatabaseDirectory(databaseUrl);
  const separator = databaseUrl.includes('?') ? '&' : '?';
  const prisma = new PrismaClient({
    datasources: { db: { url: `${databaseUrl}${separator}connection_limit=1` } }
  });

  try {
    await migrateCardNetworks(prisma);
    console.info('Card networks are ready.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Unable to migrate card networks: ${error.message}`);
    } else {
      console.error('Unable to migrate card networks:', error);
    }
    process.exitCode = 1;
  });
}
