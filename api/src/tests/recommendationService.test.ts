import prisma from '../lib/prisma';
import { createImportRun } from '../repositories/promotionImportRepository';
import { getRecommendations } from '../services/recommendationService';

describe('getRecommendations', () => {
  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.promotionDraft.deleteMany();
    await prisma.rewardRule.deleteMany();
    await prisma.merchantBranch.deleteMany();
    await prisma.outlet.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.importRun.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.paymentMethod.deleteMany();

    await prisma.paymentMethod.createMany({
      data: [
        { name: 'VISA', normalizedName: 'visa', type: 'credit_card' },
        { name: 'AMEX Gold', normalizedName: 'amexgold', type: 'credit_card' },
        { name: 'LINE Pay', normalizedName: 'linepay', type: 'mobile_payment' },
        { name: 'JKO Pay', normalizedName: 'jkopay', type: 'mobile_payment' },
        { name: 'Cash', normalizedName: 'cash', type: 'debit_card' }
      ]
    });

    const familyMart = await prisma.merchant.create({
      data: { name: 'FamilyMart', normalizedName: 'familymart', chainName: 'FamilyMart' }
    });
    const sevenEleven = await prisma.merchant.create({
      data: { name: '7-ELEVEN', normalizedName: '7-eleven', chainName: '7-ELEVEN' }
    });
    const starbucks = await prisma.merchant.create({
      data: { name: 'Starbucks', normalizedName: 'starbucks', chainName: 'Starbucks' }
    });
    const pxMart = await prisma.merchant.create({
      data: { name: 'PX Mart', normalizedName: 'px mart', chainName: 'PX Mart' }
    });

    const visa = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'VISA' } });
    const linePay = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'LINE Pay' } });
    const amex = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'AMEX Gold' } });
    const jko = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'JKO Pay' } });
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } });

    await prisma.merchantPaymentAcceptance.createMany({
      data: [
        { merchantId: familyMart.id, paymentMethodId: linePay.id },
        { merchantId: familyMart.id, paymentMethodId: visa.id },
        { merchantId: sevenEleven.id, paymentMethodId: linePay.id },
        { merchantId: sevenEleven.id, paymentMethodId: jko.id },
        { merchantId: starbucks.id, paymentMethodId: amex.id },
        { merchantId: starbucks.id, paymentMethodId: visa.id },
        { merchantId: pxMart.id, paymentMethodId: cash.id },
        { merchantId: pxMart.id, paymentMethodId: visa.id }
      ]
    });

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

  async function createPromotion(input: {
    originType: 'merchant' | 'outlet';
    originMerchantIds?: number[];
    originOutletIds?: number[];
    eligibilityType: 'merchant_wide' | 'selected_branches' | 'outlet';
    paymentMethodId: number;
    eligibleBranchIds?: number[];
    excludedMerchantIds?: number[];
    excludedBranchIds?: number[];
    sourceUrl: string;
  }) {
    const run = await createImportRun('ipass-money');
    const draft = await prisma.promotionDraft.create({
      data: {
        importRunId: run.id,
        source: 'ipass-money',
        sourceFingerprint: input.sourceUrl,
        sourceUrl: input.sourceUrl,
        sourceTitle: 'Venue promotion',
        sourceContent: 'Promotion terms',
        fetchedAt: new Date('2026-09-01T00:00:00.000Z')
      }
    });

    return prisma.promotion.create({
      data: {
        sourceDraft: { connect: { id: draft.id } },
        originType: input.originType,
        originMerchants: {
          create: (input.originMerchantIds ?? []).map((merchantId) => ({ merchant: { connect: { id: merchantId } } }))
        },
        originOutlets: {
          create: (input.originOutletIds ?? []).map((outletId) => ({ outlet: { connect: { id: outletId } } }))
        },
        eligibilityType: input.eligibilityType,
        benefitType: 'fixed_discount',
        fixedDiscountAmount: 30,
        amountThreshold: 300,
        validityStart: new Date('2026-09-01T00:00:00.000Z'),
        validityEnd: new Date('2026-12-31T23:59:59.999Z'),
        sourceUrl: input.sourceUrl,
        sourceTitle: 'Venue promotion',
        paymentMethods: {
          create: [{ paymentMethod: { connect: { id: input.paymentMethodId } } }]
        },
        eligibleBranches: {
          create: (input.eligibleBranchIds ?? []).map((branchId) => ({
            branch: { connect: { id: branchId } }
          }))
        },
        excludedMerchants: {
          create: (input.excludedMerchantIds ?? []).map((merchantId) => ({
            merchant: { connect: { id: merchantId } }
          }))
        },
        excludedBranches: {
          create: (input.excludedBranchIds ?? []).map((branchId) => ({
            branch: { connect: { id: branchId } }
          }))
        }
      }
    });
  }

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

  test('omits an accepted payment method without a reward rule', async () => {
    const familyMart = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } });

    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: familyMart.id, paymentMethodId: cash.id }
    });

    const results = await getRecommendations({
      merchant_name: 'FamilyMart',
      amount: 500,
      date: new Date('2026-08-29')
    });

    expect(results.map((result) => result.paymentMethod)).toEqual(['LINE Pay', 'VISA']);
  });

  test('applies one promotion to every Outlet listed as an origin', async () => {
    const sevenEleven = await prisma.merchant.findUniqueOrThrow({ where: { name: '7-ELEVEN' } });
    const linePay = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'LINE Pay' } });
    const [mallA, mallB, mallC] = await Promise.all(['Mall A', 'Mall B', 'Mall C'].map((name) =>
      prisma.outlet.create({ data: { name, normalizedName: name.toLowerCase().replace(' ', '') } })
    ));
    const promotion = await createPromotion({
      originType: 'outlet',
      originOutletIds: [mallA.id, mallB.id],
      eligibilityType: 'outlet',
      paymentMethodId: linePay.id,
      sourceUrl: 'https://official.example/multi-mall'
    });
    const ids = async (outletId: number) => (await getRecommendations({
      merchant_name: sevenEleven.name,
      amount: 500,
      date: new Date('2026-10-01'),
      outlet_id: outletId
    })).map((item) => item.promotionId);

    expect(await ids(mallA.id)).toContain(promotion.id);
    expect(await ids(mallB.id)).toContain(promotion.id);
    expect(await ids(mallC.id)).not.toContain(promotion.id);
  });

  test('limits Outlet promotions to one physical venue and applies Merchant exclusions', async () => {
    const familyMart = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const sevenEleven = await prisma.merchant.findUniqueOrThrow({ where: { name: '7-ELEVEN' } });
    const linePay = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'LINE Pay' } });
    const nangang = await prisma.outlet.create({
      data: { name: 'LaLaport Nangang', normalizedName: 'lalaportnangang' }
    });
    const taichung = await prisma.outlet.create({
      data: { name: 'LaLaport Taichung', normalizedName: 'lalaporttaichung' }
    });
    const sevenBranch = await prisma.merchantBranch.create({
      data: {
        merchantId: sevenEleven.id,
        name: 'Nangang store',
        normalizedName: 'nangangstore',
        outletId: nangang.id
      }
    });
    const excludedBranch = await prisma.merchantBranch.create({
      data: {
        merchantId: sevenEleven.id,
        name: 'Excluded store',
        normalizedName: 'excludedstore',
        outletId: nangang.id
      }
    });
    const promotion = await createPromotion({
      originType: 'outlet',
      originOutletIds: [nangang.id],
      eligibilityType: 'outlet',
      paymentMethodId: linePay.id,
      excludedMerchantIds: [familyMart.id],
      excludedBranchIds: [excludedBranch.id],
      sourceUrl: 'https://official.example/lalaport-nangang'
    });

    const selectedVenue = await getRecommendations({
      merchant_name: sevenEleven.name,
      amount: 500,
      date: new Date('2026-10-01'),
      outlet_id: nangang.id,
      branch_id: sevenBranch.id
    });
    const otherVenue = await getRecommendations({
      merchant_name: sevenEleven.name,
      amount: 500,
      date: new Date('2026-10-01'),
      outlet_id: taichung.id
    });
    const excludedMerchantResults = await getRecommendations({
      merchant_name: familyMart.name,
      amount: 500,
      date: new Date('2026-10-01'),
      outlet_id: nangang.id
    });
    const excludedBranchResults = await getRecommendations({
      merchant_name: sevenEleven.name,
      amount: 500,
      date: new Date('2026-10-01'),
      outlet_id: nangang.id,
      branch_id: excludedBranch.id
    });

    expect(selectedVenue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        promotionId: promotion.id,
        sourceUrl: promotion.sourceUrl,
        originType: 'outlet',
        originName: 'LaLaport Nangang'
      })
    ]));
    expect(otherVenue.map((item) => item.promotionId)).not.toContain(promotion.id);
    expect(excludedMerchantResults.map((item) => item.promotionId)).not.toContain(promotion.id);
    expect(excludedBranchResults.map((item) => item.promotionId)).not.toContain(promotion.id);
  });

  test('returns branch-limited Merchant promotions only for an eligible branch', async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const linePay = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'LINE Pay' } });
    const branch = await prisma.merchantBranch.create({
      data: { merchantId: merchant.id, name: 'Eligible branch', normalizedName: 'eligiblebranch' }
    });
    const promotion = await createPromotion({
      originType: 'merchant',
      originMerchantIds: [merchant.id],
      eligibilityType: 'selected_branches',
      eligibleBranchIds: [branch.id],
      paymentMethodId: linePay.id,
      sourceUrl: 'https://official.example/branch-only'
    });

    const noBranch = await getRecommendations({
      merchant_name: merchant.name,
      amount: 500,
      date: new Date('2026-10-01')
    });
    const selectedBranch = await getRecommendations({
      merchant_name: merchant.name,
      amount: 500,
      date: new Date('2026-10-01'),
      branch_id: branch.id
    });

    expect(noBranch.map((item) => item.promotionId)).not.toContain(promotion.id);
    expect(selectedBranch.map((item) => item.promotionId)).toContain(promotion.id);
  });

  test('does not use a legacy branch name to qualify a canonical Promotion', async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { name: 'FamilyMart' } });
    const linePay = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'LINE Pay' } });
    const branch = await prisma.merchantBranch.create({
      data: { merchantId: merchant.id, name: 'Named eligible branch', normalizedName: 'named eligible branch' }
    });
    const promotion = await createPromotion({
      originType: 'merchant',
      originMerchantIds: [merchant.id],
      eligibilityType: 'selected_branches',
      eligibleBranchIds: [branch.id],
      paymentMethodId: linePay.id,
      sourceUrl: 'https://official.example/id-only-scope'
    });

    const results = await getRecommendations({
      merchant_name: merchant.name,
      amount: 500,
      date: new Date('2026-10-01'),
      outlet_name: branch.name
    });

    expect(results.map((item) => item.promotionId)).not.toContain(promotion.id);
  });
});
