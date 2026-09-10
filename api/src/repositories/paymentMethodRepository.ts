import prisma from '../lib/prisma';
import { normalizePaymentMethodKey } from '../lib/normalization';
import type { PaymentMethodRecord } from './types';

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

export function toLegacyPaymentMethodId(paymentMethodName: string): string {
  const key = normalizePaymentMethodKey(paymentMethodName);
  return legacyIds[key] ?? key;
}

export async function findPaymentMethodByLegacyIdOrName(
  value: string
): Promise<PaymentMethodRecord | null> {
  const normalizedValue = normalizePaymentMethodKey(value);
  const paymentMethods = await prisma.paymentMethod.findMany({
    orderBy: { id: 'asc' },
    select: paymentMethodSelect
  });

  return (
    paymentMethods.find(
      (paymentMethod) =>
        normalizePaymentMethodKey(paymentMethod.name) === normalizedValue ||
        toLegacyPaymentMethodId(paymentMethod.name) === normalizedValue
    ) ?? null
  );
}
