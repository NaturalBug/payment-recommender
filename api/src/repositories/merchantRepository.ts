import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeMerchantName } from '../lib/normalization';
import { MerchantAlreadyExistsError } from './errors';
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
