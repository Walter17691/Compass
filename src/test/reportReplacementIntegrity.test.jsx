import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  HR_REVIEW_PENDING, PENDING_REVIEW_INDEX, findPendingReview, planHrReviewRequest,
  isDuplicatePendingViolation, HR_REVIEW_OUTCOME,
} from '../lib/hrReviewIdempotency.js';
import {
  reportDigest, reportAuditAction, describeReportReplacement, REPORT_AUDIT_ACTION,
} from '../lib/reportDigest.js';
import { hasExistingReport, assessReportGeneration, REPORT_GENERATION } from '../lib/investigationReportDocument.js';

// ─────────────────────────────────────────────────────────────────────────
// IR-0.2a — REPORT REPLACEMENT INTEGRITY.
//
// ┌─ THE TWO DEFECTS, FOUND IN PRE-FLIGHT BEFORE THE UAT RAN ───────────────┐
// │ 1. requestHrReview() was a plain INSERT with status 'pending' and no      │
// │    idempotency check, and hr_review_requests had only PRIMARY KEY (id).   │
// │    Regenerating a report on a case already holding inv_report/pending     │
// │    would queue the same gate for HR twice.                               │
// │ 2. A deliberate replacement audited identically to a first generation     │
// │    ("Investigation report generated"), so the supersession of a report    │
// │    Compass cannot version was invisible.                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Production at the time: 139 requests across 3 orgs, 119 pending / 20 approved,
// ZERO duplicate (case_id, step) groups at any status. The UAT case held
// 0ac3bba6-3b6c-4071-bf1e-90329e57dbf5 inv_report/pending.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t.replace(/^\s*\/\/.*$/gm, '');

const CASE = '065d5a28-54a0-47f0-99a3-3ecb13f180bf';
const STEP = 'inv_report';
const pendingRow = (over = {}) => ({
  id: '0ac3bba6-3b6c-4071-bf1e-90329e57dbf5', case_id: CASE, step: STEP,
  status: HR_REVIEW_PENDING, requested_at: '2026-10-07T16:35:49.000Z',
  requested_by: 'manager-uuid', record_snapshot: 'Investigation submitted for review', ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A/B/C. one pending request per gate', () => {
  it('A. first generation: there is no pending request, so one is created', () => {
    const plan = planHrReviewRequest({ requests: [], caseId: CASE, step: STEP });
    expect(plan.shouldInsert).toBe(true);
    expect(plan.outcome).toBe(HR_REVIEW_OUTCOME.CREATED);
    expect(plan.existing).toBe(null);
    expect(reportAuditAction(false)).toBe(REPORT_AUDIT_ACTION.GENERATED);
  });

  it('B. replacement with an existing pending request: it is REUSED, not duplicated', () => {
    const existing = pendingRow();
    const plan = planHrReviewRequest({ requests: [existing], caseId: CASE, step: STEP });
    expect(plan.shouldInsert).toBe(false);
    expect(plan.outcome).toBe(HR_REVIEW_OUTCOME.REUSED);
    // PRESERVED, not replaced: the same row, untouched.
    expect(plan.existing).toBe(existing);
    expect(plan.existing.id).toBe('0ac3bba6-3b6c-4071-bf1e-90329e57dbf5');
    expect(plan.existing.requested_at).toBe('2026-10-07T16:35:49.000Z');
    expect(reportAuditAction(true)).toBe(REPORT_AUDIT_ACTION.REPLACED);
  });

  it('C. repeated replacement never creates a second pending request', () => {
    const requests = [pendingRow()];
    for (let i = 0; i < 5; i += 1) {
      const plan = planHrReviewRequest({ requests, caseId: CASE, step: STEP });
      expect(plan.shouldInsert).toBe(false);
      // The caller inserts nothing, so the list cannot grow.
      expect(requests).toHaveLength(1);
    }
  });

  it('the gate is case+step scoped, not meeting scoped', () => {
    // A report regenerated with a different meeting context is the SAME gate.
    const existing = pendingRow({ meeting_id: 'meeting_old' });
    expect(findPendingReview([existing], CASE, STEP)).toBe(existing);
    // A different case or a different step is a different gate.
    expect(findPendingReview([existing], 'other-case', STEP)).toBe(null);
    expect(findPendingReview([existing], CASE, 'dismissal')).toBe(null);
    expect(findPendingReview([existing], null, STEP)).toBe(null);
    expect(findPendingReview(null, CASE, STEP)).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. the database is the authority under concurrency', () => {
  it('a duplicate-pending violation is recognised and treated as already-pending', () => {
    for (const err of [
      { code: '23505', message: 'duplicate key value violates unique constraint "hr_review_requests_one_pending_per_step"' },
      { code: '23505', details: 'Key (case_id, step)=(…, inv_report) already exists.', constraint: PENDING_REVIEW_INDEX },
      { code: '23505', message: 'duplicate key value violates unique constraint "_pending_per_step"' },
    ]) {
      expect(isDuplicatePendingViolation(err)).toBe(true);
    }
  });

  it('a unique violation from a DIFFERENT constraint is NOT swallowed', () => {
    // Swallowing this would hide a real failure as "already pending".
    expect(isDuplicatePendingViolation({ code: '23505', message: 'duplicate key value violates unique constraint "cases_pkey"' })).toBe(false);
    expect(isDuplicatePendingViolation({ code: '23505', message: 'violates unique constraint "employee_records_email_key"' })).toBe(false);
  });

  it('non-unique errors are never treated as already-pending', () => {
    for (const err of [null, undefined, {}, { code: '23503' }, { code: '42501', message: 'permission denied' },
      { message: 'network' }]) {
      expect(isDuplicatePendingViolation(err)).toBe(false);
    }
  });

  it('the invariant is a partial unique index on the PENDING state (migration)', () => {
    const sql = read('supabase/hr_review_pending_uniqueness_2026-10-08.sql');
    const code = sql.replace(/^\s*--.*$/gm, '');
    expect(code).toMatch(/create unique index hr_review_requests_one_pending_per_step/);
    expect(code).toMatch(/on public\.hr_review_requests \(case_id, step\)/);
    expect(code).toMatch(/where status = 'pending'/);
    // No elevated privilege, no policy change, no trigger, no column.
    expect(code).not.toMatch(/security definer|create policy|drop policy|create trigger|add column|alter column/i);
    // And no backfill or mutation of existing rows.
    expect(code).not.toMatch(/\bupdate public\.|\bdelete from\b|\binsert into\b/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. a legitimate later review cycle still works', () => {
  it('once the previous request leaves pending, a new one may be created', () => {
    // Every investigation review status is a TERMINAL HR action, so any of them
    // reopens the ability to resubmit.
    for (const status of ['approved', 'returned', 'clarification_requested', 'taken_over', 'closed', 'progressed']) {
      const plan = planHrReviewRequest({ requests: [pendingRow({ status })], caseId: CASE, step: STEP });
      expect(plan.shouldInsert, status).toBe(true);
      expect(plan.outcome, status).toBe(HR_REVIEW_OUTCOME.CREATED);
    }
  });

  it('history is preserved — a non-pending row is never matched or mutated', () => {
    const history = [pendingRow({ id: 'old-1', status: 'returned' }), pendingRow({ id: 'old-2', status: 'approved' })];
    const snapshot = JSON.parse(JSON.stringify(history));
    expect(findPendingReview(history, CASE, STEP)).toBe(null);
    expect(planHrReviewRequest({ requests: history, caseId: CASE, step: STEP }).shouldInsert).toBe(true);
    expect(history).toEqual(snapshot);
  });

  it('a pending row alongside history is still found', () => {
    const requests = [pendingRow({ id: 'old', status: 'returned' }), pendingRow({ id: 'current' })];
    expect(findPendingReview(requests, CASE, STEP).id).toBe('current');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('replacement audit semantics', () => {
  it('the two actions are distinct and neither can stand for the other', () => {
    expect(REPORT_AUDIT_ACTION.GENERATED).toBe('Investigation report generated');
    expect(REPORT_AUDIT_ACTION.REPLACED).toBe('Investigation report replaced');
    expect(REPORT_AUDIT_ACTION.GENERATED).not.toBe(REPORT_AUDIT_ACTION.REPLACED);
  });

  it('the action is decided by the PRE-WRITE state, not by a UI flag', () => {
    expect(reportAuditAction(hasExistingReport({ investigationReport: 'x' }))).toBe(REPORT_AUDIT_ACTION.REPLACED);
    expect(reportAuditAction(hasExistingReport({ investigationReport: '   ' }))).toBe(REPORT_AUDIT_ACTION.GENERATED);
    expect(reportAuditAction(hasExistingReport({}))).toBe(REPORT_AUDIT_ACTION.GENERATED);
  });

  it('EXECUTED: SHA-256 digests are real, stable and distinguish documents', async () => {
    const a = await reportDigest('## Report A\n\ncontent');
    const b = await reportDigest('## Report B\n\ncontent');
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(b).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(await reportDigest('## Report A\n\ncontent')).toBe(a);   // stable
    // A known vector, so the implementation is pinned, not merely self-consistent.
    expect(await reportDigest('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('digests fail soft — an audit is never lost because a hash could not be taken', async () => {
    expect(await reportDigest('')).toBe(null);
    expect(await reportDigest(null)).toBe(null);
    expect(await reportDigest(undefined)).toBe(null);
  });

  it('the detail carries evidence, and NO report text or narrative', () => {
    const detail = describeReportReplacement({
      employeeName: 'ZZ Test',
      supersededDigest: 'sha256:aaaa', supersededLength: 14847, supersededAt: '07/10/2026',
      newDigest: 'sha256:bbbb', newLength: 15002,
    });
    expect(detail).toMatch(/previous report superseded/);
    expect(detail).toMatch(/sha256:aaaa/);
    expect(detail).toMatch(/14847 chars/);
    expect(detail).toMatch(/sha256:bbbb/);
    expect(detail).toMatch(/not retained/);
    // The limitation is stated rather than implied.
    expect(detail).toMatch(/does not yet keep report versions/);
    // And nothing resembling report content.
    expect(detail).not.toMatch(/PART 1|Executive Summary|allegation|stock count/i);
  });

  it('the detail degrades honestly when a digest is unavailable', () => {
    const detail = describeReportReplacement({ supersededLength: 100, newLength: 200 });
    expect(detail).toMatch(/digest unavailable/);
    expect(detail).not.toMatch(/null|undefined/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F/G/H/I. failure paths write nothing', () => {
  const app = stripComments(read('src/App.jsx'));
  const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));

  it('F. a cancelled replacement writes no report, no audit, no review (wiring)', () => {
    const attempt = app.slice(app.indexOf('const attemptSubmitInvestigation = async'));
    const body = attempt.slice(0, attempt.indexOf('\n  };'));
    expect(body).toMatch(/if\(!confirmed\) \{[^}]*return; \}/);
    // The consent precedes everything, so cancelling cannot have advanced anything.
    expect(body.indexOf('describeReplaceExistingReport')).toBeLessThan(body.indexOf('finalizeInvestigationSubmission'));
  });

  it('G. a truncated or empty generation produces no audit and no review (wiring)', () => {
    expect(assessReportGeneration({ text: 'x', truncated: true }).reason).toBe(REPORT_GENERATION.TRUNCATED);
    expect(conclude).toMatch(/if\(!assessed\.ok\)/);
    const guard = conclude.indexOf('if(!assessed.ok)');
    expect(guard).toBeLessThan(conclude.indexOf('await saveCases'));
    expect(guard).toBeLessThan(conclude.indexOf('reportAuditAction'));
  });

  it('H. a stale updated_at conflict does not falsely audit success (wiring)', () => {
    const saveIdx = conclude.indexOf('const saved = await saveCases');
    const guardIdx = conclude.indexOf('if(!saved?.ok)');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(saveIdx);
    expect(conclude.indexOf('reportAuditAction')).toBeGreaterThan(guardIdx);
    expect(conclude).toMatch(/reason:REPORT_GENERATION\.NOT_PERSISTED/);
  });

  it('the pre-write state is captured BEFORE the stream, so a race cannot mislabel it (wiring)', () => {
    const had = conclude.indexOf('const hadExistingReport = hasExistingReport(cs)');
    expect(had).toBeGreaterThan(-1);
    expect(had).toBeLessThan(conclude.indexOf('await streamClaude'));
  });

  it('I. replacement writes only the three report fields — no decision, no correspondence (wiring)', () => {
    const writes = [...conclude.matchAll(/\{\.\.\.x,([^}]*)\}/g)].map(m => m[1]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe('investigationReport:text,investigationReportDate:new Date().toISOString(),stage:"inv_report"');
    for (const f of ['case_decisions', 'record_case_decision', 'letterType', 'letterOutput',
      'signing_requests', 'participantComment', 'responseResolution']) {
      expect(conclude).not.toContain(f);
    }
  });

  it('requestHrReview reuses before inserting, and treats a race as success (wiring)', () => {
    const fn = app.slice(app.indexOf('const requestHrReview = async'), app.indexOf('\n  };', app.indexOf('const requestHrReview = async')));
    const plan = fn.indexOf('planHrReviewRequest(');
    expect(plan).toBeGreaterThan(-1);
    expect(plan).toBeLessThan(fn.indexOf(".insert({"));
    expect(fn).toMatch(/if\(!plan\.shouldInsert\)/);
    expect(fn).toMatch(/isDuplicatePendingViolation\(error\)/);
    // Reuse is silent: no toast, so no second submission event is announced.
    const reuse = fn.slice(fn.indexOf('if(!plan.shouldInsert)'), fn.indexOf('const { data, error }'));
    expect(reuse).not.toMatch(/showToast/);
  });

  it('no report version WRITING architecture was added to the replacement path', () => {
    // This asserted that no src/lib file was named /reportVersion|reportHistory/
    // at all. That was right for IR-0, which deliberately added no versioning
    // and said so. It is superseded by decision, not by drift: B3.1 created
    // public.investigation_report_versions and B3.4 added
    // src/lib/reportVersionGateway.js so the DSAR compiler can disclose what
    // the store holds about a subject.
    //
    // What this test is FOR survives intact, and is now stated precisely: the
    // legacy generate-and-replace path in App.jsx must not have grown
    // versioning, and nothing may WRITE a version. A read for disclosure is
    // not a lifecycle change — B3.2 is, and it is not this release.
    const libs = fs.readdirSync(path.resolve(__dirname, '..', '..', 'src', 'lib'))
      .filter(f => /reportVersion|reportHistory/i.test(f));
    expect(libs).toEqual(['reportVersionGateway.js']);

    // The gateway reads. It does not write, and it does not adopt.
    const gateway = read('src/lib/reportVersionGateway.js').replace(/^\s*\/\/.*$/gm, '');
    expect(gateway).toContain('.select(');
    expect(gateway).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
    expect(gateway).not.toMatch(/adopt_investigation_report_version/);

    // App.jsx — the legacy replacement path — still knows nothing about any
    // of it. This is the assertion that keeps the old flow the only flow.
    expect(app).not.toMatch(/investigationReportVersions|investigationReportHistory|investigation_report_versions/);
    const sql = read('supabase/hr_review_pending_uniqueness_2026-10-08.sql').replace(/^\s*--.*$/gm, '');
    expect(sql).not.toMatch(/create table/i);
  });
});
