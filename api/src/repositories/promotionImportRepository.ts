import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError, RepositoryValidationError } from './errors';
import type {
  ImportRunRecord,
  ImportRunStatus,
  ImportSource,
  ImportedPromotionDraft,
  PromotionDraftRecord,
  PromotionDraftReviewInput,
  PromotionDraftStatus,
  PublishedDraftResult,
  RewardRuleRecord
} from './types';

type ImportRunRow = {
  id: number;
  source: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  draftCount: number;
};

type PromotionDraftRow = {
  id: number;
  importRunId: number;
  source: string;
  sourceFingerprint: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceContent: string;
  fetchedAt: Date;
  parsedCashbackRate: unknown;
  parsedAmountThreshold: number | null;
  parsedValidityStart: Date | null;
  parsedValidityEnd: Date | null;
  status: string;
  merchantId: number | null;
  paymentMethodId: number | null;
  cashbackRate: unknown;
  amountThreshold: number | null;
  validityStart: Date | null;
  validityEnd: Date | null;
  promotionNote: string | null;
  rewardRuleId: number | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
};

type RewardRuleRow = {
  id: number;
  merchantId: number;
  paymentMethodId: number;
  cashbackRate: unknown;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote: string | null;
  paymentMethod: { name: string };
};

type PendingDraftWriteResult =
  | { kind: 'updated'; draft: PromotionDraftRow }
  | { kind: 'finalized'; draft: PromotionDraftRow }
  | { kind: 'missing' };

const editableDraftStatuses = ['pending_review'] as const;

const importRunSelect = {
  id: true,
  source: true,
  status: true,
  startedAt: true,
  completedAt: true,
  errorMessage: true,
  draftCount: true
} as const;

const promotionDraftSelect = {
  id: true,
  importRunId: true,
  source: true,
  sourceFingerprint: true,
  sourceUrl: true,
  sourceTitle: true,
  sourceContent: true,
  fetchedAt: true,
  parsedCashbackRate: true,
  parsedAmountThreshold: true,
  parsedValidityStart: true,
  parsedValidityEnd: true,
  status: true,
  merchantId: true,
  paymentMethodId: true,
  cashbackRate: true,
  amountThreshold: true,
  validityStart: true,
  validityEnd: true,
  promotionNote: true,
  rewardRuleId: true,
  reviewedAt: true,
  rejectionReason: true
} as const;

const rewardRuleSelect = {
  id: true,
  merchantId: true,
  paymentMethodId: true,
  cashbackRate: true,
  amountThreshold: true,
  validityStart: true,
  validityEnd: true,
  promotionNote: true,
  paymentMethod: {
    select: { name: true }
  }
} as const;

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function toImportRunRecord(row: ImportRunRow): ImportRunRecord {
  return {
    id: row.id,
    source: row.source as ImportSource,
    status: row.status as ImportRunStatus,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorMessage: row.errorMessage,
    draftCount: row.draftCount
  };
}

function toPromotionDraftRecord(row: PromotionDraftRow): PromotionDraftRecord {
  return {
    id: row.id,
    importRunId: row.importRunId,
    source: row.source as ImportSource,
    sourceFingerprint: row.sourceFingerprint,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    sourceContent: row.sourceContent,
    fetchedAt: row.fetchedAt,
    parsedCashbackRate: toNullableNumber(row.parsedCashbackRate),
    parsedAmountThreshold: row.parsedAmountThreshold,
    parsedValidityStart: row.parsedValidityStart,
    parsedValidityEnd: row.parsedValidityEnd,
    status: row.status as PromotionDraftStatus,
    merchantId: row.merchantId,
    paymentMethodId: row.paymentMethodId,
    cashbackRate: toNullableNumber(row.cashbackRate),
    amountThreshold: row.amountThreshold,
    validityStart: row.validityStart,
    validityEnd: row.validityEnd,
    promotionNote: row.promotionNote,
    rewardRuleId: row.rewardRuleId,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason
  };
}

function toRewardRuleRecord(row: RewardRuleRow): RewardRuleRecord {
  return {
    id: row.id,
    merchantId: row.merchantId,
    paymentMethodId: row.paymentMethodId,
    paymentMethodName: row.paymentMethod.name,
    cashbackRate: Number(row.cashbackRate),
    amountThreshold: row.amountThreshold,
    validityStart: row.validityStart,
    validityEnd: row.validityEnd,
    promotionNote: row.promotionNote
  };
}

function ensureDraftIsEditable(draft: PromotionDraftRow): void {
  if (!editableDraftStatuses.includes(draft.status as (typeof editableDraftStatuses)[number])) {
    throw new RepositoryConflictError('promotion draft is no longer pending review');
  }
}

function validateReviewedRewardFields(draft: PromotionDraftRow): asserts draft is PromotionDraftRow & {
  merchantId: number;
  paymentMethodId: number;
  cashbackRate: unknown;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
} {
  const merchantId = draft.merchantId;
  const paymentMethodId = draft.paymentMethodId;
  const cashbackRate = toNullableNumber(draft.cashbackRate);

  if (
    typeof merchantId !== 'number' ||
    !Number.isInteger(merchantId) ||
    merchantId <= 0 ||
    typeof paymentMethodId !== 'number' ||
    !Number.isInteger(paymentMethodId) ||
    paymentMethodId <= 0 ||
    cashbackRate === null ||
    !Number.isFinite(cashbackRate) ||
    cashbackRate < 0 ||
    draft.amountThreshold === null ||
    !Number.isInteger(draft.amountThreshold) ||
    draft.amountThreshold < 0 ||
    draft.validityStart === null ||
    Number.isNaN(draft.validityStart.getTime()) ||
    draft.validityEnd === null ||
    Number.isNaN(draft.validityEnd.getTime()) ||
    draft.validityEnd < draft.validityStart
  ) {
    throw new RepositoryValidationError('promotion draft is missing reviewed reward values');
  }
}

function toDraftCreateData(input: ImportedPromotionDraft): Prisma.PromotionDraftUncheckedCreateInput {
  return {
    importRunId: input.importRunId,
    source: input.source,
    sourceFingerprint: input.sourceFingerprint,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    sourceContent: input.sourceContent,
    fetchedAt: input.fetchedAt,
    parsedCashbackRate: input.parsedCashbackRate ?? null,
    parsedAmountThreshold: input.parsedAmountThreshold ?? null,
    parsedValidityStart: input.parsedValidityStart ?? null,
    parsedValidityEnd: input.parsedValidityEnd ?? null
  };
}

function toDraftUpdateData(input: ImportedPromotionDraft): Prisma.PromotionDraftUncheckedUpdateInput {
  return {
    importRunId: input.importRunId,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    sourceContent: input.sourceContent,
    fetchedAt: input.fetchedAt,
    parsedCashbackRate: input.parsedCashbackRate ?? null,
    parsedAmountThreshold: input.parsedAmountThreshold ?? null,
    parsedValidityStart: input.parsedValidityStart ?? null,
    parsedValidityEnd: input.parsedValidityEnd ?? null
  };
}

function mapPrismaError(error: unknown, foreignKeyConflictMessage?: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new RepositoryConflictError('reward rule conflicts with an existing record');
    }

    if (error.code === 'P2003') {
      if (foreignKeyConflictMessage) {
        throw new RepositoryConflictError(foreignKeyConflictMessage);
      }
      throw new RepositoryValidationError('merchant or payment method is invalid');
    }

    if (error.code === 'P2025') {
      throw new RepositoryValidationError('promotion draft not found');
    }
  }

  throw error;
}

async function writePendingDraft(
  id: number,
  data: Prisma.PromotionDraftUncheckedUpdateInput
): Promise<PendingDraftWriteResult> {
  return prisma.$transaction(async (transaction) => {
    const updatedDrafts = await transaction.promotionDraft.updateMany({
      where: {
        id,
        status: 'pending_review'
      },
      data
    });

    if (updatedDrafts.count === 1) {
      const updatedDraft = await transaction.promotionDraft.findUniqueOrThrow({
        where: { id },
        select: promotionDraftSelect
      });

      return { kind: 'updated', draft: updatedDraft };
    }

    const currentDraft = await transaction.promotionDraft.findUnique({
      where: { id },
      select: promotionDraftSelect
    });

    if (!currentDraft) {
      return { kind: 'missing' };
    }

    return { kind: 'finalized', draft: currentDraft };
  });
}

export async function createImportRun(source: ImportSource): Promise<ImportRunRecord> {
  const run = await prisma.importRun.create({
    data: {
      source,
      status: 'running'
    },
    select: importRunSelect
  });

  return toImportRunRecord(run);
}

export async function completeImportRun(id: number, draftCount: number): Promise<void> {
  await prisma.importRun.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      draftCount,
      errorMessage: null
    }
  });
}

export async function failImportRun(id: number, errorMessage: string): Promise<void> {
  await prisma.importRun.update({
    where: { id },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage
    }
  });
}

export async function listImportRuns(): Promise<ImportRunRecord[]> {
  const runs = await prisma.importRun.findMany({
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    select: importRunSelect
  });

  return runs.map(toImportRunRecord);
}

export async function upsertPendingDraft(input: ImportedPromotionDraft): Promise<PromotionDraftRecord> {
  const existingDraft = await prisma.promotionDraft.findUnique({
    where: { sourceFingerprint: input.sourceFingerprint },
    select: promotionDraftSelect
  });

  if (existingDraft) {
    if (existingDraft.status !== 'pending_review') {
      return toPromotionDraftRecord(existingDraft);
    }

    try {
      const updatedDraft = await writePendingDraft(existingDraft.id, toDraftUpdateData(input));

      if (updatedDraft.kind === 'missing') {
        throw new RepositoryValidationError('promotion draft not found');
      }

      return toPromotionDraftRecord(updatedDraft.draft);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new RepositoryValidationError('import run is invalid');
      }

      throw error;
    }
  }

  try {
    const createdDraft = await prisma.promotionDraft.create({
      data: toDraftCreateData(input),
      select: promotionDraftSelect
    });

    return toPromotionDraftRecord(createdDraft);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new RepositoryValidationError('import run is invalid');
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicateDraft = await prisma.promotionDraft.findUnique({
        where: { sourceFingerprint: input.sourceFingerprint },
        select: promotionDraftSelect
      });

      if (!duplicateDraft) {
        throw error;
      }

      if (duplicateDraft.status !== 'pending_review') {
        return toPromotionDraftRecord(duplicateDraft);
      }

      const updatedDraft = await writePendingDraft(duplicateDraft.id, toDraftUpdateData(input));

      if (updatedDraft.kind === 'missing') {
        throw new RepositoryValidationError('promotion draft not found');
      }

      return toPromotionDraftRecord(updatedDraft.draft);
    }

    throw error;
  }
}

export async function listPromotionDrafts(status?: PromotionDraftStatus): Promise<PromotionDraftRecord[]> {
  const drafts = await prisma.promotionDraft.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
    select: promotionDraftSelect
  });

  return drafts.map(toPromotionDraftRecord);
}

export async function findPromotionDraft(id: number): Promise<PromotionDraftRecord | null> {
  const draft = await prisma.promotionDraft.findUnique({
    where: { id },
    select: promotionDraftSelect
  });

  return draft ? toPromotionDraftRecord(draft) : null;
}

export async function updatePromotionDraft(
  id: number,
  input: PromotionDraftReviewInput
): Promise<PromotionDraftRecord | null> {
  const data: Prisma.PromotionDraftUncheckedUpdateInput = {
    rejectionReason: null
  };

  if (input.merchantId !== undefined) data.merchantId = input.merchantId;
  if (input.paymentMethodId !== undefined) data.paymentMethodId = input.paymentMethodId;
  if (input.cashbackRate !== undefined) data.cashbackRate = input.cashbackRate;
  if (input.amountThreshold !== undefined) data.amountThreshold = input.amountThreshold;
  if (input.validityStart !== undefined) data.validityStart = input.validityStart;
  if (input.validityEnd !== undefined) data.validityEnd = input.validityEnd;
  if (input.promotionNote !== undefined) data.promotionNote = input.promotionNote;

  try {
    const updatedDraft = await writePendingDraft(id, data);

    if (updatedDraft.kind === 'missing') {
      return null;
    }

    if (updatedDraft.kind === 'finalized') {
      throw new RepositoryConflictError('promotion draft is no longer pending review');
    }

    return toPromotionDraftRecord(updatedDraft.draft);
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function rejectPromotionDraft(id: number, reason: string): Promise<PromotionDraftRecord | null> {
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    throw new RepositoryValidationError('rejection reason is required');
  }

  const rejectedDraft = await writePendingDraft(id, {
    status: 'rejected',
    reviewedAt: new Date(),
    rejectionReason: trimmedReason
  });

  if (rejectedDraft.kind === 'missing') {
    return null;
  }

  if (rejectedDraft.kind === 'finalized') {
    throw new RepositoryConflictError('promotion draft is no longer pending review');
  }

  return toPromotionDraftRecord(rejectedDraft.draft);
}

export async function publishPromotionDraft(id: number): Promise<PublishedDraftResult> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const draft = await transaction.promotionDraft.findUnique({
        where: { id },
        select: promotionDraftSelect
      });

      if (!draft) {
        throw new RepositoryValidationError('promotion draft not found');
      }

      ensureDraftIsEditable(draft);
      validateReviewedRewardFields(draft);

      const [merchant, paymentMethod, acceptance] = await Promise.all([
        transaction.merchant.findUnique({
          where: { id: draft.merchantId },
          select: { id: true }
        }),
        transaction.paymentMethod.findUnique({
          where: { id: draft.paymentMethodId },
          select: { id: true }
        }),
        transaction.merchantPaymentAcceptance.findUnique({
          where: {
            merchantId_paymentMethodId: {
              merchantId: draft.merchantId,
              paymentMethodId: draft.paymentMethodId
            }
          },
          select: { id: true }
        })
      ]);

      if (!merchant || !paymentMethod) {
        throw new RepositoryConflictError('merchant or payment method is no longer available');
      }

      if (!acceptance) {
        throw new RepositoryConflictError('payment method is not accepted by this merchant');
      }

      const rewardRule = await transaction.rewardRule.create({
        data: {
          merchantId: draft.merchantId,
          paymentMethodId: draft.paymentMethodId,
          cashbackRate: Number(draft.cashbackRate),
          amountThreshold: draft.amountThreshold,
          validityStart: draft.validityStart,
          validityEnd: draft.validityEnd,
          promotionNote: draft.promotionNote
        },
        select: rewardRuleSelect
      });

      const publishedDraft = await transaction.promotionDraft.update({
        where: { id },
        data: {
          status: 'published',
          rewardRuleId: rewardRule.id,
          reviewedAt: new Date(),
          rejectionReason: null
        },
        select: promotionDraftSelect
      });

      return {
        draft: toPromotionDraftRecord(publishedDraft),
        rewardRule: toRewardRuleRecord(rewardRule)
      };
    });
  } catch (error) {
    mapPrismaError(error, 'promotion catalog relationships changed; refresh the draft');
  }
}
