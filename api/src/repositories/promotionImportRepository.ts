import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError, RepositoryValidationError } from './errors';
import { promotionSelect, toPromotionRecord } from './promotionRepository';
import type {
  ImportRunRecord,
  ImportRunStatus,
  ImportSource,
  ImportedPromotionDraft,
  PromotionDraftRecord,
  PromotionDraftReviewInput,
  PromotionDraftStatus,
  PublishedDraftResult
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
  parsedBenefitType: string | null;
  parsedFixedDiscountAmount: number | null;
  parsedAmountThreshold: number | null;
  parsedValidityStart: Date | null;
  parsedValidityEnd: Date | null;
  cashbackRateReviewed: boolean;
  benefitTypeReviewed: boolean;
  fixedDiscountAmountReviewed: boolean;
  amountThresholdReviewed: boolean;
  validityStartReviewed: boolean;
  validityEndReviewed: boolean;
  status: string;
  originType: string | null;
  originMerchants: { merchantId: number }[];
  originOutlets: { outletId: number }[];
  eligibilityType: string | null;
  eligibleBranches: { branchId: number }[];
  excludedMerchants: { merchantId: number }[];
  excludedBranches: { branchId: number }[];
  paymentMethods: { paymentMethodId: number }[];
  merchantId: number | null;
  paymentMethodId: number | null;
  benefitType: string;
  cashbackRate: unknown;
  fixedDiscountAmount: number | null;
  amountThreshold: number | null;
  validityStart: Date | null;
  validityEnd: Date | null;
  promotionNote: string | null;
  branchId: number | null;
  rewardRuleId: number | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
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
  parsedBenefitType: true,
  parsedFixedDiscountAmount: true,
  parsedAmountThreshold: true,
  parsedValidityStart: true,
  parsedValidityEnd: true,
  cashbackRateReviewed: true,
  benefitTypeReviewed: true,
  fixedDiscountAmountReviewed: true,
  amountThresholdReviewed: true,
  validityStartReviewed: true,
  validityEndReviewed: true,
  status: true,
  originType: true,
  originMerchants: { select: { merchantId: true } },
  originOutlets: { select: { outletId: true } },
  eligibilityType: true,
  eligibleBranches: { select: { branchId: true } },
  excludedMerchants: { select: { merchantId: true } },
  excludedBranches: { select: { branchId: true } },
  paymentMethods: { select: { paymentMethodId: true } },
  merchantId: true,
  paymentMethodId: true,
  benefitType: true,
  cashbackRate: true,
  fixedDiscountAmount: true,
  amountThreshold: true,
  validityStart: true,
  validityEnd: true,
  promotionNote: true,
  branchId: true,
  rewardRuleId: true,
  reviewedAt: true,
  rejectionReason: true
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
    parsedBenefitType: row.parsedBenefitType as PromotionDraftRecord['parsedBenefitType'],
    parsedFixedDiscountAmount: row.parsedFixedDiscountAmount,
    parsedAmountThreshold: row.parsedAmountThreshold,
    parsedValidityStart: row.parsedValidityStart,
    parsedValidityEnd: row.parsedValidityEnd,
    cashbackRateReviewed: row.cashbackRateReviewed,
    benefitTypeReviewed: row.benefitTypeReviewed,
    fixedDiscountAmountReviewed: row.fixedDiscountAmountReviewed,
    amountThresholdReviewed: row.amountThresholdReviewed,
    validityStartReviewed: row.validityStartReviewed,
    validityEndReviewed: row.validityEndReviewed,
    status: row.status as PromotionDraftStatus,
    originType: row.originType as PromotionDraftRecord['originType'],
    originMerchantIds: row.originMerchants.map(({ merchantId }) => merchantId),
    originOutletIds: row.originOutlets.map(({ outletId }) => outletId),
    eligibilityType: row.eligibilityType as PromotionDraftRecord['eligibilityType'],
    eligibleBranchIds: row.eligibleBranches.map(({ branchId }) => branchId),
    excludedMerchantIds: row.excludedMerchants.map(({ merchantId }) => merchantId),
    excludedBranchIds: row.excludedBranches.map(({ branchId }) => branchId),
    paymentMethodIds: row.paymentMethods.map(({ paymentMethodId }) => paymentMethodId),
    merchantId: row.merchantId,
    paymentMethodId: row.paymentMethodId,
    benefitType: row.benefitType as PromotionDraftRecord['benefitType'],
    cashbackRate: toNullableNumber(row.cashbackRate),
    fixedDiscountAmount: row.fixedDiscountAmount,
    amountThreshold: row.amountThreshold,
    validityStart: row.validityStart,
    validityEnd: row.validityEnd,
    promotionNote: row.promotionNote,
    outletId: row.branchId,
    rewardRuleId: row.rewardRuleId,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason
  };
}

function ensureDraftIsEditable(draft: PromotionDraftRow): void {
  if (!editableDraftStatuses.includes(draft.status as (typeof editableDraftStatuses)[number])) {
    throw new RepositoryConflictError('promotion draft is no longer pending review');
  }
}

function validateReviewedPromotion(draft: PromotionDraftRow): asserts draft is PromotionDraftRow & {
  originType: 'merchant' | 'outlet';
  eligibilityType: 'merchant_wide' | 'selected_branches' | 'outlet';
  benefitType: 'cashback' | 'fixed_discount';
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
} {
  const validMerchantOrigin =
    draft.originType === 'merchant' &&
    draft.originMerchants.length > 0 &&
    draft.originOutlets.length === 0;
  const validOutletOrigin =
    draft.originType === 'outlet' &&
    draft.originOutlets.length > 0 &&
    draft.originMerchants.length === 0;
  const validEligibility =
    (draft.originType === 'merchant' &&
      (draft.eligibilityType === 'merchant_wide' || draft.eligibilityType === 'selected_branches')) ||
    (draft.originType === 'outlet' && draft.eligibilityType === 'outlet');
  const cashbackRate = toNullableNumber(draft.cashbackRate);

  if (
    (!validMerchantOrigin && !validOutletOrigin) ||
    !validEligibility ||
    (draft.eligibilityType === 'selected_branches' && draft.eligibleBranches.length === 0) ||
    draft.paymentMethods.length === 0 ||
    (draft.benefitType !== 'cashback' && draft.benefitType !== 'fixed_discount') ||
    (draft.benefitType === 'cashback' &&
      (cashbackRate === null || !Number.isFinite(cashbackRate) || cashbackRate < 0)) ||
    (draft.benefitType === 'fixed_discount' &&
      (draft.fixedDiscountAmount === null ||
        !Number.isInteger(draft.fixedDiscountAmount) ||
        draft.fixedDiscountAmount <= 0)) ||
    draft.amountThreshold === null ||
    !Number.isInteger(draft.amountThreshold) ||
    draft.amountThreshold < 0 ||
    draft.validityStart === null ||
    Number.isNaN(draft.validityStart.getTime()) ||
    draft.validityEnd === null ||
    Number.isNaN(draft.validityEnd.getTime()) ||
    draft.validityEnd < draft.validityStart
  ) {
    throw new RepositoryValidationError('promotion draft is missing reviewed scope or reward values');
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
    parsedBenefitType: input.parsedBenefitType ?? null,
    parsedFixedDiscountAmount: input.parsedFixedDiscountAmount ?? null,
    parsedAmountThreshold: input.parsedAmountThreshold ?? null,
    parsedValidityStart: input.parsedValidityStart ?? null,
    parsedValidityEnd: input.parsedValidityEnd ?? null
  };
}

function hasParsedNumberChanged(current: unknown, next: number | null | undefined): boolean {
  const currentValue = current === null || current === undefined ? null : Number(current);
  return currentValue !== (next ?? null);
}

function hasParsedDateChanged(current: Date | null, next: Date | null | undefined): boolean {
  return (current?.getTime() ?? null) !== (next?.getTime() ?? null);
}

function toDraftUpdateData(
  input: ImportedPromotionDraft,
  existingDraft: PromotionDraftRow
): Prisma.PromotionDraftUncheckedUpdateInput {
  const data: Prisma.PromotionDraftUncheckedUpdateInput = {
    importRunId: input.importRunId,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    sourceContent: input.sourceContent,
    fetchedAt: input.fetchedAt,
    parsedCashbackRate: input.parsedCashbackRate ?? null,
    parsedBenefitType: input.parsedBenefitType ?? null,
    parsedFixedDiscountAmount: input.parsedFixedDiscountAmount ?? null,
    parsedAmountThreshold: input.parsedAmountThreshold ?? null,
    parsedValidityStart: input.parsedValidityStart ?? null,
    parsedValidityEnd: input.parsedValidityEnd ?? null
  };

  if (existingDraft.parsedBenefitType !== (input.parsedBenefitType ?? null)) {
    data.benefitTypeReviewed = false;
  }
  if (hasParsedNumberChanged(existingDraft.parsedCashbackRate, input.parsedCashbackRate)) {
    data.cashbackRateReviewed = false;
  }
  if (hasParsedNumberChanged(existingDraft.parsedFixedDiscountAmount, input.parsedFixedDiscountAmount)) {
    data.fixedDiscountAmountReviewed = false;
  }
  if (hasParsedNumberChanged(existingDraft.parsedAmountThreshold, input.parsedAmountThreshold)) {
    data.amountThresholdReviewed = false;
  }
  if (hasParsedDateChanged(existingDraft.parsedValidityStart, input.parsedValidityStart)) {
    data.validityStartReviewed = false;
  }
  if (hasParsedDateChanged(existingDraft.parsedValidityEnd, input.parsedValidityEnd)) {
    data.validityEndReviewed = false;
  }

  return data;
}

function mapPrismaError(error: unknown, foreignKeyConflictMessage?: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new RepositoryConflictError('promotion already exists for this draft');
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
  data: Prisma.PromotionDraftUncheckedUpdateInput,
  scope?: PromotionDraftReviewInput
): Promise<PendingDraftWriteResult> {
  return prisma.$transaction(async (transaction) => {
    const previousDraft = await transaction.promotionDraft.findUnique({
      where: { id },
      select: {
        originType: true,
        originMerchants: { select: { merchantId: true } },
        originOutlets: { select: { outletId: true } },
        eligibilityType: true
      }
    });
    const updateData = { ...data };
    if (scope?.originType !== undefined) {
      if (scope.originType === 'merchant' && scope.originOutletIds?.length) {
        throw new RepositoryValidationError('merchant origin cannot include an origin outlet');
      }
      if (scope.originType === 'outlet' && scope.originMerchantIds?.length) {
        throw new RepositoryValidationError('outlet origin cannot include an origin merchant');
      }
      if (scope.originType === null || scope.originType !== previousDraft?.originType) {
        updateData.eligibilityType = scope.eligibilityType ?? null;
      }
    }

    const updatedDrafts = await transaction.promotionDraft.updateMany({
      where: {
        id,
        status: 'pending_review'
      },
      data: updateData
    });

    if (updatedDrafts.count === 1) {
      if (scope) {
        await replaceDraftScope(transaction, id, scope, previousDraft && {
          originType: previousDraft.originType,
          originMerchantIds: previousDraft.originMerchants.map(({ merchantId }) => merchantId),
          originOutletIds: previousDraft.originOutlets.map(({ outletId }) => outletId),
          eligibilityType: previousDraft.eligibilityType
        });
      }
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

function validateScopeIds(values: number[] | undefined, field: string): number[] | undefined {
  if (values === undefined) return undefined;
  if (
    !Array.isArray(values) ||
    values.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    new Set(values).size !== values.length
  ) {
    throw new RepositoryValidationError(`${field} must contain unique positive integer IDs`);
  }
  return values;
}

async function replaceDraftScope(
  transaction: Prisma.TransactionClient,
  draftId: number,
  input: PromotionDraftReviewInput,
  previousDraft: {
    originType: string | null;
    originMerchantIds: number[];
    originOutletIds: number[];
    eligibilityType: string | null;
  } | null
): Promise<void> {
  const suppliedEligibleBranchIds = validateScopeIds(input.eligibleBranchIds, 'eligibleBranchIds');
  const suppliedExcludedMerchantIds = validateScopeIds(input.excludedMerchantIds, 'excludedMerchantIds');
  const suppliedExcludedBranchIds = validateScopeIds(input.excludedBranchIds, 'excludedBranchIds');
  const paymentMethodIds = validateScopeIds(input.paymentMethodIds, 'paymentMethodIds');
  const suppliedOriginMerchantIds = validateScopeIds(input.originMerchantIds, 'originMerchantIds');
  const suppliedOriginOutletIds = validateScopeIds(input.originOutletIds, 'originOutletIds');
  const originType = input.originType !== undefined ? input.originType : previousDraft?.originType;
  const originMerchantIds = originType === 'merchant'
    ? suppliedOriginMerchantIds ?? previousDraft?.originMerchantIds ?? []
    : [];
  const originOutletIds = originType === 'outlet'
    ? suppliedOriginOutletIds ?? previousDraft?.originOutletIds ?? []
    : [];
  const originChanged =
    input.originType !== undefined || suppliedOriginMerchantIds !== undefined || suppliedOriginOutletIds !== undefined;
  const eligibilityType =
    input.eligibilityType !== undefined ? input.eligibilityType : previousDraft?.eligibilityType;
  const eligibleBranchIds = suppliedEligibleBranchIds ?? (
    originType !== 'merchant' || eligibilityType !== 'selected_branches' ? [] : undefined
  );
  const excludedMerchantIds = suppliedExcludedMerchantIds ?? (originType === 'outlet' ? undefined : []);
  const excludedBranchIds = suppliedExcludedBranchIds ?? (originType !== 'outlet' ? [] : undefined);

  if (originMerchantIds.length) {
    const count = await transaction.merchant.count({ where: { id: { in: originMerchantIds } } });
    if (count !== originMerchantIds.length) throw new RepositoryValidationError('origin merchant is invalid');
  }
  if (originOutletIds.length) {
    const count = await transaction.outlet.count({ where: { id: { in: originOutletIds } } });
    if (count !== originOutletIds.length) throw new RepositoryValidationError('origin outlet is invalid');
  }
  if (originType === 'merchant' && originMerchantIds.length === 0) {
    throw new RepositoryValidationError('merchant origin requires an origin merchant');
  }
  if (originType === 'outlet' && originOutletIds.length === 0) {
    throw new RepositoryValidationError('outlet origin requires an origin outlet');
  }

  if (eligibleBranchIds !== undefined) {
    const branches = await transaction.merchantBranch.findMany({
      where: { id: { in: eligibleBranchIds } },
      select: { id: true, merchantId: true }
    });
    if (branches.length !== eligibleBranchIds.length) {
      throw new RepositoryValidationError('eligible branches contain an unknown ID');
    }
    if (
      originType === 'merchant' &&
      branches.some((branch) => !originMerchantIds.includes(branch.merchantId))
    ) {
      throw new RepositoryValidationError('eligible branches must belong to the origin merchant');
    }
  }

  if (excludedBranchIds !== undefined) {
    const count = await transaction.merchantBranch.count({ where: { id: { in: excludedBranchIds } } });
    if (count !== excludedBranchIds.length) {
      throw new RepositoryValidationError('excluded branches contain an unknown ID');
    }
  }
  if (excludedMerchantIds !== undefined) {
    const count = await transaction.merchant.count({ where: { id: { in: excludedMerchantIds } } });
    if (count !== excludedMerchantIds.length) {
      throw new RepositoryValidationError('excluded merchants contain an unknown ID');
    }
  }
  if (paymentMethodIds !== undefined) {
    const count = await transaction.paymentMethod.count({ where: { id: { in: paymentMethodIds } } });
    if (count !== paymentMethodIds.length) {
      throw new RepositoryValidationError('payment methods contain an unknown ID');
    }
  }

  if (originChanged) {
    await transaction.promotionDraftOriginMerchant.deleteMany({ where: { draftId } });
    await transaction.promotionDraftOriginOutlet.deleteMany({ where: { draftId } });
    if (originMerchantIds.length) {
      await transaction.promotionDraftOriginMerchant.createMany({
        data: originMerchantIds.map((merchantId) => ({ draftId, merchantId }))
      });
    }
    if (originOutletIds.length) {
      await transaction.promotionDraftOriginOutlet.createMany({
        data: originOutletIds.map((outletId) => ({ draftId, outletId }))
      });
    }
    if (eligibleBranchIds === undefined) {
      await transaction.promotionDraftEligibleBranch.deleteMany({
        where: { draftId, branch: { merchantId: { notIn: originMerchantIds } } }
      });
    }
    if (excludedBranchIds === undefined) {
      const kept = await transaction.promotionDraftExcludedBranch.findMany({
        where: { draftId },
        select: { branchId: true, branch: { select: { outletId: true } } }
      });
      const stale = kept
        .filter(({ branch }) => branch.outletId === null || !originOutletIds.includes(branch.outletId))
        .map(({ branchId }) => branchId);
      if (stale.length) {
        await transaction.promotionDraftExcludedBranch.deleteMany({
          where: { draftId, branchId: { in: stale } }
        });
      }
    }
  }

  if (eligibleBranchIds !== undefined) {
    await transaction.promotionDraftEligibleBranch.deleteMany({ where: { draftId } });
    if (eligibleBranchIds.length) {
      await transaction.promotionDraftEligibleBranch.createMany({
        data: eligibleBranchIds.map((branchId) => ({ draftId, branchId }))
      });
    }
  }
  if (excludedMerchantIds !== undefined) {
    await transaction.promotionDraftExcludedMerchant.deleteMany({ where: { draftId } });
    if (excludedMerchantIds.length) {
      await transaction.promotionDraftExcludedMerchant.createMany({
        data: excludedMerchantIds.map((merchantId) => ({ draftId, merchantId }))
      });
    }
  }
  if (excludedBranchIds !== undefined) {
    await transaction.promotionDraftExcludedBranch.deleteMany({ where: { draftId } });
    if (excludedBranchIds.length) {
      await transaction.promotionDraftExcludedBranch.createMany({
        data: excludedBranchIds.map((branchId) => ({ draftId, branchId }))
      });
    }
  }
  if (paymentMethodIds !== undefined) {
    await transaction.promotionDraftPaymentMethod.deleteMany({ where: { draftId } });
    if (paymentMethodIds.length) {
      await transaction.promotionDraftPaymentMethod.createMany({
        data: paymentMethodIds.map((paymentMethodId) => ({ draftId, paymentMethodId }))
      });
    }
  }
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
      const updatedDraft = await writePendingDraft(existingDraft.id, toDraftUpdateData(input, existingDraft));

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

      const updatedDraft = await writePendingDraft(duplicateDraft.id, toDraftUpdateData(input, duplicateDraft));

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
    rejectionReason: null,
    reviewedAt: new Date()
  };

  if (input.merchantId !== undefined) data.merchantId = input.merchantId;
  if (input.paymentMethodId !== undefined) data.paymentMethodId = input.paymentMethodId;
  if (input.originType !== undefined) data.originType = input.originType;
  if (input.eligibilityType !== undefined) data.eligibilityType = input.eligibilityType;
  if (input.benefitType !== undefined) {
    data.benefitType = input.benefitType ?? 'cashback';
    data.benefitTypeReviewed = input.benefitType !== null;
  }
  if (input.cashbackRate !== undefined) {
    data.cashbackRate = input.cashbackRate;
    data.cashbackRateReviewed = true;
  }
  if (input.fixedDiscountAmount !== undefined) {
    data.fixedDiscountAmount = input.fixedDiscountAmount;
    data.fixedDiscountAmountReviewed = true;
  }
  if (input.amountThreshold !== undefined) {
    data.amountThreshold = input.amountThreshold;
    data.amountThresholdReviewed = true;
  }
  if (input.validityStart !== undefined) {
    data.validityStart = input.validityStart;
    data.validityStartReviewed = true;
  }
  if (input.validityEnd !== undefined) {
    data.validityEnd = input.validityEnd;
    data.validityEndReviewed = true;
  }
  if (input.promotionNote !== undefined) data.promotionNote = input.promotionNote;
  if (input.outletId !== undefined) data.branchId = input.outletId;

  try {
    const updatedDraft = await writePendingDraft(id, data, input);

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

export async function reopenPromotionDraft(id: number): Promise<PromotionDraftRecord | null> {
  return prisma.$transaction(async (transaction) => {
    const result = await transaction.promotionDraft.updateMany({
      where: { id, status: 'rejected' },
      data: { status: 'pending_review', reviewedAt: null }
    });

    if (result.count === 1) {
      const draft = await transaction.promotionDraft.findUniqueOrThrow({
        where: { id },
        select: promotionDraftSelect
      });
      return toPromotionDraftRecord(draft);
    }

    const existing = await transaction.promotionDraft.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return null;
    throw new RepositoryConflictError('only rejected promotion drafts can be reopened');
  });
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
      validateReviewedPromotion(draft);
      const originMerchantIds = draft.originMerchants.map(({ merchantId }) => merchantId);
      const originOutletIds = draft.originOutlets.map(({ outletId }) => outletId);
      const originCount = draft.originType === 'merchant'
        ? await transaction.merchant.count({ where: { id: { in: originMerchantIds } } })
        : await transaction.outlet.count({ where: { id: { in: originOutletIds } } });
      if (originCount !== (draft.originType === 'merchant' ? originMerchantIds : originOutletIds).length) {
        throw new RepositoryConflictError('promotion origin is no longer available');
      }
      const paymentMethodIds = draft.paymentMethods.map(({ paymentMethodId }) => paymentMethodId);
      const paymentMethodCount = await transaction.paymentMethod.count({
        where: { id: { in: paymentMethodIds } }
      });
      if (paymentMethodCount !== paymentMethodIds.length) {
        throw new RepositoryConflictError('selected payment methods are no longer available');
      }
      const eligibleBranchIds = draft.eligibleBranches.map(({ branchId }) => branchId);
      const excludedBranchIds = draft.excludedBranches.map(({ branchId }) => branchId);
      if (draft.originType === 'merchant' && eligibleBranchIds.length) {
        const branchCount = await transaction.merchantBranch.count({
          where: { id: { in: eligibleBranchIds }, merchantId: { in: originMerchantIds } }
        });
        if (branchCount !== eligibleBranchIds.length) {
          throw new RepositoryValidationError('eligible branches must belong to the origin merchant');
        }
      }
      if (draft.originType === 'outlet' && excludedBranchIds.length) {
        const branchCount = await transaction.merchantBranch.count({
          where: { id: { in: excludedBranchIds }, outletId: { in: originOutletIds } }
        });
        if (branchCount !== excludedBranchIds.length) {
          throw new RepositoryValidationError('excluded branches must belong to the origin outlet');
        }
      }
      const promotion = await transaction.promotion.create({
        data: {
          sourceDraft: { connect: { id: draft.id } },
          originType: draft.originType,
          originMerchants: {
            create: originMerchantIds.map((merchantId) => ({ merchant: { connect: { id: merchantId } } }))
          },
          originOutlets: {
            create: originOutletIds.map((outletId) => ({ outlet: { connect: { id: outletId } } }))
          },
          eligibilityType: draft.eligibilityType,
          benefitType: draft.benefitType,
          cashbackRate: draft.benefitType === 'cashback' ? Number(draft.cashbackRate) : null,
          fixedDiscountAmount: draft.benefitType === 'fixed_discount' ? draft.fixedDiscountAmount : null,
          amountThreshold: draft.amountThreshold,
          validityStart: draft.validityStart,
          validityEnd: draft.validityEnd,
          promotionNote: draft.promotionNote,
          sourceUrl: draft.sourceUrl,
          sourceTitle: draft.sourceTitle,
          paymentMethods: {
            create: draft.paymentMethods.map(({ paymentMethodId }) => ({
              paymentMethod: { connect: { id: paymentMethodId } }
            }))
          },
          eligibleBranches: {
            create: eligibleBranchIds.map((branchId) => ({ branch: { connect: { id: branchId } } }))
          },
          excludedMerchants: {
            create: draft.excludedMerchants.map(({ merchantId }) => ({
              merchant: { connect: { id: merchantId } }
            }))
          },
          excludedBranches: {
            create: excludedBranchIds.map((branchId) => ({ branch: { connect: { id: branchId } } }))
          }
        },
        select: promotionSelect
      });

      const publishedDraft = await transaction.promotionDraft.update({
        where: { id },
        data: {
          status: 'published',
          reviewedAt: new Date(),
          rejectionReason: null
        },
        select: promotionDraftSelect
      });

      return {
        draft: toPromotionDraftRecord(publishedDraft),
        promotion: toPromotionRecord(promotion)
      };
    });
  } catch (error) {
    mapPrismaError(error, 'promotion catalog relationships changed; refresh the draft');
  }
}
