# Store-Focused Payment Recommendation MVP Design

**Date:** 2026-08-29  
**Scope:** Taiwan MVP  
**Status:** Approved for implementation

## 1. Goal

Build a web app that recommends the best payment method for a specific store and transaction amount, based on merchant-specific cashback and promotion rules.

The user enters a store name, transaction amount, and payment date. The app returns the highest-value payment option ranked by reward rate and estimated cashback.

## 2. Design decision

This version changes the core recommendation model from category-based to merchant-based:

- `merchant_type` is replaced by a specific `merchant` entity
- `spendingCategory` is removed from the MVP
- Recommendation logic is based on store-specific rules, not abstract category rules

This reduces user input and makes the app more useful in real-world purchase decisions.

## 3. User flow

1. User enters a store name or selects from a known merchant list
2. User enters purchase amount
3. User selects payment date (defaults to today)
4. App fetches valid payment methods accepted by that merchant
5. App filters and ranks reward rules for those methods
6. App displays ranked results with estimated cashback

Example:
- Store: FamilyMart
- Amount: 500 TWD
- Date: 2026-08-29
- Result: LINE Pay 3%, VISA 2%, Mastercard 1%

## 4. Data model

### Merchant
- id
- name
- chain_name
- category
- location
- notes

### PaymentMethod
- id
- name
- type (credit_card, debit_card, mobile_payment)

### MerchantPaymentAcceptance
- id
- merchant_id
- payment_method_id

### RewardRule
- id
- merchant_id
- payment_method_id
- cashback_rate
- amount_threshold
- validity_start
- validity_end
- promotion_note

## 5. Recommendation logic

Input:
- merchant_name
- amount
- payment_date

Algorithm:
1. Find merchant by exact or normalized name
2. Load all payment methods accepted by that merchant
3. Filter reward rules valid on the payment date
4. Remove rules below amount threshold
5. Compute estimated cashback = amount * cashback_rate
6. Sort by cashback_rate descending
7. Return top recommendations

## 6. Example rule

- Merchant: Starbucks
- Payment method: AMEX Gold
- cashback_rate: 0.04
- amount_threshold: 0
- validity_start: 2026-08-01
- validity_end: 2026-08-31
- promotion_note: "4% on coffee purchases"

If amount is 1000 TWD, estimated cashback = 40 TWD.

## 7. Data maintenance

Merchant acceptance and reward rules are maintained by admin, not by end users.

MVP approach:
- Admin panel manages merchant records
- Admin panel manages accepted payment methods per merchant
- Admin panel manages reward rules and promos

This keeps the MVP simple while allowing future integrations with bank or payment-provider feeds.

## 8. MVP scope

### In scope
- Store-based lookup
- Amount-based reward calculation
- Date-based promotion filtering
- Ranked best-payment list
- Admin CRUD for merchant/payment/reward data
- Taiwan-only scope
- Anonymous user flow

### Out of scope
- User accounts
- Transaction history
- Expense tracking
- Personalized recommendation engine
- Payment processing
- Cross-country support

## 9. Tech stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Validation: Zod
- Testing: Jest + Supertest + React Testing Library

## 10. API contract

### GET /api/recommendations
Query params:
- merchant_name
- amount
- date

Sample response:
```json
{
  "success": true,
  "data": [
    {
      "paymentMethod": "AMEX Gold",
      "cashbackRate": 0.04,
      "estimatedCashback": 40,
      "promotionNote": "4% on coffee purchases"
    }
  ]
}
```

## 11. Admin requirements

Admin can manage:
- merchant list
- payment methods
- merchant acceptance mapping
- reward rules and expiration dates

## 12. Success metrics

- User can get a top recommendation in under 10 seconds
- Recommendations are based on actual store + promo data
- Admin can update rules without code changes
- App works on mobile and desktop

## 13. Risks

- Incomplete merchant data reduces recommendation quality
- Reward data changes frequently and must be maintained
- Store names may vary by branch or alias, requiring normalization

## 14. Next step

Proceed to implementation planning for the store-focused MVP.
