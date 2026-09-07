import { PrismaClient } from '@prisma/client';

describe('prisma schema access', () => {
  test('can create and read a merchant row', async () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: 'file:./prisma/test.db' } }
    });

    await prisma.$executeRaw`PRAGMA foreign_keys = ON;`;
    await prisma.merchant.deleteMany({ where: { name: 'TestMart' } });
    await prisma.merchant.create({
      data: { name: 'TestMart', chainName: 'TestMart' }
    });

    const merchant = await prisma.merchant.findUnique({ where: { name: 'TestMart' } });
    expect(merchant?.name).toBe('TestMart');

    await prisma.$disconnect();
  });
});
