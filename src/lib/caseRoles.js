// Process Intelligence (Phase 3, P8) — the spec's case-scoped role
// vocabulary (§16). Investigator, Case Owner and Hearing Manager (this
// codebase's existing "disciplinary_officer") already have real, working
// assignment flows predating this phase (assignInvestigator,
// ReassignCaseModal, HandoffModal) — listed here too so every role
// Compass recognises has one canonical id/label pair, but ASSIGNABLE_ROLES
// only covers the ones that had no UI at all before this phase: Appeal
// Manager, Notetaker, the employee's own line manager, and an Approver
// (the role P9's approval workflows gate on).
export const CASE_ROLES = [
  { id: "case_owner", label: "Case Owner" },
  { id: "investigator", label: "Investigator" },
  { id: "disciplinary_officer", label: "Hearing Manager" },
  { id: "appeal_manager", label: "Appeal Manager" },
  { id: "notetaker", label: "Notetaker" },
  { id: "employee_manager", label: "Employee's Manager" },
  { id: "approver", label: "Approver" },
];

export const ASSIGNABLE_ROLE_IDS = ["appeal_manager", "notetaker", "employee_manager", "approver"];
export const ASSIGNABLE_ROLES = CASE_ROLES.filter(r => ASSIGNABLE_ROLE_IDS.includes(r.id));

export function caseRoleLabel(roleId) {
  return CASE_ROLES.find(r => r.id === roleId)?.label || roleId;
}

// case_access has one row per (case, user) — see baseline_schema's
// case_access_case_id_user_id_key — so a role assignment always replaces
// whatever role that user previously held on this case; the "latest row"
// for a role is still the defensive read (a stale duplicate shouldn't be
// possible under that constraint, but this matches the same
// last-write-wins pattern CaseViewScreen's existing investigator lookup
// already uses).
export function currentRoleHolder(caseAccess, orgMembers, caseId, roleId) {
  const rows = (caseAccess || []).filter(a => a.caseId === caseId && a.role === roleId);
  const latest = rows[rows.length - 1];
  if (!latest) return null;
  return (orgMembers || []).find(m => m.user_id === latest.userId) || null;
}
