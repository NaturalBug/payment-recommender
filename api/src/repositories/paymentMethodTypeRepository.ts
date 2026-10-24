import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { RepositoryConflictError, RepositoryValidationError } from './errors';

export type PaymentMethodTypeRecord = {
  id: number;
  name: string;
  paymentMethodCount: number;
};

const TYPE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;

export function normalizePaymentMethodTypeName(value: string): string {
  const name = value.trim().toLowerCase();
  if (!TYPE_NAME_PATTERN.test(name)) {
    throw new RepositoryValidationError(
      'type name must use lowercase letters, digits, and underscores, starting with a letter'
    );
  }
  return name;
}

// Types already used by payment methods (created before the catalog existed) are added on demand.
async function syncTypesInUse(): Promise<void> {
  const inUse = await prisma.paymentMethod.findMany({ distinct: ['type'], select: { type: true } });
  if (!inUse.length) {
    return;
  }
  const existing = new Set((await prisma.paymentMethodType.findMany({ select: { name: true } })).map((type) => type.name));
  const missing = inUse.filter((method) => !existing.has(method.type));
  if (missing.length) {
    await prisma.paymentMethodType.createMany({ data: missing.map((method) => ({ name: method.type })) });
  }
}

export async function listPaymentMethodTypes(): Promise<PaymentMethodTypeRecord[]> {
  await syncTypesInUse();
  const [types, usage] = await Promise.all([
    prisma.paymentMethodType.findMany({ orderBy: { name: 'asc' } }),
    prisma.paymentMethod.groupBy({ by: ['type'], _count: { _all: true } })
  ]);
  const countByType = new Map(usage.map((row) => [row.type, row._count._all]));
  return types.map((type) => ({
    id: type.id,
    name: type.name,
    paymentMethodCount: countByType.get(type.name) ?? 0
  }));
}

export async function paymentMethodTypeExists(name: string): Promise<boolean> {
  await syncTypesInUse();
  return (await prisma.paymentMethodType.count({ where: { name } })) > 0;
}

export async function createPaymentMethodType(rawName: string): Promise<PaymentMethodTypeRecord> {
  const name = normalizePaymentMethodTypeName(rawName);
  try {
    const created = await prisma.paymentMethodType.create({ data: { name } });
    return { id: created.id, name: created.name, paymentMethodCount: 0 };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new RepositoryConflictError('payment method type already exists');
    }
    throw error;
  }
}

export async function deletePaymentMethodType(id: number): Promise<boolean> {
  const type = await prisma.paymentMethodType.findUnique({ where: { id } });
  if (!type) {
    return false;
  }
  if ((await prisma.paymentMethod.count({ where: { type: type.name } })) > 0) {
    throw new RepositoryConflictError('payment method type is in use');
  }
  const { count } = await prisma.paymentMethodType.deleteMany({ where: { id } });
  return count > 0;
}
