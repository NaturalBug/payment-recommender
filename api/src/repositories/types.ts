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
  legacyId: string | null;
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
  paymentMethodLegacyId?: string | null;
  cashbackRate: number;
  amountThreshold: number;
  validityStart: Date;
  validityEnd: Date;
  promotionNote?: string | null;
};
