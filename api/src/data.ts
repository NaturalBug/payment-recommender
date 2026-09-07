// Legacy in-memory catalog retained for compatibility references only.
// Runtime API behavior now uses the Prisma-backed repository layer.

export type PaymentMethod = {
  id: string;
  name: string;
  type: 'credit_card' | 'debit_card' | 'mobile_payment';
};

export type RewardRule = {
  id: string;
  merchantName: string;
  paymentMethodId: string;
  cashbackRate: number;
  amountThreshold: number;
  validityStart: string;
  validityEnd: string;
  promotionNote?: string;
};

export const paymentMethods: PaymentMethod[] = [
  { id: 'visa', name: 'VISA', type: 'credit_card' },
  { id: 'amex', name: 'AMEX Gold', type: 'credit_card' },
  { id: 'linepay', name: 'LINE Pay', type: 'mobile_payment' },
  { id: 'jko', name: 'JKO Pay', type: 'mobile_payment' },
  { id: 'cash', name: 'Cash', type: 'debit_card' }
];

export const defaultRewardRules: RewardRule[] = [
  {
    id: 'rule-1', merchantName: 'FamilyMart', paymentMethodId: 'linepay', cashbackRate: 0.03, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '3% cashback at FamilyMart'
  },
  {
    id: 'rule-2', merchantName: 'FamilyMart', paymentMethodId: 'visa', cashbackRate: 0.02, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2% cashback at FamilyMart'
  },
  {
    id: 'rule-3', merchantName: '7-ELEVEN', paymentMethodId: 'linepay', cashbackRate: 0.025, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '2.5% at 7-ELEVEN'
  },
  {
    id: 'rule-4', merchantName: '7-ELEVEN', paymentMethodId: 'jko', cashbackRate: 0.018, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.8% at 7-ELEVEN'
  },
  {
    id: 'rule-5', merchantName: 'Starbucks', paymentMethodId: 'amex', cashbackRate: 0.04, amountThreshold: 100, validityStart: '2026-08-01', validityEnd: '2026-08-31', promotionNote: '4% August coffee promotion'
  },
  {
    id: 'rule-6', merchantName: 'Starbucks', paymentMethodId: 'visa', cashbackRate: 0.015, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1.5% standard cashback'
  },
  {
    id: 'rule-7', merchantName: 'PX Mart', paymentMethodId: 'cash', cashbackRate: 0.0, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: 'Cash has no reward, but zero fee'
  },
  {
    id: 'rule-8', merchantName: 'PX Mart', paymentMethodId: 'visa', cashbackRate: 0.01, amountThreshold: 0, validityStart: '2026-01-01', validityEnd: '2026-12-31', promotionNote: '1% on general purchases'
  }
];

export const defaultMerchants = ['FamilyMart', '7-ELEVEN', 'Starbucks', 'PX Mart'];

export let merchants = [...defaultMerchants];
export let rewardRules: RewardRule[] = [...defaultRewardRules];

export function resetDataStore() {
  merchants = [...defaultMerchants];
  rewardRules = [...defaultRewardRules];
}

export function getMerchantCatalog(): string[] {
  return [...merchants];
}

export function addMerchant(merchantName: string): string {
  const normalized = merchantName.trim();

  if (!normalized) {
    throw new Error('merchant name is required');
  }

  const exists = merchants.some((merchant) => merchant.toLowerCase() === normalized.toLowerCase());
  if (exists) {
    return normalized;
  }

  merchants.push(normalized);
  return normalized;
}

export function getRewardRuleCatalog(): RewardRule[] {
  return rewardRules.map((rule) => ({ ...rule }));
}

export function addRewardRule(input: Omit<RewardRule, 'id'> & { id?: string }): RewardRule {
  const id = input.id ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nextRule: RewardRule = {
    ...input,
    id,
    merchantName: input.merchantName.trim(),
    paymentMethodId: input.paymentMethodId.trim(),
    promotionNote: input.promotionNote?.trim() || undefined
  };

  if (!nextRule.merchantName || !nextRule.paymentMethodId) {
    throw new Error('merchantName and paymentMethodId are required');
  }

  rewardRules.push(nextRule);
  return { ...nextRule };
}

export function removeRewardRule(ruleId: string): boolean {
  const index = rewardRules.findIndex((rule) => rule.id === ruleId);
  if (index === -1) {
    return false;
  }

  rewardRules.splice(index, 1);
  return true;
}
