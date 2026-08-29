# Payment Recommendation MVP

Store-focused payment recommendation app prototype.

This workspace contains:
- `api/` — backend recommendation logic and TypeScript route contract
- `web/` — browser-based prototype UI that works without Node tooling

This implementation is intentionally targeted at the merchant-based MVP described in the design: merchant + amount + date, not category-based logic.

Important: the runtime environment here does not include Node/npm, so dependency installation and full test execution could not be completed inside this session. The project scaffold and validation logic were written in a writable fallback workspace (`/tmp/payment-recommender`) to keep the implementation moving.

When Node is available, run:

```bash
npm install --workspaces
npm run web:dev
```

or open `web/index.html` directly in a browser.
