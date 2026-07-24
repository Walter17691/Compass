// Supabase `cases` row (snake_case columns) -> client/shared shape
// (camelCase) used by computeDueSoon and the rest of the app. Single
// source of truth so the client loader and the server-side digest job
// can't drift apart on column names.
export function mapCaseRow(row) {
  return {
    id: row.id,
    employeeName: row.employee_name,
    email: row.employee_email || row.email || "",
    meetings: row.meetings || [],
    evidence: row.evidence || [],
    stage: row.stage || "open",
    caseType: row.case_type || "",
    description: row.description || "",
    dateReceived: row.date_received || "",
    urgency: row.urgency || "normal",
    outcome: row.outcome || "",
    investigationReport: row.investigation_report || null,
    investigationReportDate: row.investigation_report_date || null,
    disciplinaryOfficer: row.disciplinary_officer || null,
    disciplinaryOfficerId: row.disciplinary_officer_id || null,
    disciplinaryOfficerEmail: row.disciplinary_officer_email || null,
    investigatingManager: row.investigating_manager || null,
    handoffDate: row.handoff_date || null,
    nextSteps: row.next_steps || [],
    locationId: row.location_id || "",
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
