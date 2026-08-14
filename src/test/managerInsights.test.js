import { describe, it, expect } from 'vitest';
import { computeManagerPerformanceInsights } from '../lib/managerInsights.js';

describe('computeManagerPerformanceInsights', () => {
  const cases = [{ id: 'c1', employeeName: 'Sam' }, { id: 'c2', employeeName: 'Jo' }];

  it('reports zero/null stats when nothing has been delegated', () => {
    const result = computeManagerPerformanceInsights([], [], [], [], []);
    expect(result).toEqual({
      avgInvestigationCompletionDays: null,
      investigationCompletionSampleSize: 0,
      investigationsReturnedForRework: 0,
      overdueManagerActions: 0,
      meetingQualityGapsCount: 0,
      processDeviationsCount: 0,
      delegatedCaseCount: 0,
    });
  });

  it('averages investigation completion time from assignment (case_access.grantedAt) to first submission (hr_review_requests.requested_at)', () => {
    const caseAccess = [
      { id: 'a1', caseId: 'c1', role: 'investigator', grantedAt: '2026-08-01T00:00:00Z' },
      { id: 'a2', caseId: 'c2', role: 'investigator', grantedAt: '2026-08-01T00:00:00Z' },
    ];
    const hrReviewRequests = [
      { id: 'r1', case_id: 'c1', step: 'inv_report', requested_at: '2026-08-11T00:00:00Z' },
      { id: 'r2', case_id: 'c2', step: 'inv_report', requested_at: '2026-08-06T00:00:00Z' },
    ];
    const result = computeManagerPerformanceInsights(cases, caseAccess, hrReviewRequests, [], []);
    expect(result.avgInvestigationCompletionDays).toBe(7.5);
    expect(result.investigationCompletionSampleSize).toBe(2);
  });

  it('ignores a case that was assigned but never submitted', () => {
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator', grantedAt: '2026-08-01T00:00:00Z' }];
    const result = computeManagerPerformanceInsights(cases, caseAccess, [], [], []);
    expect(result.avgInvestigationCompletionDays).toBeNull();
    expect(result.investigationCompletionSampleSize).toBe(0);
  });

  it('uses the earliest grant and earliest submission when either happened more than once', () => {
    const caseAccess = [
      { id: 'a1', caseId: 'c1', role: 'investigator', grantedAt: '2026-08-05T00:00:00Z' },
      { id: 'a2', caseId: 'c1', role: 'investigator', grantedAt: '2026-08-01T00:00:00Z' },
    ];
    const hrReviewRequests = [
      { id: 'r1', case_id: 'c1', step: 'inv_report', requested_at: '2026-08-11T00:00:00Z' },
      { id: 'r2', case_id: 'c1', step: 'inv_report', requested_at: '2026-08-20T00:00:00Z' },
    ];
    const result = computeManagerPerformanceInsights(cases, caseAccess, hrReviewRequests, [], []);
    expect(result.avgInvestigationCompletionDays).toBe(10);
  });

  it('counts investigations returned for rework from hr_review_requests', () => {
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator' }];
    const hrReviewRequests = [
      { id: 'r1', case_id: 'c1', step: 'inv_report', status: 'returned' },
      { id: 'r2', case_id: 'c2', step: 'inv_report', status: 'approved' },
      { id: 'r3', case_id: 'c1', step: 'escalation', status: 'returned' },
    ];
    const result = computeManagerPerformanceInsights(cases, caseAccess, hrReviewRequests, [], []);
    expect(result.investigationsReturnedForRework).toBe(1);
  });

  it('counts overdue dueSoon items scoped to delegated (investigator) cases only', () => {
    const caseAccess = [
      { id: 'a1', caseId: 'c1', role: 'investigator' },
      { id: 'a2', caseId: 'c2', role: 'notetaker' },
    ];
    const dueSoon = [
      { caseId: 'c1', overdue: true },
      { caseId: 'c1', overdue: false },
      { caseId: 'c2', overdue: true },
      { caseId: 'c3', overdue: true },
    ];
    const result = computeManagerPerformanceInsights(cases, caseAccess, [], [], dueSoon);
    expect(result.overdueManagerActions).toBe(1);
  });

  it('counts meeting-quality-override and policy-deviation audit entries separately', () => {
    const caseAccess = [{ id: 'a1', caseId: 'c1', role: 'investigator' }];
    const auditLog = [
      { action: 'Ended meeting despite quality check gaps', caseId: 'c1' },
      { action: 'Ended meeting despite quality check gaps', caseId: 'c2' },
      { action: 'Policy deviation recorded', caseId: 'c1' },
      { action: 'Task added', caseId: 'c1' },
    ];
    const result = computeManagerPerformanceInsights(cases, caseAccess, [], auditLog, []);
    expect(result.meetingQualityGapsCount).toBe(2);
    expect(result.processDeviationsCount).toBe(1);
  });

  it('reports how many distinct cases have been delegated', () => {
    const caseAccess = [
      { id: 'a1', caseId: 'c1', role: 'investigator' },
      { id: 'a2', caseId: 'c1', role: 'investigator' },
      { id: 'a3', caseId: 'c2', role: 'investigator' },
    ];
    const result = computeManagerPerformanceInsights(cases, caseAccess, [], [], []);
    expect(result.delegatedCaseCount).toBe(2);
  });
});
