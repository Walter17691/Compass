// Client-side mirror of the capability functions in
// supabase/role_expansion_2026-08-09.sql (is_hr_role/
// has_confidential_case_oversight) — kept in one place so UI gating
// (which nav items and Settings controls show) and the real RLS boundary
// agree on what each role can do, rather than drifting independently.
// The RLS policies are the actual enforcement; this only controls what
// the UI offers to click.
export const ROLES = [
  { id: "hr_manager", label: "HR Manager" },
  { id: "hr_director", label: "HR Director" },
  { id: "location_manager", label: "Location Manager" },
  { id: "line_manager", label: "Line Manager" },
  { id: "investigator", label: "Investigator" },
  { id: "legal_reviewer", label: "Legal/Compliance Reviewer" },
  { id: "auditor", label: "Auditor (read-only)" },
];

export const ROLE_LABELS = Object.fromEntries(ROLES.map(r => [r.id, r.label]));

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "Team member";
}

export function isHrRole(role) {
  return role === "hr_manager" || role === "hr_director";
}

// Roles with org-wide visibility into confidential cases, matching
// has_confidential_case_oversight() in the migration.
export function hasConfidentialOversight(role) {
  return role === "hr_director" || role === "legal_reviewer" || role === "auditor";
}

// Manager Enablement (Phase 4, MP1) — mirrors can_see_all_org_cases() in
// supabase/manager_enablement_case_access_2026-08-13.sql. Everyone else
// (location_manager, line_manager, any other role) only sees cases
// they've created, own, or hold a case_access role on — enforced by that
// migration's restrictive RLS policy, not by this function; this only
// lets the UI reason about the same boundary (e.g. deciding whether to
// show the full HR workspace or the simplified Manager Portal).
export function canSeeAllOrgCases(role) {
  return isHrRole(role) || hasConfidentialOversight(role);
}

// Phase 6.5 hardening — client-side mirror of can_access_case_location()
// in supabase/manager_enablement_case_access_2026-08-13.sql /
// role_expansion_2026-08-09.sql, added so api/cron/_digest.js (which runs
// on the service-role key and so has no RLS of its own to lean on) can
// replicate the real per-recipient visibility rule instead of a looser
// approximation. Only a location_manager with a real, non-empty assigned-
// locations list is filtered by location at all — everyone else
// (including a location_manager with no locations assigned yet) sees
// every location, matching the SQL function's own documented reasoning.
export function canAccessCaseLocation(role, memberLocationIds, caseLocationId) {
  if (role !== "location_manager") return true;
  if (!memberLocationIds || memberLocationIds.length === 0) return true;
  return memberLocationIds.includes(caseLocationId);
}
