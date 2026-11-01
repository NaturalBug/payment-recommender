# Payment Recommendation MVP Constitution

## Core Principles

### I. Correct Recommendations
Recommendations MUST be based on explicit merchant, payment-method, amount, date, and promotion
data. Rules MUST preserve catalog acceptance invariants and must not infer locations or eligibility
from names. This protects customers from receiving an inapplicable payment recommendation.

### II. Layered, Typed API Design
API changes MUST use TypeScript and keep routes thin, business rules in services, and persistence
in repositories. Public and administrative behavior MUST validate inputs and return explicit errors.
This keeps recommendation logic testable and database-provider-independent.

### III. Test-First Changes
Behavior changes MUST begin with a focused failing test, followed by the smallest implementation
that passes it, then refactoring while tests remain green. API tests MUST use the isolated test
database and MUST NOT depend on local development data. This prevents regressions in business
rules and persistence.

### IV. Scaled Spec Kit and Superpowers Delivery
Changes estimated below 30 minutes and touching fewer than three files MAY proceed directly.
Single-concern work estimated at 30 minutes to two hours MUST use the applicable Superpowers
workflow. Multi-component, user-facing, audited, or longer work MUST use Spec Kit to produce
reviewed specifications, plans, and tasks, then use Superpowers for worktree isolation,
red-green-refactor, independent subagent execution, code review, and branch completion. Once a
reviewed `.specify/specs/<feature-id>/tasks.md` exists, it is the execution contract and MUST NOT
be re-planned. Spec Kit's `/speckit-implement` MUST NOT be combined with Superpowers for the same
feature. This applies rigor in proportion to risk while preserving a single source of execution.

### V. Secure, Explicit Operations
Administrative endpoints MUST require authentication and preserve their authorization behavior.
Secrets, environment files, and SQLite database artifacts MUST NOT be committed. Failures in
imports, persistence, and external sources MUST be surfaced explicitly rather than silently
defaulted. This protects administrative control and maintains trustworthy operational state.

## Engineering Constraints

The backend MUST use Express, TypeScript, Prisma, and the configured database provider. The
browser UI MUST remain dependency-free unless an approved task explicitly changes this constraint.
Repository and service interfaces MUST avoid provider-specific SQL to preserve the documented
PostgreSQL migration path. Frontend and API contracts MUST use catalog identifiers rather than
display names for selected entities.

## Delivery Workflow

For work requiring the full process, Spec Kit owns constitution, specification, planning, and task
generation; Superpowers owns implementation, review, and branch completion. Implementation tasks
MUST identify affected API, persistence, and UI boundaries before editing. Tests MUST be written
and observed failing before behavior changes are implemented; targeted tests, API build, and
JavaScript syntax checks MUST pass before review. Independent work items MAY use subagents, but
their outputs MUST be integrated and reviewed by the primary implementer. Code review MUST
precede branch completion and findings MUST be addressed or explicitly accepted.

## Governance

This constitution supersedes conflicting development practices. Amendments MUST be documented in
this file with an updated Sync Impact Report, reviewed for consistency with repository guidance,
and assigned a semantic version: MAJOR for incompatible principle removals or redefinitions, MINOR
for new or materially expanded governance, and PATCH for clarifications. Each implementation plan,
task list, pull request, and code review MUST verify compliance with the applicable principles.
Exceptions require a written rationale, scope, and expiration in the relevant task or pull request.

**Version**: 1.1.0 | **Ratified**: 2026-11-01 |
**Last Amended**: 2026-11-01
