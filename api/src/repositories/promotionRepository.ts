import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { PromotionRecord } from './types';

export const promotionSelect = {
  id: true,
  sourceDraftId: true,
  originType: true,
  originMerchantId: true,
  originOutletId: true,
  eligibilityType: true,
  benefitType: true,
  cashbackRate: true,
  fixedDiscountAmount: true,
  amountThreshold: true,
  validityStart: true,
  validityEnd: true,
  promotionNote: true,
  sourceUrl: true,
  sourceTitle: true,
  paymentMethods: { select: { paymentMethodId: true } },
  eligibleBranches: { select: { branchId: true } },
  excludedMerchants: { select: { merchantId: true } },
  excludedBranches: { select: { branchId: true } }
} satisfies Prisma.PromotionSelect;

export type PromotionRow = Prisma.PromotionGetPayload<{ select: typeof promotionSelect }>;

export function toPromotionRecord(row: PromotionRow): PromotionRecord {
  return {
    id: row.id,
    sourceDraftId: row.sourceDraftId,
    originType: row.originType as PromotionRecord['originType'],
    originMerchantId: row.originMerchantId,
    originOutletId: row.originOutletId,
    eligibilityType: row.eligibilityType as PromotionRecord['eligibilityType'],
    benefitType: row.benefitType as PromotionRecord['benefitType'],
    cashbackRate: row.cashbackRate === null ? null : Number(row.cashbackRate),
    fixedDiscountAmount: row.fixedDiscountAmount,
    amountThreshold: row.amountThreshold,
    validityStart: row.validityStart,
    validityEnd: row.validityEnd,
    promotionNote: row.promotionNote,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    paymentMethodIds: row.paymentMethods.map(({ paymentMethodId }) => paymentMethodId),
    eligibleBranchIds: row.eligibleBranches.map(({ branchId }) => branchId),
    excludedMerchantIds: row.excludedMerchants.map(({ merchantId }) => merchantId),
    excludedBranchIds: row.excludedBranches.map(({ branchId }) => branchId)
  };
}

export async function listPromotions(): Promise<PromotionRecord[]> {
  const rows = await prisma.promotion.findMany({
    orderBy: { id: 'asc' },
    select: promotionSelect
  });
  return rows.map(toPromotionRecord);
}

export async function findPromotionBySourceDraftId(sourceDraftId: number): Promise<PromotionRecord | null> {
  const row = await prisma.promotion.findUnique({
    where: { sourceDraftId },
    select: promotionSelect
  });
  return row ? toPromotionRecord(row) : null;
}
