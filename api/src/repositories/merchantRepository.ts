import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeMerchantName } from '../lib/normalization';
import { MerchantAlreadyExistsError, RepositoryConflictError } from './errors';
import type { MerchantRecord } from './types';

const merchantSelect = {
  id: true,
  name: true,
  chainName: true,
  category: true,
  location: true,
  notes: true
} as const;

export async function listMerchants(): Promise<MerchantRecord[]> {
  return prisma.merchant.findMany({
    orderBy: { name: 'asc' },
    select: merchantSelect
  });
}

export async function findMerchantByName(name: string): Promise<MerchantRecord | null> {
  return prisma.merchant.findUnique({
    where: { normalizedName: normalizeMerchantName(name) },
    select: merchantSelect
  });
}

export async function listAcceptedPaymentMethodIds(merchantId: number): Promise<number[]> {
  const acceptances = await prisma.merchantPaymentAcceptance.findMany({
    where: { merchantId },
    orderBy: { paymentMethodId: 'asc' },
    select: { paymentMethodId: true }
  });

  return acceptances.map((acceptance) => acceptance.paymentMethodId);
}

export async function createMerchant(name: string, chainName?: string): Promise<MerchantRecord> {
  const trimmedName = name.trim();

  try {
    return await prisma.merchant.create({
      data: {
        name: trimmedName,
        normalizedName: normalizeMerchantName(trimmedName),
        chainName: chainName ?? trimmedName
      },
      select: merchantSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new MerchantAlreadyExistsError(trimmedName);
    }

    throw error;
  }
}

export async function updateMerchant(id: number, name: string): Promise<MerchantRecord | null> {
  const trimmedName = name.trim();

  try {
    return await prisma.merchant.update({
      where: { id },
      data: {
        name: trimmedName,
        normalizedName: normalizeMerchantName(trimmedName)
      },
      select: merchantSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new RepositoryConflictError('merchant already exists');
      }

      if (error.code === 'P2025') {
        return null;
      }
    }

    throw error;
  }
}

export async function deleteMerchant(id: number): Promise<boolean> {
  const [acceptanceCount, rewardRuleCount] = await Promise.all([
    prisma.merchantPaymentAcceptance.count({ where: { merchantId: id } }),
    prisma.rewardRule.count({ where: { merchantId: id } })
  ]);

  if (acceptanceCount > 0) {
    throw new RepositoryConflictError('merchant has accepted payment methods');
  }

  if (rewardRuleCount > 0) {
    throw new RepositoryConflictError('merchant has reward rules');
  }

  try {
    await prisma.merchant.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return false;
      }

      if (error.code === 'P2003') {
        throw new RepositoryConflictError('merchant has dependent catalog records');
      }
    }

    throw error;
  }
}
