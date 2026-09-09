import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { seedDatabase } from '../../prisma/seed';

const testDatabaseUrl = `file:${path.resolve(__dirname, '../../prisma/test.db')}`;

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
        data: { name: 'Persist Mart', chainName: 'Persist Mart' }
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
});
