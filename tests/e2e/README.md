# E2E tests

Runs against the local dev server (`npm run dev`, localhost:5173) using a real Supabase-backed login — there's no mock backend.

## Which Supabase project

Phase 7 (Controlled Beta Infrastructure Gate 3) — E2E now runs against a
**dedicated, genuinely separate non-production Supabase project**
(`compass-e2e-test`), never the live production database. This is
mandatory, not a nice-to-have: once a real external beta org has data in
production, E2E creating/mutating/deleting rows there would be a genuine
customer-data risk, and the shared production test org had already
accumulated 2,700+ real cases from years of unattended test runs (see the
now-resolved "Known issue" below).

`src/supabase.js` and every server-side `api/**/_supabase.js` read
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (client) or `SUPABASE_URL`
(server), falling back to production only if unset — so a `.env` that
doesn't set these still points at production by accident. Set them
explicitly for E2E:
```
VITE_SUPABASE_URL=https://zdbbvljbndmujywtkwfy.supabase.co
VITE_SUPABASE_ANON_KEY=<the compass-e2e-test project's anon key>
```
Never point these at the production project (`npeegfsoijhdnnvuqjin`) for
a test run, and never copy real employee/production data into
`compass-e2e-test` — it should only ever contain synthetic data created
by test runs themselves.

## One-time setup

1. A throwaway test org + two test accounts already exist on
   `compass-e2e-test` (see "Second tenant" below for the second one) —
   this repo does not commit real credentials, so get the actual values
   from whoever set them up rather than re-signing-up unless you're
   deliberately replacing them.
2. Add to a local `.env` file (not committed):
   ```
   VITE_SUPABASE_URL=https://zdbbvljbndmujywtkwfy.supabase.co
   VITE_SUPABASE_ANON_KEY=<the compass-e2e-test project's anon key>
   E2E_TEST_EMAIL=your-test-account@example.com
   E2E_TEST_PASSWORD=your-test-account-password
   ```
3. `npx playwright install chromium` (one-time browser download, already done if you're reading this after the initial setup).

### Second tenant (for tests/e2e/tenant-isolation.spec.js)

Every other spec in this suite runs against ONE account/org, which can prove features work but can never prove tenant isolation — there's nothing else to leak into. `tenant-isolation.spec.js` needs a genuinely separate account, with real membership in org(s) that share zero overlap with the primary `E2E_TEST_EMAIL` account above, to prove a case created in one tenant is actually invisible to the other.

Conceptually, the second account needs to be:
- A **synthetic test identity** — never a real employee/customer account (see the standing rule at the top of every migration in this project: throwaway test data only, real customer data is never used for testing).
- A member of at least one org with **zero membership overlap** with the primary `E2E_TEST_EMAIL` account's own org(s) — this is what actually proves isolation; two accounts that happen to share even one org membership can't distinguish "correctly isolated" from "coincidentally not tested."
- **Multi-org** — a member of (at least) two of its own orgs, distinct from each other and from the primary account's org. This lets the same account double as the org-switcher fixture (confirms switching between two real memberships works, and settles correctly under rapid switching) without provisioning a third identity just for that.
- Any real role works (the spec doesn't test role-based permissions, only tenant boundaries) — HR-director is simplest since it's what a brand-new org's creator is assigned automatically.

Add both as **GitHub repository secrets** (`E2E_TEST_EMAIL_2`, `E2E_TEST_PASSWORD_2`) for CI, and to your local `.env` for local runs:
```
E2E_TEST_EMAIL_2=your-second-test-account@example.com
E2E_TEST_PASSWORD_2=your-second-test-account-password
```
If these are missing: CI hard-fails with a clear message (`requireSecondTenantOrFail` in `helpers.js`) rather than silently skipping — a missing secret must never read as a passing tenant-isolation check. A local run without them configured gets a soft skip instead, since that's a legitimate, common case for a contributor not working on this spec.

**Resolved (2026-08-27, Phase 7 Gate 3):** the "Known issue" that used to be documented here — the shared second-tenant org's localStorage quota being exceeded by 2,700+ accumulated real cases — no longer applies now that E2E runs against a fresh, dedicated `compass-e2e-test` project rather than the same production database every other spec (and years of prior unattended runs) also used. Keep an eye on volume growing again over time on the new project too; `deleteCaseByEmployeeName` cleanup in `helpers.js` still matters, this fix is a reset, not a structural guarantee against it recurring.

## Running

```
npm run test:e2e
```

## Coverage

- `login.spec.js` — sign in, land on Home.
- `case-golden-path.spec.js` — create a case, confirm it lists. Scoped to the structural path only, not the full meeting-transcript-to-AI-letter flow — that makes a real, non-deterministic Claude API call, which isn't a good fit for a deterministic E2E assertion.
- `dsar.spec.js` — logs a DSAR request with a fixed historical received date and asserts the displayed due date is exactly one calendar month later. This is the specific bug caught manually earlier in development (a UTC/local timezone mismatch made due dates land a day early).
- `tribunal-risk.spec.js` — enters a weekly pay figure on a case and asserts the indicative exposure estimate renders with its "not legal advice" disclaimer.
- `tenant-isolation.spec.js` — the one spec that proves cross-tenant data doesn't leak: a case created in one org is invisible to a genuinely different one, the org switcher lists exactly the right memberships, and org-scoped localStorage caching doesn't bleed between tenants. Needs the second tenant above; see its own section for why and what CI does when it's missing.
