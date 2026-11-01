import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError } from './errors';
import type { MerchantPaymentAcceptanceRecord, PaymentMethodRecord } from './types';

const paymentMethodSelect = {
  id: true,
  name: true,
  type: true
} as const;

export async function listAcceptedPaymentMethods(merchantId: number): Promise<PaymentMethodRecord[]> {
  const acceptances = await prisma.merchantPaymentAcceptance.findMany({
    where: { merchantId },
    orderBy: { paymentMethod: { name: 'asc' } },
    select: { paymentMethod: { select: paymentMethodSelect } }
  });

  return acceptances.map((acceptance) => acceptance.paymentMethod);
}

export async function addAcceptance(
  merchantId: number,
  paymentMethodId: number
): Promise<MerchantPaymentAcceptanceRecord> {
  return prisma.merchantPaymentAcceptance.upsert({
    where: { merchantId_paymentMethodId: { merchantId, paymentMethodId } },
    update: {},
    create: { merchantId, paymentMethodId },
    select: {
      merchantId: true,
      paymentMethodId: true,
      paymentMethod: { select: paymentMethodSelect }
    }
  });
}

export async function removeAcceptance(merchantId: number, paymentMethodId: number): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const acceptance = await transaction.merchantPaymentAcceptance.findUnique({
      where: { merchantId_paymentMethodId: { merchantId, paymentMethodId } },
      select: { id: true }
    });

    if (!acceptance) {
      return false;
    }

    const [rewardRuleCount, issuerRestrictionCount] = await Promise.all([
      transaction.rewardRule.count({
        where: { merchantId, paymentMethodId }
      }),
      transaction.merchantIssuerRestriction.count({
        where: { merchantId, networkId: paymentMethodId }
      })
    ]);

    if (rewardRuleCount > 0) {
      throw new RepositoryConflictError('acceptance has reward rules');
    }
    if (issuerRestrictionCount > 0) {
      throw new RepositoryConflictError('acceptance has issuer restrictions');
    }

    try {
      await transaction.merchantPaymentAcceptance.delete({
        where: { merchantId_paymentMethodId: { merchantId, paymentMethodId } }
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return false;
        }
        if (error.code === 'P2003') {
          const rewardRules = await transaction.rewardRule.count({ where: { merchantId, paymentMethodId } });
          if (rewardRules > 0) {
            throw new RepositoryConflictError('acceptance has reward rules');
          }
          throw new RepositoryConflictError('acceptance has issuer restrictions');
        }
      }

      throw error;
    }
  });
}
