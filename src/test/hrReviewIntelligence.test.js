import { describe, it, expect } from 'vitest';
import { computePendingHrReview, computeFirstPassApprovalRate, HR_REVIEW_MIN_SAMPLE_SIZE } from '../lib/hrReviewIntelligence';

// Insights Phase 5 (Process Quality + HR Review Intelligence) — pure
// aggregation over hr_review_requests, scoped to step === "inv_report"
// throughout, mirroring the real App.jsx lifecycle: requestHrReview
// INSERTS a new row per submission (status 'pending'); respondToReview/
// resolveInvestigationReview UPDATES that same row's status once
// (guarded by .eq('status','pending')), never creating a second row for
// the same submission. A resubmission after a return is therefore always
// a fresh row sharing the same case_id.
describe('computePendingHrReview', () => {
  const NOW = new Date('2026-09-06T00:00:00.000Z');

  it('zero pending', () => {
    expect(computePendingHrReview([], NOW)).toEqual({ count: 0, caseIds: [], oldestPendingDays: null });
  });

  it('one pending', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z' }];
    const result = computePendingHrReview(rows, NOW);
    expect(result.count).toBe(1);
    expect(result.caseIds).toEqual(['c1']);
    expect(result.oldestPendingDays).toBe(5);
  });

  it('multiple pending, distinct cases', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'pending', requested_at: '2026-09-04T00:00:00.000Z' },
    ];
    const result = computePendingHrReview(rows, NOW);
    expect(result.count).toBe(2);
    expect(new Set(result.caseIds)).toEqual(new Set(['c1', 'c2']));
    expect(result.oldestPendingDays).toBe(5); // oldest of the two
  });

  it('same-case duplicate pending rows are deduped to one case, using the OLDER requested_at for age', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-09-04T00:00:00.000Z' },
      { case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z' }, // older, malformed-duplicate scenario
    ];
    const result = computePendingHrReview(rows, NOW);
    expect(result.count).toBe(1);
    expect(result.caseIds).toEqual(['c1']);
    expect(result.oldestPendingDays).toBe(5); // never understates how long the case has waited
  });

  it('excludes rows with the wrong step', () => {
    const rows = [{ case_id: 'c1', step: 'escalation', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z' }];
    expect(computePendingHrReview(rows, NOW).count).toBe(0);
  });

  it('excludes rows with the wrong status', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-09-01T00:00:00.000Z' }];
    expect(computePendingHrReview(rows, NOW).count).toBe(0);
  });

  it('safely ignores a row with a missing case_id', () => {
    const rows = [{ step: 'inv_report', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z' }];
    expect(computePendingHrReview(rows, NOW).count).toBe(0);
  });

  it('handles an invalid requested_at without crashing: case still counted, age excluded', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: 'not-a-date' }];
    const result = computePendingHrReview(rows, NOW);
    expect(result.count).toBe(1);
    expect(result.caseIds).toEqual(['c1']);
    expect(result.oldestPendingDays).toBeNull();
  });

  it('a case with only an invalid date still contributes to count even when another case has a valid one', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: 'not-a-date' },
      { case_id: 'c2', step: 'inv_report', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z' },
    ];
    const result = computePendingHrReview(rows, NOW);
    expect(result.count).toBe(2);
    expect(result.oldestPendingDays).toBe(5);
  });

  it('handles null/undefined input gracefully', () => {
    expect(computePendingHrReview(null, NOW)).toEqual({ count: 0, caseIds: [], oldestPendingDays: null });
    expect(computePendingHrReview(undefined, NOW)).toEqual({ count: 0, caseIds: [], oldestPendingDays: null });
  });

  it('never exposes record_snapshot or comments — the returned shape is minimal', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-09-01T00:00:00.000Z', record_snapshot: 'SENSITIVE', comments: 'SENSITIVE' }];
    const result = computePendingHrReview(rows, NOW);
    expect(JSON.stringify(result)).not.toMatch(/SENSITIVE/);
    expect(Object.keys(result).sort()).toEqual(['caseIds', 'count', 'oldestPendingDays']);
  });
});

describe('computeFirstPassApprovalRate', () => {
  it('direct approval, no return: first-pass approved', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.numerator).toBe(3); // c1 + the 2 padding cases (see pad()) are all first-pass approved
    expect(result.reworkCaseIds).not.toContain('c1');
  });

  it('first submission returned, no resubmission: rework required, excluded from first-pass numerator', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.reworkCaseIds).toContain('c1');
  });

  it('returned then resubmitted then approved: still classified as rework required, not first-pass', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-10T00:00:00.000Z' },
    ];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.reworkCaseIds).toContain('c1');
  });

  it('returned twice then approved: still rework required (one entry, not double-counted)', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-10T00:00:00.000Z' },
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-20T00:00:00.000Z' },
    ];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.reworkCaseIds.filter(id => id === 'c1')).toHaveLength(1);
  });

  it('pending only: excluded from denominator entirely', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(3)]);
    expect(result.denominator).toBe(3); // c1 excluded, only the 3 padding cases counted
  });

  it('returned and never resubmitted: counted as rework required (denominator includes it), not silently dropped', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.denominator).toBe(3);
    expect(result.reworkCaseIds).toContain('c1');
  });

  it('an ambiguous-only status (clarification_requested) does not count as either approved or rework', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'clarification_requested', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(3)]);
    expect(result.denominator).toBe(3); // c1 excluded
    expect(result.reworkCaseIds).not.toContain('c1');
  });

  it('duplicate identical rows for the same case do not inflate the denominator', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.denominator).toBe(3); // c1 counted once, plus 2 padding
  });

  it('safely ignores a row with a missing case_id', () => {
    const rows = [{ step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(3)]);
    expect(result.denominator).toBe(3);
  });

  it('does not crash on an invalid requested_at (classification is set-based, not order-based)', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: 'not-a-date' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(result.denominator).toBe(3);
  });

  it('an unknown/unrecognised status does not count as either approved or rework', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'some_future_status', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(3)]);
    expect(result.denominator).toBe(3);
  });

  it('denominator 0: not applicable', () => {
    expect(computeFirstPassApprovalRate([])).toEqual({ applicable: false, denominator: 0, numerator: 0, rate: null, reworkCaseIds: [] });
  });

  it('denominator 1: below the sample floor, not applicable', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate(rows);
    expect(result.denominator).toBe(1);
    expect(result.applicable).toBe(false);
    expect(result.rate).toBeNull(); // never shows 100% from one case
  });

  it('denominator 2: below the sample floor, not applicable', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    expect(computeFirstPassApprovalRate(rows).applicable).toBe(false);
  });

  it('denominator exactly 3 (HR_REVIEW_MIN_SAMPLE_SIZE): applicable', () => {
    expect(HR_REVIEW_MIN_SAMPLE_SIZE).toBe(3);
    const result = computeFirstPassApprovalRate(pad(3));
    expect(result.denominator).toBe(3);
    expect(result.applicable).toBe(true);
  });

  it('numerator 0: 0% rate, still applicable if denominator clears the floor', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c3', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    const result = computeFirstPassApprovalRate(rows);
    expect(result.numerator).toBe(0);
    expect(result.rate).toBe(0);
    expect(result.applicable).toBe(true);
  });

  it('numerator = denominator: 100% rate', () => {
    const result = computeFirstPassApprovalRate(pad(3));
    expect(result.numerator).toBe(result.denominator);
    expect(result.rate).toBe(100);
  });

  it('a partial rate rounds the same way every other Insights percentage does', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c3', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    const result = computeFirstPassApprovalRate(rows);
    expect(result.rate).toBe(Math.round((2 / 3) * 100)); // 67%
  });

  it('deterministic: rebuilding the same input always produces the same classification', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-10T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    const a = computeFirstPassApprovalRate(rows);
    const b = computeFirstPassApprovalRate([...rows]);
    expect(a).toEqual(b);
  });

  it('the correct unique-case denominator: repeated rows for the same resolved case never double-count', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'approved', requested_at: '2026-08-02T00:00:00.000Z' },
    ];
    expect(computeFirstPassApprovalRate(rows).denominator).toBe(2);
  });

  it('rework-case drill-down ids are exactly and only the returned cases', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
      { case_id: 'c3', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z' },
    ];
    const result = computeFirstPassApprovalRate(rows);
    expect(new Set(result.reworkCaseIds)).toEqual(new Set(['c2', 'c3']));
  });

  it('never exposes comments or record_snapshot — the returned shape is minimal', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: '2026-08-01T00:00:00.000Z', comments: 'SENSITIVE', record_snapshot: 'SENSITIVE' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(2)]);
    expect(JSON.stringify(result)).not.toMatch(/SENSITIVE/);
    expect(Object.keys(result).sort()).toEqual(['applicable', 'denominator', 'numerator', 'rate', 'reworkCaseIds']);
  });

  it('handles null/undefined input gracefully', () => {
    expect(computeFirstPassApprovalRate(null).applicable).toBe(false);
    expect(computeFirstPassApprovalRate(undefined).applicable).toBe(false);
  });

  it('outcome-approval rows on the same shared status column (different step) are never included', () => {
    // The same hr_review_requests.status column also serves the
    // unrelated outcome-approval vocabulary (pending/approved/rejected)
    // on step values other than "inv_report" (see approvals.js). These
    // must never leak into investigation-review classification.
    const rows = [{ case_id: 'c1', step: 'suspension', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }];
    const result = computeFirstPassApprovalRate([...rows, ...pad(3)]);
    expect(result.denominator).toBe(3); // c1 excluded — wrong step
  });
});

// Small fixture helper: N distinct cases, each with exactly one directly-
// approved inv_report row — i.e. N genuinely first-pass-approved cases,
// used purely to pad a fixture's denominator above the sample floor
// without affecting the specific case(s) under test.
function pad(n) {
  return Array.from({ length: n }, (_, i) => ({ case_id: `pad${i}`, step: 'inv_report', status: 'approved', requested_at: '2026-08-01T00:00:00.000Z' }));
}
