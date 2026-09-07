import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

describe('admin routes', () => {
  beforeEach(async () => {
    await prisma.rewardRule.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.paymentMethod.deleteMany();

    await prisma.paymentMethod.createMany({
      data: [
        { name: 'VISA', type: 'credit_card' },
        { name: 'AMEX Gold', type: 'credit_card' },
        { name: 'LINE Pay', type: 'mobile_payment' },
        { name: 'JKO Pay', type: 'mobile_payment' },
        { name: 'Cash', type: 'debit_card' }
      ]
    });

    await prisma.merchant.createMany({
      data: [
        { name: 'FamilyMart', chainName: 'FamilyMart' },
        { name: '7-ELEVEN', chainName: '7-ELEVEN' },
        { name: 'Starbucks', chainName: 'Starbucks' },
        { name: 'PX Mart', chainName: 'PX Mart' }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('lists merchants from the catalog', async () => {
    const response = await request(app).get('/api/admin/merchants');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toContain('FamilyMart');
  });

  test('creates a new merchant', async () => {
    const response = await request(app)
      .post('/api/admin/merchants')
      .send({ merchantName: 'MomoMart' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.merchantName).toBe('MomoMart');
  });

  test('creates a reward rule for a merchant', async () => {
    const response = await request(app)
      .post('/api/admin/reward-rules')
      .send({
        merchantName: 'FamilyMart',
        paymentMethodId: 'visa',
        cashbackRate: 0.05,
        amountThreshold: 200,
        validityStart: '2026-09-01',
        validityEnd: '2026-09-30',
        promotionNote: '5% back for September'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.merchantName).toBe('FamilyMart');
    expect(response.body.data.cashbackRate).toBe(0.05);
  });
});
