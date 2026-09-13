import { PrismaClient } from '@prisma/client';
import { normalizeMerchantName, normalizePaymentMethodKey } from '../src/lib/normalization';
import { getDatabaseUrl } from '../src/config/env';

export const merchants = [
  { seedKey: 'familymart', name: 'FamilyMart', chainName: 'FamilyMart' },
  { seedKey: '7-eleven', name: '7-ELEVEN', chainName: '7-ELEVEN' },
  { seedKey: 'starbucks', name: 'Starbucks', chainName: 'Starbucks' },
  { seedKey: 'px-mart', name: 'PX Mart', chainName: 'PX Mart' }
] as const;

export const paymentMethods = [
  { seedKey: 'visa', legacyId: 'visa', name: 'VISA', type: 'credit_card' },
  { seedKey: 'amex-gold', legacyId: 'amex', name: 'AMEX Gold', type: 'credit_card' },
  { seedKey: 'line-pay', legacyId: 'linepay', name: 'LINE Pay', type: 'mobile_payment' },
  { seedKey: 'jko-pay', legacyId: 'jko', name: 'JKO Pay', type: 'mobile_payment' },
  { seedKey: 'cash', legacyId: 'cash', name: 'Cash', type: 'debit_card' }
] as const;

export const merchantPaymentAcceptances = [
  { merchantName: 'FamilyMart', paymentMethodName: 'LINE Pay' },
  { merchantName: 'FamilyMart', paymentMethodName: 'VISA' },
  { merchantName: '7-ELEVEN', paymentMethodName: 'LINE Pay' },
  { merchantName: '7-ELEVEN', paymentMethodName: 'JKO Pay' },
  { merchantName: 'Starbucks', paymentMethodName: 'AMEX Gold' },
  { merchantName: 'Starbucks', paymentMethodName: 'VISA' },
  { merchantName: 'PX Mart', paymentMethodName: 'Cash' },
  { merchantName: 'PX Mart', paymentMethodName: 'VISA' }
] as const;

export const rewardRules = [
  { id: 1, merchantName: 'FamilyMart', paymentMethodName: 'LINE Pay', cashbackRate: 0.03, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '3% cashback at FamilyMart' },
  { id: 2, merchantName: 'FamilyMart', paymentMethodName: 'VISA', cashbackRate: 0.02, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2% cashback at FamilyMart' },
  { id: 3, merchantName: '7-ELEVEN', paymentMethodName: 'LINE Pay', cashbackRate: 0.025, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2.5% at 7-ELEVEN' },
  { id: 4, merchantName: '7-ELEVEN', paymentMethodName: 'JKO Pay', cashbackRate: 0.018, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.8% at 7-ELEVEN' },
  { id: 5, merchantName: 'Starbucks', paymentMethodName: 'AMEX Gold', cashbackRate: 0.04, amountThreshold: 100, validityStart: '2026-08-01', validityEnd: '2026-08-31', promotionNote: '4% August coffee promotion' },
  { id: 6, merchantName: 'Starbucks', paymentMethodName: 'VISA', cashbackRate: 0.015, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.5% standard cashback' },
  { id: 7, merchantName: 'PX Mart', paymentMethodName: 'Cash', cashbackRate: 0, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: 'Cash has no reward, but zero fee' },
  { id: 8, merchantName: 'PX Mart', paymentMethodName: 'VISA', cashbackRate: 0.01, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1% on general purchases' }
] as const;

async function backfillPaymentMethodNormalizedNames(prisma: PrismaClient): Promise<void> {
  const methods = await prisma.paymentMethod.findMany({
    select: { id: true, name: true, normalizedName: true }
  });
  const methodIdByNormalizedName = new Map<string, number>();

  for (const method of methods) {
    const normalizedName = normalizePaymentMethodKey(method.name);
    const existingMethodId = methodIdByNormalizedName.get(normalizedName);
    if (existingMethodId !== undefined && existingMethodId !== method.id) {
      throw new Error(`payment method normalization conflict: "${method.name}"`);
    }
    methodIdByNormalizedName.set(normalizedName, method.id);
  }

  await prisma.$transaction(
    methods.map((method) => prisma.paymentMethod.update({
      where: { id: method.id },
      data: { normalizedName: normalizePaymentMethodKey(method.name) }
    }))
  );
}

async function backfillSeedKeys(prisma: PrismaClient): Promise<void> {
  const [existingMerchants, existingPaymentMethods] = await Promise.all([
    prisma.merchant.findMany({ select: { id: true, name: true, seedKey: true } }),
    prisma.paymentMethod.findMany({ select: { id: true, name: true, seedKey: true, legacyId: true } })
  ]);

  await prisma.$transaction([
    ...existingMerchants.flatMap((merchant) => {
      const seed = merchants.find((item) => normalizeMerchantName(item.name) === normalizeMerchantName(merchant.name));
      return seed && !merchant.seedKey
        ? [prisma.merchant.update({ where: { id: merchant.id }, data: { seedKey: seed.seedKey } })]
        : [];
    }),
    ...existingPaymentMethods.flatMap((paymentMethod) => {
      const seed = paymentMethods.find(
        (item) => normalizePaymentMethodKey(item.name) === normalizePaymentMethodKey(paymentMethod.name)
      );
      return seed && !paymentMethod.seedKey
        ? [prisma.paymentMethod.update({
          where: { id: paymentMethod.id },
          data: { seedKey: seed.seedKey, legacyId: paymentMethod.legacyId ?? seed.legacyId }
        })]
        : [];
    })
  ]);
}

export async function seedDatabase(prisma: PrismaClient) {
  await backfillSeedKeys(prisma);

  for (const merchant of merchants) {
    await prisma.merchant.upsert({
      where: { seedKey: merchant.seedKey },
      update: {},
      create: {
        name: merchant.name,
        normalizedName: normalizeMerchantName(merchant.name),
        seedKey: merchant.seedKey,
        chainName: merchant.chainName
      }
    });
  }

  for (const method of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { seedKey: method.seedKey },
      update: {},
      create: {
        name: method.name,
        normalizedName: normalizePaymentMethodKey(method.name),
        legacyId: method.legacyId,
        seedKey: method.seedKey,
        type: method.type
      }
    });
  }

  await backfillPaymentMethodNormalizedNames(prisma);

  for (const acceptance of merchantPaymentAcceptances) {
    const merchantSeed = merchants.find((item) => item.name === acceptance.merchantName);
    const paymentMethodSeed = paymentMethods.find((item) => item.name === acceptance.paymentMethodName);
    if (!merchantSeed || !paymentMethodSeed) {
      throw new Error('seed acceptance references an unknown catalog record');
    }

    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { seedKey: merchantSeed.seedKey }
    });
    const paymentMethod = await prisma.paymentMethod.findUniqueOrThrow({
      where: { seedKey: paymentMethodSeed.seedKey }
    });

    await prisma.merchantPaymentAcceptance.upsert({
      where: {
        merchantId_paymentMethodId: {
          merchantId: merchant.id,
          paymentMethodId: paymentMethod.id
        }
      },
      update: {},
      create: {
        merchantId: merchant.id,
        paymentMethodId: paymentMethod.id
      }
    });
  }

  for (const rule of rewardRules) {
    const merchantSeed = merchants.find((item) => item.name === rule.merchantName);
    const paymentMethodSeed = paymentMethods.find((item) => item.name === rule.paymentMethodName);
    if (!merchantSeed || !paymentMethodSeed) {
      throw new Error('seed reward rule references an unknown catalog record');
    }

    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { seedKey: merchantSeed.seedKey }
    });
    const paymentMethod = await prisma.paymentMethod.findUniqueOrThrow({
      where: { seedKey: paymentMethodSeed.seedKey }
    });

    await prisma.rewardRule.upsert({
      where: { id: rule.id },
      update: {},
      create: {
        id: rule.id,
        merchantId: merchant.id,
        paymentMethodId: paymentMethod.id,
        cashbackRate: rule.cashbackRate,
        amountThreshold: rule.amountThreshold,
        validityStart: new Date(`${rule.validityStart}T00:00:00.000Z`),
        validityEnd: new Date(`${rule.validityEnd}T23:59:59.999Z`),
        promotionNote: rule.promotionNote
      }
    });
  }
}

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: getDatabaseUrl() }
    }
  });

  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
