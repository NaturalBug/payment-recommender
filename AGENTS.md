# Repository Guidelines

## Project Structure & Module Organization

- `api/src/` contains the Express application: routes in `routes/`, business logic in `services/`, database access in `repositories/`, and shared helpers in `lib/` and `middleware/`.
- `api/prisma/` holds the Prisma schema and seed script. SQLite databases are local artifacts and must not be committed.
- `api/src/tests/` contains Jest integration and service tests.
- `web/` is the dependency-free browser UI (`index.html`, `app.js`, `styles.css`) plus the admin page (`admin.html`, `admin.js`).
- `docs/superpowers/` stores design specifications and implementation plans.

## Build, Test, and Development Commands

Install workspace dependencies with `npm install --workspaces` (or `npm ci --workspaces` for a clean, lockfile-based install).

- `npm run api:dev` starts the API with automatic TypeScript reloads on port 4000.
- `npm run web:dev` serves `web/` on port 4173.
- `npm run test:api` runs the API Jest suite.
- `npm run build --workspace api` type-checks and emits the API build.
- From `api/`, run `npm run db:generate`, `npm run db:push`, and `npm run db:seed` after configuring `.env` to initialize local data.

## Coding Style & Naming Conventions

Use TypeScript for API changes and follow the existing style: two-space indentation, single quotes, semicolons, trailing commas where appropriate, and named exports for domain functions. Use camelCase for variables/functions, PascalCase for types, and lowercase descriptive filenames such as `rewardRuleRepository.ts`. Keep HTTP handlers thin; place recommendation rules in services and persistence operations in repositories. The frontend uses plain JavaScript and CSS—preserve its existing DOM-oriented structure and two-space indentation. No formatter or linter is currently configured.

## Testing Guidelines

Write Jest tests beside the API test suite as `api/src/tests/<feature>.test.ts`. Name tests as behavior statements, for example `test('returns empty array for unknown merchant', ...)`. Tests use an isolated SQLite database (`api/prisma/test.db`) configured by `testSetup`; never depend on `dev.db`. Run `npm run test:api` before opening a PR, and run `node --check web/app.js && node --check web/admin.js` after frontend edits.

## Commit & Pull Request Guidelines

Follow the established Conventional Commit pattern: `feat(api): protect admin endpoints`, `fix(web): improve admin catalog form layout`, or `chore(deps): update dependencies`. Keep commits focused. PRs should describe the user-visible change, link the relevant issue when available, list verification commands, and include screenshots for UI changes. Do not commit `.env`, API keys, or Prisma database files.
