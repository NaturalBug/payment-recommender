import { PrismaClient } from '@prisma/client';
import { normalizeMerchantName, normalizePaymentMethodKey } from '../src/lib/normalization';
import { getDatabaseUrl } from '../src/config/env';

export const merchants = [
  { name: 'FamilyMart', chainName: 'FamilyMart' },
  { name: '7-ELEVEN', chainName: '7-ELEVEN' },
  { name: 'Starbucks', chainName: 'Starbucks' },
  { name: 'PX Mart', chainName: 'PX Mart' }
] as const;

export const paymentMethods = [
  { name: 'VISA', type: 'credit_card' },
  { name: 'AMEX Gold', type: 'credit_card' },
  { name: 'LINE Pay', type: 'mobile_payment' },
  { name: 'JKO Pay', type: 'mobile_payment' },
  { name: 'Cash', type: 'debit_card' }
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

export async function seedDatabase(prisma: PrismaClient) {
  for (const merchant of merchants) {
    await prisma.merchant.upsert({
      where: { name: merchant.name },
      update: { normalizedName: normalizeMerchantName(merchant.name) },
      create: {
        name: merchant.name,
        normalizedName: normalizeMerchantName(merchant.name),
        chainName: merchant.chainName
      }
    });
  }

  for (const method of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { name: method.name },
      update: { normalizedName: normalizePaymentMethodKey(method.name) },
      create: {
        name: method.name,
        normalizedName: normalizePaymentMethodKey(method.name),
        type: method.type
      }
    });
  }

  for (const acceptance of merchantPaymentAcceptances) {
    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { name: acceptance.merchantName }
    });
    const paymentMethod = await prisma.paymentMethod.findUniqueOrThrow({
      where: { name: acceptance.paymentMethodName }
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
    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { name: rule.merchantName }
    });
    const paymentMethod = await prisma.paymentMethod.findUniqueOrThrow({
      where: { name: rule.paymentMethodName }
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
