# SQLite Persistence Design

**Date:** 2026-08-31  
**Scope:** Payment recommendation MVP  
**Status:** Approved for design documentation

## 1. Goal

Replace the current in-memory merchant and reward-rule store with SQLite persistence while keeping the application ready to migrate to PostgreSQL or another relational database later.

After this change, merchants and reward rules created through the admin API must survive API restarts. Existing recommendation and admin API contracts should remain compatible.

## 2. Design principles

- Use Prisma as the database access layer.
- Keep recommendation logic independent from Prisma-specific query code.
- Keep the SQLite connection configured through `DATABASE_URL`.
- Use relational models and portable field types rather than SQLite-specific SQL.
- Preserve the existing anonymous user flow and admin API shape.
- Do not add authentication or an admin UI in this phase.

## 3. Architecture

The API will use four layers:

1. **Routes** parse HTTP requests and return the existing JSON response shapes.
2. **Services** validate business rules and calculate recommendations.
3. **Repositories** provide merchant, payment-method, acceptance, and reward-rule operations.
4. **Prisma client** persists data in SQLite.

The recommendation service will receive repository data or repository operations through a small interface. It must not import Prisma directly. Admin routes will use the same repository boundary for reads and writes.

This boundary allows the database provider to change later without rewriting route or recommendation behavior.

## 4. Data model

### Merchant

- `id`: integer primary key
- `name`: unique merchant name
- `chainName`: optional chain name
- `category`: optional descriptive category
- `location`: optional location
- `notes`: optional notes

### PaymentMethod

- `id`: integer primary key
- `name`: unique display name
- `type`: credit card, debit card, or mobile payment

### MerchantPaymentAcceptance

- `id`: integer primary key
- `merchantId`: foreign key to Merchant
- `paymentMethodId`: foreign key to PaymentMethod
- unique constraint on `(merchantId, paymentMethodId)`

### RewardRule

- `id`: integer primary key
- `merchantId`: foreign key to Merchant
- `paymentMethodId`: foreign key to PaymentMethod
- `cashbackRate`: decimal-compatible numeric value
- `amountThreshold`: integer amount in TWD
- `validityStart`: date/time
- `validityEnd`: date/time
- `promotionNote`: optional text

Reward rules must reference existing merchants and payment methods. Merchant deletion behavior will be restrictive in this phase so rules are not silently lost.

## 5. Seed and migration behavior

The Prisma schema and migration create the database structure. A seed script inserts the current sample merchants, payment methods, acceptance mappings, and reward rules.

Seeding must be idempotent:

- Running the seed repeatedly must not create duplicate merchants or payment methods.
- Existing records must not be overwritten in a way that removes admin changes.
- Reward rules use stable seed identifiers or deterministic matching for safe re-runs.

The API must not reset the database on startup. Existing records remain available after a restart.

## 6. API compatibility

Existing endpoints remain available:

- `GET /api/recommendations`
- `GET /api/admin/merchants`
- `POST /api/admin/merchants`
- `GET /api/admin/reward-rules`
- `POST /api/admin/reward-rules`
- `DELETE /api/admin/reward-rules/:id`

The response shapes remain unchanged unless a database identifier is needed for an existing admin operation. Validation errors continue to use HTTP 400, missing reward rules use HTTP 404, and unexpected database failures use HTTP 500 with an explicit error response.

The recommendation endpoint continues to:

1. Normalize and match the merchant name.
2. Select accepted payment methods for that merchant.
3. Filter reward rules by date and amount threshold.
4. Calculate estimated cashback.
5. Sort results by cashback rate descending.

If a merchant has no matching reward rules, the endpoint returns an empty data array as it does today.

## 7. Configuration

Add an environment example documenting:

```text
DATABASE_URL="file:./prisma/dev.db"
PORT=4000
```

The SQLite database file is local development data and should be ignored by git. Production deployment should provide a different `DATABASE_URL`; switching to PostgreSQL later will require changing the Prisma provider, applying a compatible migration, and migrating data.

## 8. Error handling

- Repository/database errors are propagated to the route-level error boundary.
- Invalid request payloads return clear 400 responses.
- Foreign-key and uniqueness conflicts are translated into explicit client errors.
- No broad catches or silent fallback to in-memory data are allowed.
- The API must fail visibly if the database cannot be initialized or queried.

## 9. Testing strategy

Keep the current recommendation behavior tests and admin route tests.

Add:

- Prisma repository tests for merchant and reward-rule CRUD.
- API tests that create a merchant/rule, read it back, and verify it affects recommendations.
- Seed idempotency coverage.
- A persistence test that writes data, reloads the repository/client, and confirms the data remains.
- Validation tests for invalid numeric values, invalid dates, unknown payment methods, and duplicate acceptance mappings.

Tests should use an isolated SQLite database or test database configuration and must not modify the development database.

## 10. Scope and future migration

In scope:

- Prisma schema and SQLite migration
- Seed data
- Repository abstraction
- Database-backed recommendation and admin APIs
- Environment configuration
- Persistence and integration tests

Out of scope:

- PostgreSQL deployment
- Authentication and authorization
- Admin UI
- External bank or payment-provider feeds
- Multi-user concurrency guarantees beyond SQLite's normal behavior

The repository interface and portable schema are the migration points for a future PostgreSQL deployment. The application-facing routes and recommendation algorithm should not need to change when the provider changes.

## 11. Acceptance criteria

- A fresh setup can create the SQLite database and seed sample data.
- The existing recommendation examples return the same ranking and cashback values.
- Admin-created merchants and rules remain after restarting the API.
- Re-running seed does not duplicate or erase managed data.
- API and repository tests pass without using PostgreSQL.
- The working tree contains no SQLite database files or secrets.
