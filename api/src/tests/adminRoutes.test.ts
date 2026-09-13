import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import * as merchantRepository from '../repositories/merchantRepository';
import * as paymentMethodRepository from '../repositories/paymentMethodRepository';
import * as rewardRuleRepository from '../repositories/rewardRuleRepository';
import { RepositoryConflictError } from '../repositories/errors';

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
    const response = await request(app).get('/api/admin/merchants').set('X-Admin-API-Key', 'test-admin-key');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'FamilyMart' })])
    );
  });

  test('creates a new merchant', async () => {
    const response = await request(app)
      .post('/api/admin/merchants')
      .set('X-Admin-API-Key', 'test-admin-key')
      .send({ merchantName: 'MomoMart' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({ name: 'MomoMart' });
    expect(typeof response.body.data.id).toBe('number');
  });

  test('returns a conflict for a duplicate merchant POST', async () => {
    const response = await request(app)
      .post('/api/admin/merchants')
      .set('X-Admin-API-Key', 'test-admin-key')
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
      .set('X-Admin-API-Key', 'test-admin-key')
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

    const response = await request(app).get('/api/admin/reward-rules').set('X-Admin-API-Key', 'test-admin-key');

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('merchant 999999 not found');
  });

  test('creates a reward rule for a merchant', async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: method.id }
    });

    const response = await request(app)
      .post('/api/admin/reward-rules')
      .set('X-Admin-API-Key', 'test-admin-key')
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
            merchantId: merchant.id,
            paymentMethodId: method.id
          }
        }
      })
    ).resolves.not.toBeNull();
  });

  test('surfaces unexpected reward-rule write errors as server errors', async () => {
    jest.spyOn(rewardRuleRepository, 'createRewardRule').mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app)
      .post('/api/admin/reward-rules')
      .set('X-Admin-API-Key', 'test-admin-key')
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

  test('rejects a reward rule for an unaccepted payment method', async () => {
    const response = await request(app)
      .post('/api/admin/reward-rules')
      .set('X-Admin-API-Key', 'test-admin-key')
      .send({
        merchantName: 'FamilyMart',
        paymentMethodId: 'amex',
        cashbackRate: 0.05,
        amountThreshold: 0,
        validityStart: '2026-09-01',
        validityEnd: '2026-09-30'
      });

    expect(response).toMatchObject({
      status: 400,
      body: {
        success: false,
        message: 'payment method is not accepted by this merchant'
      }
    });
  });

  test('lists public merchants without an admin API key', async () => {
    const response = await request(app).get('/api/merchants');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'FamilyMart' })])
    );
  });

  test('manages a payment method and merchant acceptance', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    const method = await request(app).post('/api/admin/payment-methods').set(key)
      .send({ name: 'Taiwan Pay', type: 'mobile_payment' });
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });

    const acceptance = await request(app).put(`/api/admin/merchants/${merchant.id}/payment-methods/${method.body.data.id}`).set(key);
    expect(acceptance.status).toBe(201);
    await expect(request(app).delete(`/api/admin/merchants/${merchant.id}`).set(key))
      .resolves.toMatchObject({ status: 409 });
  });

  test('rejects duplicate payment method names and incomplete requests', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };

    const duplicate = await request(app)
      .post('/api/admin/payment-methods')
      .set(key)
      .send({ name: 'visa', type: 'credit_card' });
    const incomplete = await request(app)
      .post('/api/admin/payment-methods')
      .set(key)
      .send({ name: 'New Pay' });

    expect(duplicate).toMatchObject({
      status: 409,
      body: { success: false, message: 'payment method already exists' }
    });
    expect(incomplete).toMatchObject({
      status: 400,
      body: { success: false, message: 'name and type are required' }
    });
  });

  test('rejects removal of an accepted payment method with reward rules', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
    await prisma.merchantPaymentAcceptance.create({ data: { merchantId: merchant.id, paymentMethodId: method.id } });
    await prisma.rewardRule.create({
      data: {
        merchantId: merchant.id, paymentMethodId: method.id, cashbackRate: 0.01, amountThreshold: 0,
        validityStart: new Date('2026-09-01'), validityEnd: new Date('2026-09-30')
      }
    });

    const response = await request(app)
      .delete(`/api/admin/merchants/${merchant.id}/payment-methods/${method.id}`).set(key);
    expect(response).toMatchObject({
      status: 409,
      body: { success: false, message: 'acceptance has reward rules' }
    });
  });

  test('returns not found when removing a missing acceptance', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });

    const response = await request(app)
      .delete(`/api/admin/merchants/${merchant.id}/payment-methods/${method.id}`)
      .set(key);

    expect(response).toMatchObject({
      status: 404,
      body: { success: false, message: 'acceptance not found' }
    });
  });

  test('manages payment methods via CRUD endpoints', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };

    // List
    const listRes = await request(app).get('/api/admin/payment-methods').set(key);
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'VISA' })])
    );

    // Create
    const createRes = await request(app).post('/api/admin/payment-methods').set(key)
      .send({ name: 'EasyCard', type: 'transit_card' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({ name: 'EasyCard', type: 'transit_card' });
    const createdId = createRes.body.data.id;

    // Update
    const patchRes = await request(app).patch(`/api/admin/payment-methods/${createdId}`).set(key)
      .send({ name: 'EasyCard 2.0', type: 'contactless' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data).toMatchObject({ id: createdId, name: 'EasyCard 2.0', type: 'contactless' });

    // Delete
    const deleteRes = await request(app).delete(`/api/admin/payment-methods/${createdId}`).set(key);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ success: true, data: { deleted: true } });

    // 404 for deleted
    const deleteNotFound = await request(app).delete(`/api/admin/payment-methods/${createdId}`).set(key);
    expect(deleteNotFound.status).toBe(404);
  });

  test('maps payment method update conflicts and delete failures', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
    jest.spyOn(paymentMethodRepository, 'updatePaymentMethod')
      .mockRejectedValueOnce(new RepositoryConflictError('payment method already exists'));
    jest.spyOn(paymentMethodRepository, 'deletePaymentMethod')
      .mockRejectedValueOnce(new Error('database unavailable'));

    const conflict = await request(app)
      .patch(`/api/admin/payment-methods/${method.id}`)
      .set(key)
      .send({ name: 'Renamed VISA' });
    const failure = await request(app)
      .delete(`/api/admin/payment-methods/${method.id}`)
      .set(key);

    expect(conflict).toMatchObject({
      status: 409,
      body: { success: false, message: 'payment method already exists' }
    });
    expect(failure).toMatchObject({
      status: 500,
      body: { success: false, message: 'database unavailable' }
    });
  });

  test('manages merchant updates, acceptances, and deletion', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    const createRes = await request(app).post('/api/admin/merchants').set(key)
      .send({ merchantName: 'Temp Mart' });
    expect(createRes.status).toBe(201);
    const merchantId = createRes.body.data.id;

    // Update merchant
    const updateRes = await request(app).patch(`/api/admin/merchants/${merchantId}`).set(key)
      .send({ merchantName: 'Temp Mart Updated' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Temp Mart Updated');

    // Add acceptance
    const visa = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
    const putAcc = await request(app).put(`/api/admin/merchants/${merchantId}/payment-methods/${visa.id}`).set(key);
    expect(putAcc.status).toBe(201);

    // List acceptances
    const listAcc = await request(app).get(`/api/admin/merchants/${merchantId}/payment-methods`).set(key);
    expect(listAcc.status).toBe(200);
    expect(listAcc.body.data).toEqual([expect.objectContaining({ id: visa.id, name: 'VISA' })]);

    // Delete acceptance
    const delAcc = await request(app).delete(`/api/admin/merchants/${merchantId}/payment-methods/${visa.id}`).set(key);
    expect(delAcc.status).toBe(200);
    expect(delAcc.body).toEqual({ success: true, data: { deleted: true } });

    // Delete merchant
    const delMerchant = await request(app).delete(`/api/admin/merchants/${merchantId}`).set(key);
    expect(delMerchant.status).toBe(200);
    expect(delMerchant.body).toEqual({ success: true, data: { deleted: true } });
  });

  test('recommends a newly managed catalog payment method', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    const merchant = await request(app)
      .post('/api/admin/merchants')
      .set(key)
      .send({ merchantName: 'Catalog Mart' });
    const method = await request(app)
      .post('/api/admin/payment-methods')
      .set(key)
      .send({ name: 'Catalog Pay', type: 'mobile_payment' });

    await request(app)
      .put(`/api/admin/merchants/${merchant.body.data.id}/payment-methods/${method.body.data.id}`)
      .set(key);
    await request(app)
      .post('/api/admin/reward-rules')
      .set(key)
      .send({
        merchantName: 'Catalog Mart',
        paymentMethodId: String(method.body.data.id),
        cashbackRate: 0.06,
        amountThreshold: 0,
        validityStart: '2026-09-01',
        validityEnd: '2026-09-30'
      });

    const recommendation = await request(app)
      .get('/api/recommendations')
      .query({ merchant_name: 'Catalog Mart', amount: 500, date: '2026-09-15' });

    expect(recommendation.status).toBe(200);
    expect(recommendation.body.data[0]).toMatchObject({
      paymentMethod: 'Catalog Pay',
      cashbackRate: 0.06
    });
  });

  test('validates IDs and returns 404 for invalid or missing IDs', async () => {
    const key = { 'X-Admin-API-Key': 'test-admin-key' };
    await expect(request(app).get('/api/admin/merchants/invalid/payment-methods').set(key))
      .resolves.toMatchObject({ status: 404 });
    await expect(request(app).patch('/api/admin/merchants/-1').set(key).send({ merchantName: 'Bad' }))
      .resolves.toMatchObject({ status: 404 });
    await expect(request(app).patch('/api/admin/merchants/999999').set(key).send({ merchantName: 'Bad' }))
      .resolves.toMatchObject({ status: 404 });
    await expect(request(app).delete('/api/admin/merchants/0').set(key))
      .resolves.toMatchObject({ status: 404 });
    await expect(request(app).patch('/api/admin/payment-methods/invalid').set(key).send({ name: 'Bad' }))
      .resolves.toMatchObject({ status: 404 });
    await expect(request(app).delete('/api/admin/payment-methods/999999').set(key))
      .resolves.toMatchObject({ status: 404 });
  });
});
