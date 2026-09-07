import prisma from '../lib/prisma';
import { getRecommendations } from '../services/recommendationService';

describe('getRecommendations', () => {
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

    const familyMart = await prisma.merchant.create({ data: { name: 'FamilyMart', chainName: 'FamilyMart' } });
    const sevenEleven = await prisma.merchant.create({ data: { name: '7-ELEVEN', chainName: '7-ELEVEN' } });
    const starbucks = await prisma.merchant.create({ data: { name: 'Starbucks', chainName: 'Starbucks' } });
    const pxMart = await prisma.merchant.create({ data: { name: 'PX Mart', chainName: 'PX Mart' } });

    const visa = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
    const linePay = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'LINE Pay' } });
    const amex = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'AMEX Gold' } });
    const jko = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'JKO Pay' } });
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } });

    await prisma.rewardRule.createMany({
      data: [
        {
          merchantId: familyMart.id,
          paymentMethodId: linePay.id,
          cashbackRate: 0.03,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: '3% cashback at FamilyMart'
        },
        {
          merchantId: familyMart.id,
          paymentMethodId: visa.id,
          cashbackRate: 0.02,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: '2% cashback at FamilyMart'
        },
        {
          merchantId: sevenEleven.id,
          paymentMethodId: linePay.id,
          cashbackRate: 0.025,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: '2.5% at 7-ELEVEN'
        },
        {
          merchantId: sevenEleven.id,
          paymentMethodId: jko.id,
          cashbackRate: 0.018,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: '1.8% at 7-ELEVEN'
        },
        {
          merchantId: starbucks.id,
          paymentMethodId: amex.id,
          cashbackRate: 0.04,
          amountThreshold: 100,
          validityStart: new Date('2026-08-01T00:00:00.000Z'),
          validityEnd: new Date('2026-08-31T23:59:59.999Z'),
          promotionNote: '4% August coffee promotion'
        },
        {
          merchantId: starbucks.id,
          paymentMethodId: visa.id,
          cashbackRate: 0.015,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: '1.5% standard cashback'
        },
        {
          merchantId: pxMart.id,
          paymentMethodId: cash.id,
          cashbackRate: 0,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: 'Cash has no reward, but zero fee'
        },
        {
          merchantId: pxMart.id,
          paymentMethodId: visa.id,
          cashbackRate: 0.01,
          amountThreshold: 0,
          validityStart: new Date('2026-01-01T00:00:00.000Z'),
          validityEnd: new Date('2026-12-31T23:59:59.999Z'),
          promotionNote: '1% on general purchases'
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('ranks LINE Pay above VISA for FamilyMart', async () => {
    const results = await getRecommendations({
      merchant_name: 'FamilyMart',
      amount: 500,
      date: new Date('2026-08-29')
    });

    expect(results[0].paymentMethod).toBe('LINE Pay');
    expect(results[0].cashbackRate).toBeCloseTo(0.03);
  });

  test('returns empty array for unknown merchant', async () => {
    const results = await getRecommendations({
      merchant_name: 'NotAStore',
      amount: 500,
      date: new Date('2026-08-29')
    });

    expect(results).toEqual([]);
  });

  test('keeps standard rebates after a seasonal promo expires', async () => {
    const results = await getRecommendations({
      merchant_name: 'Starbucks',
      amount: 500,
      date: new Date('2026-09-01')
    });

    expect(results[0].paymentMethod).toBe('VISA');
    expect(results[0].cashbackRate).toBeCloseTo(0.015);
  });

  test('ranks cash lower than a reward-bearing method', async () => {
    const results = await getRecommendations({
      merchant_name: 'PX Mart',
      amount: 1000,
      date: new Date('2026-08-29')
    });

    expect(results[0].paymentMethod).toBe('VISA');
  });
});
