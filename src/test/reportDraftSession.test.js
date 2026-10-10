import { describe, it, expect } from 'vitest';
import {
  createDraftSession, editSections, editRaw, setHrReason, beginSave, applySaveResult,
  rebaseOnto, makeReadOnly, currentBody, hasUnsavedChanges, canAttemptSave,
  describeDraftState, DRAFT_STATE, READ_ONLY_REASON,
  commitLive, confirmRebase, canConfirmRebase, conflictLatestLoaded, conflictUnavailable,
  conflictBodyLoading, conflictBodyLoaded, conflictBodyUnavailable,
} from '../lib/reportDraftSession.js';
import { DRAFT_SAVE_RESULT } from '../lib/reportDraftGateway.js';
import { composeReportBody, emptyReportSections } from '../lib/reportDraftComposer.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — THE TWO QUESTIONS THESE TESTS EXIST TO ANSWER.
//
//   1. CAN THE INVESTIGATOR'S TEXT BE LOST? Every failure path is walked and
//      the body is asserted unchanged afterwards. There is a sweep at the end
//      that drives EVERY outcome code through the machine and checks the text
//      survived, so a new code cannot be added without facing the question.
//
//   2. CAN A RETRY CREATE A SECOND VERSION? The request-id rules are tested
//      as behaviour rather than as implementation: an exact repeat reuses the
//      id, anything else does not, and an edit-then-undo is an exact repeat
//      again because the comparison is on content.
// ─────────────────────────────────────────────────────────────────────────

const CASE = '18f32633-788d-4163-a893-1ef049acefac';
const ID1 = 'aaaa0000-0000-0000-0000-000000000001';
const ID2 = 'aaaa0000-0000-0000-0000-000000000002';

const open = (over = {}) => createDraftSession({
  caseId: CASE, baseVersion: 0, canSave: true, ...over,
});

const versionRow = (n) => ({ id: `v${n}`, versionNo: n, adoptedAt: null, isCurrent: false });
const ok = (n = 1) => ({ result: DRAFT_SAVE_RESULT.OK, version: versionRow(n) });

describe('B3.2-1 — opening a session', () => {
  it('starts clean, empty and with nothing to save', () => {
    const s = open();
    expect(s.state).toBe(DRAFT_STATE.CLEAN);
    expect(currentBody(s)).toBe('');
    expect(hasUnsavedChanges(s)).toBe(false);
    expect(canAttemptSave(s)).toBe(false);
    expect(describeDraftState(s)).toMatch(/No draft has been written yet/);
  });

  it('is read-only when saving is not available, and says why', () => {
    const notActivated = createDraftSession({ caseId: CASE, baseVersion: 0, canSave: false, readOnlyReason: READ_ONLY_REASON.NOT_ACTIVATED });
    expect(notActivated.state).toBe(DRAFT_STATE.READ_ONLY);
    expect(describeDraftState(notActivated)).toMatch(/not yet switched on for your organisation/);

    const noAuthority = createDraftSession({ caseId: CASE, baseVersion: 0, canSave: false, readOnlyReason: READ_ONLY_REASON.NO_AUTHORITY });
    expect(describeDraftState(noAuthority)).toMatch(/assigned investigator, or HR under a documented exception/);

    const unreadable = createDraftSession({ caseId: CASE, baseVersion: null, canSave: false, readOnlyReason: READ_ONLY_REASON.HISTORY_UNREADABLE });
    expect(describeDraftState(unreadable)).toMatch(/could not read this case’s report history/);
  });

  it('decomposes a body it wrote into the seven fields', () => {
    const body = composeReportBody({ ...emptyReportSections(), summary: 'A summary.' });
    const s = open({ body, baseVersion: 2 });
    expect(s.rawMode).toBe(false);
    expect(s.sections.summary).toBe('A summary.');
    expect(currentBody(s)).toBe(body);
    expect(hasUnsavedChanges(s)).toBe(false);
  });

  it('keeps a legacy body as RAW text rather than redistributing it', () => {
    const legacy = 'INVESTIGATION REPORT\n\nWritten before Compass had sections.';
    const s = open({ body: legacy });
    expect(s.rawMode).toBe(true);
    expect(s.raw).toBe(legacy);
    expect(currentBody(s)).toBe(legacy);
    expect(hasUnsavedChanges(s)).toBe(false);
    // And re-saving it unchanged would store the identical bytes.
    expect(currentBody(s)).toBe(legacy);
  });

  it('cannot save without a base version, because that is the concurrency token', () => {
    const s = open({ baseVersion: null });
    const edited = editSections(s, { summary: 'x' });
    expect(canAttemptSave(edited)).toBe(false);
  });

  it('refuses to save an all-blank draft, which the table would reject anyway', () => {
    const s = editSections(open(), { summary: '   \n ' });
    expect(canAttemptSave(s)).toBe(false);
  });
});

describe('B3.2-1 — editing', () => {
  it('becomes dirty on a real change and clean again when undone', () => {
    const s0 = open();
    const s1 = editSections(s0, { summary: 'x' });
    expect(s1.state).toBe(DRAFT_STATE.DIRTY);
    expect(hasUnsavedChanges(s1)).toBe(true);

    const s2 = editSections(s1, { summary: '' });
    expect(s2.state).toBe(DRAFT_STATE.CLEAN);
    expect(hasUnsavedChanges(s2)).toBe(false);
  });

  it('allows an incomplete draft — one section is enough to save', () => {
    const s = editSections(open(), { matters: 'Only the matters, so far.' });
    expect(canAttemptSave(s)).toBe(true);
  });

  it('ignores edits on a read-only session rather than pretending to accept them', () => {
    const ro = createDraftSession({ caseId: CASE, baseVersion: 0, canSave: false });
    expect(editSections(ro, { summary: 'x' })).toBe(ro);
    expect(editRaw(ro, 'x')).toBe(ro);
    expect(setHrReason(ro, 'x')).toBe(ro);
  });

  it('only accepts raw edits in raw mode, so the two editors cannot fight', () => {
    const structured = open();
    expect(editRaw(structured, 'x')).toBe(structured);

    const raw = open({ body: 'legacy text' });
    const edited = editRaw(raw, 'legacy text, amended');
    expect(currentBody(edited)).toBe('legacy text, amended');
    expect(edited.state).toBe(DRAFT_STATE.DIRTY);
  });
});

describe('B3.2-1 — the request id is minted per distinct request and reused for an exact repeat', () => {
  it('mints a fresh id for the first save', () => {
    const s = editSections(open(), { summary: 'x' });
    const { session, request } = beginSave(s, { newRequestId: ID1 });
    expect(request.requestId).toBe(ID1);
    expect(request.expectedBaseVersion).toBe(0);
    expect(request.body).toBe(composeReportBody({ ...emptyReportSections(), summary: 'x' }));
    expect(session.state).toBe(DRAFT_STATE.SAVING);
  });

  it('REUSES the id for an exact retry after an uncertain outcome', () => {
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.NETWORK });
    expect(s.retryable).toBe(true);
    expect(s.pending.requestId).toBe(ID1);

    // The retry offers a NEW id, which must be ignored because the request is
    // byte-identical to the one whose outcome is unknown.
    r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID1);
  });

  it('MINTS A NEW id when the text changed after a failed save', () => {
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.NETWORK });

    s = editSections(s, { summary: 'x, amended' });
    r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID2);
  });

  it('treats an edit that is undone as an exact repeat again, because content decides', () => {
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.NETWORK });

    s = editSections(s, { summary: 'xy' });     // changed
    s = editSections(s, { summary: 'x' });      // and changed back
    r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID1);
  });

  it('MINTS A NEW id when only the HR reason changed, because the digest covers it', () => {
    let s = open({ requiresHrReason: true });
    s = editSections(s, { summary: 'x' });
    s = setHrReason(s, 'Investigator on leave');
    let r = beginSave(s, { newRequestId: ID1 });
    expect(r.request.hrReason).toBe('Investigator on leave');
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.NETWORK });

    s = setHrReason(s, 'A different reason');
    r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID2);
  });

  it('MINTS A NEW id after a stale save, because the base version will differ', () => {
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.STALE });
    expect(s.pending).toBeNull();

    s = rebaseOnto(s, 3);
    r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID2);
    expect(r.request.expectedBaseVersion).toBe(3);
  });

  it('MINTS A NEW id after a request-reuse refusal, which is the only recovery', () => {
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.REQUEST_REUSED });
    expect(s.pending).toBeNull();
    r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID2);
  });

  it('will not save without an id to use', () => {
    const s = editSections(open(), { summary: 'x' });
    expect(beginSave(s, { newRequestId: '' }).request).toBeNull();
    expect(beginSave(s, {}).request).toBeNull();
    expect(beginSave(s, { newRequestId: null }).request).toBeNull();
  });

  it('will not start a second save while one is in flight', () => {
    const s = editSections(open(), { summary: 'x' });
    const { session } = beginSave(s, { newRequestId: ID1 });
    expect(canAttemptSave(session)).toBe(false);
    expect(beginSave(session, { newRequestId: ID2 }).request).toBeNull();
  });
});

describe('B3.2-1 — HR saving on a case they are not the investigator for', () => {
  it('prompts for a reason BEFORE consuming a request id', () => {
    let s = open({ requiresHrReason: true });
    s = editSections(s, { summary: 'x' });
    const r = beginSave(s, { newRequestId: ID1 });
    expect(r.request).toBeNull();
    expect(r.session.state).toBe(DRAFT_STATE.NEEDS_HR_REASON);
    expect(r.session.pending).toBeNull();
    expect(describeDraftState(r.session)).toMatch(/requires a written reason/i);
  });

  it('treats a whitespace-only reason as no reason', () => {
    let s = open({ requiresHrReason: true });
    s = setHrReason(editSections(s, { summary: 'x' }), '    ');
    expect(beginSave(s, { newRequestId: ID1 }).request).toBeNull();
  });

  it('sends the trimmed reason once given, and keeps the text throughout', () => {
    let s = open({ requiresHrReason: true });
    s = editSections(s, { summary: 'x' });
    s = beginSave(s, { newRequestId: ID1 }).session;        // prompted
    s = setHrReason(s, '  Investigator on long-term sick leave  ');
    const r = beginSave(s, { newRequestId: ID1 });
    expect(r.request.hrReason).toBe('Investigator on long-term sick leave');
    expect(currentBody(r.session)).toContain('x');
  });

  it('switches into the prompt if the database asks for a reason the client did not expect', () => {
    let s = editSections(open(), { summary: 'x' });           // requiresHrReason false
    const r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.HR_REASON_REQUIRED });
    expect(s.state).toBe(DRAFT_STATE.NEEDS_HR_REASON);
    expect(s.requiresHrReason).toBe(true);
    expect(currentBody(s)).toContain('x');
  });
});

describe('B3.2-1 — a successful save', () => {
  it('advances the base version and reports the version number', () => {
    let s = editSections(open(), { summary: 'x' });
    const r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, ok(1));
    expect(s.state).toBe(DRAFT_STATE.SAVED);
    expect(s.baseVersion).toBe(1);
    expect(s.pending).toBeNull();
    expect(s.savedThisSession).toBe(true);
    expect(hasUnsavedChanges(s)).toBe(false);
    expect(describeDraftState(s)).toBe('Saved as version 1.');
  });

  it('clears the HR reason after a save, so the next save must state its own', () => {
    let s = open({ requiresHrReason: true });
    s = setHrReason(editSections(s, { summary: 'x' }), 'A reason');
    const r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, ok(1));
    expect(s.hrReason).toBe('');
  });

  it('keeps typing-while-saving as UNSAVED rather than claiming it was stored', () => {
    let s = editSections(open(), { summary: 'first' });
    const r = beginSave(s, { newRequestId: ID1 });
    // The investigator keeps writing while the request is in flight.
    const stillTyping = editSections(r.session, { summary: 'first, and more' });
    const after = applySaveResult(stillTyping, ok(1));
    expect(after.state).toBe(DRAFT_STATE.DIRTY);
    expect(hasUnsavedChanges(after)).toBe(true);
    expect(currentBody(after)).toContain('and more');
    // What was SENT is what is recorded as saved.
    expect(after.savedBody).toBe(composeReportBody({ ...emptyReportSections(), summary: 'first' }));
  });

  it('allows the next save from the new base', () => {
    let s = editSections(open(), { summary: 'x' });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, ok(1));
    s = editSections(s, { summary: 'x2' });
    const r = beginSave(s, { newRequestId: ID2 });
    expect(r.request.expectedBaseVersion).toBe(1);
    expect(r.request.requestId).toBe(ID2);
  });

  it('tolerates a version row with no usable number without losing the base', () => {
    let s = editSections(open({ baseVersion: 4 }), { summary: 'x' });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session,
      { result: DRAFT_SAVE_RESULT.OK, version: { id: 'v', versionNo: null } });
    expect(s.baseVersion).toBe(4);
    expect(s.state).toBe(DRAFT_STATE.SAVED);
    expect(describeDraftState(s)).toBe('Saved.');
  });
});

describe('B3.2-1 — a conflict preserves the local draft and never merges', () => {
  it('keeps the investigator’s text exactly, and says the server version was not applied', () => {
    const typed = 'My own assessment, written over an hour.';
    let s = editSections(open(), { assessment: typed });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.STALE });
    expect(s.state).toBe(DRAFT_STATE.STALE);
    expect(s.sections.assessment).toBe(typed);
    expect(hasUnsavedChanges(s)).toBe(true);
    expect(describeDraftState(s)).toMatch(/Your text is still here and has not been changed/);
  });

  it('offers a rebase that changes only the token, not a character of the text', () => {
    const typed = 'My own assessment.';
    let s = editSections(open(), { assessment: typed });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.STALE });
    const before = currentBody(s);
    s = rebaseOnto(s, 5);
    expect(currentBody(s)).toBe(before);
    expect(s.baseVersion).toBe(5);
    expect(s.state).toBe(DRAFT_STATE.DIRTY);
    expect(canAttemptSave(s)).toBe(true);
  });

  it('ignores a rebase onto a nonsense version', () => {
    let s = editSections(open(), { summary: 'x' });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.STALE });
    for (const v of [null, undefined, '3', 1.5, NaN]) expect(rebaseOnto(s, v)).toBe(s);
  });

  it('still allows a save attempt from the stale state, so the investigator is not stuck', () => {
    let s = editSections(open(), { summary: 'x' });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.STALE });
    expect(canAttemptSave(s)).toBe(true);
  });
});

describe('B3.2-1 — losing authority mid-draft does not lose the draft', () => {
  it('keeps the text when the database refuses the save', () => {
    const typed = 'Half a report.';
    let s = editSections(open(), { assessment: typed });
    s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.REFUSED });
    expect(s.state).toBe(DRAFT_STATE.ERROR);
    expect(s.sections.assessment).toBe(typed);
    expect(describeDraftState(s)).toMatch(/Copy anything you need/);
  });

  it('keeps the text when the session is turned read-only under the editor', () => {
    const typed = 'Half a report.';
    let s = editSections(open(), { assessment: typed });
    s = makeReadOnly(s, READ_ONLY_REASON.NO_AUTHORITY);
    expect(s.state).toBe(DRAFT_STATE.READ_ONLY);
    expect(s.sections.assessment).toBe(typed);
    expect(currentBody(s)).toContain(typed);
    expect(canAttemptSave(s)).toBe(false);
  });
});

describe('B3.2-1 — NO outcome loses the investigator’s text', () => {
  const typed = 'Every word of this must survive.';

  it.each(Object.values(DRAFT_SAVE_RESULT))('survives %s', (result) => {
    let s = editSections(open(), { assessment: typed });
    const sent = currentBody(s);
    const r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result, version: result === DRAFT_SAVE_RESULT.OK ? versionRow(1) : undefined });

    // The text is still in the session in every single case.
    expect(currentBody(s), result).toBe(sent);
    expect(s.sections.assessment, result).toBe(typed);
    // And the state is never left as SAVING, which would hang the UI.
    expect(s.state, result).not.toBe(DRAFT_STATE.SAVING);
    // And there is always something to say.
    expect(typeof describeDraftState(s), result).toBe('string');
  });

  it('never leaves a pending request on an outcome that definitely stored nothing', () => {
    for (const result of [DRAFT_SAVE_RESULT.STALE, DRAFT_SAVE_RESULT.REFUSED, DRAFT_SAVE_RESULT.REQUEST_REUSED,
      DRAFT_SAVE_RESULT.CASE_MISSING, DRAFT_SAVE_RESULT.INVALID, DRAFT_SAVE_RESULT.UNAVAILABLE,
      DRAFT_SAVE_RESULT.HR_REASON_REQUIRED]) {
      let s = editSections(open(), { assessment: typed });
      s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result });
      expect(s.pending, result).toBeNull();
    }
  });

  it('always keeps the pending request where the outcome is unknown', () => {
    for (const result of [DRAFT_SAVE_RESULT.NETWORK, DRAFT_SAVE_RESULT.MALFORMED, DRAFT_SAVE_RESULT.ERROR]) {
      let s = editSections(open(), { assessment: typed });
      s = applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result });
      expect(s.pending?.requestId, result).toBe(ID1);
      expect(s.retryable, result).toBe(true);
    }
  });

  it('is total on a missing or unknown outcome', () => {
    let s = editSections(open(), { assessment: typed });
    s = beginSave(s, { newRequestId: ID1 }).session;
    for (const outcome of [undefined, null, {}, { result: 'something_new' }]) {
      const after = applySaveResult(s, outcome);
      expect(currentBody(after)).toContain(typed);
      expect(after.state).toBe(DRAFT_STATE.ERROR);
    }
  });

  it('is total on a null session', () => {
    expect(() => applySaveResult(null, ok(1))).not.toThrow();
    expect(currentBody(null)).toBe('');
    expect(hasUnsavedChanges(null)).toBe(false);
    expect(canAttemptSave(null)).toBe(false);
    expect(describeDraftState(null)).toBe('No draft is open.');
  });
});

describe('B3.2-1 — sessions are immutable, so a stale reference cannot resurrect old text', () => {
  it('returns a frozen session from every transition', () => {
    let s = open();
    expect(Object.isFrozen(s)).toBe(true);
    s = editSections(s, { summary: 'x' });
    expect(Object.isFrozen(s)).toBe(true);
    const r = beginSave(s, { newRequestId: ID1 });
    expect(Object.isFrozen(r.session)).toBe(true);
    expect(Object.isFrozen(applySaveResult(r.session, ok(1)))).toBe(true);
    expect(Object.isFrozen(rebaseOnto(s, 2))).toBe(true);
    expect(Object.isFrozen(makeReadOnly(s))).toBe(true);
  });

  it('does not mutate the session it was given', () => {
    const s = editSections(open(), { summary: 'x' });
    const snapshot = JSON.stringify(s);
    beginSave(s, { newRequestId: ID1 });
    applySaveResult(s, ok(1));
    rebaseOnto(s, 9);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B3.2-1 RELIABILITY PASS.
// ═══════════════════════════════════════════════════════════════════════════

describe('B3.2-1 — commitLive takes the editor’s text without disturbing a retry', () => {
  it('applies the live sections and marks the draft dirty', () => {
    const s = commitLive(open(), { sections: { matters: 'typed live' } });
    expect(s.sections.matters).toBe('typed live');
    expect(s.state).toBe(DRAFT_STATE.DIRTY);
    expect(hasUnsavedChanges(s)).toBe(true);
  });

  it('returns the SAME session when the live text matches, so nothing churns', () => {
    const s = editSections(open(), { matters: 'x' });
    expect(commitLive(s, { sections: { matters: 'x' } })).toBe(s);
  });

  it('commits identical content before a retry WITHOUT minting a new id', () => {
    // The end-to-end shape of a lost response: the editor commits what is on
    // screen (unchanged), then saves. The identifier must be reused.
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.NETWORK });

    const committed = commitLive(s, { sections: s.sections, hrReason: '' });
    r = beginSave(committed, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID1);
  });

  it('mints a NEW id when the committed content differs', () => {
    let s = editSections(open(), { summary: 'x' });
    let r = beginSave(s, { newRequestId: ID1 });
    s = applySaveResult(r.session, { result: DRAFT_SAVE_RESULT.NETWORK });

    const committed = commitLive(s, { sections: { ...s.sections, summary: 'x amended' } });
    r = beginSave(committed, { newRequestId: ID2 });
    expect(r.request.requestId).toBe(ID2);
    expect(r.request.body).toContain('x amended');
  });

  it('does not clear a STALE or reason prompt the investigator still has to act on', () => {
    let stale = editSections(open(), { summary: 'x' });
    stale = applySaveResult(beginSave(stale, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.STALE });
    expect(commitLive(stale, { sections: { summary: 'x and more' } }).state).toBe(DRAFT_STATE.STALE);

    let prompt = open({ requiresHrReason: true });
    prompt = beginSave(editSections(prompt, { summary: 'x' }), { newRequestId: ID1 }).session;
    expect(prompt.state).toBe(DRAFT_STATE.NEEDS_HR_REASON);
    expect(commitLive(prompt, { sections: { summary: 'x2' } }).state).toBe(DRAFT_STATE.NEEDS_HR_REASON);
  });

  it('ignores raw text in structured mode and sections in raw mode', () => {
    const structured = open();
    expect(commitLive(structured, { raw: 'nope' })).toBe(structured);
    const raw = open({ body: 'legacy body' });
    expect(commitLive(raw, { sections: { summary: 'nope' } })).toBe(raw);
    expect(commitLive(raw, { raw: 'legacy body amended' }).raw).toBe('legacy body amended');
  });

  it('is total and never mutates', () => {
    const s = open();
    const snap = JSON.stringify(s);
    for (const v of [null, undefined, 42, 'str', [], { sections: 7 }]) {
      expect(() => commitLive(s, v)).not.toThrow();
    }
    expect(JSON.stringify(s)).toBe(snap);
    expect(commitLive(null, { sections: {} })).toBeNull();
    const ro = createDraftSession({ caseId: CASE, baseVersion: 0, canSave: false });
    expect(commitLive(ro, { sections: { summary: 'x' } })).toBe(ro);
  });
});

describe('B3.2-1 — the stale-version review', () => {
  const stale = () => {
    const s = editSections(open(), { assessment: 'My own words.' });
    return applySaveResult(beginSave(s, { newRequestId: ID1 }).session, { result: DRAFT_SAVE_RESULT.STALE });
  };
  const latest = { id: 'v7', versionNo: 7, createdAt: 'T', createdBy: 'u2', authorKind: 'user' };

  it('opens in a FETCHING state — no confirmation is possible yet', () => {
    const s = stale();
    expect(s.conflict).toEqual({ state: 'fetching', latest: null, body: null, bodyState: 'idle' });
    expect(canConfirmRebase(s)).toBe(false);
  });

  it('becomes confirmable once the newer version is identified', () => {
    const s = conflictLatestLoaded(stale(), latest);
    expect(s.conflict.state).toBe('ready');
    expect(s.conflict.latest).toEqual(latest);
    expect(canConfirmRebase(s)).toBe(true);
  });

  it('FAILS CLOSED when the latest cannot be retrieved — and keeps the text', () => {
    const s = conflictUnavailable(stale());
    expect(s.conflict.state).toBe('unavailable');
    expect(canConfirmRebase(s)).toBe(false);
    expect(confirmRebase(s)).toBe(s);
    expect(s.sections.assessment).toBe('My own words.');
    expect(describeDraftState(s)).toMatch(/cannot read it to show you what changed/i);
  });

  it('fails closed on a latest with no usable version number', () => {
    for (const bad of [null, undefined, {}, { versionNo: null }, { versionNo: '7' }]) {
      const s = conflictLatestLoaded(stale(), bad);
      expect(s.conflict.state).toBe('unavailable');
      expect(canConfirmRebase(s)).toBe(false);
    }
  });

  it('carries the newer version’s text for inspection, and survives a failure to load it', () => {
    let s = conflictLatestLoaded(stale(), latest);
    s = conflictBodyLoading(s);
    expect(s.conflict.bodyState).toBe('fetching');
    s = conflictBodyLoaded(s, 'The other version.');
    expect(s.conflict.body).toBe('The other version.');
    expect(s.conflict.bodyState).toBe('ready');
    // Inspecting never touches the draft.
    expect(s.sections.assessment).toBe('My own words.');

    const failed = conflictBodyUnavailable(conflictLatestLoaded(stale(), latest));
    expect(failed.conflict.bodyState).toBe('unavailable');
    expect(failed.conflict.body).toBeNull();
    expect(canConfirmRebase(failed)).toBe(true);   // reading is optional
  });

  it('confirmation moves the base to the reviewed version and keeps every character', () => {
    const s = conflictLatestLoaded(stale(), latest);
    const before = currentBody(s);
    const after = confirmRebase(s);
    expect(after.baseVersion).toBe(7);
    expect(currentBody(after)).toBe(before);
    expect(after.conflict).toBeNull();
    expect(after.state).toBe(DRAFT_STATE.DIRTY);
    expect(canAttemptSave(after)).toBe(true);
  });

  it('refuses to confirm while the review is still fetching', () => {
    const s = stale();
    expect(confirmRebase(s)).toBe(s);
    expect(s.baseVersion).toBe(0);
  });

  it('reopens the review when ANOTHER save lands during the confirmation', () => {
    // The race the brief names. Confirmation does not revalidate locally —
    // the database does, under a row lock — so a second competing save comes
    // back as another 40001 and the review starts again against the newer one.
    let s = confirmRebase(conflictLatestLoaded(stale(), latest));
    s = applySaveResult(beginSave(s, { newRequestId: ID2 }).session, { result: DRAFT_SAVE_RESULT.STALE });
    expect(s.state).toBe(DRAFT_STATE.STALE);
    expect(s.conflict.state).toBe('fetching');
    expect(s.sections.assessment).toBe('My own words.');

    s = conflictLatestLoaded(s, { ...latest, id: 'v8', versionNo: 8 });
    expect(canConfirmRebase(s)).toBe(true);
    expect(confirmRebase(s).baseVersion).toBe(8);
  });

  it('clears the review when the save finally lands', () => {
    let s = confirmRebase(conflictLatestLoaded(stale(), latest));
    s = applySaveResult(beginSave(s, { newRequestId: ID2 }).session, ok(8));
    expect(s.conflict).toBeNull();
    expect(s.state).toBe(DRAFT_STATE.SAVED);
  });

  it('ignores the review transitions outside a stale state', () => {
    const clean = open();
    expect(conflictLatestLoaded(clean, latest)).toBe(clean);
    expect(conflictUnavailable(clean)).toBe(clean);
    expect(canConfirmRebase(clean)).toBe(false);
    expect(canConfirmRebase(null)).toBe(false);
  });
});
