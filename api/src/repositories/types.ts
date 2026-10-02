export type MerchantRecord = {
  id: number;
  name: string;
  chainName?: string | null;
  category?: string | null;
  location?: string | null;
  notes?: string | null;
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
  cashbackRate: number;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string | null;
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
  parsedAmountThreshold?: number | null;
  parsedValidityStart?: Date | null;
  parsedValidityEnd?: Date | null;
};

export type PromotionDraftReviewInput = {
  merchantId?: number;
  paymentMethodId?: number;
  cashbackRate?: number;
  amountThreshold?: number;
  validityStart?: Date;
  validityEnd?: Date;
  promotionNote?: string | null;
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
  parsedAmountThreshold?: number | null;
  parsedValidityStart?: Date | null;
  parsedValidityEnd?: Date | null;
  status: PromotionDraftStatus;
  merchantId?: number | null;
  paymentMethodId?: number | null;
  cashbackRate?: number | null;
  amountThreshold?: number | null;
  validityStart?: Date | null;
  validityEnd?: Date | null;
  promotionNote?: string | null;
  rewardRuleId?: number | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
};

export type PublishedDraftResult = {
  draft: PromotionDraftRecord;
  rewardRule: RewardRuleRecord;
};
