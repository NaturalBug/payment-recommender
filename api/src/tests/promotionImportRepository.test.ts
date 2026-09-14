import { PrismaClient } from '@prisma/client';
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
    await prisma.promotionDraft.deleteMany();
    await prisma.rewardRule.deleteMany();
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
      rewardRule: expect.objectContaining({
        merchantId: merchant.id,
        paymentMethodId: paymentMethod.id,
        cashbackRate: 0.05,
        amountThreshold: 100
      })
    });
    expect(published.draft.rewardRuleId).toBe(published.rewardRule.id);
    await expect(
      prisma.rewardRule.findUnique({
        where: { id: published.rewardRule.id },
        select: { promotionNote: true }
      })
    ).resolves.toMatchObject({ promotionNote: 'Verified manually' });
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

  test('rejects publishing a draft whose selected catalog records are missing and leaves it pending', async () => {
    const { draft, reviewInput } = await createReviewedDraftFixture();
    await updatePromotionDraft(draft.id, reviewInput);

    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    await prisma.$executeRawUnsafe(`UPDATE "PromotionDraft" SET "merchantId" = 999999 WHERE "id" = ${draft.id}`);
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    await expect(publishPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryValidationError);
    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: { status: true, rewardRuleId: true }
      })
    ).resolves.toMatchObject({ status: 'pending_review', rewardRuleId: null });
  });

  test('rejects publishing a draft when the selected payment method is not accepted and leaves it pending', async () => {
    const merchant = await createMerchant('Missing Acceptance Mart');
    const paymentMethod = await createPaymentMethod({ name: 'Missing Acceptance Pay', type: 'mobile_payment' });
    const { draft } = await createDraftFixture();

    await updatePromotionDraft(draft.id, {
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      cashbackRate: 0.02,
      amountThreshold: 10,
      validityStart: new Date('2026-09-01T00:00:00.000Z'),
      validityEnd: new Date('2026-09-30T00:00:00.000Z')
    });

    await expect(publishPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryValidationError);
    await expect(
      prisma.promotionDraft.findUnique({
        where: { id: draft.id },
        select: { status: true, rewardRuleId: true }
      })
    ).resolves.toMatchObject({ status: 'pending_review', rewardRuleId: null });
  });

  test('rejects publishing a draft that is no longer pending review', async () => {
    const { draft } = await createDraftFixture();
    await rejectPromotionDraft(draft.id, 'Already reviewed');

    await expect(publishPromotionDraft(draft.id)).rejects.toBeInstanceOf(RepositoryConflictError);
  });
});
