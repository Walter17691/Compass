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
