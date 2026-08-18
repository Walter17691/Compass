// Integrations & Workflow Automation (Phase 5, IP21, §15) — "Open in
// Compass" deep link. No real external HRIS platform exists to link FROM
// (IP19 is a stub adapter only), so this is entirely the RECEIVING end: a
// ?employee=<name> query param lands on a screen offering the four
// spec actions (View Existing Cases / Raise Concern / Create Case / View
// Active Actions), each routed into an already-existing, already
// role-appropriate flow rather than new permission logic.

export function parseEmployeeDeepLink(search) {
  const params = new URLSearchParams(search || "");
  const employeeName = (params.get("employee") || "").trim();
  return employeeName || null;
}

export function findCasesForEmployee(cases, employeeName) {
  const name = (employeeName || "").trim().toLowerCase();
  if (!name) return [];
  return (cases || []).filter(cs => (cs.employeeName || "").trim().toLowerCase() === name);
}
