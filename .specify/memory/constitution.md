<!--
Sync Impact Report
Version change: unversioned scaffold -> 1.0.0
Modified principles: None; the scaffold placeholders were replaced with five initial principles.
Added sections: Engineering Constraints; Delivery Workflow.
Removed sections: None.
Follow-up TODOs: TODO(RATIFICATION_DATE): Original adoption date is unknown.
-->
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

### IV. Superpowers Delivery Sequence
Implementation of any task list MUST follow this sequence: isolated worktree, test-driven
development using red-green-refactor, subagent-driven execution where tasks are independent, code
review, then the finish-branch workflow. A later stage MUST NOT be skipped; a stage that does not
apply MUST be explicitly documented in the task or review record. This makes delivery repeatable
and independently verified.

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

Every implementation task MUST identify its affected API, persistence, and UI boundaries before
editing. Work MUST be performed in an isolated worktree before code changes begin. Tests MUST be
written and observed failing before the implementation is introduced; targeted tests, API build,
and JavaScript syntax checks MUST pass before review. Independent work items MAY use subagents,
but their outputs MUST be integrated and reviewed by the primary implementer. Code review MUST
precede the finish-branch workflow and review findings MUST be addressed or explicitly accepted.

## Governance

This constitution supersedes conflicting development practices. Amendments MUST be documented in
this file with an updated Sync Impact Report, reviewed for consistency with repository guidance,
and assigned a semantic version: MAJOR for incompatible principle removals or redefinitions, MINOR
for new or materially expanded governance, and PATCH for clarifications. Each implementation plan,
task list, pull request, and code review MUST verify compliance with the applicable principles.
Exceptions require a written rationale, scope, and expiration in the relevant task or pull request.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): Original adoption date is unknown |
**Last Amended**: 2026-11-01
