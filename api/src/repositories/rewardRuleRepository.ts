import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError, RepositoryValidationError } from './errors';
import type { RewardRuleRecord } from './types';

type RewardRuleRow = {
  id: number;
  merchantId: number;
  paymentMethodId: number;
  cashbackRate: unknown;
  benefitType: string;
  fixedDiscountAmount: number | null;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote: string | null;
  sourceUrl: string | null;
  paymentMethod: { name: string };
  branchId: number | null;
  branch: { name: string } | null;
};

function toRewardRuleRecord(rule: RewardRuleRow): RewardRuleRecord {
  return {
    id: rule.id,
    merchantId: rule.merchantId,
    paymentMethodId: rule.paymentMethodId,
    paymentMethodName: rule.paymentMethod.name,
    benefitType: rule.benefitType as RewardRuleRecord['benefitType'],
    cashbackRate: rule.cashbackRate === null ? null : Number(rule.cashbackRate),
    fixedDiscountAmount: rule.fixedDiscountAmount,
    amountThreshold: rule.amountThreshold,
    validityStart: rule.validityStart,
    validityEnd: rule.validityEnd,
    promotionNote: rule.promotionNote,
    sourceUrl: rule.sourceUrl,
    outletId: rule.branchId,
    outletName: rule.branch?.name ?? null
  };
}

const rewardRuleSelect = {
  id: true,
  merchantId: true,
  paymentMethodId: true,
  benefitType: true,
  cashbackRate: true,
  fixedDiscountAmount: true,
  amountThreshold: true,
  validityStart: true,
  validityEnd: true,
  promotionNote: true,
  sourceUrl: true,
  branchId: true,
  paymentMethod: {
    select: { name: true }
  },
  branch: { select: { name: true } }
} as const;

export async function listRewardRules(): Promise<RewardRuleRecord[]> {
  const rules = await prisma.rewardRule.findMany({
    orderBy: { id: 'asc' },
    select: rewardRuleSelect
  });

  return rules.map(toRewardRuleRecord);
}

export async function createRewardRule(input: {
  merchantId: number;
  paymentMethodId: number;
  benefitType?: 'cashback' | 'fixed_discount';
  cashbackRate?: number;
  fixedDiscountAmount?: number;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string;
  sourceUrl?: string;
  outletId?: number | null;
}): Promise<RewardRuleRecord> {
  try {
    const benefitType = input.benefitType ?? 'cashback';
    if (
      (benefitType === 'cashback' && (!Number.isFinite(input.cashbackRate) || (input.cashbackRate ?? -1) < 0)) ||
      (benefitType === 'fixed_discount' &&
        (!Number.isInteger(input.fixedDiscountAmount) || (input.fixedDiscountAmount ?? 0) <= 0))
    ) {
      throw new RepositoryValidationError('benefit values are invalid');
    }

    const rule = await prisma.$transaction(async (transaction) => {
      const acceptance = await transaction.merchantPaymentAcceptance.findUnique({
        where: {
          merchantId_paymentMethodId: {
            merchantId: input.merchantId,
            paymentMethodId: input.paymentMethodId
          }
        }
      });

      if (!acceptance) {
        throw new RepositoryValidationError('payment method is not accepted by this merchant');
      }

      if (input.outletId !== undefined && input.outletId !== null) {
        const branch = await transaction.merchantBranch.findFirst({
          where: { id: input.outletId, merchantId: input.merchantId },
          select: { id: true }
        });

        if (!branch) {
          throw new RepositoryValidationError('branch does not belong to this merchant');
        }
      }

      return transaction.rewardRule.create({
        data: {
          merchantId: input.merchantId,
          paymentMethodId: input.paymentMethodId,
          benefitType,
          cashbackRate: benefitType === 'cashback' ? input.cashbackRate : null,
          fixedDiscountAmount: benefitType === 'fixed_discount' ? input.fixedDiscountAmount : null,
          amountThreshold: input.amountThreshold,
          validityStart: input.validityStart,
          validityEnd: input.validityEnd,
          promotionNote: input.promotionNote ?? null,
          sourceUrl: input.sourceUrl ?? null,
          branchId: input.outletId ?? null
        },
        select: rewardRuleSelect
      });
    });

    return toRewardRuleRecord(rule);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new RepositoryConflictError('reward rule conflicts with an existing record');
      }

      if (error.code === 'P2003') {
        throw new RepositoryValidationError('merchant or payment method is invalid');
      }
    }

    throw error;
  }
}

export async function deleteRewardRule(id: number): Promise<boolean> {
  try {
    await prisma.rewardRule.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return false;
    }

    throw error;
  }
}
