import { normalizeMerchantName } from '../lib/normalization';
import { getMerchantCardRules, listRecommendationCards } from '../repositories/cardRepository';
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
  cardId?: number;
  issuerName?: string;
  networkName?: string;
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

  const [rewardRules, acceptedPaymentMethodIds, promotions, paymentMethods, cards, merchantCardRules] = await Promise.all([
    listRewardRules(),
    listAcceptedPaymentMethodIds(merchant.id),
    listPromotions(),
    listPaymentMethods(),
    listRecommendationCards(),
    getMerchantCardRules(merchant.id)
  ]);
  const acceptedPaymentMethodIdSet = new Set(acceptedPaymentMethodIds);
  const paymentMethodsById = new Map(paymentMethods.map((paymentMethod) => [paymentMethod.id, paymentMethod]));
  type NetworkCard = (typeof cards)[number] & { networkId: number; networkName: string };
  const cardsByNetworkId = new Map<number, NetworkCard[]>();
  const eligibleCardsByNetworkId = new Map<number, NetworkCard[]>();
  const excludedCardIds = new Set(merchantCardRules.excludedCardIds);
  for (const card of cards) {
    for (const networkId of card.networkIds) {
      if (!acceptedPaymentMethodIdSet.has(networkId)) continue;
      const network = paymentMethodsById.get(networkId);
      if (network?.type !== 'credit_card') continue;

      const networkCard = { ...card, networkId, networkName: network.name };
      const networkCards = cardsByNetworkId.get(networkId) ?? [];
      networkCards.push(networkCard);
      cardsByNetworkId.set(networkId, networkCards);
      const allowedIssuerIds = merchantCardRules.issuerIdsByNetwork[networkId];
      if (
        excludedCardIds.has(card.id) ||
        (allowedIssuerIds?.length && !allowedIssuerIds.includes(card.issuerId))
      ) {
        continue;
      }
      const eligibleNetworkCards = eligibleCardsByNetworkId.get(networkId) ?? [];
      eligibleNetworkCards.push(networkCard);
      eligibleCardsByNetworkId.set(networkId, eligibleNetworkCards);
    }
  }
  const recommendationCardsByPaymentMethodId = new Map<
    number,
    Array<NetworkCard | undefined>
  >();
  for (const paymentMethodId of acceptedPaymentMethodIds) {
    const paymentMethod = paymentMethodsById.get(paymentMethodId);
    if (
      paymentMethod?.type !== 'credit_card' ||
      (!cardsByNetworkId.has(paymentMethodId) &&
        !merchantCardRules.issuerIdsByNetwork[paymentMethodId]?.length)
    ) {
      recommendationCardsByPaymentMethodId.set(paymentMethodId, [undefined]);
      continue;
    }

    recommendationCardsByPaymentMethodId.set(
      paymentMethodId,
      eligibleCardsByNetworkId.get(paymentMethodId) ?? []
    );
  }
  const cardsForPaymentMethod = (paymentMethodId: number) =>
    recommendationCardsByPaymentMethodId.get(paymentMethodId) ?? [];
  const cardRecommendationFields = (card: NetworkCard | undefined) => card ? {
    cardId: card.id,
    issuerName: card.issuerName,
    networkName: card.networkName
  } : {};
  const cardPaymentMethodName = (fallbackName: string, card: NetworkCard | undefined) =>
    card ? `${card.issuerName} ${card.name} (${card.networkName})` : fallbackName;
  const selectedBranchId = selectedBranch?.id;
  const selectedOutletId = selectedOutlet?.id;

  const ruleRecommendations = rewardRules
    .filter((rule) => {
      if (cardsForPaymentMethod(rule.paymentMethodId).length === 0) return false;
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
    .flatMap((rule): Recommendation[] => {
      const benefitType = rule.benefitType ?? 'cashback';
      const estimatedSavings = calculateSavings(
        amount,
        benefitType,
        rule.cashbackRate,
        rule.fixedDiscountAmount
      );
      return cardsForPaymentMethod(rule.paymentMethodId).map((card) => ({
        paymentMethod: cardPaymentMethodName(rule.paymentMethodName || 'Unknown', card),
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
        branchName: rule.outletName ?? undefined,
        ...cardRecommendationFields(card)
      }));
    });

  const promotionRecommendations: Recommendation[] = [];
  for (const promotion of promotions) {
    if (!promotion.paymentMethodIds.some((id) =>
      acceptedPaymentMethodIdSet.has(id) && cardsForPaymentMethod(id).length > 0
    )) continue;
    if (date < promotion.validityStart || date > promotion.validityEnd || amount < promotion.amountThreshold) continue;
    if (promotion.excludedMerchantIds.includes(merchant.id)) continue;
    if (promotion.excludedBranchIds.includes(selectedBranchId ?? -1)) continue;
    if (!selectedBranchId && promotion.excludedBranchIds.length > 0) continue;

    if (promotion.originType === 'merchant') {
      if (!promotion.originMerchantIds.includes(merchant.id)) continue;
      if (
        promotion.eligibilityType === 'selected_branches' &&
        (selectedBranchId === undefined || !promotion.eligibleBranchIds.includes(selectedBranchId))
      ) {
        continue;
      }
    } else if (selectedOutletId === undefined || !promotion.originOutletIds.includes(selectedOutletId)) {
      continue;
    }

    const originName = promotion.originType === 'merchant'
      ? merchant.name
      : selectedOutlet?.name;
    for (const paymentMethodId of promotion.paymentMethodIds) {
      const paymentMethod = paymentMethodsById.get(paymentMethodId);
      if (!paymentMethod || !acceptedPaymentMethodIdSet.has(paymentMethodId)) continue;
      const recommendationCards = cardsForPaymentMethod(paymentMethodId).filter((card) => {
        if (promotion.issuerIds.length > 0 && (!card || !promotion.issuerIds.includes(card.issuerId))) return false;
        if (promotion.cardIds.length > 0 && (!card || !promotion.cardIds.includes(card.id))) return false;
        return true;
      });
      if (recommendationCards.length === 0) continue;
      const estimatedSavings = calculateSavings(
        amount,
        promotion.benefitType,
        promotion.cashbackRate,
        promotion.fixedDiscountAmount
      );
      for (const card of recommendationCards) {
        promotionRecommendations.push({
          paymentMethod: cardPaymentMethodName(paymentMethod.name, card),
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
          outletId: selectedOutletId,
          outletName: selectedOutlet?.name,
          ...cardRecommendationFields(card)
        });
      }
    }
  }

  return [...ruleRecommendations, ...promotionRecommendations]
    .sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}
