import prisma from '../lib/prisma';
import { createMerchant, listMerchants } from '../repositories/merchantRepository';
import { createRewardRule, deleteRewardRule, listRewardRules } from '../repositories/rewardRuleRepository';

describe('repository layer', () => {
  beforeEach(async () => {
    await prisma.rewardRule.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.paymentMethod.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('creates and reads persisted merchant data', async () => {
    const merchant = await createMerchant('SQLite Mart', 'SQLite Mart');
    const merchants = await listMerchants();

    expect(merchants.some((item) => item.name === merchant.name)).toBe(true);
  });

  test('creates and reads persisted reward rules with payment method names', async () => {
    const merchant = await createMerchant('Rule Mart', 'Rule Mart');
    const paymentMethod = await prisma.paymentMethod.create({
      data: { name: 'Test Visa', type: 'credit_card' }
    });
    const rule = await createRewardRule({
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      cashbackRate: 0.05,
      amountThreshold: 100,
      validityStart: new Date('2026-09-01'),
      validityEnd: new Date('2026-09-30'),
      promotionNote: 'Five percent back'
    });

    const rules = await listRewardRules();
    const persistedRule = rules.find((item) => item.id === rule.id);

    expect(persistedRule).toMatchObject({
      id: rule.id,
      paymentMethodName: 'Test Visa',
      cashbackRate: 0.05
    });
    expect(typeof persistedRule?.cashbackRate).toBe('number');
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
  });

  test('returns false when deleting a missing reward rule', async () => {
    await expect(deleteRewardRule(999999)).resolves.toBe(false);
  });

  test('rethrows unexpected delete errors', async () => {
    const databaseError = new Error('database unavailable');
    const deleteSpy = jest.spyOn(prisma.rewardRule, 'delete').mockRejectedValueOnce(databaseError);

    await expect(deleteRewardRule(1)).rejects.toBe(databaseError);

    deleteSpy.mockRestore();
  });
});
