import { normalizeMerchantName } from '../lib/normalization';
import { listAcceptedPaymentMethodIds, listMerchants } from '../repositories/merchantRepository';
import { listRewardRules } from '../repositories/rewardRuleRepository';

export type Recommendation = {
  paymentMethod: string;
  cashbackRate: number;
  estimatedCashback: number;
  promotionNote?: string;
};

export type GetRecommendationsInput = {
  merchant_name: string;
  amount: number;
  date: Date;
};

export async function getRecommendations({
  merchant_name,
  amount,
  date
}: GetRecommendationsInput): Promise<Recommendation[]> {
  const normalizedMerchant = normalizeMerchantName(merchant_name);
  const merchants = await listMerchants();

  const merchant = merchants.find((entry) => normalizeMerchantName(entry.name) === normalizedMerchant);
  if (!merchant) {
    return [];
  }

  const [rewardRules, acceptedPaymentMethodIds] = await Promise.all([
    listRewardRules(),
    listAcceptedPaymentMethodIds(merchant.id)
  ]);
  const acceptedPaymentMethodIdSet = new Set(acceptedPaymentMethodIds);

  const relevantRuleSet = rewardRules.filter((rule) => {
    const validityStart = new Date(rule.validityStart);
    const validityEnd = new Date(rule.validityEnd);
    const validMerchant = rule.merchantId === merchant.id;
    const validDate = date >= validityStart && date <= validityEnd;
    const validAmount = amount >= rule.amountThreshold;

    return validMerchant && acceptedPaymentMethodIdSet.has(rule.paymentMethodId) && validDate && validAmount;
  });

  return relevantRuleSet
    .map((rule) => ({
      paymentMethod: rule.paymentMethodName || 'Unknown',
      cashbackRate: rule.cashbackRate,
      estimatedCashback: Number((amount * rule.cashbackRate).toFixed(2)),
      promotionNote: rule.promotionNote ?? undefined
    }))
    .sort((a, b) => b.cashbackRate - a.cashbackRate);
}
