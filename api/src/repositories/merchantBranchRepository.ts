import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeMerchantName } from '../lib/normalization';
import { RepositoryConflictError, RepositoryValidationError } from './errors';
import type { MerchantBranchRecord } from './types';

const merchantBranchSelect = {
  id: true,
  merchantId: true,
  name: true,
  location: true,
  outletId: true
} as const;

export async function listMerchantBranches(merchantId: number): Promise<MerchantBranchRecord[]> {
  return prisma.merchantBranch.findMany({
    where: { merchantId },
    orderBy: { name: 'asc' },
    select: merchantBranchSelect
  });
}

export async function listOutletBranches(outletId: number): Promise<MerchantBranchRecord[]> {
  return prisma.merchantBranch.findMany({
    where: { outletId },
    orderBy: [{ merchant: { name: 'asc' } }, { name: 'asc' }],
    select: merchantBranchSelect
  });
}

export async function findMerchantBranchByName(
  merchantId: number,
  name: string
): Promise<MerchantBranchRecord | null> {
  return prisma.merchantBranch.findUnique({
    where: {
      merchantId_normalizedName: {
        merchantId,
        normalizedName: normalizeMerchantName(name)
      }
    },
    select: merchantBranchSelect
  });
}

export async function findMerchantBranchById(id: number): Promise<MerchantBranchRecord | null> {
  return prisma.merchantBranch.findUnique({
    where: { id },
    select: merchantBranchSelect
  });
}

export async function createMerchantBranch(input: {
  merchantId: number;
  name: string;
  location?: string;
  outletId?: number | null;
}): Promise<MerchantBranchRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new RepositoryValidationError('branch name is required');
  }

  try {
    return await prisma.merchantBranch.create({
      data: {
        merchantId: input.merchantId,
        name,
        normalizedName: normalizeMerchantName(name),
        location: input.location?.trim() || null,
        outletId: input.outletId ?? null
      },
      select: merchantBranchSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new RepositoryConflictError('branch already exists for this merchant');
      }
      if (error.code === 'P2003') {
        throw new RepositoryValidationError('merchant or outlet is invalid');
      }
    }
    throw error;
  }
}
