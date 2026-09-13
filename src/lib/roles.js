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

// Roles that collect assigned locations as organisational/reporting
// metadata — since the three-level case-access model (2026-09-13),
// location no longer scopes case visibility at all (see this file's own
// canAccessCaseLocation removal note below). Kept separate from the
// general role list so the invite form only asks for locations where
// they're collected, rather than showing the field for every role.
export const LOCATION_SCOPED_ROLES = new Set(["location_manager"]);

// Short, honest, already-real descriptions for the invite form — same
// tone/purpose as IntegrationsSection.jsx's own USE_DESCRIPTION: describe
// what the role can actually do today, not aspirational copy.
export const ROLE_DESCRIPTIONS = {
  hr_manager: "Full access to organisation cases and HR actions, except reserved administrator functions.",
  // NEW-16 hygiene fix (2026-09-13) — this previously said "Sees and can
  // contribute to cases at their assigned location(s) only," describing
  // behaviour manager_enablement_case_access_2026-08-13.sql deliberately
  // removed weeks earlier (that migration's own comment: "narrowing it is
  // a deliberate, confirmed behaviour change, not an oversight"). Assigned
  // locations are still collected and stored, but do not currently grant
  // case visibility on their own — access today is identical to
  // line_manager's model. Corrected so this invite-form copy matches what
  // actually happens, not what it used to do.
  location_manager: "Sees cases they create or are explicitly given access to. Assigned location(s) are recorded for reference but do not currently grant additional case visibility.",
  line_manager: "Sees cases they own or are explicitly given access to.",
  // Three-level case-access model (2026-09-13) — this description was
  // already the stated intent, but the old model didn't actually deliver
  // it: an Investigator who personally raised a case still saw it via
  // created_by, same as every other non-oversight role. Level 3 (the new
  // default for this role) makes it genuinely true — case_access is the
  // only path to visibility, and Investigator can no longer create/raise
  // cases at all.
  investigator: "No case access until individually assigned to a specific case. Cannot raise new cases.",
  legal_reviewer: "Access to HR review requests and cases with confidential-case oversight.",
  auditor: "Read-only access; cannot create, edit, or delete records.",
};

// Three-level case-access model (2026-09-13) — replaces role-name-list-
// based case visibility (can_see_all_org_cases) and location-based
// visibility (can_access_case_location, confirmed dead in practice since
// manager_enablement_case_access_2026-08-13.sql) with one explicit,
// independently-persisted column: org_members.case_access_level.
//
// Deliberately NOT the same column as org_members.access_level, which is
// a pre-existing, completely unrelated feature (organisational seniority,
// used only by HandoffModal.jsx to decide who's senior enough to be
// appointed an impartial ACAS disciplinary officer). Reusing that name
// would have silently corrupted that feature.
//
// Role is unchanged and still governs CAPABILITIES (who can invite team
// members, manage settings, appoint a disciplinary officer, approve HR
// Review Gate sign-off, take HR Intervention actions). case_access_level
// governs a different question entirely: which cases a person can see.
// Role selection suggests a default level (below); the two are
// independently persisted and one never silently changes the other.
export const CASE_ACCESS_LEVELS = [
  { id: 1, label: "Level 1 — Full access", description: "Can see all cases." },
  { id: 2, label: "Level 2 — Raised + assigned", description: "Can see cases they raise and cases assigned to them." },
  { id: 3, label: "Level 3 — Assigned only", description: "Can only see cases assigned to them." },
];

export const CASE_ACCESS_LEVEL_LABELS = Object.fromEntries(CASE_ACCESS_LEVELS.map(l => [l.id, l.label]));

// Fail-closed by design: an unrecognised role has no entry here at all,
// so callers must handle "no default" explicitly (Level 3, never a silent
// Level 1) rather than this map quietly answering for a role it's never
// seen — the exact same principle the production migration itself uses.
export const DEFAULT_CASE_ACCESS_LEVEL_BY_ROLE = {
  hr_director: 1,
  hr_manager: 1,
  legal_reviewer: 1,
  auditor: 1,
  location_manager: 2,
  line_manager: 2,
  investigator: 3,
};

export function defaultCaseAccessLevelForRole(role) {
  return DEFAULT_CASE_ACCESS_LEVEL_BY_ROLE[role] ?? 3;
}

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

// canAccessCaseLocation() — REMOVED (2026-09-13, three-level case-access
// model). It mirrored can_access_case_location(), whose effect on actual
// case visibility was already confirmed dead in production before this
// removal (manager_enablement_case_access_2026-08-13.sql had already
// superseded it). Its one live caller, api/cron/_digest.js's
// isAuthorisedFor, now checks case_access_level directly instead — see
// that file's own comment for the DB ↔ digest parity table. Locations
// play no role in case visibility under the new model at all; they
// remain useful organisational/reporting metadata only.
