import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError, RepositoryValidationError } from './errors';
import type { RewardRuleRecord } from './types';

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

function toRewardRuleRecord(rule: RewardRuleRow): RewardRuleRecord {
  return {
    id: rule.id,
    merchantId: rule.merchantId,
    paymentMethodId: rule.paymentMethodId,
    paymentMethodName: rule.paymentMethod.name,
    cashbackRate: Number(rule.cashbackRate),
    amountThreshold: rule.amountThreshold,
    validityStart: rule.validityStart,
    validityEnd: rule.validityEnd,
    promotionNote: rule.promotionNote
  };
}

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
  cashbackRate: number;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string;
}): Promise<RewardRuleRecord> {
  try {
    const rule = await prisma.$transaction(async (transaction) => {
      await transaction.merchantPaymentAcceptance.upsert({
        where: {
          merchantId_paymentMethodId: {
            merchantId: input.merchantId,
            paymentMethodId: input.paymentMethodId
          }
        },
        update: {},
        create: {
          merchantId: input.merchantId,
          paymentMethodId: input.paymentMethodId
        }
      });

      return transaction.rewardRule.create({
        data: {
          merchantId: input.merchantId,
          paymentMethodId: input.paymentMethodId,
          cashbackRate: input.cashbackRate,
          amountThreshold: input.amountThreshold,
          validityStart: input.validityStart,
          validityEnd: input.validityEnd,
          promotionNote: input.promotionNote ?? null
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
