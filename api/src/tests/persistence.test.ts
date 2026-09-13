import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { seedDatabase } from '../../prisma/seed';
import { updateMerchant } from '../repositories/merchantRepository';
import {
  findPaymentMethodByLegacyIdOrName,
  updatePaymentMethod
} from '../repositories/paymentMethodRepository';

jest.setTimeout(15000);

const workerId = process.env.JEST_WORKER_ID ?? process.pid.toString();
const testDatabaseUrl =
  process.env.DATABASE_URL ?? `file:${path.resolve(__dirname, `../../prisma/test-${workerId}.db`)}`;

async function resetManagedRows(prisma: PrismaClient) {
  await prisma.rewardRule.deleteMany();
  await prisma.merchantPaymentAcceptance.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.paymentMethod.deleteMany();
}

describe('data persistence', () => {
  beforeEach(async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      await resetManagedRows(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('persists merchant records across a new Prisma client', async () => {
    const clientA = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });
    const clientB = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      await clientA.merchant.create({
        data: {
          name: 'Persist Mart',
          normalizedName: 'persist mart',
          chainName: 'Persist Mart'
        }
      });

      const persisted = await clientB.merchant.findUnique({
        where: { name: 'Persist Mart' }
      });

      expect(persisted?.name).toBe('Persist Mart');
    } finally {
      await clientA.$disconnect();
      await clientB.$disconnect();
    }
  });

  test('seed reruns do not duplicate or erase managed rows', async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      await seedDatabase(prisma);
      await seedDatabase(prisma);

      const merchantCount = await prisma.merchant.count();
      const paymentMethodCount = await prisma.paymentMethod.count();
      const acceptanceCount = await prisma.merchantPaymentAcceptance.count();
      const rewardRuleCount = await prisma.rewardRule.count();

      expect(merchantCount).toBe(4);
      expect(paymentMethodCount).toBe(5);
      expect(acceptanceCount).toBe(8);
      expect(rewardRuleCount).toBe(8);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('seed backfills normalized keys for existing payment methods', async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      const paymentMethod = await prisma.paymentMethod.create({
        data: { name: 'Custom Pay', type: 'mobile_payment' }
      });

      await seedDatabase(prisma);

      await expect(
        prisma.paymentMethod.findUniqueOrThrow({ where: { id: paymentMethod.id } })
      ).resolves.toMatchObject({ normalizedName: 'custompay' });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('seed reports existing payment methods with colliding normalized keys', async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      await prisma.paymentMethod.createMany({
        data: [
          { name: 'Legacy Pay', type: 'mobile_payment' },
          { name: 'legacy-pay', type: 'mobile_payment' }
        ]
      });

      await expect(seedDatabase(prisma)).rejects.toThrow('payment method normalization conflict');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('seed backfills an acceptance mapping for a legacy orphan reward rule', async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      const merchant = await prisma.merchant.create({
        data: { name: 'Legacy Shop', normalizedName: 'legacy shop' }
      });
      const paymentMethod = await prisma.paymentMethod.create({
        data: { name: 'Legacy Card', type: 'credit_card' }
      });

      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
      await prisma.$executeRawUnsafe(
        `INSERT INTO RewardRule (merchantId, paymentMethodId, cashbackRate, amountThreshold, validityStart, validityEnd)
         VALUES (${merchant.id}, ${paymentMethod.id}, 0.05, 0, '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z')`
      );
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

      await seedDatabase(prisma);

      await expect(
        prisma.merchantPaymentAcceptance.findUnique({
          where: {
            merchantId_paymentMethodId: {
              merchantId: merchant.id,
              paymentMethodId: paymentMethod.id
            }
          }
        })
      ).resolves.not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('seed preserves renamed seeded catalog records', async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDatabaseUrl }
      }
    });

    try {
      await seedDatabase(prisma);
      const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
      const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });

      await updateMerchant(merchant.id, 'Family Mart');
      await updatePaymentMethod(method.id, { name: 'Visa Platinum', type: 'credit_card' });
      await seedDatabase(prisma);

      await expect(prisma.merchant.count()).resolves.toBe(4);
      await expect(prisma.paymentMethod.count()).resolves.toBe(5);
      await expect(
        prisma.merchant.findUniqueOrThrow({ where: { id: merchant.id } })
      ).resolves.toMatchObject({ name: 'Family Mart' });
      await expect(
        prisma.paymentMethod.findUniqueOrThrow({ where: { id: method.id } })
      ).resolves.toMatchObject({ name: 'Visa Platinum' });
      await expect(findPaymentMethodByLegacyIdOrName('visa')).resolves.toMatchObject({
        id: method.id,
        name: 'Visa Platinum'
      });
    } finally {
      await prisma.$disconnect();
    }
  });
});
