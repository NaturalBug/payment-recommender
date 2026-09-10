export function normalizeMerchantName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizePaymentMethodKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
