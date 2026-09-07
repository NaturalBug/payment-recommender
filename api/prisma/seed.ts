import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const paymentMethods = [
  { name: 'VISA', type: 'credit_card' },
  { name: 'AMEX Gold', type: 'credit_card' },
  { name: 'LINE Pay', type: 'mobile_payment' },
  { name: 'JKO Pay', type: 'mobile_payment' },
  { name: 'Cash', type: 'debit_card' }
] as const;

const merchantNames = ['FamilyMart', '7-ELEVEN', 'Starbucks', 'PX Mart'];

const rewardRules = [
  { merchantName: 'FamilyMart', paymentMethodName: 'LINE Pay', cashbackRate: 0.03, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '3% cashback at FamilyMart' },
  { merchantName: 'FamilyMart', paymentMethodName: 'VISA', cashbackRate: 0.02, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2% cashback at FamilyMart' },
  { merchantName: '7-ELEVEN', paymentMethodName: 'LINE Pay', cashbackRate: 0.025, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2.5% at 7-ELEVEN' },
  { merchantName: '7-ELEVEN', paymentMethodName: 'JKO Pay', cashbackRate: 0.018, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.8% at 7-ELEVEN' },
  { merchantName: 'Starbucks', paymentMethodName: 'AMEX Gold', cashbackRate: 0.04, amountThreshold: 100, validityStart: '2026-08-01', validityEnd: '2026-08-31', promotionNote: '4% August coffee promotion' },
  { merchantName: 'Starbucks', paymentMethodName: 'VISA', cashbackRate: 0.015, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.5% standard cashback' },
  { merchantName: 'PX Mart', paymentMethodName: 'Cash', cashbackRate: 0, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: 'Cash has no reward, but zero fee' },
  { merchantName: 'PX Mart', paymentMethodName: 'VISA', cashbackRate: 0.01, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1% on general purchases' }
] as const;

async function main() {
  for (const method of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { name: method.name },
      update: { type: method.type },
      create: { name: method.name, type: method.type }
    });
  }

  for (const merchantName of merchantNames) {
    await prisma.merchant.upsert({
      where: { name: merchantName },
      update: { chainName: merchantName },
      create: { name: merchantName, chainName: merchantName }
    });
  }

  for (const rule of rewardRules) {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: rule.merchantName } });
    const paymentMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: rule.paymentMethodName } });
    const existingRule = await prisma.rewardRule.findFirst({
      where: {
        merchantId: merchant.id,
        paymentMethodId: paymentMethod.id,
        amountThreshold: rule.amountThreshold,
        validityStart: new Date(`${rule.validityStart}T00:00:00.000Z`),
        validityEnd: new Date(`${rule.validityEnd}T23:59:59.999Z`)
      }
    });

    if (!existingRule) {
      await prisma.rewardRule.create({
        data: {
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
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
