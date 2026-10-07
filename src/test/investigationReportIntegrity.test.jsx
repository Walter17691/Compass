import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  INVESTIGATION_REPORT_DOC, isInvestigationReportDoc,
  investigationReportDocActions, INVESTIGATION_REPORT_SAVE_REFUSAL, refuseInvestigationReportSave,
  describeReplaceExistingReport, hasExistingReport,
  assessReportGeneration, describeReportGeneration, REPORT_GENERATION,
} from '../lib/investigationReportDocument.js';
import { hasLetterType, getCaseStage } from '../lib/caseStage.js';
import { EMPLOYEE_DIRECTED_LETTER_TYPES } from '../lib/letterValidation.js';

// ─────────────────────────────────────────────────────────────────────────
// IR-0 — INVESTIGATION REPORT LIFECYCLE INTEGRITY.
//
// ┌─ THE THREE VERIFIED DEFECTS ────────────────────────────────────────────┐
// │ 1. The report could be saved as an OUTCOME LETTER. activeLetter defaults  │
// │    to "outcome"; "View report" set letterOutput and navigated without     │
// │    naming the document; "Save to case" then wrote                        │
// │    letterType:"outcome", and caseStage reads                             │
// │    hasOutcome = !!cs.outcome || hasLetterType(meetings,"outcome")         │
// │    so the case acquired an OUTCOME stage nobody decided.                 │
// │                                                                         │
// │ 2. A returned report was silently overwritten. HR "returned" reverts the  │
// │    stage and LEAVES investigationReport populated; the next step          │
// │    re-offered generation, which overwrote it with no history or warning.  │
// │                                                                         │
// │ 3. A truncated or unpersisted generation was announced as complete.      │
// │    streamClaude's { stopReason, truncated } was never requested, and     │
// │    saveCases was called without a changedId — the fire-and-forget bulk   │
// │    branch — with the audit entry and success toast on the next lines.    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Production pre-check before the fix: 2,953 in-scope cases, 873 meetings with
// letterOutput, only 3 with a letterType key — all three NULL. Zero non-null
// letterType values, zero cases at stage 'outcome'. Reachable, never triggered.
//
// Tests execute the decisions. Source-text assertions appear only where the
// claim genuinely is about wiring, and are marked as such.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
// FULL-LINE // comments only, deliberately. Stripping /* ... */ across App.jsx
// swallows real code — a "/*" inside any string literal opens a false block that
// runs to the next "*/" — which silently emptied the slices these assertions
// read and made four of them fail for the wrong reason. A line-start // is
// unambiguous, and "https://" mid-line is untouched.
const stripComments = (t) => t.replace(/^\s*\/\/.*$/gm, '');

const REPORT_TEXT = '## Executive Summary\n\nThe investigation considered three meetings.';

const caseWithReport = (over = {}) => ({
  id: 'case-1', employeeName: 'ZZ Test', caseType: 'misconduct',
  investigationReport: REPORT_TEXT,
  investigationReportDate: '2026-10-07T09:00:00.000Z',
  meetings: [
    { id: 'm1', type: 'Investigation', date: '2026-10-05', status: 'completed', record: '# Record one' },
    { id: 'm2', type: 'Investigation', date: '2026-10-06', status: 'completed', record: '# Record two' },
  ],
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('IR-0.1 — the report can never become an outcome letter', () => {
  it('has its own document identity, and it is not "outcome"', () => {
    expect(INVESTIGATION_REPORT_DOC).toBe('investigation-report');
    expect(INVESTIGATION_REPORT_DOC).not.toBe('outcome');
    expect(isInvestigationReportDoc('investigation-report')).toBe(true);
    expect(isInvestigationReportDoc('outcome')).toBe(false);
    expect(isInvestigationReportDoc(undefined)).toBe(false);
  });

  it('is not an employee-directed letter, so outcome-letter validation never applies', () => {
    expect(EMPLOYEE_DIRECTED_LETTER_TYPES).not.toContain(INVESTIGATION_REPORT_DOC);
    expect(EMPLOYEE_DIRECTED_LETTER_TYPES).toContain('outcome');
  });

  it('EXECUTED: the write boundary refuses to persist it, so no letterType is written at all', () => {
    const actions = investigationReportDocActions(INVESTIGATION_REPORT_DOC);
    expect(actions.maySaveToCase).toBe(false);
    expect(actions.mayRegenerate).toBe(false);
    expect(actions.reason).toMatch(/already held on the case/i);
    expect(INVESTIGATION_REPORT_SAVE_REFUSAL.ok).toBe(false);
    // An ordinary letter is unaffected.
    expect(investigationReportDocActions('outcome').maySaveToCase).toBe(true);
    expect(investigationReportDocActions('invite').mayRegenerate).toBe(true);
  });

  it('EXECUTED: a case whose report was viewed/saved cannot read as having an outcome letter', () => {
    // The whole mechanism, exercised rather than asserted. Before IR-0, the save
    // appended a meeting carrying letterType "outcome"; now the save is refused,
    // so the meetings array is untouched and hasLetterType stays false.
    const cs = caseWithReport();
    expect(hasLetterType(cs.meetings, 'outcome')).toBe(false);

    // The shape the old defect produced, for contrast — this is what must never
    // be reachable from viewing a report.
    const corrupted = [...cs.meetings, { id: 'm3', type: 'Meeting', letterOutput: REPORT_TEXT, letterType: 'outcome' }];
    expect(hasLetterType(corrupted, 'outcome')).toBe(true);
    expect(getCaseStage({ ...cs, meetings: corrupted, stage: null })).toBe('outcome');
    // And with the save refused, that array is never built.
    expect(getCaseStage({ ...cs, stage: null })).not.toBe('outcome');
  });

  it('EXECUTED: an independently existing outcome letter is still honoured', () => {
    // IR-0 must not suppress a REAL outcome letter. Only the report is refused.
    const withRealOutcome = caseWithReport({
      meetings: [{ id: 'm1', type: 'Disciplinary', date: '2026-10-06', letterOutput: 'Dear ZZ, ...', letterType: 'outcome' }],
    });
    expect(hasLetterType(withRealOutcome.meetings, 'outcome')).toBe(true);
    expect(getCaseStage({ ...withRealOutcome, stage: null })).toBe('outcome');
  });

  it('opening the report is side-effect free and names the document (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const from = app.indexOf('const openInvestigationReport');
    expect(from).toBeGreaterThan(-1);
    const body = app.slice(from, app.indexOf('};', from));
    expect(body).toMatch(/setActiveLetter\(INVESTIGATION_REPORT_DOC\)/);
    // Local state and navigation only — no write of any kind.
    expect(body).not.toMatch(/saveCases|audit\(|supabase|handleLetter/);
  });

  it('both former entry points now route through it (wiring)', () => {
    const tab = stripComments(read('src/components/caseTabs/MeetingsTab.jsx'));
    const docs = stripComments(read('src/components/caseTabs/DocumentsTab.jsx'));
    expect(tab).toMatch(/onOpenInvestigationReport\?\.\(cs\)/);
    // The un-named route is gone from the report button.
    expect(tab).not.toMatch(/setLetterOutput\(cs\.investigationReport\)/);
    expect(docs).toMatch(/d\.kind==="report"&&onOpenInvestigationReport/);
  });

  it('EXECUTED: the save guard refuses the report and permits every real letter', () => {
    expect(refuseInvestigationReportSave(INVESTIGATION_REPORT_DOC)).toBe(INVESTIGATION_REPORT_SAVE_REFUSAL);
    expect(refuseInvestigationReportSave(INVESTIGATION_REPORT_DOC).ok).toBe(false);
    for (const letter of ['outcome', 'invite', 'appeal', 'suspension', undefined, null, '']) {
      expect(refuseInvestigationReportSave(letter)).toBe(null);
    }
  });

  it('the save path consults that guard unconditionally (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const from = app.indexOf('const saveMeetingToCase = async');
    const body = app.slice(from, app.indexOf('saveMeetingToCaseImpl(signatureInfo)', from));
    // Pinned to the exact shape, so a short-circuited guard
    // (`if(false && ...)`) fails this — an earlier version asserted only that
    // the call appeared somewhere, and a disabling mutation survived it.
    expect(body).toMatch(/const reportSaveRefusal = refuseInvestigationReportSave\(activeLetter\);/);
    expect(body).toMatch(/\n\s*if\(reportSaveRefusal\) \{/);
    expect(body).toMatch(/return reportSaveRefusal;/);
    // And it is checked BEFORE the in-flight lock, so it cannot be skipped.
    expect(body.indexOf('refuseInvestigationReportSave')).toBeLessThan(body.indexOf('savingMeetingRef.current'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('IR-0.2 — an existing report is never silently destroyed', () => {
  it('EXECUTED: detects an existing report, and ignores empty or whitespace', () => {
    expect(hasExistingReport(caseWithReport())).toBe(true);
    expect(hasExistingReport({ investigationReport: '' })).toBe(false);
    expect(hasExistingReport({ investigationReport: '   \n ' })).toBe(false);
    expect(hasExistingReport({})).toBe(false);
    expect(hasExistingReport(null)).toBe(false);
  });

  it('the wording states the destruction plainly and is not called "regenerate"', () => {
    const copy = describeReplaceExistingReport({ reportDate: '2026-10-07T09:00:00.000Z', fmtDate: () => '07/10/2026' });
    expect(copy.title).toBe('An investigation report already exists.');
    expect(copy.message).toMatch(/REPLACE the current draft/);
    expect(copy.message).toMatch(/07\/10\/2026/);
    // The brief: do not hide the destructive effect, and do not imply the
    // previous report remains available.
    expect(copy.message).toMatch(/cannot yet keep previous versions/i);
    expect(copy.message).toMatch(/will not be recoverable/i);
    expect(copy.confirmLabel).toBe('Replace current draft');
    expect(copy.cancelLabel).toBe('Cancel');
    const all = `${copy.title} ${copy.message} ${copy.confirmLabel}`.toLowerCase();
    expect(all).not.toMatch(/regenerat/);
    expect(all).not.toMatch(/version history is available|previous version will be kept/);
  });

  it('works without a date, rather than printing an empty bracket', () => {
    const copy = describeReplaceExistingReport();
    expect(copy.message).toMatch(/REPLACE the current draft\./);
    expect(copy.message).not.toMatch(/\(\s*\)/);
    expect(copy.message).not.toMatch(/drafted (null|undefined)/);
  });

  it('EXECUTED: generation is refused outright when a report exists and no decision was taken', () => {
    // The refusal reason the write boundary returns.
    expect(REPORT_GENERATION.NEEDS_REPLACE_DECISION).toBe('needs_replace_decision');
    expect(describeReportGeneration(REPORT_GENERATION.NEEDS_REPLACE_DECISION))
      .toMatch(/already exists/i);
  });

  it('the write boundary enforces it, and the consent is taken before anything else (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    expect(conclude).toMatch(/hasExistingReport\(cs\) && !replaceExisting/);
    expect(conclude).toMatch(/NEEDS_REPLACE_DECISION/);

    const attempt = app.slice(app.indexOf('const attemptSubmitInvestigation = async'));
    const body = attempt.slice(0, attempt.indexOf('\n  };'));
    // Consent first, THEN the quality gaps, then the submission.
    const iConsent = body.indexOf('describeReplaceExistingReport');
    const iGaps = body.indexOf('computeInvestigationQualityGaps');
    const iFinalize = body.indexOf('finalizeInvestigationSubmission');
    expect(iConsent).toBeGreaterThan(-1);
    expect(iConsent).toBeLessThan(iGaps);
    expect(iGaps).toBeLessThan(iFinalize);
    // Cancelling returns without submitting.
    expect(body).toMatch(/if\(!confirmed\) \{[^}]*return; \}/);
  });

  it('a returned investigation is protected the same way, and stays revisable', () => {
    // HR "returned" reverts the stage and leaves the report in place — exactly
    // the state in which the old code overwrote it silently.
    const returned = caseWithReport({ stage: 'investigation' });
    expect(hasExistingReport(returned)).toBe(true);
    expect(getCaseStage(returned)).toBe('investigation');
    // The guard is on the REPORT's existence, not the stage, so a returned case
    // is covered — and because the decision is a confirm rather than a block,
    // the investigator can still deliberately replace it.
    const app = stripComments(read('src/App.jsx'));
    expect(app).toMatch(/if\(actionId==="returned"\)/);
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    expect(conclude).not.toMatch(/stage\s*===\s*['"]investigation['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('IR-0.3 — completion and persistence must be true', () => {
  it('EXECUTED: a complete generation is accepted', () => {
    expect(assessReportGeneration({ text: REPORT_TEXT, truncated: false })).toEqual({ ok: true, reason: 'ok' });
  });

  it('EXECUTED: a truncated generation is refused, and is not a report', () => {
    const out = assessReportGeneration({ text: REPORT_TEXT, truncated: true });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(REPORT_GENERATION.TRUNCATED);
    expect(describeReportGeneration(out.reason)).toMatch(/cut off before it finished/i);
    expect(describeReportGeneration(out.reason)).toMatch(/nothing on the case has changed/i);
  });

  it('EXECUTED: empty or whitespace output is refused', () => {
    for (const text of ['', '   \n  ', null, undefined]) {
      expect(assessReportGeneration({ text }).ok).toBe(false);
      expect(assessReportGeneration({ text }).reason).toBe(REPORT_GENERATION.EMPTY);
    }
  });

  it('EXECUTED: truncation is decided by the stream, not by text length', () => {
    // A long complete report is fine; a short truncated one is not. Length is
    // not the signal — stopReason is.
    expect(assessReportGeneration({ text: 'x'.repeat(20000), truncated: false }).ok).toBe(true);
    expect(assessReportGeneration({ text: 'short', truncated: true }).ok).toBe(false);
  });

  it('streamClaude is asked for completion metadata, and it is consumed (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    // The 5th argument exists for exactly this and was previously omitted.
    expect(conclude).toMatch(/3400,/);
    expect(conclude).toMatch(/c => \{ completion = c; \}\)/);
    expect(conclude).toMatch(/truncated: !!completion\?\.truncated/);
    // And the result gates everything that follows.
    expect(conclude).toMatch(/if\(!assessed\.ok\)/);
  });

  it('persistence is awaited, and success is announced only after it lands (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    // changedId passed, so saveCases returns the real promise instead of the
    // fire-and-forget bulk branch.
    expect(conclude).toMatch(/const saved = await saveCases\(\s*\n?[\s\S]{0,260}?caseId\);/);
    const iSaved = conclude.indexOf('const saved = await saveCases');
    const iGuard = conclude.indexOf('if(!saved?.ok)');
    expect(iSaved).toBeGreaterThan(-1);
    expect(iGuard).toBeGreaterThan(iSaved);
    // IR-0.2a moved the action string behind reportAuditAction(), because a
    // replacement must not audit as a first generation. The INVARIANT is
    // unchanged and is what this asserts: EVERY audit call and EVERY success
    // toast comes after the persistence check. Asserting one literal string
    // would have passed again the moment a second call site was added.
    const auditCalls = [...conclude.matchAll(/\baudit\(/g)].map(m => m.index);
    const successToasts = [...conclude.matchAll(/showToast\("Investigation report (generated|replaced)"\)/g)].map(m => m.index);
    expect(auditCalls.length).toBeGreaterThan(0);
    expect(successToasts.length).toBeGreaterThan(0);
    for (const i of auditCalls) expect(i).toBeGreaterThan(iGuard);
    for (const i of successToasts) expect(i).toBeGreaterThan(iGuard);
  });

  it('the report, its date and the stage are one case update — no partial write (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    // All three fields in a single spread on a single cases.map — one row write.
    expect(conclude).toMatch(/\{\.\.\.x,investigationReport:text,investigationReportDate:[^,]+,stage:"inv_report"\}/);
    expect(conclude.match(/await saveCases\(/g) || []).toHaveLength(1);
  });

  it('the workflow does not advance unless the report was written (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const from = app.indexOf('const finalizeInvestigationSubmission');
    const body = app.slice(from, app.indexOf('const attemptSubmitInvestigation', from));
    expect(body).toMatch(/const result = await concludeInvestigation\(caseId, \{ replaceExisting \}\)/);
    expect(body).toMatch(/if\(!result\?\.ok\) return result;/);
    // And the two advancement effects come after that guard.
    const iGuard = body.indexOf('if(!result?.ok) return result;');
    expect(body.indexOf('requestHrReview')).toBeGreaterThan(iGuard);
    expect(body.indexOf('toggleCaseTaskDone')).toBeGreaterThan(iGuard);
  });

  it('the concurrency lock is released on every path (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    expect(conclude).toMatch(/if\(concludingInvestigation\) return \{ ok:false, reason:'in_flight' \}/);
    expect(conclude).toMatch(/\} finally \{[\s\S]*?setConcludingInvestigation\(false\)/);
  });

  it('EXECUTED: every refusal reason has manager-facing wording', () => {
    for (const reason of Object.values(REPORT_GENERATION)) {
      if (reason === REPORT_GENERATION.OK) continue;
      expect(describeReportGeneration(reason), reason).toBeTruthy();
    }
    expect(describeReportGeneration('something_else')).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('stage integrity — the report is none of these things', () => {
  it('EXECUTED: a report alone yields inv_report, never outcome or disciplinary', () => {
    const cs = caseWithReport({ stage: null });
    expect(getCaseStage(cs)).toBe('inv_report');
    expect(getCaseStage(cs)).not.toBe('outcome');
    expect(getCaseStage(cs)).not.toBe('disciplinary');
  });

  it('EXECUTED: a report does not create an outcome, a finding or a decision', () => {
    const cs = caseWithReport();
    expect(cs.outcome).toBeUndefined();
    expect(hasLetterType(cs.meetings, 'outcome')).toBe(false);
    // No allegation status, no conclusion, no case_decision is touched by any of
    // this — IR-0 writes only investigationReport/Date/stage.
    const app = stripComments(read('src/App.jsx'));
    const conclude = app.slice(app.indexOf('const concludeInvestigation = async'), app.indexOf('const finalizeInvestigationSubmission'));
    // It READS the structured conclusion — that is correct and long-standing
    // (allegationContext quotes it, or says "not recorded"). The claim here is
    // that it WRITES none of the authoritative decision surfaces.
    expect(conclude).toContain('a.investigationConclusion');          // read
    for (const f of ['case_decisions', 'record_case_decision', 'recordInvestigationConclusion',
      'saveAllegationToDB', 'investigation_conclusion:']) {
      expect(conclude).not.toContain(f);                              // never written
    }
    // The only case fields it writes are the three in the single update.
    const writes = [...conclude.matchAll(/\{\.\.\.x,([^}]*)\}/g)].map(m => m[1]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe('investigationReport:text,investigationReportDate:new Date().toISOString(),stage:"inv_report"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('nothing else was touched', () => {
  it('IR-1 items are still deferred — the report context is unchanged', () => {
    const app = stripComments(read('src/App.jsx'));
    // Still only m.record, as before. IR-1 changes this, not IR-0.
    expect(app).toContain('"Investigation meeting "+(i+1)+" — "+m.date+nl+m.record');
    // The hearing pack is untouched.
    const pack = stripComments(read('src/lib/hearingPack.js'));
    expect(pack).not.toMatch(/responseResolution|proposedCorrection|responseAddendum/);
  });

  it('no adoption or versioning was introduced', () => {
    const app = stripComments(read('src/App.jsx'));
    expect(app).not.toMatch(/investigationReportAdoptedBy|investigationReportVersions|adoptInvestigationReport/);
  });

  it('readiness logic is unchanged', () => {
    const tab = stripComments(read('src/components/caseTabs/MeetingsTab.jsx'));
    expect(tab).toContain('invMeetings.some(m=>m.record)');
  });

  it('no schema change', () => {
    const files = fs.readdirSync(path.resolve(__dirname, '..', '..', 'supabase'));
    expect(files.some(f => /investigation_report/i.test(f))).toBe(false);
  });
});
