import { merchants, paymentMethods, rewardRules } from '../data';

export type Recommendation = {
  paymentMethod: string;
  cashbackRate: number;
  estimatedCashback: number;
  promotionNote?: string;
};

type GetRecommendationsInput = {
  merchant_name: string;
  amount: number;
  date: Date;
};

export function getRecommendations({ merchant_name, amount, date }: GetRecommendationsInput): Recommendation[] {
  const normalizedMerchant = merchant_name.trim();
  const isValidMerchant = merchants.some((merchant) => merchant.toLowerCase() === normalizedMerchant.toLowerCase());

  if (!isValidMerchant) {
    return [];
  }

  const relevantRuleSet = rewardRules.filter((rule) => {
    const ruleDate = new Date(rule.validityStart);
    const ruleEnd = new Date(rule.validityEnd);
    const validMerchant = rule.merchantName.toLowerCase() === normalizedMerchant.toLowerCase();
    const validDate = date >= ruleDate && date <= ruleEnd;
    const validAmount = amount >= rule.amountThreshold;
    return validMerchant && validDate && validAmount;
  });

  return relevantRuleSet
    .map((rule) => {
      const paymentMethod = paymentMethods.find((method) => method.id === rule.paymentMethodId);
      if (!paymentMethod) {
        return null;
      }
      return {
        paymentMethod: paymentMethod.name,
        cashbackRate: rule.cashbackRate,
        estimatedCashback: Number((amount * rule.cashbackRate).toFixed(2)),
        promotionNote: rule.promotionNote
      };
    })
    .filter((entry): entry is Recommendation => entry !== null)
    .sort((a, b) => b.cashbackRate - a.cashbackRate);
}
