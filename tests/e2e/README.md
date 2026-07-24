# E2E tests

Runs against the local dev server (`npm run dev`, localhost:5173) using a real Supabase-backed login — there's no mock backend.

## One-time setup

1. Sign up a **new, separate org** at http://localhost:5173 (or the deployed URL) — any throwaway email works via the normal signup flow. Do not use the real Compass LTD account: every test run creates real case/DSAR data against whatever account signs in.
2. Add to a local `.env` file (not committed):
   ```
   E2E_TEST_EMAIL=your-test-account@example.com
   E2E_TEST_PASSWORD=your-test-account-password
   ```
3. `npx playwright install chromium` (one-time browser download, already done if you're reading this after the initial setup).

## Running

```
npm run test:e2e
```

## Coverage

- `login.spec.js` — sign in, land on Home.
- `case-golden-path.spec.js` — create a case, confirm it lists. Scoped to the structural path only, not the full meeting-transcript-to-AI-letter flow — that makes a real, non-deterministic Claude API call, which isn't a good fit for a deterministic E2E assertion.
- `dsar.spec.js` — logs a DSAR request with a fixed historical received date and asserts the displayed due date is exactly one calendar month later. This is the specific bug caught manually earlier in development (a UTC/local timezone mismatch made due dates land a day early).
- `tribunal-risk.spec.js` — enters a weekly pay figure on a case and asserts the indicative exposure estimate renders with its "not legal advice" disclaimer.
