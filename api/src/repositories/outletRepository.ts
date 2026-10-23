import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeMerchantName } from '../lib/normalization';
import { RepositoryConflictError, RepositoryValidationError } from './errors';
import type { OutletRecord } from './types';

const outletSelect = {
  id: true,
  name: true,
  location: true
} as const;

export async function listOutlets(): Promise<OutletRecord[]> {
  return prisma.outlet.findMany({
    orderBy: [{ name: 'asc' }, { location: 'asc' }],
    select: outletSelect
  });
}

export async function findOutletById(id: number): Promise<OutletRecord | null> {
  return prisma.outlet.findUnique({ where: { id }, select: outletSelect });
}

export async function createOutlet(input: { name: string; location?: string }): Promise<OutletRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new RepositoryValidationError('outlet name is required');
  }

  try {
    return await prisma.outlet.create({
      data: {
        name,
        normalizedName: normalizeMerchantName(name),
        location: input.location?.trim() || null
      },
      select: outletSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new RepositoryConflictError('outlet already exists');
    }
    throw error;
  }
}
