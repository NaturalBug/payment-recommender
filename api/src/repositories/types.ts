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
