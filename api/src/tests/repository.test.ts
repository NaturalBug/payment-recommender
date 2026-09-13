import prisma from '../lib/prisma';
import { createMerchant, deleteMerchant, listMerchants, updateMerchant } from '../repositories/merchantRepository';
import {
  addAcceptance,
  removeAcceptance
} from '../repositories/merchantPaymentAcceptanceRepository';
import {
  createPaymentMethod,
  deletePaymentMethod,
  updatePaymentMethod
} from '../repositories/paymentMethodRepository';
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
    await addAcceptance(merchant.id, paymentMethod.id);
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

  test('updates a merchant and rejects deletion while it has an acceptance', async () => {
    const merchant = await createMerchant('Old Mart');
    const method = await createPaymentMethod({ name: 'Test Pay', type: 'mobile_payment' });
    await addAcceptance(merchant.id, method.id);

    await expect(updateMerchant(merchant.id, 'New Mart')).resolves.toMatchObject({ name: 'New Mart' });
    await expect(deleteMerchant(merchant.id)).rejects.toThrow('accepted payment methods');
  });

  test('updates a payment method and rejects deletion while it is accepted', async () => {
    const merchant = await createMerchant('Test Mart');
    const method = await createPaymentMethod({ name: 'Old Pay', type: 'credit_card' });
    await addAcceptance(merchant.id, method.id);

    await expect(updatePaymentMethod(method.id, { name: 'New Pay', type: 'mobile_payment' }))
      .resolves.toMatchObject({ name: 'New Pay', type: 'mobile_payment' });
    await expect(deletePaymentMethod(method.id)).rejects.toThrow('accepted by merchants');
  });

  test('rejects creating a payment method with an existing normalized key', async () => {
    const paymentMethod = await createPaymentMethod({ name: 'Line Pay', type: 'mobile_payment' });

    await expect(
      createPaymentMethod({ name: 'line-pay', type: 'mobile_payment' })
    ).rejects.toThrow('payment method already exists');
    await expect(
      prisma.paymentMethod.findUniqueOrThrow({ where: { id: paymentMethod.id } })
    ).resolves.toMatchObject({ normalizedName: 'linepay' });
  });

  test('rejects updating a payment method to another method normalized key', async () => {
    const firstMethod = await createPaymentMethod({ name: 'Line Pay', type: 'mobile_payment' });
    const secondMethod = await createPaymentMethod({ name: 'JKO Pay', type: 'mobile_payment' });

    await expect(
      updatePaymentMethod(secondMethod.id, { name: 'line-pay', type: 'mobile_payment' })
    ).rejects.toThrow('payment method already exists');
    await expect(updatePaymentMethod(firstMethod.id, { name: 'line-pay', type: 'mobile_payment' }))
      .resolves.toMatchObject({ name: 'line-pay' });
  });

  test('rejects removing an acceptance that has a reward rule', async () => {
    const merchant = await createMerchant('Reward Mart');
    const method = await createPaymentMethod({ name: 'Reward Pay', type: 'credit_card' });
    await addAcceptance(merchant.id, method.id);
    await createRewardRule({
      merchantId: merchant.id,
      paymentMethodId: method.id,
      cashbackRate: 0.01,
      amountThreshold: 0,
      validityStart: new Date('2026-09-01'),
      validityEnd: new Date('2026-09-30')
    });

    await expect(removeAcceptance(merchant.id, method.id)).rejects.toThrow('reward rules');
  });

  test('returns false when removing a missing acceptance with an orphaned reward rule', async () => {
    const merchant = await createMerchant('Orphaned Reward Mart');
    const method = await createPaymentMethod({ name: 'Orphaned Reward Pay', type: 'credit_card' });

    await prisma.rewardRule.create({
      data: {
        merchantId: merchant.id,
        paymentMethodId: method.id,
        cashbackRate: 0.01,
        amountThreshold: 0,
        validityStart: new Date('2026-09-01'),
        validityEnd: new Date('2026-09-30')
      }
    });

    await expect(removeAcceptance(merchant.id, method.id)).resolves.toBe(false);
  });

  test('rejects creating a reward rule without an acceptance', async () => {
    const merchant = await createMerchant('Unaccepted Reward Mart');
    const method = await createPaymentMethod({ name: 'Unaccepted Reward Pay', type: 'credit_card' });

    await expect(
      createRewardRule({
        merchantId: merchant.id,
        paymentMethodId: method.id,
        cashbackRate: 0.01,
        amountThreshold: 0,
        validityStart: new Date('2026-09-01'),
        validityEnd: new Date('2026-09-30')
      })
    ).rejects.toThrow('payment method is not accepted by this merchant');
  });

  test('rethrows unexpected delete errors', async () => {
    const databaseError = new Error('database unavailable');
    const deleteSpy = jest.spyOn(prisma.rewardRule, 'delete').mockRejectedValueOnce(databaseError);

    await expect(deleteRewardRule(1)).rejects.toBe(databaseError);

    deleteSpy.mockRestore();
  });
});
