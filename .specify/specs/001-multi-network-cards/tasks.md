# Tasks: Multi-Network Cards

Execution contract (Superpowers TDD: red, green, refactor; commit per task group).

- [x] T1 Migration: test then implement `api/prisma/migrateCardNetworks.ts` (legacy `Card.networkId` -> `CardNetwork`, rebuild `Card`), wire into `db:push`, README note. (FR-007)
- [x] T2 Schema: add `CardNetwork`, drop `Card.networkId`, update seed if it creates cards. (FR-001)
- [x] T3 Repository + routes: `networkIds` create/list/validation (min 1, unique, credit_card), update tests. (FR-001, FR-002, FR-006)
- [x] T4 Recommendation: expand per accepted network, per-network issuer allowlist, card-wide exclusion, network-specific promotions; tests for US1/US2. (FR-003..FR-005)
- [x] T5 Admin UI: multi-network card form + table, `node --check`. (FR-006)
- [ ] T6 Full verification, code review, PR.
