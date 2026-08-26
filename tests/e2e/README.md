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

**Known issue (2026-08-26):** the `org data is namespaced in localStorage...` test in this spec currently fails against the live shared second-tenant org — not a flake, confirmed via direct investigation. That org has accumulated 2,700+ real cases from years of every spec in this suite running against it without cleanup (this spec's own two canary-creating tests now clean up after themselves, see `deleteCaseByEmployeeName` in `helpers.js`, but that doesn't retroactively shrink the existing pile), which genuinely exceeds the browser's localStorage quota — `src/lib/storage.js`'s `lsSet` now logs this instead of silently swallowing it, but the underlying write still fails. Fixing the test requires a decision about bulk-cleaning or replacing the shared fixture org, which affects every other spec that also uses it — see the test's own comment for detail.

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
