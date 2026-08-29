export type PaymentMethod = {
  id: string;
  name: string;
  type: 'credit_card' | 'debit_card' | 'mobile_payment';
};

export type RewardRule = {
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
  { id: 'jko', name: 'JKO Pay', type: 'mobile_payment' }
];

export const rewardRules: RewardRule[] = [
  {
    merchantName: 'FamilyMart',
    paymentMethodId: 'linepay',
    cashbackRate: 0.03,
    amountThreshold: 0,
    validityStart: '2026-01-01',
    validityEnd: '2026-12-31',
    promotionNote: '3% cashback at FamilyMart'
  },
  {
    merchantName: 'FamilyMart',
    paymentMethodId: 'visa',
    cashbackRate: 0.02,
    amountThreshold: 0,
    validityStart: '2026-01-01',
    validityEnd: '2026-12-31',
    promotionNote: '2% cashback at FamilyMart'
  },
  {
    merchantName: '7-ELEVEN',
    paymentMethodId: 'linepay',
    cashbackRate: 0.025,
    amountThreshold: 0,
    validityStart: '2026-01-01',
    validityEnd: '2026-12-31',
    promotionNote: '2.5% at 7-ELEVEN'
  },
  {
    merchantName: 'Starbucks',
    paymentMethodId: 'amex',
    cashbackRate: 0.04,
    amountThreshold: 100,
    validityStart: '2026-08-01',
    validityEnd: '2026-08-31',
    promotionNote: '4% August coffee promotion'
  },
  {
    merchantName: 'Starbucks',
    paymentMethodId: 'visa',
    cashbackRate: 0.015,
    amountThreshold: 0,
    validityStart: '2026-01-01',
    validityEnd: '2026-12-31',
    promotionNote: '1.5% standard cashback'
  }
];

export const merchants = ['FamilyMart', '7-ELEVEN', 'Starbucks'];
