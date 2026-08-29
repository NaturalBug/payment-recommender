import { getRecommendations } from '../services/recommendationService';

describe('getRecommendations', () => {
  test('ranks LINE Pay above VISA for FamilyMart', () => {
    const results = getRecommendations({
      merchant_name: 'FamilyMart',
      amount: 500,
      date: new Date('2026-08-29')
    });

    expect(results[0].paymentMethod).toBe('LINE Pay');
    expect(results[0].cashbackRate).toBeCloseTo(0.03);
  });

  test('returns empty array for unknown merchant', () => {
    const results = getRecommendations({
      merchant_name: 'NotAStore',
      amount: 500,
      date: new Date('2026-08-29')
    });

    expect(results).toEqual([]);
  });

  test('keeps standard rebates after a seasonal promo expires', () => {
    const results = getRecommendations({
      merchant_name: 'Starbucks',
      amount: 500,
      date: new Date('2026-09-01')
    });

    expect(results[0].paymentMethod).toBe('VISA');
    expect(results[0].cashbackRate).toBeCloseTo(0.015);
  });
});
