# Task 2 Report: Add repository layer and Prisma client

## Outcome

Implemented the Prisma singleton and repository layer in the isolated
`sqlite-persistence` worktree.

## Changes

- Added `api/src/lib/prisma.ts` with a shared `PrismaClient` instance.
- Added repository record types for merchants and reward rules.
- Added merchant list/create operations with stable name ordering.
- Added reward-rule list/create/delete operations.
- Included the related payment-method name in every reward-rule record through
  the Prisma relation, so service code does not need a hard-coded ID mapping.
- Converted Prisma `Decimal` cashback rates to JavaScript numbers at the
  repository boundary.
- Updated repository integration tests to clean their database state and
  create the referenced `PaymentMethod` row before creating a reward rule.

## Validation

The SQLite test database was synchronized with the committed Task 1 schema,
then these commands passed:

- `npm test -- --runInBand src/tests/repository.test.ts`: 2 tests passed.
- `npm test -- --runInBand`: 3 suites and 9 tests passed.
- `npm run build`: passed.

Commands were run from `api/` with `DATABASE_URL` set to the isolated
worktree's `api/prisma/test.db`.

## Scope note

Routes and service code still use the existing in-memory catalog by design;
this task only establishes the persistence boundary for the next migration
task.
