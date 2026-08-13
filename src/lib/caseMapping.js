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
    estimatedWeeklyPay: row.estimated_weekly_pay || null,
    estimatedAgeAtDismissal: row.estimated_age_at_dismissal || null,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
    confidential: row.confidential || false,
    updatedAt: row.updated_at || null,
    manager: row.manager || "",
    ownerId: row.owner_id || null,
    priority: row.priority || "normal",
    timelineOverrides: row.timeline_overrides || {},
    fitNoteEndDate: row.fit_note_end_date || null,
    probationReviewDate: row.probation_review_date || null,
    ohReferralDate: row.oh_referral_date || null,
    ohReportReceivedDate: row.oh_report_received_date || null,
    suspensionReviewDate: row.suspension_review_date || null,
  };
}
