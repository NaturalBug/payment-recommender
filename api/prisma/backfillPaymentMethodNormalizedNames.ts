import { Prisma, PrismaClient } from '@prisma/client';
import { normalizePaymentMethodKey } from '../src/lib/normalization';
import { getDatabaseUrl } from '../src/config/env';

type PaymentMethodColumn = {
  name: string;
};

type LegacyPaymentMethod = {
  id: number;
  name: string;
  normalizedName: string;
};

export async function backfillPaymentMethodNormalizedNames(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const tables = await transaction.$queryRaw<Array<{ name: string }>>`
      SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'PaymentMethod'
    `;
    if (tables.length === 0) {
      return;
    }

    let columns = await transaction.$queryRawUnsafe<PaymentMethodColumn[]>('PRAGMA table_info("PaymentMethod")');
    if (!columns.some((column) => column.name === 'normalizedName')) {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "PaymentMethod" ADD COLUMN "normalizedName" TEXT NOT NULL DEFAULT \'\''
      );
      columns = [...columns, { name: 'normalizedName' }];
    }

    if (!columns.some((column) => column.name === 'name')) {
      throw new Error('PaymentMethod table has no name column');
    }

    const methods = await transaction.$queryRawUnsafe<LegacyPaymentMethod[]>(
      'SELECT "id", "name", "normalizedName" FROM "PaymentMethod" ORDER BY "id"'
    );
    const normalizedNames = new Map<number, string>();
    const owners = new Map<string, string>();

    for (const method of methods) {
      const normalizedName = method.normalizedName || normalizePaymentMethodKey(method.name);
      if (!normalizedName) {
        throw new Error(`payment method "${method.name}" has no normalized name`);
      }

      const existingName = owners.get(normalizedName);
      if (existingName) {
        throw new Error(
          `duplicate normalized names for payment methods "${existingName}" and "${method.name}"`
        );
      }
      owners.set(normalizedName, method.name);
      normalizedNames.set(method.id, normalizedName);
    }

    for (const method of methods) {
      if (!method.normalizedName) {
        await transaction.$executeRaw`
          UPDATE "PaymentMethod" SET "normalizedName" = ${normalizedNames.get(method.id)}
          WHERE "id" = ${method.id}
        `;
      }
    }

    await transaction.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethod_normalizedName_key" ON "PaymentMethod"("normalizedName")'
    );
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: getDatabaseUrl() } } });

  try {
    await backfillPaymentMethodNormalizedNames(prisma);
    console.info('PaymentMethod normalized names are ready.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Unable to backfill payment method names: ${error.message}`);
    } else {
      console.error('Unable to backfill payment method names:', error);
    }
    process.exitCode = 1;
  });
}
