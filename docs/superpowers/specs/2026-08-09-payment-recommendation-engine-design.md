# Payment Recommendation Engine - MVP Design Document

**Date:** August 9, 2026  
**Scope:** MVP for Taiwan market  
**Status:** Design Approved

---

## 1. Overview

A web application that helps users select the optimal payment method (credit card, debit card, mobile payment) based on transaction context (merchant type, spending category, amount) to maximize cashback rewards.

**Core Value Proposition:** Users answer 4 quick questions about their transaction and instantly see ranked payment methods with highest cashback rates, helping them save money on every purchase.

**Geographic Scope:** Taiwan (initial MVP)  
**Future Opportunities:** User accounts for transaction tracking, referral partnerships with banks/payment providers for commissions

---

## 2. User Flow

### Primary User Journey: Anonymous Q&A Recommendation

```
1. User arrives at web app
   ↓
2. Answer 4 questions:
   - Where are you paying? (Merchant Type)
   - How much? (Amount in TWD)
   - What category? (Spending Category)
   - When? (Date)
   ↓
3. Backend filters & ranks payment methods
   ↓
4. See ranked recommendation list with rates & promotions
   ↓
5. User takes action (use recommended payment method)
```

### Questions & Options

**Q1: Where are you paying?**
- Dropdown with merchant types
- Examples: Convenience Store, Restaurant, Department Store, Gas Station, Online, Supermarket, Pharmacy, etc.
- Purpose: Filter to accepted payment methods

**Q2: How much are you spending?**
- Number input (default currency: TWD)
- Validation: Positive numbers only
- Purpose: Calculate potential reward amount

**Q3: What category of spending?**
- Dropdown with spending categories
- Examples: Groceries, Dining, Entertainment, Travel, Shopping, Utilities, Gas, Other
- Purpose: Look up category-specific cashback rates

**Q4: When?**
- Date picker (defaults to today)
- Purpose: Check for time-limited promotions

---

## 3. Recommendation Logic

### Algorithm

```
Input: merchant_type, amount, category, date

Step 1: Filter
  - Get all payment methods that accept this merchant_type
  
Step 2: Look Up Rates
  - Query CardRewards table for (payment_method, category, date)
  - Include only rates where date falls within validity_start and validity_end
  
Step 3: Calculate Potential Rewards
  - potential_reward = amount × cashback_rate
  
Step 4: Rank
  - Sort by cashback_rate (descending)
  - Display top 3 recommendations
  
Step 5: Format Output
  - Show: Payment method name, cashback rate, promotion note (if applicable)
  - Example: "AMEX Gold: 4% cashback (Aug promotion: 5%)"
```

### Display

- **Top 3 results** ranked by cashback rate
- Each shows: payment method name, rate percentage, estimated reward amount, promo notes
- Clear call-to-action: Use this payment method

---

## 4. Data Model

### Core Tables

**PaymentMethods**
- id (PK)
- name (string): AMEX, VISA, Mastercard, JCO Pay, LINE Pay, etc.
- type (enum): credit_card, debit_card, mobile_payment

**MerchantTypes**
- id (PK)
- name (string): Convenience Store, Restaurant, Department Store, Gas Station, Online, Supermarket, Pharmacy, etc.

**MerchantTypePaymentAcceptance**
- merchant_type_id (FK)
- payment_method_id (FK)
- Maintains: Which payment methods are accepted at each merchant type

**SpendingCategories**
- id (PK)
- name (string): Groceries, Dining, Entertainment, Travel, Shopping, Utilities, Gas, Other

**CardRewards**
- id (PK)
- payment_method_id (FK): AMEX, VISA, etc.
- spending_category_id (FK): Dining, Groceries, etc.
- cashback_rate (decimal): 0.04 (4%), 0.05 (5%), etc.
- validity_start (date): When promotion begins
- validity_end (date): When promotion ends
- promotion_note (string): "Summer Bonus: 5% on Dining (Aug 2026)"
- created_at (timestamp)
- updated_at (timestamp)

**Notes:**
- No user accounts in MVP
- No transaction history (stored)
- All data is static reference data maintained by admin

---

## 5. Tech Stack

### Frontend
- **Framework:** React + TypeScript
- **Styling:** Tailwind CSS or similar
- **Build:** Vite or Create React App
- **State Management:** Simple React Context or Redux (minimal)

### Backend
- **Runtime:** Node.js
- **Framework:** Express + TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma or TypeORM
- **Validation:** Zod or Joi

### Admin Panel
- Same tech stack (React + Express backend)
- CRUD interface for managing: Payment methods, Merchant types, Card rewards rules

### Deployment (MVP)
- **Frontend:** Vercel (free tier)
- **Backend:** Railway, Heroku, or DigitalOcean
- **Database:** PostgreSQL cloud service (Railway, Render, AWS RDS)

---

## 6. API Endpoints

### Public (User-Facing)

**GET /api/recommendations**
- Query Parameters: merchant_type, amount, category, date
- Response: Ranked list of payment methods with rates and estimated rewards

**GET /api/merchant-types**
- Returns list of available merchant types (for dropdown)

**GET /api/categories**
- Returns list of available spending categories (for dropdown)

### Admin

**POST/GET/PUT/DELETE /api/admin/card-rewards**
- CRUD operations for reward rules

Similar endpoints for PaymentMethods, MerchantTypes, MerchantTypePaymentAcceptance

---

## 7. Error Handling

| Scenario | Handling |
|----------|----------|
| No payment methods found for merchant type | Show: "We don't have rewards data for this merchant yet. Check back soon!" |
| Invalid inputs | Client-side validation + 400 Bad Request |
| Expired promotions | Automatically filtered out |
| Multiple promotions for same card | Show highest applicable rate with note |
| Database error | 500 Internal Server Error |

---

## 8. Initial Data Seeding

For MVP launch, seed with:
- 10-15 major payment methods (AMEX, VISA, Mastercard, JCO Pay, LINE Pay, Apple Pay, Google Pay, etc.)
- 8-10 merchant types
- 8 spending categories
- Sample rewards data for top combinations (realistic Taiwan rates: 1-5% cashback)

---

## 9. MVP Success Criteria

- User can complete Q&A flow in <30 seconds
- Recommendation list loads in <1 second
- At least 3 different payment methods recommended per query
- Admin can CRUD reward rules without code changes
- No user authentication required
- Mobile-responsive design

---

## 10. Future Phases (Post-MVP)

### Phase 2: User Accounts & Analytics
- Optional login to save favorite payment methods
- Track recommendation trends

### Phase 3: Referral Program & Bank Partnerships
- Referral links to banks/payment providers
- Commission on sign-ups
- Banks can update reward data via API feed

### Phase 4: Expense Tracking
- Integrate transaction history
- Show actual rewards earned vs. potential
- Budgeting insights

### Phase 5: ML Personalization
- Learn user preferences
- Proactive recommendations

---

## 11. Constraints & Assumptions

**Constraints:**
- MVP limited to Taiwan market
- Rewards data manually maintained (no real-time bank APIs initially)
- No user accounts = anonymous queries only
- No payment processing (only recommendations)

**Assumptions:**
- Users have smartphones/computers to access web app
- Users have at least one payment method
- Cashback rates are accurate at time of data entry

---

## 12. Security & Compliance

- No sensitive payment data stored (no card numbers, CVVs)
- HTTPS for all communications
- Input validation on all endpoints
- Rate limiting on recommendation API to prevent abuse
- Taiwan payment regulations: Compliance review when partnering with financial institutions

---

## 13. Testing Strategy

### Unit Tests
- Recommendation algorithm
- Input validation logic

### Integration Tests
- Q&A flow → API call → ranking logic
- Admin CRUD operations

### Manual Testing
- Happy path: Full user Q&A → recommendation display
- Edge cases: No data available, expired promos, multiple promos
- Mobile responsiveness

---

## 14. Deployment Checklist

- Database created & seeded with sample data
- Backend API deployed & tested
- Frontend deployed & connected to backend
- Admin panel live and functional
- DNS configured (if custom domain)
- Monitoring/logging set up
- Error tracking (Sentry or similar)
