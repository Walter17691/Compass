// ─────────────────────────────────────────────────────────────────────────
// WHO MAY ADMINISTER A SUBJECT ACCESS REQUEST.
//
// Compass is employer-facing. Employees do not log in to submit DSARs —
// requests arrive externally and are registered by an authorised internal user
// (supabase/dsar_2026-07-24.sql states this intent: "No employee-portal
// exposure in v1 — this is purely an HR workflow tool, not something the data
// subject interacts with directly").
//
// The product decision: every DSAR capability is reserved to hr_director —
// reaching the workspace, registering and managing requests, collecting subject
// data, reviewing/redacting/withholding, generating and downloading the
// response package, and recording completion. No other HR role receives them
// merely because is_hr_role() is true.
//
// ┌─ WHY THIS IS NARROWER THAN isHR, AND WHY THAT IS THE POINT ─────────────┐
// │ Every DSAR surface was gated on `isHR`, which admits hr_manager AND     │
// │ hr_director. One predicate, one role, used by every layer, so the UI,   │
// │ the API route and the RLS policy cannot drift from each other:          │
// │                                                                         │
// │   UI   — the nav entry, the screen, and the data loader                 │
// │   API  — api/portal/_dsar-lookup.js                                     │
// │   DB   — supabase/dsar_director_only_authority_2026-10-09.sql           │
// │                                                                         │
// │ The database policy is the backstop. It is what makes the other two     │
// │ unbypassable, including for a raw PostgREST request carrying a valid    │
// │ hr_manager token.                                                        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHAT THIS MUST NOT TOUCH. `is_hr_role()` is load-bearing almost everywhere —
// measured on production, 36 RLS policies across 18 tables reference it and 16
// further functions call it. DSAR administration is narrowed by changing the
// ONE dsar_requests predicate, never by narrowing that function. Ordinary case
// access and investigation permissions are unchanged: an hr_manager keeps every
// case capability they have today and loses only DSAR administration.
//
// Deliberately a separate module from exportAuthority.js. The two happen to
// resolve to the same role today, and merging them would imply that is a fact
// about the product rather than a coincidence of two independent decisions.
// ─────────────────────────────────────────────────────────────────────────

/** The single role permitted to administer subject access requests. */
export const DSAR_ADMIN_ROLE = 'hr_director';

/**
 * May this member administer subject access requests?
 *
 * Pure and total: anything that is not exactly the authorised role is refused,
 * including undefined, null, '' and any future role added to ROLES.
 */
export function mayAdministerDsar({ role = null } = {}) {
  return role === DSAR_ADMIN_ROLE;
}

/** The refusal a blocked user should see. Names the role, so it tells them who to ask. */
export const DSAR_ADMIN_REFUSAL =
  'Only an HR Director can work on subject access requests.';
