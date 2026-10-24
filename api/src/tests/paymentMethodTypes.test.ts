import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';

const key = { 'X-Admin-API-Key': 'test-admin-key' };

describe('payment method type catalog', () => {
  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.promotionDraft.deleteMany();
    await prisma.rewardRule.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.importRun.deleteMany();
    await prisma.paymentMethod.deleteMany();
    await prisma.paymentMethodType.deleteMany();
    await prisma.paymentMethodType.createMany({
      data: [{ name: 'mobile_payment' }, { name: 'transit_card' }]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('lists catalog types, including types only used by existing payment methods', async () => {
    await prisma.paymentMethod.create({
      data: { name: 'Legacy Card', normalizedName: 'legacycard', type: 'legacy_card' }
    });

    const response = await request(app).get('/api/admin/payment-method-types').set(key);

    expect(response.status).toBe(200);
    expect(response.body.data.map((type: { name: string }) => type.name)).toEqual([
      'legacy_card',
      'mobile_payment',
      'transit_card'
    ]);
  });

  test('creates a type and rejects duplicates and invalid names', async () => {
    const created = await request(app).post('/api/admin/payment-method-types').set(key)
      .send({ name: 'Stored_Value' });
    const duplicate = await request(app).post('/api/admin/payment-method-types').set(key)
      .send({ name: 'transit_card' });
    const invalid = await request(app).post('/api/admin/payment-method-types').set(key)
      .send({ name: 'not valid!' });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'stored_value' });
    expect(duplicate).toMatchObject({ status: 409, body: { message: 'payment method type already exists' } });
    expect(invalid.status).toBe(400);
  });

  test('requires payment methods to use a catalog type', async () => {
    const accepted = await request(app).post('/api/admin/payment-methods').set(key)
      .send({ name: 'iPASS MONEY', type: 'transit_card' });
    const unknown = await request(app).post('/api/admin/payment-methods').set(key)
      .send({ name: 'Mystery Pay', type: 'mystery' });
    const unknownPatch = await request(app).patch(`/api/admin/payment-methods/${accepted.body.data.id}`)
      .set(key).send({ type: 'mystery' });

    expect(accepted.status).toBe(201);
    expect(unknown).toMatchObject({ status: 400, body: { message: 'payment method type is not in the catalog' } });
    expect(unknownPatch.status).toBe(400);
  });

  test('deletes an unused type but refuses to delete one still in use', async () => {
    await prisma.paymentMethod.create({
      data: { name: 'iPASS MONEY', normalizedName: 'ipassmoney', type: 'transit_card' }
    });
    const types = await prisma.paymentMethodType.findMany();
    const unused = types.find((type) => type.name === 'mobile_payment')!;
    const used = types.find((type) => type.name === 'transit_card')!;

    const deleted = await request(app).delete(`/api/admin/payment-method-types/${unused.id}`).set(key);
    const refused = await request(app).delete(`/api/admin/payment-method-types/${used.id}`).set(key);
    const missing = await request(app).delete(`/api/admin/payment-method-types/${unused.id}`).set(key);

    expect(deleted.status).toBe(200);
    expect(refused).toMatchObject({ status: 409, body: { message: 'payment method type is in use' } });
    expect(missing.status).toBe(404);
  });
});
