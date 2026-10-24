# Payment Recommendation MVP

Store-focused payment recommendation app prototype.

This repo contains a merchant-based MVP that recommends the best payment method for a store, amount, and date.

## Structure
- `api/` — backend recommendation logic and TypeScript service
- `web/` — browser UI demo

## Local run

```bash
export PATH="/tmp/node-v20.17.0-linux-x64/bin:$PATH"
npm install --workspaces
npm run api:dev
```

Then in a second terminal:

```bash
python3 -m http.server 4173 --bind 0.0.0.0 --directory web
```

The UI calls `http://localhost:4000/api/recommendations` when the API is running.

Check API and database availability with:

```bash
curl http://localhost:4000/health
```

The endpoint returns HTTP `200` with `{"status":"ok","database":"ok"}` when both
the API and database are available. It returns HTTP `503` when the database
connection check fails.

## Database setup

The API uses Prisma with SQLite for local development. Create the local environment file and initialize the database before starting the API:

```bash
cd api
cp .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
```

Use `DATABASE_URL="file:./prisma/dev.db"` for local SQLite development. Keep
the database file in `api/prisma/` and do not commit it; it is already ignored
by git. Back up local SQLite data before applying schema updates, then update
the schema in place:

```bash
npx prisma db push
npm run db:seed
```

Set `ADMIN_API_KEY` in `api/.env` before using the Admin Catalog page. The key
must be sent in the `X-Admin-API-Key` header for every `/api/admin/*` request.
The Admin Catalog page asks for this key and keeps it only in the current page;
you must enter it again after reloading the page. Click **Connect** after
entering the key; the catalog and management forms remain disabled until the
key is verified successfully.

## Promotion import beta

The first manual-import beta supports exactly these official public sources:

- `line-pay`
- `jko-pay`
- `ipass-money`

The JKO Pay importer reads the localized official campaign listing directly and
keeps only official campaign or event links. The iPASS MONEY importer reads
promotion cards from its public listing and accepts only official promotion
detail links. Both sources still produce drafts for manual review.

Initialize the local database with the existing setup commands before importing:

```bash
cd api
cp .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
```

Run one source at a time against that same local database:

```bash
cd api
npm run import:promotions -- --source line-pay
npm run import:promotions -- --source jko-pay
npm run import:promotions -- --source ipass-money
```

Each successful run creates an `ImportRun` record plus reviewable
`PromotionDraft` entries. Drafts do not affect `/api/recommendations` and do
not publish automatically. An approved draft creates a canonical `Promotion`
record, which can affect public recommendations.

Reward rules support both percentage cashback and fixed cash discounts. Admins
can manage shopping Outlets/Malls (physical venues) separately from Merchant
branches. A promotion may originate from one or more Merchants or one or more
shopping Outlets/Malls (`originMerchantIds` / `originOutletIds`, one type per
promotion); Merchant promotions may apply Merchant-wide or to selected
branches, while Outlet/Mall promotions apply at any listed Outlet and can
exclude Merchants or branches. Recommendations use selected catalog IDs, not names or inferred
locations. Review notes for exclusions or limited quantities are shown with
the result, alongside a link to the official promotion terms.

Import failures exit non-zero and are recorded on the related import run. Only
allowed official public pages are supported in this phase. Source availability,
page structure, and published terms can change over time, so a source that
worked previously may later fail or become unsupported if it requires access
that is no longer publicly permitted.

### Reviewing and publishing imported promotions

1. Start the API and web UI, then open `web/admin.html` in the browser flow
   described above and connect with `ADMIN_API_KEY`.
2. Use the **Imported promotions** section to inspect recent import runs and
   pending drafts, including the official source URL, captured source text, and
   parsed values.
3. Add any missing Merchant branches, shopping Outlets/Malls, or payment methods.
   Configure accepted payment methods for Merchants as needed; acceptance is
   checked when recommendations are generated.
4. Save the reviewed origin, eligibility, payment methods, included branches,
   exclusions, benefit, threshold, dates, and optional user-facing note.
5. Publish the draft to create a canonical `Promotion`, or reject it with a
   reason to keep it out of recommendations. Rejected drafts can be reopened
   for review; importing the same activity does not reopen them automatically.
6. On the public page, choose the Merchant branch and/or shopping Outlet/Mall
   explicitly to include matching location-specific promotions.

## Test isolation

Jest runs against a dedicated SQLite test database instead of the development database. The test bootstrap sets `DATABASE_URL` to `file:./prisma/test.db`, so local dev data and test runs stay isolated. To reset only the isolated test database if it becomes stale:

```bash
rm -f api/prisma/test.db
```

## Future PostgreSQL migration notes

The data access layer is intentionally provider-agnostic: Prisma, repository interfaces, and route/service logic do not embed SQLite-specific SQL. To switch to PostgreSQL later, update `api/prisma/schema.prisma` to use the `postgresql` provider, point `DATABASE_URL` to a PostgreSQL connection string, run `npx prisma generate` and apply the new migration or `npx prisma db push`, and keep the existing API contracts unchanged. The recommendation and admin behavior should not require application code changes beyond database configuration.

## Admin API

The backend now includes a lightweight admin catalog for merchants and reward rules.

- `GET /api/admin/merchants`
- `POST /api/admin/merchants` with `{ "merchantName": "MomoMart" }`
- `GET /api/admin/reward-rules`
- `POST /api/admin/reward-rules` with rule payload
- `DELETE /api/admin/reward-rules/:id`
- `GET /api/admin/promotions` (read-only list of published promotions)

All Admin API endpoints require `X-Admin-API-Key`. Requests without a key
return `401`; requests with an incorrect key return `403`.

### Catalog management

The public recommendation page loads merchants from `GET /api/merchants`
without an Admin API key. Administrators can use the protected catalog
endpoints to manage merchants, payment methods, and merchant acceptance
mappings:

- `GET`, `POST`, `PATCH`, and `DELETE` `/api/admin/merchants`
- `GET`, `POST`, `PATCH`, and `DELETE` `/api/admin/payment-methods` (`type` must exist in the type catalog)
- `GET`, `POST` `/api/admin/payment-method-types` and `DELETE` `/api/admin/payment-method-types/:id` (names are lowercase `a-z0-9_`; types in use cannot be deleted)
- `GET`, `PUT`, and `DELETE` `/api/admin/merchants/:merchantId/payment-methods/:paymentMethodId`

Configure a merchant in this order: create the merchant, create or choose a
payment method, add its acceptance mapping, then create its reward rule.
Reward-rule requests use the numeric payment-method ID returned by the payment
method catalog.
Merchant, payment-method, and acceptance deletion returns `409 Conflict` while
dependent acceptance mappings or reward rules exist.

## Continuous integration

GitHub Actions runs on pushes to the main development branches and pull
requests targeting `master`. The workflow installs dependencies, generates the
Prisma client, runs API tests, builds the API, and checks frontend JavaScript
syntax.

## WSL / Windows access notes

Inside WSL, the app is running correctly on:

- `http://127.0.0.1:4000/api/recommendations?merchant_name=FamilyMart&amount=500&date=2026-08-29`
- `http://127.0.0.1:4173`

If the Windows browser cannot reach the app via `localhost`, use the WSL virtual interface IP instead. Example:

```bash
hostname -I
```

Then open:

```text
http://<WSL_IP>:4173
http://<WSL_IP>:4000/api/recommendations?merchant_name=FamilyMart&amount=500&date=2026-08-29
```

For example, in this environment the interface IP is `172.24.14.183`, so the browser URL is:

```text
http://172.24.14.183:4173
```

If Windows still refuses the port, add a Windows portproxy rule:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=4173 connectaddress=172.24.14.183 connectport=4173
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=4000 connectaddress=172.24.14.183 connectport=4000
```
