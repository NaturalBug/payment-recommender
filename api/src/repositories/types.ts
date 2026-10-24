export type MerchantRecord = {
  id: number;
  name: string;
  chainName?: string | null;
  category?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type MerchantBranchRecord = {
  id: number;
  merchantId: number;
  name: string;
  location?: string | null;
  outletId?: number | null;
};

export type MerchantOutletRecord = MerchantBranchRecord;

export type OutletRecord = {
  id: number;
  name: string;
  location?: string | null;
};

export type PaymentMethodRecord = {
  id: number;
  name: string;
  type: string;
};

export type PaymentMethodInput = {
  name: string;
  type: string;
};

export type MerchantPaymentAcceptanceRecord = {
  merchantId: number;
  paymentMethodId: number;
  paymentMethod: PaymentMethodRecord;
};

export type RewardRuleRecord = {
  id: number;
  merchantId: number;
  paymentMethodId: number;
  paymentMethodName: string;
  benefitType: 'cashback' | 'fixed_discount';
  cashbackRate?: number | null;
  fixedDiscountAmount?: number | null;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string | null;
  sourceUrl?: string | null;
  outletId?: number | null;
  outletName?: string | null;
};

export type ImportSource = 'line-pay' | 'jko-pay' | 'ipass-money';

export type ImportRunStatus = 'running' | 'completed' | 'failed';

export type PromotionDraftStatus = 'pending_review' | 'published' | 'rejected';

export type ImportRunRecord = {
  id: number;
  source: ImportSource;
  status: ImportRunStatus;
  startedAt: Date;
  completedAt?: Date | null;
  errorMessage?: string | null;
  draftCount: number;
};

export type ImportedPromotionDraft = {
  importRunId: number;
  source: ImportSource;
  sourceFingerprint: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceContent: string;
  fetchedAt: Date;
  parsedCashbackRate?: number | null;
  parsedBenefitType?: 'cashback' | 'fixed_discount' | null;
  parsedFixedDiscountAmount?: number | null;
  parsedAmountThreshold?: number | null;
  parsedValidityStart?: Date | null;
  parsedValidityEnd?: Date | null;
};

export type PromotionDraftReviewInput = {
  originType?: 'merchant' | 'outlet' | null;
  originMerchantIds?: number[];
  originOutletIds?: number[];
  eligibilityType?: 'merchant_wide' | 'selected_branches' | 'outlet' | null;
  eligibleBranchIds?: number[];
  excludedMerchantIds?: number[];
  excludedBranchIds?: number[];
  paymentMethodIds?: number[];
  merchantId?: number | null;
  paymentMethodId?: number | null;
  benefitType?: 'cashback' | 'fixed_discount' | null;
  cashbackRate?: number | null;
  fixedDiscountAmount?: number | null;
  amountThreshold?: number | null;
  validityStart?: Date | null;
  validityEnd?: Date | null;
  promotionNote?: string | null;
  outletId?: number | null;
};

export type PromotionDraftRecord = {
  id: number;
  importRunId: number;
  source: ImportSource;
  sourceFingerprint: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceContent: string;
  fetchedAt: Date;
  parsedCashbackRate?: number | null;
  parsedBenefitType?: 'cashback' | 'fixed_discount' | null;
  parsedFixedDiscountAmount?: number | null;
  parsedAmountThreshold?: number | null;
  parsedValidityStart?: Date | null;
  parsedValidityEnd?: Date | null;
  cashbackRateReviewed: boolean;
  benefitTypeReviewed: boolean;
  fixedDiscountAmountReviewed: boolean;
  amountThresholdReviewed: boolean;
  validityStartReviewed: boolean;
  validityEndReviewed: boolean;
  status: PromotionDraftStatus;
  originType?: 'merchant' | 'outlet' | null;
  originMerchantIds: number[];
  originOutletIds: number[];
  eligibilityType?: 'merchant_wide' | 'selected_branches' | 'outlet' | null;
  eligibleBranchIds: number[];
  excludedMerchantIds: number[];
  excludedBranchIds: number[];
  paymentMethodIds: number[];
  merchantId?: number | null;
  paymentMethodId?: number | null;
  benefitType: 'cashback' | 'fixed_discount';
  cashbackRate?: number | null;
  fixedDiscountAmount?: number | null;
  amountThreshold?: number | null;
  validityStart?: Date | null;
  validityEnd?: Date | null;
  promotionNote?: string | null;
  outletId?: number | null;
  rewardRuleId?: number | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
};

export type PromotionRecord = {
  id: number;
  sourceDraftId: number;
  originType: 'merchant' | 'outlet';
  originMerchantIds: number[];
  originOutletIds: number[];
  eligibilityType: 'merchant_wide' | 'selected_branches' | 'outlet';
  benefitType: 'cashback' | 'fixed_discount';
  cashbackRate: number | null;
  fixedDiscountAmount: number | null;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote: string | null;
  sourceUrl: string;
  sourceTitle: string;
  paymentMethodIds: number[];
  eligibleBranchIds: number[];
  excludedMerchantIds: number[];
  excludedBranchIds: number[];
};

export type PublishedDraftResult = {
  draft: PromotionDraftRecord;
  promotion: PromotionRecord;
};

export type BenefitType = 'cashback' | 'fixed_discount';
