import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError, RepositoryValidationError } from '../repositories/errors';
import { addAcceptance } from '../repositories/merchantPaymentAcceptanceRepository';
import { createMerchant } from '../repositories/merchantRepository';
import { createPaymentMethod } from '../repositories/paymentMethodRepository';
import {
  completeImportRun,
  createImportRun,
  failImportRun,
  listImportRuns,
  listPromotionDrafts,
  publishPromotionDraft,
  reopenPromotionDraft,
  rejectPromotionDraft,
  updatePromotionDraft,
  upsertPendingDraft
} from '../repositories/promotionImportRepository';
import type { ImportedPromotionDraft, PromotionDraftReviewInput } from '../repositories/types';

describe('promotion import repository', () => {
  const concurrentPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

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
  });

  afterAll(async () => {
    await concurrentPrisma.$disconnect();
    await prisma.$disconnect();
  });

  async function createDraftFixture(overrides: Partial<ImportedPromotionDraft> = {}) {
    const run = await createImportRun(overrides.source ?? 'line-pay');
    const source = overrides.source ?? 'line-pay';
    const input: ImportedPromotionDraft = {
      importRunId: run.id,
      source,
      sourceFingerprint: overrides.sourceFingerprint ?? `${source}:summer-offer`,
      sourceUrl: overrides.sourceUrl ?? 'https://example.com/summer',
      sourceTitle: overrides.sourceTitle ?? 'Summer offer',
      sourceContent: overrides.sourceContent ?? '3% cashback',
      fetchedAt: overrides.fetchedAt ?? new Date('2026-09-14T00:00:00.000Z'),
      parsedCashbackRate: overrides.parsedCashbackRate,
      parsedAmountThreshold: overrides.parsedAmountThreshold,
      parsedValidityStart: overrides.parsedValidityStart,
      parsedValidityEnd: overrides.parsedValidityEnd
    };

    const draft = await upsertPendingDraft(input);

    return { run, draft, input };
  }

  async function createReviewedDraftFixture() {
    const merchant = await createMerchant('Review Mart');
    const paymentMethod = await createPaymentMethod({ name: 'Review Pay', type: 'mobile_payment' });
    await addAcceptance(merchant.id, paymentMethod.id);
    const { draft } = await createDraftFixture();
    const reviewInput: PromotionDraftReviewInput = {
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      originType: 'merchant',
      originMerchantIds: [merchant.id],
      eligibilityType: 'merchant_wide',
      paymentMethodIds: [paymentMethod.id],
      cashbackRate: 0.05,
      amountThreshold: 100,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T23:59:59.000Z'),
      promotionNote: 'Verified manually'
    };

    return { draft, merchant, paymentMethod, reviewInput };
  }

  async function withConcurrentDraftFinalization<T>(
    _draftId: number,
    finalizeDraft: () => Promise<unknown>,
    action: () => Promise<T>
  ): Promise<T> {
    const originalTransaction = prisma.$transaction.bind(prisma) as (...args: unknown[]) => Promise<unknown>;
    const transactionSpy = jest.spyOn(prisma, '$transaction');

    transactionSpy.mockImplementationOnce((async (...args: unknown[]) => {
      await finalizeDraft();
      return originalTransaction(...args);
    }) as never);

    try {
      return await action();
    } finally {
      transactionSpy.mockRestore();
    }
  }

  async function publishDraftConcurrently(draftId: number): Promise<void> {
    await concurrentPrisma.$transaction(async (transaction) => {
      const draft = await transaction.promotionDraft.findUniqueOrThrow({
        where: { id: draftId },
        select: {
          merchantId: true,
          paymentMethodId: true,
          cashbackRate: true,
          amountThreshold: true,
          validityStart: true,
          validityEnd: true,
          promotionNote: true
        }
      });

      const rewardRule = await transaction.rewardRule.create({
        data: {
          merchantId: draft.merchantId!,
          paymentMethodId: draft.paymentMethodId!,
          cashbackRate: draft.cashbackRate!,
          amountThreshold: draft.amountThreshold!,
          validityStart: draft.validityStart!,
          validityEnd: draft.validityEnd!,
          promotionNote: draft.promotionNote
        }
      });

      await transaction.promotionDraft.update({
        where: { id: draftId },
        data: {
          status: 'published',
          rewardRuleId: rewardRule.id,
          reviewedAt: new Date('2026-09-15T00:00:00.000Z'),
          rejectionReason: null
        }
      });
    });
  }

  test('records import run lifecycle transitions', async () => {
    const completedRun = await createImportRun('line-pay');
    const failedRun = await createImportRun('jko-pay');

    await completeImportRun(completedRun.id, 2);
    await failImportRun(failedRun.id, 'source fetch failed');

    const runs = await listImportRuns();
    const persistedCompletedRun = runs.find((run) => run.id === completedRun.id);
    const persistedFailedRun = runs.find((run) => run.id === failedRun.id);

    expect(completedRun).toMatchObject({
      source: 'line-pay',
      status: 'running',
      draftCount: 0,
      errorMessage: null,
      completedAt: null
    });
    expect(persistedCompletedRun).toMatchObject({
      id: completedRun.id,
      status: 'completed',
      draftCount: 2,
      errorMessage: null
    });
    expect(persistedCompletedRun?.completedAt).toBeInstanceOf(Date);
    expect(persistedFailedRun).toMatchObject({
      id: failedRun.id,
      status: 'failed',
      draftCount: 0,
      errorMessage: 'source fetch failed'
    });
    expect(persistedFailedRun?.completedAt).toBeInstanceOf(Date);
  });

  test('updates a repeated pending draft without changing its identity', async () => {
    const { draft: first, input } = await createDraftFixture();
    const nextRun = await createImportRun('line-pay');

    const second = await upsertPendingDraft({
      ...input,
      importRunId: nextRun.id,
      sourceContent: '5% cashback',
      parsedCashbackRate: 0.05
    });

    expect(second).toMatchObject({
      id: first.id,
      importRunId: nextRun.id,
      sourceContent: '5% cashback',
      parsedCashbackRate: 0.05,
      status: 'pending_review'
    });
  });

  test('does not overwrite a draft finalized during a repeated import', async () => {
    const { draft, input } = await createDraftFixture();
    const nextRun = await createImportRun('line-pay');

    const repeated = await withConcurrentDraftFinalization(
      draft.id,
      async () => {
        await concurrentPrisma.promotionDraft.update({
          where: { id: draft.id },
          data: {
            status: 'rejected',
            reviewedAt: new Date('2026-09-15T00:00:00.000Z'),
            rejectionReason: 'Concurrent review'
          }
        });
      },
      () =>
        upsertPendingDraft({
          ...input,
          importRunId: nextRun.id,
          sourceContent: 'changed source text',
          parsedCashbackRate: 0.08
        })
    );

    expect(repeated).toMatchObject({
      id: draft.id,
      importRunId: input.importRunId,
      status: 'rejected',
      sourceContent: input.sourceContent,
      parsedCashbackRate: null,
      rejectionReason: 'Concurrent review'
    });
  });

  test('lists promotion drafts by optional status filter', async () => {
    const { draft: pendingDraft } = await createDraftFixture({ sourceFingerprint: 'line-pay:pending' });
    const { draft: rejectedDraft } = await createDraftFixture({ sourceFingerprint: 'line-pay:rejected' });

    await rejectPromotionDraft(rejectedDraft.id, 'Offer is out of scope');

    const allDrafts = await listPromotionDrafts();
    const pendingDrafts = await listPromotionDrafts('pending_review');

    expect(allDrafts.map((draft) => draft.id).sort((left, right) => left - right)).toEqual(
      [pendingDraft.id, rejectedDraft.id].sort((left, right) => left - right)
    );
    expect(pendingDrafts).toHaveLength(1);
    expect(pendingDrafts[0]).toMatchObject({ id: pendingDraft.id, status: 'pending_review' });
  });

  test('returns null when updating a missing draft', async () => {
    const reviewInput: PromotionDraftReviewInput = {
      merchantId: 1,
      paymentMethodId: 2,
      cashbackRate: 0.03,
      amountThreshold: 50,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T00:00:00.000Z')
    };

    await expect(updatePromotionDraft(999999, reviewInput)).resolves.toBeNull();
  });

  test('clears nullable reviewed fields when explicit nulls are saved', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    await updatePromotionDraft(draft.id, reviewInput);

    const cleared = await updatePromotionDraft(draft.id, {
      merchantId: null,
      paymentMethodId: null,
      cashbackRate: null,
      amountThreshold: null,
      validityStart: null,
      validityEnd: null,
      promotionNote: null
    });

    expect(cleared).toMatchObject({
      id: draft.id,
      merchantId: null,
      paymentMethodId: null,
      cashbackRate: null,
      amountThreshold: null,
      validityStart: null,
      validityEnd: null,
      promotionNote: null,
      cashbackRateReviewed: true,
      amountThresholdReviewed: true,
      validityStartReviewed: true,
      validityEndReviewed: true
    });
    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: {
          merchantId: true,
          paymentMethodId: true,
          cashbackRate: true,
          amountThreshold: true,
          validityStart: true,
          validityEnd: true,
          promotionNote: true,
          cashbackRateReviewed: true,
          amountThresholdReviewed: true,
          validityStartReviewed: true,
          validityEndReviewed: true
        }
      })
    ).resolves.toMatchObject({
      merchantId: null,
      paymentMethodId: null,
      cashbackRate: null,
      amountThreshold: null,
      validityStart: null,
      validityEnd: null,
      promotionNote: null,
      cashbackRateReviewed: true,
      amountThresholdReviewed: true,
      validityStartReviewed: true,
      validityEndReviewed: true
    });
  });

  test('requires review for parsed fields that change on a pending draft re-import', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    const run = await createImportRun('line-pay');
    const input: ImportedPromotionDraft = {
      importRunId: run.id,
      source: 'line-pay',
      sourceFingerprint: draft.sourceFingerprint,
      sourceUrl: draft.sourceUrl,
      sourceTitle: draft.sourceTitle,
      sourceContent: draft.sourceContent,
      fetchedAt: draft.fetchedAt
    };
    await updatePromotionDraft(draft.id, reviewInput);
    await updatePromotionDraft(draft.id, {
      cashbackRate: null,
      amountThreshold: null,
      validityStart: null,
      validityEnd: null
    });

    const nextRun = await createImportRun('line-pay');
    const repeated = await upsertPendingDraft({
      ...input,
      importRunId: nextRun.id,
      sourceContent: '8% cashback through October',
      parsedCashbackRate: 0.08,
      parsedAmountThreshold: 800,
      parsedValidityStart: new Date('2026-10-01T00:00:00.000Z'),
      parsedValidityEnd: new Date('2026-10-31T23:59:59.999Z')
    });

    expect(repeated).toMatchObject({
      id: draft.id,
      importRunId: nextRun.id,
      sourceContent: '8% cashback through October',
      parsedCashbackRate: 0.08,
      parsedAmountThreshold: 800,
      cashbackRate: null,
      amountThreshold: null,
      validityStart: null,
      validityEnd: null,
      cashbackRateReviewed: false,
      amountThresholdReviewed: false,
      validityStartReviewed: false,
      validityEndReviewed: false
    });
  });

  test('requires review again when an imported parsed value changes', async () => {
    const { draft } = await createDraftFixture({ parsedCashbackRate: 0.03 });
    await updatePromotionDraft(draft.id, {
      cashbackRate: 0.05
    });
    const nextRun = await createImportRun('line-pay');

    const repeated = await upsertPendingDraft({
      importRunId: nextRun.id,
      source: 'line-pay',
      sourceFingerprint: draft.sourceFingerprint,
      sourceUrl: draft.sourceUrl,
      sourceTitle: draft.sourceTitle,
      sourceContent: '8% cashback',
      fetchedAt: draft.fetchedAt,
      parsedCashbackRate: 0.08
    });

    expect(repeated).toMatchObject({
      parsedCashbackRate: 0.08,
      cashbackRate: 0.05,
      cashbackRateReviewed: false
    });
  });

  test('clears scope relations that no longer apply after an origin change', async () => {
    const originMerchant = await createMerchant('Scope Merchant');
    const excludedMerchant = await createMerchant('Excluded Scope Merchant');
    const outlet = await prisma.outlet.create({
      data: { name: 'Scope Outlet', normalizedName: 'scopeoutlet' }
    });
    const excludedBranch = await prisma.merchantBranch.create({
      data: {
        merchantId: excludedMerchant.id,
        name: 'Excluded Outlet branch',
        normalizedName: 'excludedoutletbranch',
        outletId: outlet.id
      }
    });
    const { draft } = await createDraftFixture();
    await updatePromotionDraft(draft.id, {
      originType: 'outlet',
      originOutletIds: [outlet.id],
      eligibilityType: 'outlet',
      excludedMerchantIds: [excludedMerchant.id],
      excludedBranchIds: [excludedBranch.id]
    });

    const updated = await updatePromotionDraft(draft.id, {
      originType: 'merchant',
      originMerchantIds: [originMerchant.id],
      eligibilityType: 'merchant_wide'
    });

    expect(updated).toMatchObject({
      originType: 'merchant',
      originMerchantIds: [originMerchant.id],
      originOutletIds: [],
      eligibilityType: 'merchant_wide',
      eligibleBranchIds: [],
      excludedMerchantIds: [],
      excludedBranchIds: []
    });
  });

  test('rejects a draft only with a non-empty reason and records review metadata', async () => {
    const { draft } = await createDraftFixture();

    await expect(rejectPromotionDraft(draft.id, '   ')).rejects.toBeInstanceOf(RepositoryValidationError);

    const rejected = await rejectPromotionDraft(draft.id, ' Not eligible for review ');

    expect(rejected).toMatchObject({
      id: draft.id,
      status: 'rejected',
      rejectionReason: 'Not eligible for review'
    });
    expect(rejected?.reviewedAt).toBeInstanceOf(Date);
    await expect(rejectPromotionDraft(999999, 'Missing draft')).resolves.toBeNull();
  });

  test('reopens only rejected drafts and retains rejection context', async () => {
    const { draft } = await createDraftFixture();
    await expect(reopenPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryConflictError);

    await rejectPromotionDraft(draft.id, 'Rejected by mistake');
    const reopened = await reopenPromotionDraft(draft.id);

    expect(reopened).toMatchObject({
      id: draft.id,
      status: 'pending_review',
      rejectionReason: 'Rejected by mistake',
      sourceFingerprint: draft.sourceFingerprint,
      reviewedAt: null
    });
    await expect(reopenPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(reopenPromotionDraft(999999)).resolves.toBeNull();
  });

  test('publishes a reviewed draft only when its payment method is accepted', async () => {
    const { draft, merchant, paymentMethod, reviewInput } = await createReviewedDraftFixture();

    const updatedDraft = await updatePromotionDraft(draft.id, reviewInput);
    const published = await publishPromotionDraft(draft.id);

    expect(updatedDraft).toMatchObject({
      id: draft.id,
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      cashbackRate: 0.05,
      amountThreshold: 100,
      status: 'pending_review'
    });

    expect(typeof updatedDraft?.cashbackRate).toBe('number');
    expect(published).toMatchObject({
      draft: expect.objectContaining({
        id: draft.id,
        status: 'published',
        merchantId: merchant.id,
        paymentMethodId: paymentMethod.id
      }),
      promotion: expect.objectContaining({
        originType: 'merchant',
        originMerchantIds: [merchant.id],
        eligibilityType: 'merchant_wide',
        paymentMethodIds: [paymentMethod.id],
        cashbackRate: 0.05,
        amountThreshold: 100
      })
    });
    expect(published.draft.rewardRuleId).toBeNull();
    await expect(reopenPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      prisma.promotion.findUnique({
        where: { sourceDraftId: draft.id },
        select: { promotionNote: true }
      })
    ).resolves.toMatchObject({ promotionNote: 'Verified manually' });
  });

  test('publishes explicit Merchant branch and Outlet exclusion scopes without creating RewardRules', async () => {
    const originMerchant = await createMerchant('Sanyou Cosmetics');
    const excludedMerchant = await createMerchant('Excluded Merchant');
    const paymentMethod = await createPaymentMethod({ name: 'iPASS MONEY', type: 'mobile_payment' });
    await addAcceptance(originMerchant.id, paymentMethod.id);
    const outlet = await prisma.outlet.create({
      data: { name: 'LaLaport Nangang', normalizedName: 'lalaportnangang', location: 'Nangang' }
    });
    const branch = await prisma.merchantBranch.create({
      data: {
        merchantId: originMerchant.id,
        name: 'Nangang branch',
        normalizedName: 'nangangbranch',
        outletId: outlet.id
      }
    });
    const merchantDraft = await createDraftFixture({ sourceFingerprint: 'test:merchant-scope' });
    await updatePromotionDraft(merchantDraft.draft.id, {
      merchantId: originMerchant.id,
      paymentMethodId: paymentMethod.id,
      originType: 'merchant',
      originMerchantIds: [originMerchant.id],
      eligibilityType: 'selected_branches',
      eligibleBranchIds: [branch.id],
      excludedMerchantIds: [excludedMerchant.id],
      excludedBranchIds: [],
      paymentMethodIds: [paymentMethod.id],
      cashbackRate: 0.05,
      amountThreshold: 100,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T23:59:59.000Z')
    });
    const outletDraft = await createDraftFixture({ sourceFingerprint: 'test:outlet-scope' });
    await updatePromotionDraft(outletDraft.draft.id, {
      originType: 'outlet',
      originOutletIds: [outlet.id],
      eligibilityType: 'outlet',
      eligibleBranchIds: [],
      excludedMerchantIds: [excludedMerchant.id],
      excludedBranchIds: [],
      paymentMethodIds: [paymentMethod.id],
      cashbackRate: 0.03,
      amountThreshold: 0,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T23:59:59.000Z')
    });

    await publishPromotionDraft(merchantDraft.draft.id);
    await publishPromotionDraft(outletDraft.draft.id);

    const promotions = await prisma.promotion.findMany({
      orderBy: { sourceDraftId: 'asc' },
      include: {
        originMerchants: true,
        originOutlets: true,
        paymentMethods: true,
        eligibleBranches: true,
        excludedMerchants: true,
        excludedBranches: true
      }
    });
    expect(promotions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        originType: 'merchant',
        originMerchants: [expect.objectContaining({ merchantId: originMerchant.id })],
        eligibilityType: 'selected_branches',
        eligibleBranches: [expect.objectContaining({ branchId: branch.id })],
        excludedMerchants: [expect.objectContaining({ merchantId: excludedMerchant.id })],
        paymentMethods: [expect.objectContaining({ paymentMethodId: paymentMethod.id })]
      }),
      expect.objectContaining({
        originType: 'outlet',
        originOutlets: [expect.objectContaining({ outletId: outlet.id })],
        eligibilityType: 'outlet',
        excludedMerchants: [expect.objectContaining({ merchantId: excludedMerchant.id })],
        paymentMethods: [expect.objectContaining({ paymentMethodId: paymentMethod.id })]
      })
    ]));
    await expect(prisma.rewardRule.count()).resolves.toBe(0);
  });

  test('maps a publish-time foreign-key race to a catalog conflict', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    await updatePromotionDraft(draft.id, reviewInput);
    const foreignKeyError = new Prisma.PrismaClientKnownRequestError('foreign key violation', {
      code: 'P2003',
      clientVersion: Prisma.prismaVersion.client
    });
    const transactionSpy = jest.spyOn(prisma, '$transaction');
    transactionSpy.mockImplementationOnce((async (
      callback: (transaction: Prisma.TransactionClient) => Promise<unknown>
    ) => callback({
      promotionDraft: prisma.promotionDraft,
      merchant: prisma.merchant,
      paymentMethod: prisma.paymentMethod,
      merchantPaymentAcceptance: prisma.merchantPaymentAcceptance,
      promotion: {
        create: jest.fn().mockRejectedValue(foreignKeyError)
      }
    } as unknown as Prisma.TransactionClient)) as never);

    try {
      await expect(publishPromotionDraft(draft.id)).rejects.toMatchObject({
        constructor: RepositoryConflictError,
        message: 'promotion catalog relationships changed; refresh the draft'
      });
    } finally {
      transactionSpy.mockRestore();
    }

    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: { status: true, rewardRuleId: true }
      })
    ).resolves.toMatchObject({ status: 'pending_review', rewardRuleId: null });
  });

  test('rejects stale review updates after a concurrent publish', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    await updatePromotionDraft(draft.id, reviewInput);

    await expect(
      withConcurrentDraftFinalization(
        draft.id,
        () => publishDraftConcurrently(draft.id),
        () =>
          updatePromotionDraft(draft.id, {
            ...reviewInput,
            cashbackRate: 0.09
          })
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    const persistedDraft = await prisma.promotionDraft.findUnique({
      where: { id: draft.id },
      select: {
        status: true,
        cashbackRate: true,
        rewardRuleId: true
      }
    });

    expect(persistedDraft).toMatchObject({
      status: 'published',
      rewardRuleId: expect.any(Number)
    });
    expect(Number(persistedDraft?.cashbackRate)).toBe(0.05);
  });

  test('rejects stale draft rejection after a concurrent publish', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    await updatePromotionDraft(draft.id, reviewInput);

    await expect(
      withConcurrentDraftFinalization(draft.id, () => publishDraftConcurrently(draft.id), () =>
        rejectPromotionDraft(draft.id, 'Stale rejection')
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: {
          status: true,
          rejectionReason: true,
          rewardRuleId: true
        }
      })
    ).resolves.toMatchObject({
      status: 'published',
      rejectionReason: null,
      rewardRuleId: expect.any(Number)
    });
  });

  test('does not overwrite a published draft during a later import', async () => {
    const { draft, input } = await createDraftFixture();
    const merchant = await createMerchant('Published Mart');
    const paymentMethod = await createPaymentMethod({ name: 'Published Pay', type: 'mobile_payment' });
    await addAcceptance(merchant.id, paymentMethod.id);
    await updatePromotionDraft(draft.id, {
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      originType: 'merchant',
      originMerchantIds: [merchant.id],
      eligibilityType: 'merchant_wide',
      paymentMethodIds: [paymentMethod.id],
      cashbackRate: 0.04,
      amountThreshold: 0,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T00:00:00.000Z')
    });
    await publishPromotionDraft(draft.id);

    const nextRun = await createImportRun('line-pay');
    const repeated = await upsertPendingDraft({
      ...input,
      importRunId: nextRun.id,
      sourceContent: 'changed source text'
    });

    expect(repeated).toMatchObject({
      id: draft.id,
      importRunId: input.importRunId,
      status: 'published',
      sourceContent: input.sourceContent
    });
  });

  test('does not overwrite a rejected draft during a later import', async () => {
    const { draft, input } = await createDraftFixture();
    await rejectPromotionDraft(draft.id, 'Offer already ended');
    const nextRun = await createImportRun('line-pay');

    const repeated = await upsertPendingDraft({
      ...input,
      importRunId: nextRun.id,
      sourceContent: 'changed source text'
    });

    expect(repeated).toMatchObject({
      id: draft.id,
      importRunId: input.importRunId,
      status: 'rejected',
      sourceContent: input.sourceContent,
      rejectionReason: 'Offer already ended'
    });
  });

  test('rejects publishing a draft with missing review values and leaves it pending', async () => {
    const { draft } = await createDraftFixture();

    await expect(publishPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryValidationError);
    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: { status: true, rewardRuleId: true }
      })
    ).resolves.toMatchObject({ status: 'pending_review', rewardRuleId: null });
  });

  test('keeps several origin Outlets and prunes excluded branches of a removed Outlet', async () => {
    const merchant = await createMerchant('Multi Outlet Merchant');
    const mallA = await prisma.outlet.create({ data: { name: 'Multi Mall A', normalizedName: 'multimalla' } });
    const mallB = await prisma.outlet.create({ data: { name: 'Multi Mall B', normalizedName: 'multimallb' } });
    const branchA = await prisma.merchantBranch.create({
      data: { merchantId: merchant.id, name: 'Branch A', normalizedName: 'brancha', outletId: mallA.id }
    });
    const branchB = await prisma.merchantBranch.create({
      data: { merchantId: merchant.id, name: 'Branch B', normalizedName: 'branchb', outletId: mallB.id }
    });
    const { draft } = await createDraftFixture();

    const both = await updatePromotionDraft(draft.id, {
      originType: 'outlet',
      originOutletIds: [mallA.id, mallB.id],
      eligibilityType: 'outlet',
      excludedBranchIds: [branchA.id, branchB.id]
    });
    expect(both).toMatchObject({ originOutletIds: expect.arrayContaining([mallA.id, mallB.id]) });
    expect(both?.excludedBranchIds).toHaveLength(2);

    const onlyA = await updatePromotionDraft(draft.id, { originOutletIds: [mallA.id] });
    expect(onlyA?.originOutletIds).toEqual([mallA.id]);
    expect(onlyA?.excludedBranchIds).toEqual([branchA.id]);
  });

  test('rejects publishing a draft whose selected catalog records are missing and leaves it pending', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    await updatePromotionDraft(draft.id, reviewInput);

    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    await prisma.$executeRawUnsafe(`UPDATE "PromotionDraftOriginMerchant" SET "merchantId" = 999999 WHERE "draftId" = ${draft.id}`);
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    await expect(publishPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: { status: true, rewardRuleId: true }
      })
    ).resolves.toMatchObject({ status: 'pending_review', rewardRuleId: null });
  });

  test('allows publication without acceptance and defers eligibility to recommendations', async () => {
    const merchant = await createMerchant('Missing Acceptance Mart');
    const paymentMethod = await createPaymentMethod({ name: 'Missing Acceptance Pay', type: 'mobile_payment' });
    const { draft } = await createDraftFixture();

    await updatePromotionDraft(draft.id, {
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      originType: 'merchant',
      originMerchantIds: [merchant.id],
      eligibilityType: 'merchant_wide',
      paymentMethodIds: [paymentMethod.id],
      cashbackRate: 0.02,
      amountThreshold: 10,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T00:00:00.000Z')
    });

    await expect(publishPromotionDraft(draft.id)).resolves.toMatchObject({
      draft: { status: 'published' },
      promotion: { originMerchantIds: [merchant.id], paymentMethodIds: [paymentMethod.id] }
    });
    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: { status: true, rewardRuleId: true }
      })
    ).resolves.toMatchObject({ status: 'published', rewardRuleId: null });
  });

  test('rejects publishing a draft that is no longer pending review', async () => {
    const { draft } = await createDraftFixture();
    await rejectPromotionDraft(draft.id, 'Already reviewed');

    await expect(publishPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryConflictError);
  });
});
