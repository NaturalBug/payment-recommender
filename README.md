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
npx ts-node api/src/server.ts
```

Then open:

```bash
python3 -m http.server 4173 --directory web
```

The UI calls `http://localhost:4000/api/recommendations` when the API is running.
