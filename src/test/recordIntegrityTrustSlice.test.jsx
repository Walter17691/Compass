import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { SignedRecordModal } from '../components/SignedRecordModal.jsx';
import { transitionMeeting } from '../lib/meetingWrites.js';
import { MEETING_STATUS, declaredStatus } from '../lib/meetingLifecycle.js';
import {
  ESIGNATURE_STATUS, isTerminalStatus, isConfirmationSettled,
  isParticipantResponse, isConfirmedByParticipant, signatureStatusLabel,
} from '../lib/eSignature.js';
import { employeeFacingSnapshot, snapshotDivergence } from '../lib/signedSnapshot.js';
import { getNextStep } from '../lib/nextStep.js';

// ═══════════════════════════════════════════════════════════════════════════
// RECORD INTEGRITY — THE SIGNED COPY IS THE SIGNED COPY.
//
// ┌─ WHAT THIS FILE PROVED BEFORE THE FIX ──────────────────────────────────┐
// │ Written first, as a reproduction, and every assertion asserted the BROKEN │
// │ behaviour so the defect was a measured fact rather than a claim:          │
// │                                                                         │
// │   · signing_requests.document IS written once and never patched — the     │
// │     one part of the architecture that was already right.                 │
// │   · a COMPLETED, SIGNED meeting could still be re-saved, overwriting      │
// │     `record` and `signDocument` while every signature fact survived.      │
// │   · SignedRecordModal rendered `meeting.record` — the current, mutable    │
// │     text — under the heading "Signed copy… Signed by X on Y".            │
// │   · the alteration produced only a generic "Meeting saved" audit row.    │
// │   · a declined or expired INVESTIGATION record stranded the case on      │
// │     "Send investigation record for signature" forever.                   │
// │                                                                         │
// │ Those assertions are now inverted. The file is kept rather than deleted   │
// │ because a defect this specific deserves a permanent guard, and the        │
// │ inversion is the proof that the guard is real.                          │
// └─────────────────────────────────────────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════════════

const app = () => readFileSync('src/App.jsx', 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

// Asserts a guard EXISTS and IS NOT NEUTERED.
//
// `expect(src).toMatch(/isExpired\(x\)/)` passes for `if(false && isExpired(x))`,
// because the substring survives. Three mutations exploited exactly that. This
// requires the condition to begin where the guard begins, so a prepended `false &&`
// (or any other short-circuit) fails.
function expectLiveGuard(src, condition) {
  const esc = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  expect(src, `guard must exist: ${condition}`).toMatch(new RegExp(esc));
  expect(src, `guard must not be disabled: ${condition}`)
    .toMatch(new RegExp(`if\\s*\\(\\s*${esc}`));
  expect(src, `no falsy short-circuit before: ${condition}`)
    .not.toMatch(new RegExp(`if\\s*\\(\\s*(?:false|0|null)\\s*&&[^)]*${esc}`));
}

const ORIGINAL = 'ORIGINAL RECORD: the employee said they were unaware of the rota change.';
const ALTERED  = 'ALTERED RECORD: the employee admitted they knew about the rota change.';

const signedMeeting = (over = {}) => ({
  id: 'm1', caseId: 'c1', type: 'Investigation', date: '2026-10-01',
  status: MEETING_STATUS.COMPLETED,
  record: ORIGINAL, signDocument: ORIGINAL,
  signId: 'sign-1', signStatus: 'signed', signedAt: '2026-10-02T10:00:00Z',
  signerName: 'Sam Employee', signature: 'data:image/png;base64,AAA',
  ...over,
});

// The authoritative snapshot, as api/signing.js's internal GET returns it.
const snapshotFor = (document = ORIGINAL, over = {}) => async () => ({
  sign_id: 'sign-1', document, status: 'signed',
  signed_at: '2026-10-02T10:00:00Z', employee_name: 'Sam Employee',
  signature: 'data:image/png;base64,AAA', ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE SNAPSHOT IS, AND REMAINS, IMMUTABLE  (brief tests 1, 20)
// ═══════════════════════════════════════════════════════════════════════════
describe('the issued document is written once and never rewritten', () => {
  it('one INSERT supplies `document`, and no PATCH anywhere mentions it', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    expect((api.match(/sign_id: newSignId, document,/g) || [])).toHaveLength(1);
    const patchBodies = [...api.matchAll(/method: 'PATCH'[\s\S]{0,500}?\}\)/g)].map(m => m[0]);
    expect(patchBodies.length).toBeGreaterThan(0);
    patchBodies.forEach(b => expect(b).not.toMatch(/\bdocument\b\s*:/));
  });

  it('the migration does not touch document, signature or any stored record', () => {
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8')
      .replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/update public\.signing_requests/i);
    expect(sql).not.toMatch(/alter column/i);
    expect(sql).toMatch(/add column if not exists participant_comment text/);
  });

  it('a later save still cannot reach the snapshot — only the working record moves', async () => {
    let saved = null;
    const result = await transitionMeeting({
      cases: [{ id: 'c1', meetings: [signedMeeting()] }], caseId: 'c1', meetingId: 'm1',
      allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED],
      toStatus: MEETING_STATUS.COMPLETED,
      patch: { record: ALTERED, signDocument: ALTERED },
      saveCases: async next => { saved = next; return { ok: true }; },
    });
    expect(result.ok).toBe(true);
    const after = saved[0].meetings[0];
    // Corrections remain POSSIBLE — the brief forbids making them impossible.
    expect(after.record).toContain('ALTERED RECORD');
    expect(declaredStatus(after)).toBe(MEETING_STATUS.COMPLETED);
    // What changed is that this no longer decides what "Signed copy" shows.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. "SIGNED COPY" SHOWS THE SIGNED COPY  (brief tests 2, 3, 4)
// ═══════════════════════════════════════════════════════════════════════════
describe('the signed copy is read from the snapshot, never from current text', () => {
  it('renders the ISSUED text even when the working record has been altered', async () => {
    render(<SignedRecordModal meeting={signedMeeting({ record: ALTERED })}
      fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={snapshotFor(ORIGINAL)} />);

    await waitFor(() => expect(screen.getByText(/ORIGINAL RECORD/)).toBeInTheDocument());
    // THE DEFECT, INVERTED: the altered text is nowhere on screen.
    expect(screen.queryByText(/ALTERED RECORD/)).not.toBeInTheDocument();
    expect(screen.getByText('Signed copy')).toBeInTheDocument();
  });

  it('says so, plainly, when the working record has diverged', async () => {
    render(<SignedRecordModal meeting={signedMeeting({ record: ALTERED })}
      fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={snapshotFor(ORIGINAL)} />);
    await waitFor(() => expect(screen.getByText(/The working record has changed since this was issued/)).toBeInTheDocument());
  });

  it('shows no divergence notice when nothing has changed', async () => {
    render(<SignedRecordModal meeting={signedMeeting()}
      fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={snapshotFor(ORIGINAL)} />);
    await waitFor(() => expect(screen.getByText(/ORIGINAL RECORD/)).toBeInTheDocument());
    expect(screen.queryByText(/has changed since this was issued/)).not.toBeInTheDocument();
  });

  it('NEVER falls back to current text when the snapshot cannot be loaded', async () => {
    render(<SignedRecordModal meeting={signedMeeting({ record: ALTERED })}
      fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={async () => { throw new Error('offline'); }} />);
    await waitFor(() => expect(screen.getByText(/could not be retrieved/)).toBeInTheDocument());
    // A silent fallback would be the same defect under another code path.
    expect(screen.queryByText(/ALTERED RECORD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ORIGINAL RECORD/)).not.toBeInTheDocument();
  });

  it('and says nothing was stored when the snapshot is empty', async () => {
    render(<SignedRecordModal meeting={signedMeeting()}
      fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={async () => ({ document: '' })} />);
    await waitFor(() => expect(screen.getByText(/no stored copy/)).toBeInTheDocument());
  });

  it('the ACKNOWLEDGED copy behaves identically', async () => {
    render(<SignedRecordModal
      meeting={signedMeeting({ signStatus: 'acknowledged', signature: null, record: ALTERED })}
      fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={snapshotFor(ORIGINAL, { status: 'acknowledged', signature: null })} />);
    await waitFor(() => expect(screen.getByText('Acknowledged copy')).toBeInTheDocument());
    expect(screen.getByText(/ORIGINAL RECORD/)).toBeInTheDocument();
    expect(screen.queryByText(/ALTERED RECORD/)).not.toBeInTheDocument();
  });

  it('a DISPUTED record is never labelled as signed or acknowledged', async () => {
    render(<SignedRecordModal
      meeting={signedMeeting({ signStatus: 'disputed', signature: null, participantComment: 'I never said that.' })}
      fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={snapshotFor(ORIGINAL, { status: 'disputed', participant_comment: 'I never said that.' })} />);
    await waitFor(() => expect(screen.getByText(/participant disagreed/)).toBeInTheDocument());
    expect(screen.queryByText('Signed copy')).not.toBeInTheDocument();
    expect(screen.queryByText('Acknowledged copy')).not.toBeInTheDocument();
  });

  it('the modal reads the snapshot and no longer reads meeting.record for the copy', () => {
    const code = stripJs(readFileSync('src/components/SignedRecordModal.jsx', 'utf8'));
    expect(code).toContain('loadSignedSnapshot');
    expect(code).toContain('snapshot.document');
    // meeting.record survives ONLY as the divergence comparison input.
    expect(code).toMatch(/snapshotDivergence\(snapshot\.document, meeting\.record\)/);
    expect(code).not.toMatch(/cleanRecord/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PARTICIPANT COMMENTS  (brief tests 6, 7)
// ═══════════════════════════════════════════════════════════════════════════
describe('a participant can disagree without their words replacing the record', () => {
  it('the comment is shown alongside the issued document, not merged into it', async () => {
    render(<SignedRecordModal
      meeting={signedMeeting({ signStatus: 'disputed', participantComment: 'I never said that.' })}
      fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={snapshotFor(ORIGINAL, { status: 'disputed', participant_comment: 'I never said that.', participant_comment_at: '2026-10-03' })} />);
    await waitFor(() => expect(screen.getByText('I never said that.')).toBeInTheDocument());
    expect(screen.getByText(/ORIGINAL RECORD/)).toBeInTheDocument();
    expect(screen.getByText(/The record itself was not changed by this comment/)).toBeInTheDocument();
  });

  it('a dispute requires words, server-side', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    expectLiveGuard(api, "outcome === 'disputed' && !commentText");
    expect(api).toMatch(/Please say what you disagree with/);
  });

  it('a dispute writes no signature and no signed_at — nothing was agreed', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    const block = api.slice(api.indexOf("? { status: 'disputed' }") - 400, api.indexOf("? { status: 'disputed' }") + 60);
    expect(block).toContain("{ status: 'disputed' }");
    expect(block).not.toMatch(/disputed'\s*,\s*signature/);
  });

  it('the comment never travels in the manager notification email', () => {
    const api = readFileSync('api/signing.js', 'utf8');
    const emailBlock = api.slice(api.indexOf("from: 'Compass HR"), api.indexOf("Powered by Compass HR"));
    expect(emailBlock).not.toMatch(/esc\(commentText\)/);
    expect(emailBlock).toMatch(/not reproduced in this email/);
  });

  it('a dispute is not agreement, in the vocabulary itself', () => {
    expect(isParticipantResponse(ESIGNATURE_STATUS.DISPUTED)).toBe(true);
    expect(isConfirmedByParticipant(ESIGNATURE_STATUS.DISPUTED)).toBe(false);
    expect(isConfirmedByParticipant(ESIGNATURE_STATUS.DECLINED)).toBe(false);
    expect(isConfirmedByParticipant(ESIGNATURE_STATUS.SIGNED)).toBe(true);
    expect(isConfirmedByParticipant(ESIGNATURE_STATUS.ACKNOWLEDGED)).toBe(true);
    expect(signatureStatusLabel('disputed')).toBe('Responded with comments');
  });

  it('a comment is accepted with ANY outcome, not only a refusal', () => {
    const page = readFileSync('public/sign.html', 'utf8');
    expect((page.match(/participantComment\(\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. PROCEED AFTER REASONABLE OPPORTUNITY  (brief tests 13-18)
// ═══════════════════════════════════════════════════════════════════════════
describe('silence does not authorise progression — a human decision does', () => {
  it('expired is TERMINAL but NOT settled: silence unblocks nothing', () => {
    expect(isTerminalStatus(ESIGNATURE_STATUS.EXPIRED)).toBe(true);
    expect(isConfirmationSettled(ESIGNATURE_STATUS.EXPIRED)).toBe(false);
    ['sent', 'opened', 'pending', undefined, null].forEach(s =>
      expect(isConfirmationSettled(s), String(s)).toBe(false));
  });

  it('every way the matter is genuinely settled', () => {
    ['signed', 'acknowledged', 'declined', 'disputed', 'proceeded'].forEach(s =>
      expect(isConfirmationSettled(s), s).toBe(true));
  });

  it('the proceed action requires an authorised actor', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    const block = api.slice(api.indexOf('if (proceed) {'), api.indexOf('const { orgId } = req.body;'));
    expect(block).toMatch(/requireOrgMembership\(req, res, proceedOrgId\)/);
    expect(block).toMatch(/existing\.org_id !== proceedOrgId/);
    expect(block).toMatch(/Not authorised for this signing request/);
  });

  it('it requires a reason', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    expect(api).toMatch(/if \(!reason\) return res\.status\(400\)/);
    expect(api).toMatch(/Record why you are proceeding without confirmation/);
    // And the database refuses an incomplete decision regardless of the caller.
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8');
    expect(sql).toMatch(/signing_requests_proceed_complete/);
    expect(sql).toMatch(/coalesce\(btrim\(proceed_reason\), ''\) <> ''/);
  });

  it('actor and timestamp are SERVER-derived, and a client value is ignored', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    const block = api.slice(api.indexOf('if (proceed) {'), api.indexOf('const { orgId } = req.body;'));
    expect(block).toMatch(/proceeded_by: proceedAuth\.caller\.id/);
    expect(block).toMatch(/proceeded_at: nowIso/);
    // Nothing READS a client-supplied actor or time. (proceededAt appears in the
    // RESPONSE body, which is the server's own value being echoed back — so the
    // assertion targets reads of req.body, not the identifier anywhere.)
    expect(block).not.toMatch(/req\.body\.proceeded/);
    // Every proceeded_by assignment comes from the verified session. Asserted by
    // enumeration rather than a negative lookahead — `\s*(?!x)` is defeated by
    // backtracking (zero-width match, then the lookahead passes on the space).
    const assignments = [...block.matchAll(/proceeded_by:\s*([A-Za-z_.$]+)/g)].map(m => m[1]);
    expect(assignments).toEqual(['proceedAuth.caller.id']);
    // The client sends only the id and the reason.
    const appSrc = stripJs(app());
    const start = appSrc.indexOf('const proceedWithoutConfirmation');
    expect(start, 'the proceed handler must be findable').toBeGreaterThan(-1);
    // Bounded by a marker that genuinely follows it. Slicing to
    // loadSignedSnapshot produced an EMPTY string (it is defined earlier), and an
    // assertion against '' passes every `not.toMatch` vacuously — the failure mode
    // this whole slice exists to avoid.
    const end = appSrc.indexOf('const sendDocumentForSignature', start);
    expect(end).toBeGreaterThan(start);
    const handler = appSrc.slice(start, end);
    expect(handler.length).toBeGreaterThan(200);
    expect(handler).toMatch(/signId: meeting\.signId, proceed: true, proceedReason: reason, orgId/);
    expect(handler).not.toMatch(/proceeded_by|proceededBy/);
  });

  it('it records what was proceeded past, not merely that something was', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    expect(api).toMatch(/proceeded_from_status: existing\.status/);
  });

  it('a replayed proceed is safe and does not overwrite the first decision', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    expect(api).toMatch(/if \(existing\.status === 'proceeded'\)[\s\S]{0,180}alreadyProceeded: true/);
  });

  it('a participant who already responded cannot be proceeded past', () => {
    const api = stripJs(readFileSync('api/signing.js', 'utf8'));
    expect(api).toMatch(/isParticipantResponse\(existing\.status\)/);
    expect(api).toMatch(/there is nothing to proceed without/);
  });

  it('Compass never judges the opportunity reasonable — it states facts and asks', () => {
    const ho = readFileSync('src/lib/humanOverride.js', 'utf8');
    const fn = ho.slice(ho.indexOf('export async function requestProceedWithoutConfirmation'));
    expect(fn).toMatch(/required:\s*true/);
    expect(fn).toMatch(/Compass does not make that judgement for you/);
    // No pre-filled reason: the field has a placeholder (an example) but no
    // `value`, so nothing is submitted unless a human typed it. `(values.reason||"")`
    // is null-coalescing on read, not a default — hence asserting on the FIELD.
    const field = fn.slice(fn.indexOf('fields: ['), fn.indexOf('confirmLabel'));
    expect(field).toMatch(/required:\s*true/);
    expect(field).not.toMatch(/value:/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. THE INVESTIGATION DEAD END  (brief tests 11, 12, 13)
// ═══════════════════════════════════════════════════════════════════════════
describe('neither branch is stranded, and neither progresses on silence', () => {
  const caseWith = (type, stage, signStatus) => ({
    id: 'c1', caseType: 'misconduct', stage,
    meetings: [{ id: 'm1', type, status: MEETING_STATUS.COMPLETED, record: 'A full record.', signStatus }],
  });

  it('a DECLINED investigation record no longer strands the case', () => {
    const step = getNextStep(caseWith('Investigation', 'investigation', 'declined'), { isHR: true });
    expect(step.action).not.toBe('send_signature');
  });

  it('a DISPUTED investigation record does not strand it either', () => {
    const step = getNextStep(caseWith('Investigation', 'investigation', 'disputed'), { isHR: true });
    expect(step.action).not.toBe('send_signature');
  });

  it('a PROCEEDED record allows the case to continue', () => {
    const step = getNextStep(caseWith('Investigation', 'investigation', 'proceeded'), { isHR: true });
    expect(step.action).not.toBe('send_signature');
  });

  it('but an EXPIRED record still asks — silence is not progression', () => {
    const step = getNextStep(caseWith('Investigation', 'investigation', 'expired'), { isHR: true });
    expect(step.action).toBe('send_signature');
  });

  it('and so does an unanswered one', () => {
    ['sent', 'opened', undefined].forEach(s =>
      expect(getNextStep(caseWith('Investigation', 'investigation', s), { isHR: true }).action, String(s)).toBe('send_signature'));
  });

  it('the disciplinary branch now follows the SAME rule, including on expiry', () => {
    // Previously isTerminalStatus, so `expired` progressed the hearing on
    // silence alone. Both branches now use isConfirmationSettled.
    expect(getNextStep(caseWith('Disciplinary', 'disciplinary', 'expired'), { isHR: true }).action).toBe('send_signature');
    expect(getNextStep(caseWith('Disciplinary', 'disciplinary', 'declined'), { isHR: true }).action).not.toBe('send_signature');
    expect(getNextStep(caseWith('Disciplinary', 'disciplinary', 'proceeded'), { isHR: true }).action).not.toBe('send_signature');
  });

  it('one canonical predicate decides it, in both branches', () => {
    const ns = stripJs(readFileSync('src/lib/nextStep.js', 'utf8'));
    expect(ns).toMatch(/!isConfirmationSettled\(lastInv\?\.signStatus\)/);
    expect(ns).toMatch(/!isConfirmationSettled\(lastDisc\?\.signStatus\)/);
    expect(ns).not.toMatch(/signStatus!=="signed"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. EXPIRY AND REMINDERS  (brief tests 19, 20, 21)
// ═══════════════════════════════════════════════════════════════════════════
describe('expiry is persisted, and a reminder never sends a dead link', () => {
  it('a sweep exists, guarded by the cron secret, on the EXISTING router', () => {
    const router = readFileSync('api/cron/[...action].js', 'utf8');
    expect(router).toContain("case 'expire-signatures'");
    expect(router).toMatch(/expire-signatures'[\s\S]{0,400}CRON_SECRET/);
    // No new Vercel function.
    expect(readFileSync('vercel.json', 'utf8')).toContain('/api/cron/expire-signatures');
  });

  it('the sweep touches only genuinely open, genuinely expired rows', () => {
    const sweep = stripJs(readFileSync('api/cron/_expire-signatures.js', 'utf8'));
    expect(sweep).toMatch(/status=in\.\(sent,opened\)/);
    expect(sweep).toMatch(/expires_at=lt\./);
    expect(sweep).toMatch(/expires_at=not\.is\.null/);
    // Never reopens or relabels a settled row, and never fabricates engagement.
    expect(sweep).not.toMatch(/opened_at/);
    expect(sweep).not.toMatch(/pending/);
  });

  it('the sweep sends nothing', () => {
    const sweep = readFileSync('api/cron/_expire-signatures.js', 'utf8');
    expect(sweep).not.toMatch(/resend|sendEmail|fetch\('https/i);
  });

  it('a reminder refuses an expired or closed request', () => {
    const src = stripJs(app());
    const fn = src.slice(src.indexOf('const resendSignatureReminder'), src.indexOf('const resendSignatureReminder') + 3200);
    expectLiveGuard(fn, 'isExpired(request.expires_at)');
    expectLiveGuard(fn, 'isTerminalStatus(request.status)');
    expect(fn).toMatch(/reason:"expired"/);
    // And it still does not silently extend the window.
    expect(fn).not.toMatch(/computeExpiresAt/);
  });

  it('expiresAt now reaches the client, so the UI can stop saying "awaiting"', () => {
    const src = stripJs(app());
    expect(src).toMatch(/expiresAt: data\.expires_at \|\| null/);
  });

  it('no `delivered` state was introduced anywhere', () => {
    // Comments stripped: the migration's own prose explains WHY there is no
    // `delivered`, and matching prose would fail on the explanation itself.
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/\bdelivered\b/);
    expect(Object.values(ESIGNATURE_STATUS)).not.toContain('delivered');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. AMENDING A CONFIRMED RECORD  (brief test 5)
// ═══════════════════════════════════════════════════════════════════════════
describe('amending a confirmed record is a named, reasoned act', () => {
  it('it requires a reason, and cancelling leaves the record alone', () => {
    const src = app();
    expect(src).toMatch(/title: "Amend a confirmed record\?"/);
    expect(src).toMatch(/key:"reason", label:"Why is this record being amended\?", required:true/);
    expect(src).toMatch(/Amendment cancelled — the record is unchanged/);
  });

  it('it only triggers when the employee-facing text actually changes', () => {
    const src = app();
    expect(src).toMatch(/employeeFacingSnapshot\(meeting\.record\)\.trim\(\) !== employeeFacingSnapshot\(priorMeeting\.record\)\.trim\(\)/);
    expect(src).toMatch(/isConfirmationSettled\(priorMeeting\?\.signStatus\)/);
  });

  it('it emits a distinct, filterable audit action', () => {
    const src = app();
    expect(src).toMatch(/audit\("Confirmed record amended"/);
    // And it is reached by a REAL condition, not stranded behind a falsy one.
    // Raw source, not stripJs: App.jsx contains `/*` inside string literals, so
    // the non-greedy block-comment strip pairs it with a distant `*/` and removes
    // a large span of real code. Worth knowing — that helper is not safe on this file.
    expectLiveGuard(src, 'amendmentReason)');
    expect(src).toMatch(/was \$\{priorMeeting\?\.signStatus \|\| "confirmed"\} — reason/);
  });

  it('divergence detection ignores whitespace but not substance', () => {
    expect(snapshotDivergence('## Meeting Details\nHello  there', '## Meeting Details\nHello there')).toEqual({ diverged: false });
    const d = snapshotDivergence('## Meeting Details\nHello', '## Meeting Details\nHello and more');
    expect(d.diverged).toBe(true);
    expect(d.signedIsSubstringOfCurrent).toBe(true);
  });

  it('divergence returns null rather than "unchanged" when it cannot tell', () => {
    expect(snapshotDivergence('', 'anything')).toBeNull();
    expect(snapshotDivergence(null, 'anything')).toBeNull();
    expect(snapshotDivergence('something', null)).toBeNull();
  });

  it('one shared derivation, no third inline copy', () => {
    const src = app();
    expect((src.match(/indexOf\("## HR Advisor"\)/g) || [])).toHaveLength(0);
    expect((src.match(/employeeFacingSnapshot\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. MEETING COMPLETION AND CONFIRMATION STAY SEPARATE  (brief test 22)
// ═══════════════════════════════════════════════════════════════════════════
describe('a meeting record and its participant confirmation are two lifecycles', () => {
  it('signature state is not consulted to decide meeting completion', () => {
    const lifecycle = stripJs(readFileSync('src/lib/meetingLifecycle.js', 'utf8'));
    expect(lifecycle).not.toMatch(/signStatus/);
    expect(lifecycle).not.toMatch(/isConfirmationSettled|isTerminalStatus/);
  });

  it('a COMPLETED meeting with no confirmation at all is still complete', async () => {
    const { isMeetingComplete } = await import('../lib/meetingLifecycle.js');
    expect(isMeetingComplete({ id: 'm', type: 'Investigation', status: MEETING_STATUS.COMPLETED, record: 'x' })).toBe(true);
    expect(isMeetingComplete({ id: 'm', type: 'Investigation', status: MEETING_STATUS.COMPLETED, record: 'x', signStatus: 'expired' })).toBe(true);
  });

  it('and case STAGE never reads signature state either', () => {
    const stage = stripJs(readFileSync('src/lib/caseStage.js', 'utf8'));
    expect(stage).not.toMatch(/signStatus/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. NOTHING ELSE MOVED  (brief tests 23-27)
// ═══════════════════════════════════════════════════════════════════════════
describe('out-of-scope architecture is untouched', () => {
  it('the migration touches only signing_requests', () => {
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8').replace(/--[^\n]*/g, '');
    const altered = [...sql.matchAll(/alter table public\.(\w+)/g)].map(m => m[1]);
    expect([...new Set(altered)]).toEqual(['signing_requests']);
    expect(sql).not.toMatch(/create policy|drop policy|row level security/i);
    expect(sql).not.toMatch(/case_decisions|allegations|investigation_conclusion/);
  });

  it('D4.3 decisions, Slice 2 conclusions and appeals are not referenced', () => {
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8');
    expect(sql).not.toMatch(/record_case_decision|appeal_outcome|protect_allegations/);
  });

  it('the legacy `pending` status is recognised, not renamed', () => {
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8');
    expect(sql).toMatch(/'pending'/);
    expect(sql).not.toMatch(/update public\.signing_requests\s+set status/i);
    expect(signatureStatusLabel('pending')).toBe('Awaiting signature');
  });

  it('employeeFacingSnapshot preserves the legacy double-cut behaviour', () => {
    const legacy = '## Meeting Details\nBody text here\n## HR Advisor Notes\nInternal advice';
    const out = employeeFacingSnapshot(legacy);
    expect(out).toContain('Body text here');
    expect(out).not.toContain('Internal advice');
  });
});
