import prisma from '../lib/prisma';
import type { MerchantRecord } from './types';

export async function listMerchants(): Promise<MerchantRecord[]> {
  return prisma.merchant.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      chainName: true,
      category: true,
      location: true,
      notes: true
    }
  });
}

export async function createMerchant(name: string, chainName?: string): Promise<MerchantRecord> {
  return prisma.merchant.create({
    data: { name, chainName: chainName ?? name },
    select: {
      id: true,
      name: true,
      chainName: true,
      category: true,
      location: true,
      notes: true
    }
  });
}
