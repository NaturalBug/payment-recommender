import { listMerchants } from '../repositories/merchantRepository';
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
  const normalizedMerchant = merchant_name.trim();
  const merchants = await listMerchants();
  const rewardRules = await listRewardRules();

  const merchant = merchants.find((entry) => entry.name.toLowerCase() === normalizedMerchant.toLowerCase());
  if (!merchant) {
    return [];
  }

  const relevantRuleSet = rewardRules.filter((rule) => {
    const validityStart = new Date(rule.validityStart);
    const validityEnd = new Date(rule.validityEnd);
    const validMerchant = rule.merchantId === merchant.id;
    const validDate = date >= validityStart && date <= validityEnd;
    const validAmount = amount >= rule.amountThreshold;

    return validMerchant && validDate && validAmount;
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
