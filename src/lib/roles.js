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

// NEW-8 remediation — roles an ordinary team invitation may grant.
// hr_director is deliberately excluded: it's only ever created for an
// org's own founding member (org_members_insert_founding_member) or
// granted afterward by an existing hr_director (see NEW-9's
// protect_org_member_privilege_columns fix) — never through invitation.
export const TEAM_INVITE_ROLES = ROLES.filter(r => r.id !== "hr_director");

// Roles whose actual authorization model is scoped by assigned
// locations (canAccessCaseLocation). Kept separate from the general role
// list so the invite form only asks for locations where they mean
// something, rather than showing the field for every role.
export const LOCATION_SCOPED_ROLES = new Set(["location_manager"]);

// Short, honest, already-real descriptions for the invite form — same
// tone/purpose as IntegrationsSection.jsx's own USE_DESCRIPTION: describe
// what the role can actually do today, not aspirational copy.
export const ROLE_DESCRIPTIONS = {
  hr_manager: "Full access to organisation cases and HR actions, except reserved administrator functions.",
  location_manager: "Sees and can contribute to cases at their assigned location(s) only.",
  line_manager: "Sees cases they own or are explicitly given access to.",
  investigator: "No case access until individually assigned to a specific case.",
  legal_reviewer: "Access to HR review requests and cases with confidential-case oversight.",
  auditor: "Read-only access; cannot create, edit, or delete records.",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "Team member";
}

export function isHrRole(role) {
  return role === "hr_manager" || role === "hr_director";
}

// NEW-9 remediation — client-side mirror of the DB-enforced rule in
// protect_org_member_privilege_columns(): granting or removing
// hr_director access requires the ACTING user to already be an
// hr_director, not merely any HR role. Every other role change an
// hr_manager already makes (hr_manager, location_manager, line_manager,
// investigator, legal_reviewer, auditor, in either direction) is
// unaffected. The database is the real enforcement; this only keeps the
// UI from offering a control the server will reject.
export function canManageDirectorTier(actingRole, targetCurrentRole) {
  if (actingRole === "hr_director") return true;
  return targetCurrentRole !== "hr_director";
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
