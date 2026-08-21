import { describe, it, expect } from 'vitest';
import { mapCaseRow } from '../lib/caseMapping';

// Phase 6.5 hardening (Batch 8) — mapCaseRow is the single choke point
// every case load in the app goes through (loadCasesFromDB's own
// .map(mapCaseRow)), and the digest cron's own server-side loader
// mirrors its column names by hand rather than importing it — a silent
// regression here (a dropped/renamed field) corrupts every case the app
// reads. Had no test coverage at all before this.
describe('mapCaseRow', () => {
  const fullRow = {
    id: 'c1',
    employee_name: 'Jane Doe',
    employee_email: 'jane@example.com',
    meetings: [{ id: 'm1' }],
    evidence: [{ id: 'e1' }],
    stage: 'investigation',
    case_type: 'misconduct',
    description: 'A description',
    date_received: '2026-08-01',
    urgency: 'high',
    outcome: 'Final written warning',
    investigation_report: 'report text',
    investigation_report_date: '2026-08-10',
    disciplinary_officer: 'Alex Manager',
    disciplinary_officer_id: 'u1',
    disciplinary_officer_email: 'alex@example.com',
    investigating_manager: 'Sam Investigator',
    handoff_date: '2026-08-05',
    next_steps: [{ step: 'Send letter' }],
    location_id: 'loc1',
    estimated_weekly_pay: 500,
    estimated_age_at_dismissal: 40,
    assigned_to: 'u2',
    created_by: 'u3',
    created_at: '2026-07-01T00:00:00Z',
    confidential: true,
    updated_at: '2026-08-15T00:00:00Z',
    manager: 'Pat Manager',
    owner_id: 'u4',
    priority: 'urgent',
    timeline_overrides: { stage1: '2026-08-02' },
    fit_note_end_date: '2026-09-01',
    probation_review_date: '2026-10-01',
    oh_referral_date: '2026-08-03',
    oh_report_received_date: '2026-08-20',
    suspension_review_date: '2026-08-06',
    investigation_paused: true,
    oh_process: 'referred',
  };

  it('maps every snake_case column to its camelCase field, values preserved', () => {
    expect(mapCaseRow(fullRow)).toEqual({
      id: 'c1',
      employeeName: 'Jane Doe',
      email: 'jane@example.com',
      meetings: [{ id: 'm1' }],
      evidence: [{ id: 'e1' }],
      stage: 'investigation',
      caseType: 'misconduct',
      description: 'A description',
      dateReceived: '2026-08-01',
      urgency: 'high',
      outcome: 'Final written warning',
      investigationReport: 'report text',
      investigationReportDate: '2026-08-10',
      disciplinaryOfficer: 'Alex Manager',
      disciplinaryOfficerId: 'u1',
      disciplinaryOfficerEmail: 'alex@example.com',
      investigatingManager: 'Sam Investigator',
      handoffDate: '2026-08-05',
      nextSteps: [{ step: 'Send letter' }],
      locationId: 'loc1',
      estimatedWeeklyPay: 500,
      estimatedAgeAtDismissal: 40,
      assignedTo: 'u2',
      createdBy: 'u3',
      createdAt: '2026-07-01T00:00:00Z',
      confidential: true,
      updatedAt: '2026-08-15T00:00:00Z',
      manager: 'Pat Manager',
      ownerId: 'u4',
      priority: 'urgent',
      timelineOverrides: { stage1: '2026-08-02' },
      fitNoteEndDate: '2026-09-01',
      probationReviewDate: '2026-10-01',
      ohReferralDate: '2026-08-03',
      ohReportReceivedDate: '2026-08-20',
      suspensionReviewDate: '2026-08-06',
      investigationPaused: true,
      ohProcess: 'referred',
    });
  });

  it('defaults every field sensibly for a bare-minimum row (id only)', () => {
    const result = mapCaseRow({ id: 'c1' });
    expect(result).toEqual({
      id: 'c1',
      employeeName: undefined,
      email: '',
      meetings: [],
      evidence: [],
      stage: 'open',
      caseType: '',
      description: '',
      dateReceived: '',
      urgency: 'normal',
      outcome: '',
      investigationReport: null,
      investigationReportDate: null,
      disciplinaryOfficer: null,
      disciplinaryOfficerId: null,
      disciplinaryOfficerEmail: null,
      investigatingManager: null,
      handoffDate: null,
      nextSteps: [],
      locationId: '',
      estimatedWeeklyPay: null,
      estimatedAgeAtDismissal: null,
      assignedTo: undefined,
      createdBy: undefined,
      createdAt: undefined,
      confidential: false,
      updatedAt: null,
      manager: '',
      ownerId: null,
      priority: 'normal',
      timelineOverrides: {},
      fitNoteEndDate: null,
      probationReviewDate: null,
      ohReferralDate: null,
      ohReportReceivedDate: null,
      suspensionReviewDate: null,
      investigationPaused: false,
      ohProcess: null,
    });
  });

  it('falls back to the row-level email field when employee_email is not set', () => {
    expect(mapCaseRow({ id: 'c1', email: 'fallback@example.com' }).email).toBe('fallback@example.com');
  });

  it('prefers employee_email over the row-level email field when both are set', () => {
    expect(mapCaseRow({ id: 'c1', employee_email: 'primary@example.com', email: 'fallback@example.com' }).email).toBe('primary@example.com');
  });

  it('preserves assignedTo/createdBy/createdAt as-is, including when explicitly null (no || fallback masking a real null)', () => {
    const result = mapCaseRow({ id: 'c1', assigned_to: null, created_by: null, created_at: null });
    expect(result.assignedTo).toBeNull();
    expect(result.createdBy).toBeNull();
    expect(result.createdAt).toBeNull();
  });
});
