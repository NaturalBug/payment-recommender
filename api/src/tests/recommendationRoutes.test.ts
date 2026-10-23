import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('recommendation context routes', () => {
  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.promotionDraft.deleteMany();
    await prisma.rewardRule.deleteMany();
    await prisma.merchantBranch.deleteMany();
    await prisma.outlet.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.importRun.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.paymentMethod.deleteMany();

    const paymentMethod = await prisma.paymentMethod.create({
      data: { name: 'iPASS MONEY', normalizedName: 'ipassmoney', type: 'mobile_payment' }
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Context Store', normalizedName: 'contextstore' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: paymentMethod.id }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('rejects malformed branch and Outlet IDs', async () => {
    const malformedBranch = await request(app)
      .get('/api/recommendations')
      .query({ merchant_name: 'Context Store', amount: 500, branch_id: '1x' });
    const malformedOutlet = await request(app)
      .get('/api/recommendations')
      .query({ merchant_name: 'Context Store', amount: 500, outlet_id: '-1' });

    expect(malformedBranch.status).toBe(400);
    expect(malformedOutlet.status).toBe(400);
  });

  test('returns 404 for a well-formed but unknown branch ID', async () => {
    const response = await request(app)
      .get('/api/recommendations')
      .query({ merchant_name: 'Context Store', amount: 500, branch_id: 999999 });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('branch not found');
  });

  test('rejects a branch whose saved Outlet differs from the requested Outlet', async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'Context Store' } });
    const branchOutlet = await prisma.outlet.create({
      data: { name: 'Branch venue', normalizedName: 'branchvenue' }
    });
    const otherOutlet = await prisma.outlet.create({
      data: { name: 'Other venue', normalizedName: 'othervenue' }
    });
    const branch = await prisma.merchantBranch.create({
      data: {
        merchantId: merchant.id,
        name: 'Context branch',
        normalizedName: 'contextbranch',
        outletId: branchOutlet.id
      }
    });

    const response = await request(app)
      .get('/api/recommendations')
      .query({
        merchant_name: merchant.name,
        amount: 500,
        branch_id: branch.id,
        outlet_id: otherOutlet.id
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('branch does not belong to the selected outlet');
  });
});
