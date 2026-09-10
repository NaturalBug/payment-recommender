import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import * as merchantRepository from '../repositories/merchantRepository';
import * as rewardRuleRepository from '../repositories/rewardRuleRepository';

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
        { name: 'FamilyMart', normalizedName: 'familymart', chainName: 'FamilyMart' },
        { name: '7-ELEVEN', normalizedName: '7-eleven', chainName: '7-ELEVEN' },
        { name: 'Starbucks', normalizedName: 'starbucks', chainName: 'Starbucks' },
        { name: 'PX Mart', normalizedName: 'px mart', chainName: 'PX Mart' }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('returns a conflict for a duplicate merchant POST', async () => {
    const response = await request(app)
      .post('/api/admin/merchants')
      .send({ merchantName: ' familymart ' });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('already exists');
    await expect(prisma.merchant.count()).resolves.toBe(4);
  });

  test('surfaces unexpected merchant write errors as server errors', async () => {
    jest.spyOn(merchantRepository, 'createMerchant').mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app)
      .post('/api/admin/merchants')
      .send({ merchantName: 'MomoMart' });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('database unavailable');
  });

  test('fails instead of returning an unknown merchant for an orphaned reward rule', async () => {
    jest.spyOn(rewardRuleRepository, 'listRewardRules').mockResolvedValue([
      {
        id: 1,
        merchantId: 999999,
        paymentMethodId: 1,
        paymentMethodName: 'VISA',
        cashbackRate: 0.05,
        amountThreshold: 0,
        validityStart: new Date('2026-09-01'),
        validityEnd: new Date('2026-09-30'),
        promotionNote: null
      }
    ]);

    const response = await request(app).get('/api/admin/reward-rules');

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('merchant 999999 not found');
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
    await expect(
      prisma.merchantPaymentAcceptance.findUnique({
        where: {
          merchantId_paymentMethodId: {
            merchantId: (await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } })).id,
            paymentMethodId: (await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } })).id
          }
        }
      })
    ).resolves.not.toBeNull();
  });

  test('surfaces unexpected reward-rule write errors as server errors', async () => {
    jest.spyOn(rewardRuleRepository, 'createRewardRule').mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app)
      .post('/api/admin/reward-rules')
      .send({
        merchantName: 'FamilyMart',
        paymentMethodId: 'visa',
        cashbackRate: 0.05,
        amountThreshold: 200,
        validityStart: '2026-09-01',
        validityEnd: '2026-09-30'
      });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('database unavailable');
  });

  test('does not recommend a reward rule for an unaccepted payment method', async () => {
    const familyMart = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const amex = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'AMEX Gold' } });

    await prisma.rewardRule.create({
      data: {
        merchantId: familyMart.id,
        paymentMethodId: amex.id,
        cashbackRate: 0.05,
        amountThreshold: 0,
        validityStart: new Date('2026-09-01T00:00:00.000Z'),
        validityEnd: new Date('2026-09-30T23:59:59.999Z'),
        promotionNote: 'Unaccepted method'
      }
    });

    const response = await request(app)
      .get('/api/recommendations')
      .query({ merchant_name: 'FamilyMart', amount: 500, date: '2026-09-15' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
  });
});
