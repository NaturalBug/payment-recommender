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

const legacyIds: Record<string, string> = {
  amexgold: 'amex',
  linepay: 'linepay',
  jkopay: 'jko',
  visa: 'visa',
  cash: 'cash'
};

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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return false;
    }

    throw error;
  }
}

export function toLegacyPaymentMethodId(paymentMethodName: string): string {
  const key = normalizePaymentMethodKey(paymentMethodName);
  return legacyIds[key] ?? key;
}

export async function findPaymentMethodByLegacyIdOrName(
  value: string
): Promise<PaymentMethodRecord | null> {
  const trimmedValue = value.trim();
  const normalizedValue = normalizePaymentMethodKey(value);
  const paymentMethods = await prisma.paymentMethod.findMany({
    orderBy: { id: 'asc' },
    select: paymentMethodSelect
  });

  return (
    paymentMethods.find(
      (paymentMethod) =>
        String(paymentMethod.id) === trimmedValue ||
        normalizePaymentMethodKey(paymentMethod.name) === normalizedValue ||
        toLegacyPaymentMethodId(paymentMethod.name) === normalizedValue
    ) ?? null
  );
}
