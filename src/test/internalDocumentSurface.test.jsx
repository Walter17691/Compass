import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import {
  INVESTIGATION_REPORT_DOC, isInternalCaseDocument, documentCapabilities,
  refuseCorrespondence, CORRESPONDENCE_ACTION, refuseInvestigationReportSave,
} from '../lib/investigationReportDocument.js';
import { LetterScreen } from '../screens/LetterScreen.jsx';

// ─────────────────────────────────────────────────────────────────────────
// IR-SURF-01 — AN INTERNAL CASE DOCUMENT IS NOT CORRESPONDENCE.
//
// ┌─ WHAT IR-0 EXPOSED, AND PARTLY CAUSED ──────────────────────────────────┐
// │ Before IR-0 the report reached LetterScreen as activeLetter="outcome", so │
// │   outcomeNotYetDecided = activeLetter==="outcome" && !outcomeRecorded     │
// │ was true on a case with no outcome, and canIssue was false — which        │
// │ incidentally disabled Download, Gmail, Outlook, Send from Compass, Send   │
// │ for acknowledgement, Print and Copy.                                     │
// │                                                                         │
// │ Giving the report its correct identity removed that clause, and the report │
// │ is also (correctly) excluded from EMPLOYEE_DIRECTED_LETTER_TYPES so        │
// │ grounding passes. The only remaining gate became one "Approve for         │
// │ sending" click — on an internal, pre-decision document containing          │
// │ Compass's own PART 2 advisory interpretation.                            │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The rule is a DOMAIN distinction, so these tests check the boundary as well
// as the chrome. A hidden button is one UI regression from being live again.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t.replace(/^\s*\/\/.*$/gm, '');

const REPORT = '## Executive Summary\n\nThe investigation considered two meetings.\n\n---\n\n## PART 1 — Evidence on Record';
// Grounded: the salutation matches caseInfo.employee, so letterGroundingFailed
// is false and the approval gate is the only thing under test.
const LETTER = 'Dear ZZ Test,\n\nFollowing the hearing on 5 October...';

const GENUINE_LETTERS = ['outcome', 'invite', 'appeal', 'suspension', 'meeting-confirmation'];

function renderScreen(activeLetter, output, over = {}) {
  const noop = () => {};
  return render(<LetterScreen
    activeLetter={activeLetter} letterOutput={output}
    handleLetter={noop} aiProcessing={false}
    caseInfo={{ employee: 'ZZ Test', manager: 'A Manager', email: 'zz@example.test' }}
    setScreen={noop} setLetterOutput={noop}
    signature={null} setSignature={noop} setShowSigPad={noop}
    letterIsApproved={false} approveLetter={noop} letterApproval={null}
    /* over may set letterIsApproved true, in which case a matching approval
       object must be supplied — the real app derives one from the other. */
    triggerWithSig={noop} pdfGenerating={false}
    saveMeetingToCase={async () => ({ ok: true })}
    onSendFromCompass={noop} onSendForAcknowledgement={noop}
    meetingType={{ label: 'Investigation' }} outcomeRecorded={false}
    {...over}
  />);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('A/B. the investigation report presents as an internal document', () => {
  it('is classified as internal, and nothing else is', () => {
    expect(isInternalCaseDocument(INVESTIGATION_REPORT_DOC)).toBe(true);
    for (const l of [...GENUINE_LETTERS, 'witness-invitation', 'oh-consent-request', undefined, null]) {
      expect(isInternalCaseDocument(l)).toBe(false);
    }
  });

  it('EXECUTED: every correspondence capability is off, every internal one on', () => {
    const caps = documentCapabilities(INVESTIGATION_REPORT_DOC);
    // Deep equality on purpose: a new capability cannot be added without this
    // test being updated deliberately. IR-SURF-01a added mayAskWhy/mayEditInline
    // and this assertion is what surfaced it.
    expect(caps).toEqual({
      internal: true, label: 'Investigation report',
      mayApproveForSending: false, maySendToEmployee: false, mayESign: false,
      maySaveAsLetter: false, maySwitchDocumentType: false,
      mayExport: true, exportRequiresApproval: false,
      mayAskWhy: false, mayEditInline: false,
    });
  });

  it('the page says what the document is, never "letter"', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT);
    expect(screen.getByText('Investigation report')).toBeTruthy();
    expect(screen.getByText('Internal case document')).toBeTruthy();
    const body = document.body.textContent;
    expect(body).not.toMatch(/Generate letter/);
    expect(body).not.toMatch(/This letter was drafted by AI/);
    expect(body).not.toMatch(/Approve for sending/);
  });

  it('shows no document-type navigation', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT);
    for (const label of ['Outcome letter', 'Invitation', 'Appeal outcome', 'Suspension', 'Meeting confirmation']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('shows no e-signature strip and no employee-send controls', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT);
    expect(screen.queryByText(/E-signature:/)).toBeNull();
    for (const label of [/Send via Gmail/, /Send via Outlook/, /Send from Compass/,
      /Send for acknowledgement/, /Approve for sending/, /Already approved/, /Save to case/]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('still renders the report itself', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT);
    expect(screen.getByText('Executive Summary')).toBeTruthy();
    expect(screen.getByText(/The investigation considered two meetings/)).toBeTruthy();
    // And no raw Markdown, per the IR-0 presentation fix.
    expect(document.body.textContent).not.toMatch(/##|---/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. internal export is permitted WITHOUT correspondence approval', () => {
  it('EXECUTED: export does not require approval for an internal document', () => {
    const caps = documentCapabilities(INVESTIGATION_REPORT_DOC);
    expect(caps.mayExport).toBe(true);
    expect(caps.exportRequiresApproval).toBe(false);
  });

  it('Download, Print and Copy are all enabled with letterIsApproved false', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT, { letterIsApproved: false });
    for (const name of [/Download/, /^Print$/, /Copy/]) {
      expect(screen.getByRole('button', { name }).disabled, String(name)).toBe(false);
    }
  });

  it('a genuine letter still requires approval to export — unchanged', () => {
    renderScreen('invite', LETTER, { letterIsApproved: false });
    for (const name of [/Download/, /^Print$/, /Copy/]) {
      expect(screen.getByRole('button', { name }).disabled, String(name)).toBe(true);
    }
  });

  it('a genuine letter with approval can export — proving the gate, not a block', () => {
    renderScreen('invite', LETTER, { letterIsApproved: true, letterApproval: { by: 'A Manager', at: '2026-10-07T00:00:00.000Z', type: 'invite' } });
    expect(screen.getByRole('button', { name: /^Print$/ }).disabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. the boundary fails closed — this is not CSS-only hiding', () => {
  it('EXECUTED: every correspondence action is refused for the report', () => {
    for (const action of Object.values(CORRESPONDENCE_ACTION)) {
      const refusal = refuseCorrespondence(INVESTIGATION_REPORT_DOC, action);
      expect(refusal, action).toBeTruthy();
      expect(refusal.ok).toBe(false);
      expect(refusal.reason).toBe(`internal_document_${action}`);
      expect(refusal.message.length).toBeGreaterThan(20);
    }
  });

  it('EXECUTED: every correspondence action is PERMITTED for a genuine letter', () => {
    for (const letter of GENUINE_LETTERS) {
      for (const action of Object.values(CORRESPONDENCE_ACTION)) {
        expect(refuseCorrespondence(letter, action), `${letter}/${action}`).toBe(null);
      }
    }
  });

  it('EXECUTED: an unknown action is still refused for an internal document', () => {
    // Fails CLOSED: a new correspondence action added later is refused by
    // default rather than permitted because nobody updated a message map.
    const refusal = refuseCorrespondence(INVESTIGATION_REPORT_DOC, 'some_future_send');
    expect(refusal.ok).toBe(false);
    expect(refusal.message).toMatch(/internal case document/i);
  });

  it('EXECUTED: the save-as-letter path is refused (IR-0, still holding)', () => {
    expect(refuseInvestigationReportSave(INVESTIGATION_REPORT_DOC).ok).toBe(false);
    for (const l of GENUINE_LETTERS) expect(refuseInvestigationReportSave(l)).toBe(null);
  });

  it('the App action handlers consult the boundary, not the button (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    // approveLetter
    const approve = app.slice(app.indexOf('const approveLetter = ()'), app.indexOf('const [riskScore'));
    expect(approve).toMatch(/refuseCorrespondence\(activeLetter, CORRESPONDENCE_ACTION\.APPROVE_FOR_SENDING\)/);
    expect(approve).toMatch(/if\(refusal\) \{/);
    // triggerWithSig: transmission refused, export allowed without approval
    const trigger = app.slice(app.indexOf('const triggerWithSig = action'), app.indexOf('const doSend = async'));
    expect(trigger).toMatch(/documentCapabilities\(activeLetter\)/);
    expect(trigger).toMatch(/if\(caps\.internal\)/);
    expect(trigger).toMatch(/action !== "download"/);
    expect(trigger).toMatch(/doSend\(action, null\)/);
    // and export must not be behind letterIsApproved for internal docs
    expect(trigger.indexOf('if(caps.internal)')).toBeLessThan(trigger.indexOf('if(!letterIsApproved)'));
    // the two send props
    expect(app).toMatch(/onSendFromCompass=\{\(\)=>\{const r=refuseCorrespondence\(activeLetter,CORRESPONDENCE_ACTION\.SEND_FROM_COMPASS\)/);
    expect(app).toMatch(/CORRESPONDENCE_ACTION\.SEND_FOR_ACKNOWLEDGEMENT\)/);
  });

  it('the exported PDF is titled as the document, not as a letter (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const gen = app.slice(app.indexOf('const generatePDF = async sig'), app.indexOf('const generateMeetingRecordPDF'));
    // PDF-01b hoisted the lookup into a `caps` local. The INVARIANT asserted
    // here is unchanged — the heading comes from the document capability's
    // label, falling back to the meeting type — not the expression's shape.
    expect(gen).toMatch(/documentCapabilities\(activeLetter\)/);
    expect(gen).toMatch(/heading: caps\.label \|\|/);
  });

  it('LetterScreen adds no activeLetter string comparisons of its own (wiring)', () => {
    const screenSrc = stripComments(read('src/screens/LetterScreen.jsx'));
    expect(screenSrc).toMatch(/const caps = documentCapabilities\(activeLetter\);/);
    // The only activeLetter comparisons are the TWO pre-existing outcome ones
    // (the outcomeNotYetDecided gate and the stale-outcome-letter notice).
    // Nothing new was added — the capability model carries the new rule.
    const comparisons = screenSrc.match(/activeLetter\s*===\s*["'][a-z-]+["']/g) || [];
    expect(comparisons).toEqual(['activeLetter==="outcome"', 'activeLetter==="outcome"']);
    expect(screenSrc).not.toMatch(/activeLetter\s*===\s*["']investigation-report["']/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. genuine letter types are untouched', () => {
  it('EXECUTED: capabilities are identical to the pre-IR-SURF-01 behaviour', () => {
    for (const letter of [...GENUINE_LETTERS, 'witness-invitation', 'no-case-answer']) {
      expect(documentCapabilities(letter)).toEqual({
        internal: false, label: null,
        mayApproveForSending: true, maySendToEmployee: true, mayESign: true,
        maySaveAsLetter: true, maySwitchDocumentType: true,
        mayExport: true, exportRequiresApproval: true,
        mayAskWhy: true, mayEditInline: true,
      });
    }
  });

  it('a letter still shows its full correspondence surface', () => {
    renderScreen('invite', LETTER, { letterIsApproved: false });
    expect(screen.getByText('Invitation', { selector: 'h1,h2,div' })).toBeTruthy();
    expect(screen.getByText('Generate letter')).toBeTruthy();
    expect(screen.getByText(/E-signature:/)).toBeTruthy();
    expect(screen.getByText(/Approve for sending/)).toBeTruthy();
    expect(screen.getByText(/Send via Gmail/)).toBeTruthy();
    expect(screen.getByText(/Send via Outlook/)).toBeTruthy();
    expect(screen.getByText(/Save to case/)).toBeTruthy();
    // And the type switcher.
    for (const label of ['Outcome letter', 'Appeal outcome', 'Suspension']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('the outcome gate is unchanged for an outcome letter with no recorded outcome', () => {
    renderScreen('outcome', LETTER, { letterIsApproved: true, outcomeRecorded: false, letterApproval: { by: 'A Manager', at: '2026-10-07T00:00:00.000Z', type: 'outcome' } });
    // Still blocked, and still for the original reason — IR-SURF-01 must not
    // have weakened the pre-existing outcome gate while decoupling export.
    expect(screen.getByRole('button', { name: /Download/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /^Print$/ }).disabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E/G. nothing is mutated and no second source of truth exists', () => {
  it('the report is read from the case, never copied into letterOutput persistence', () => {
    const app = stripComments(read('src/App.jsx'));
    const opener = app.slice(app.indexOf('const openInvestigationReport'), app.indexOf('const saveMeetingToCase'));
    expect(opener).toMatch(/setLetterOutput\(cs\.investigationReport\)/);
    expect(opener).not.toMatch(/saveCases|audit\(|supabase/);
    // Exactly one writer of the report in the whole app, as established by IR-0.
    expect((app.match(/investigationReport:\s*text/g) || []).length).toBe(1);
    expect(app).not.toMatch(/letterOutput:\s*cs\.investigationReport/);
  });

  it('no export audit behaviour was introduced', () => {
    const app = stripComments(read('src/App.jsx'));
    const trigger = app.slice(app.indexOf('const triggerWithSig = action'), app.indexOf('const doSend = async'));
    expect(trigger).not.toMatch(/audit\(/);
  });
});
