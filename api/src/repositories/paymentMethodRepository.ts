import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizePaymentMethodKey } from '../lib/normalization';
import { RepositoryConflictError } from './errors';
import type { PaymentMethodInput, PaymentMethodRecord } from './types';

const paymentMethodSelect = {
  id: true,
  name: true,
  type: true
} as const;

async function ensurePaymentMethodNameIsAvailable(name: string, excludedId?: number): Promise<void> {
  const normalizedName = normalizePaymentMethodKey(name);
  const paymentMethods = await prisma.paymentMethod.findMany({
    select: { id: true, name: true }
  });
  const hasDuplicate = paymentMethods.some(
    (paymentMethod) =>
      paymentMethod.id !== excludedId && normalizePaymentMethodKey(paymentMethod.name) === normalizedName
  );

  if (hasDuplicate) {
    throw new RepositoryConflictError('payment method already exists');
  }
}

export async function listPaymentMethods(): Promise<PaymentMethodRecord[]> {
  return prisma.paymentMethod.findMany({
    orderBy: { name: 'asc' },
    select: paymentMethodSelect
  });
}

export async function createPaymentMethod(input: PaymentMethodInput): Promise<PaymentMethodRecord> {
  const trimmedName = input.name.trim();
  await ensurePaymentMethodNameIsAvailable(trimmedName);

  try {
    return await prisma.paymentMethod.create({
      data: {
        name: trimmedName,
        normalizedName: normalizePaymentMethodKey(trimmedName),
        type: input.type
      },
      select: paymentMethodSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new RepositoryConflictError('payment method already exists');
    }

    throw error;
  }
}

export async function updatePaymentMethod(
  id: number,
  input: PaymentMethodInput
): Promise<PaymentMethodRecord | null> {
  const trimmedName = input.name.trim();
  await ensurePaymentMethodNameIsAvailable(trimmedName, id);

  try {
    return await prisma.paymentMethod.update({
      where: { id },
      data: {
        name: trimmedName,
        normalizedName: normalizePaymentMethodKey(trimmedName),
        type: input.type
      },
      select: paymentMethodSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new RepositoryConflictError('payment method already exists');
      }

      if (error.code === 'P2025') {
        return null;
      }
    }

    throw error;
  }
}

export async function deletePaymentMethod(id: number): Promise<boolean> {
  const [acceptanceCount, rewardRuleCount] = await Promise.all([
    prisma.merchantPaymentAcceptance.count({ where: { paymentMethodId: id } }),
    prisma.rewardRule.count({ where: { paymentMethodId: id } })
  ]);

  if (acceptanceCount > 0) {
    throw new RepositoryConflictError('payment method is accepted by merchants');
  }

  if (rewardRuleCount > 0) {
    throw new RepositoryConflictError('payment method has reward rules');
  }

  try {
    await prisma.paymentMethod.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return false;
      }

      if (error.code === 'P2003') {
        throw new RepositoryConflictError('payment method has dependent catalog records');
      }
    }

    throw error;
  }
}

export async function findPaymentMethodById(id: number): Promise<PaymentMethodRecord | null> {
  return prisma.paymentMethod.findUnique({
    where: { id },
    select: paymentMethodSelect
  });
}
