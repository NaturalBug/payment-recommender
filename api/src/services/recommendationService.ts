import { normalizeMerchantName } from '../lib/normalization';
import { RepositoryNotFoundError, RepositoryValidationError } from '../repositories/errors';
import { findMerchantBranchById } from '../repositories/merchantBranchRepository';
import { listAcceptedPaymentMethodIds, listMerchants } from '../repositories/merchantRepository';
import { listPaymentMethods } from '../repositories/paymentMethodRepository';
import { findOutletById } from '../repositories/outletRepository';
import { findMerchantOutletByName } from '../repositories/merchantOutletRepository';
import { listPromotions } from '../repositories/promotionRepository';
import { listRewardRules } from '../repositories/rewardRuleRepository';

export type Recommendation = {
  paymentMethod: string;
  benefitType: 'cashback' | 'fixed_discount';
  cashbackRate?: number;
  fixedDiscountAmount?: number;
  amountThreshold: number;
  estimatedCashback?: number;
  estimatedSavings: number;
  promotionNote?: string;
  sourceUrl?: string;
  outletName?: string;
  promotionId?: number;
  originType?: 'merchant' | 'outlet';
  originName?: string;
  eligibilityType?: 'merchant_wide' | 'selected_branches' | 'outlet';
  branchId?: number;
  branchName?: string;
  outletId?: number;
};

export type GetRecommendationsInput = {
  merchant_name: string;
  amount: number;
  date: Date;
  outlet_name?: string;
  branch_id?: number;
  outlet_id?: number;
};

function calculateSavings(
  amount: number,
  benefitType: 'cashback' | 'fixed_discount',
  cashbackRate: number | null | undefined,
  fixedDiscountAmount: number | null | undefined
): number {
  return benefitType === 'fixed_discount'
    ? fixedDiscountAmount ?? 0
    : Number((amount * (cashbackRate ?? 0)).toFixed(2));
}

export async function getRecommendations({
  merchant_name,
  amount,
  date,
  outlet_name,
  branch_id,
  outlet_id
}: GetRecommendationsInput): Promise<Recommendation[]> {
  const normalizedMerchant = normalizeMerchantName(merchant_name);
  const merchants = await listMerchants();
  const merchant = merchants.find((entry) => normalizeMerchantName(entry.name) === normalizedMerchant);
  if (!merchant) return [];

  const namedBranch = outlet_name
    ? await findMerchantOutletByName(merchant.id, outlet_name)
    : null;
  const selectedBranch = branch_id !== undefined
    ? await findMerchantBranchById(branch_id)
    : null;
  if (branch_id !== undefined && !selectedBranch) {
    throw new RepositoryNotFoundError('branch not found');
  }
  if (selectedBranch && selectedBranch.merchantId !== merchant.id) {
    throw new RepositoryValidationError('branch does not belong to the selected merchant');
  }
  if (branch_id !== undefined && namedBranch && namedBranch.id !== branch_id) {
    throw new RepositoryValidationError('branch_id and outlet_name refer to different branches');
  }

  const legacySelectedBranchId = selectedBranch?.id ?? namedBranch?.id;
  let selectedOutlet = outlet_id !== undefined
    ? await findOutletById(outlet_id)
    : selectedBranch?.outletId
      ? await findOutletById(selectedBranch.outletId)
      : null;
  if (outlet_id !== undefined && !selectedOutlet) {
    throw new RepositoryNotFoundError('outlet not found');
  }
  const branchContext = selectedBranch ?? namedBranch;
  if (branchContext && outlet_id !== undefined && branchContext.outletId !== outlet_id) {
    throw new RepositoryValidationError('branch does not belong to the selected outlet');
  }

  const [rewardRules, acceptedPaymentMethodIds, promotions, paymentMethods] = await Promise.all([
    listRewardRules(),
    listAcceptedPaymentMethodIds(merchant.id),
    listPromotions(),
    listPaymentMethods()
  ]);
  const acceptedPaymentMethodIdSet = new Set(acceptedPaymentMethodIds);
  const paymentMethodNames = new Map(paymentMethods.map(({ id, name }) => [id, name]));
  const selectedBranchId = selectedBranch?.id;
  const selectedOutletId = selectedOutlet?.id;

  const ruleRecommendations = rewardRules
    .filter((rule) => {
      const validMerchant = rule.merchantId === merchant.id;
      const validDate = date >= rule.validityStart && date <= rule.validityEnd;
      const validAmount = amount >= rule.amountThreshold;
      const validBranch = rule.outletId == null || rule.outletId === legacySelectedBranchId;
      return validMerchant &&
        acceptedPaymentMethodIdSet.has(rule.paymentMethodId) &&
        validDate &&
        validAmount &&
        validBranch;
    })
    .map((rule): Recommendation => {
      const benefitType = rule.benefitType ?? 'cashback';
      const estimatedSavings = calculateSavings(
        amount,
        benefitType,
        rule.cashbackRate,
        rule.fixedDiscountAmount
      );
      return {
        paymentMethod: rule.paymentMethodName || 'Unknown',
        benefitType,
        cashbackRate: benefitType === 'cashback' ? rule.cashbackRate ?? 0 : undefined,
        fixedDiscountAmount: benefitType === 'fixed_discount' ? rule.fixedDiscountAmount ?? 0 : undefined,
        amountThreshold: rule.amountThreshold,
        estimatedCashback: benefitType === 'cashback' ? estimatedSavings : undefined,
        estimatedSavings,
        promotionNote: rule.promotionNote ?? undefined,
        sourceUrl: rule.sourceUrl ?? undefined,
        outletName: rule.outletName ?? undefined,
        branchId: rule.outletId ?? undefined,
        branchName: rule.outletName ?? undefined
      };
    });

  const promotionRecommendations: Recommendation[] = [];
  for (const promotion of promotions) {
    if (!promotion.paymentMethodIds.some((id) => acceptedPaymentMethodIdSet.has(id))) continue;
    if (date < promotion.validityStart || date > promotion.validityEnd || amount < promotion.amountThreshold) continue;
    if (promotion.excludedMerchantIds.includes(merchant.id)) continue;
    if (promotion.excludedBranchIds.includes(selectedBranchId ?? -1)) continue;
    if (!selectedBranchId && promotion.excludedBranchIds.length > 0) continue;

    if (promotion.originType === 'merchant') {
      if (promotion.originMerchantId !== merchant.id) continue;
      if (
        promotion.eligibilityType === 'selected_branches' &&
        (selectedBranchId === undefined || !promotion.eligibleBranchIds.includes(selectedBranchId))
      ) {
        continue;
      }
    } else if (selectedOutletId !== promotion.originOutletId) {
      continue;
    }

    const originName = promotion.originType === 'merchant'
      ? merchants.find(({ id }) => id === promotion.originMerchantId)?.name
      : selectedOutlet?.name;
    for (const paymentMethodId of promotion.paymentMethodIds) {
      const paymentMethod = paymentMethodNames.get(paymentMethodId);
      if (!paymentMethod || !acceptedPaymentMethodIdSet.has(paymentMethodId)) continue;
      const estimatedSavings = calculateSavings(
        amount,
        promotion.benefitType,
        promotion.cashbackRate,
        promotion.fixedDiscountAmount
      );
      promotionRecommendations.push({
        paymentMethod,
        benefitType: promotion.benefitType,
        cashbackRate: promotion.benefitType === 'cashback' ? promotion.cashbackRate ?? 0 : undefined,
        fixedDiscountAmount: promotion.benefitType === 'fixed_discount'
          ? promotion.fixedDiscountAmount ?? 0
          : undefined,
        amountThreshold: promotion.amountThreshold,
        estimatedCashback: promotion.benefitType === 'cashback' ? estimatedSavings : undefined,
        estimatedSavings,
        promotionNote: promotion.promotionNote ?? undefined,
        sourceUrl: promotion.sourceUrl,
        promotionId: promotion.id,
        originType: promotion.originType,
        originName,
        eligibilityType: promotion.eligibilityType,
        branchId: selectedBranchId,
        branchName: selectedBranch?.name,
        outletId: promotion.originType === 'outlet' ? promotion.originOutletId ?? undefined : selectedOutletId,
        outletName: selectedOutlet?.name
      });
    }
  }

  return [...ruleRecommendations, ...promotionRecommendations]
    .sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}
