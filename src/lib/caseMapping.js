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
    // Phase E0.5A — the canonical employee identity. NULL for a legacy case, and
    // NULL must never be reinterpreted as a new or unknown employee, nor resolved
    // by name: reconciliation (E0.5B) is an explicit human act.
    employeeId: row.employee_id || null,
    evidence: row.evidence || [],
    stage: row.stage || "open",
    caseType: row.case_type || "",
    description: row.description || "",
    dateReceived: row.date_received || "",
    urgency: row.urgency || "normal",
    outcome: row.outcome || "",
    // Defect #12/#14 remediation — these four were previously captured
    // by OutcomeModal but never persisted (no columns existed); see
    // supabase/warning_duration_outcome_metadata_2026-09-09.sql.
    outcomeIssuedAt: row.outcome_issued_at || null,
    outcomeNotes: row.outcome_notes || "",
    warningDurationMonths: row.warning_duration_months || null,
    warningExpiresAt: row.warning_expires_at || null,
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
    investigationPaused: row.investigation_paused || false,
    ohProcess: row.oh_process || null,
    // Appeal UAT remediation (2026-09-18) — see supabase/appeal_receipt_
    // grounds_2026-09-18.sql. Null for cases with no appeal recorded, or
    // recorded before this column existed.
    appealText: row.appeal_text || "",
    // Appeal Independence P1 (2026-09-18) — see supabase/appeal_
    // independence_decision_maker_2026-09-18.sql. The authoritative
    // decision-maker for the meeting/outcome-letter pathway; null for
    // cases decided before this column existed or decided solely via the
    // Allegations-tab workflow (allegations.decided_by covers that path).
    disciplinaryDecidedBy: row.disciplinary_decided_by || null,
  };
}
