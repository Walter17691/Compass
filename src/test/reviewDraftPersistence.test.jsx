import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import {
  transcriptFingerprint, buildReviewDraft, restorableDraft, draftMatchesTranscript,
  markDraftEdited, supersedeReviewDraft, REVIEW_DRAFT_GENERATION_VERSION,
} from '../lib/reviewDraft.js';
import { MEETING_STATUS, isMeetingComplete, declaredStatus,
         scheduledMeetingsFor, resumableMeetingFor } from '../lib/meetingLifecycle.js';
import { WRITE_FAILURE, transitionMeeting } from '../lib/meetingWrites.js';
import { getNextStep } from '../lib/nextStep.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase 3B slice 2 — the persisted Review draft. Closes the remainder of NEW-26.
//
// Phase 3A made the LIFECYCLE survive a browser boundary. The generated record,
// summary, risk and any hand edits still lived only in React state, so reopening
// Review regenerated from scratch and discarded the user's work.
//
// Two architecture corrections are enforced here:
//   1. provenance is a CONTENT fingerprint, never a count
//   2. a concurrency conflict SUSPENDS autosave and never auto-retries
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const reviewSrc = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
const libSrc = readFileSync('src/lib/reviewDraft.js', 'utf8');
const strip = src => src.split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const appCode = strip(app);
const reviewCode = strip(reviewSrc);
const libCode = strip(libSrc);

const CASE_ID = 'case-draft';
const MID = 'meeting_draft_disciplinary';
const STARTED = '2026-09-25T09:00:00.000Z';
const ENDED = '2026-09-25T10:30:00.000Z';
const RECORD = '## Meeting Details\n\nType: Disciplinary Hearing\n\n## Meeting Dialogue\n\nHR: Noted.\n\n## HR Advisor Notes\n\nProceed with care.';
const EDITED = RECORD + '\n\nAdded by hand: the employee disputed the timeline.';
const clone = v => JSON.parse(JSON.stringify(v));

const tx = (...texts) => texts.map((t, i) => ({ id: `u${i}`, speaker: 'HR', text: t, ts: '10:0' + i }));
const NOTES = tx('Employee confirmed they understood.', 'Employee gave their account.');

const meeting = (over = {}) => ({
  id: MID, caseId: CASE_ID, type: 'Disciplinary', status: MEETING_STATUS.REVIEW_DRAFT,
  date: '2026-10-04', createdAt: '2026-09-25T08:17:02.782Z', createdBy: 'UAT - HR Manager',
  startedAt: STARTED, endedAt: ENDED, chairUserId: null, manager: 'Jane Smith', participants: [],
  record: null, transcript: NOTES, signId: null, signStatus: null,
  invitation: null, calendar: null, ...over,
});
const caseWith = (...ms) => ({ id: CASE_ID, employeeName: 'Sam Patel', meetings: ms });

const draftOf = (over = {}) => buildReviewDraft({
  record: RECORD, recordOriginal: RECORD, summary: 'Key facts.',
  risk: { rating: 'MEDIUM', summary: 'Some gaps.' }, transcript: NOTES,
  now: '2026-09-25T10:31:00.000Z', ...over,
});

// Models the deployed draft write: the canonical transition, review_draft →
// review_draft, patching reviewDraft only.
const makeDraftStore = (initial, { fail = null } = {}) => {
  let db = clone(initial);
  const changedIds = [];
  const saveCases = vi.fn(async (next, changedId) => {
    if (fail) return { ok: false, reason: fail };
    changedIds.push(changedId); db = clone(next); return { ok: true };
  });
  const write = async (draft, { caseId = CASE_ID, meetingId = MID } = {}) => {
    const r = await transitionMeeting({
      cases: db, caseId, meetingId,
      allowedFrom: [MEETING_STATUS.REVIEW_DRAFT], toStatus: MEETING_STATUS.REVIEW_DRAFT,
      patch: { reviewDraft: draft }, saveCases,
    });
    return r?.ok ? { ok: true } : { ok: false, reason: r?.reason };
  };
  return { write, saveCases, changedIds, cases: () => db,
    meetings: () => db.find(c => c.id === CASE_ID).meetings,
    meeting: () => db.find(c => c.id === CASE_ID).meetings.find(m => m.id === MID) };
};

describe('2/3/4. transcript fingerprint is content provenance, not a count', () => {
  it('2. a persisted draft carries a transcriptFingerprint', () => {
    expect(draftOf().transcriptFingerprint).toMatch(/^t1:[0-9a-f]{8}$/);
  });

  it('3. the identical transcript yields the identical fingerprint', () => {
    expect(transcriptFingerprint(NOTES)).toBe(transcriptFingerprint(clone(NOTES)));
    // and is stable across irrelevant churn: ids and timestamps are excluded
    const reIded = NOTES.map((u, i) => ({ ...u, id: `zz${i}`, ts: '23:59', aiAttributed: true }));
    expect(transcriptFingerprint(reIded)).toBe(transcriptFingerprint(NOTES));
  });

  it('4. SAME COUNT but changed content yields a different fingerprint', () => {
    const changed = tx('Employee confirmed they understood.', 'Employee refused to comment.');
    expect(changed).toHaveLength(NOTES.length);          // the count is identical
    expect(transcriptFingerprint(changed)).not.toBe(transcriptFingerprint(NOTES));
  });

  it('4b. reordering, speaker changes and concatenation are all distinguished', () => {
    const base = transcriptFingerprint(NOTES);
    expect(transcriptFingerprint([...NOTES].reverse())).not.toBe(base);
    expect(transcriptFingerprint(NOTES.map(u => ({ ...u, speaker: 'Employee' })))).not.toBe(base);
    // "a"+"b" must never collide with "ab" — the control-character separators
    expect(transcriptFingerprint(tx('a', 'b'))).not.toBe(transcriptFingerprint(tx('ab')));
  });

  it('4c. pending entries are excluded, matching what End persists', () => {
    const withPending = [...NOTES, { id: 'p1', speaker: 'HR', text: 'half-typed', pending: true }];
    expect(transcriptFingerprint(withPending)).toBe(transcriptFingerprint(NOTES));
  });

  it('4d. deterministic, dependency-free and synchronous', () => {
    expect(transcriptFingerprint([])).toMatch(/^t1:/);
    expect(transcriptFingerprint(null)).toBe(transcriptFingerprint(undefined));
    for (const forbidden of ['crypto', 'await', 'async', 'fetch', 'Date.now']) {
      expect(libCode.slice(libCode.indexOf('export function transcriptFingerprint'),
        libCode.indexOf('export function buildReviewDraft'))).not.toContain(forbidden);
    }
  });

  it('the fingerprint never gates the lifecycle — advisory only', () => {
    const stale = { ...meeting(), reviewDraft: draftOf({ transcript: tx('different') }) };
    expect(draftMatchesTranscript(stale)).toBe(false);
    // ...but it is STILL restorable: silently regenerating over a user's edits
    // because a fingerprint moved is the behaviour NEW-26 exists to stop.
    expect(restorableDraft(stale)).not.toBeNull();
  });
});

describe('1/13/14/15-18. persisting the draft touches nothing else', () => {
  it('1/14. the draft persists onto the same canonical meeting', async () => {
    const st = makeDraftStore([caseWith(meeting())]);
    const r = await st.write(draftOf());
    expect(r.ok).toBe(true);
    expect(st.meeting().id).toBe(MID);
    expect(st.meeting().reviewDraft.record).toBe(RECORD);
    expect(st.changedIds).toEqual([CASE_ID]);          // single-case write
  });

  it('15/16/17/18. no duplicate; transcript, startedAt and endedAt unchanged', async () => {
    const before = meeting();
    const st = makeDraftStore([caseWith(before)]);
    await st.write(draftOf());
    const after = st.meeting();
    expect(st.meetings()).toHaveLength(1);
    expect(after.transcript).toEqual(before.transcript);
    expect(after.startedAt).toBe(STARTED);
    expect(after.endedAt).toBe(ENDED);
    expect(after.status).toBe(MEETING_STATUS.REVIEW_DRAFT);   // still not complete
  });

  it('the draft write creates no completion artefacts', async () => {
    const st = makeDraftStore([caseWith(meeting())]);
    await st.write(draftOf());
    const m = st.meeting();
    expect(m.savedAt).toBeUndefined();
    expect(m.savedBy).toBeUndefined();
    expect(m.signDocument).toBeUndefined();
    expect(m.record).toBeNull();            // authoritative record untouched
    expect(isMeetingComplete(m)).toBe(false);
  });

  it('19. a reviewDraft does not make signature eligible', async () => {
    const st = makeDraftStore([caseWith(meeting())]);
    await st.write(draftOf());
    const m = st.meeting();
    // the deployed rule: completed status AND a non-empty saved record
    const eligible = declaredStatus(m) === MEETING_STATUS.COMPLETED
      && typeof m.record === 'string' && m.record.trim().length > 0;
    expect(eligible).toBe(false);
  });

  it('20. a reviewDraft is invisible to every process reader', async () => {
    const st = makeDraftStore([caseWith(
      { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
        record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
      meeting())]);
    await st.write(draftOf());
    const cs = { ...st.cases()[0], caseType: 'Misconduct', stage: 'disciplinary' };
    expect(getNextStep(cs, { isHR: true }).action).toBe('review_meeting_record');
    expect(scheduledMeetingsFor(cs)).toEqual([]);
    expect(resumableMeetingFor(cs).meeting).toBeNull();
    expect(isMeetingComplete(st.meeting())).toBe(false);
    // and no reader in the codebase consults it
    for (const f of ['src/lib/nextStep.js', 'src/lib/meetingLifecycle.js', 'src/lib/caseStage.js']) {
      expect(readFileSync(f, 'utf8')).not.toContain('reviewDraft');
    }
  });

  it('the draft write is the canonical transition, review_draft → review_draft', () => {
    const i = appCode.indexOf('const persistReviewDraft = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('allowedFrom: [MEETING_STATUS.REVIEW_DRAFT], toStatus: MEETING_STATUS.REVIEW_DRAFT');
    expect(body).toContain('patch: { reviewDraft: draft }');
    for (const forbidden of ['savedAt', 'savedBy', 'signDocument', 'COMPLETED', 'newId(']) {
      expect(body).not.toContain(forbidden);
    }
  });
});

describe('5-12. restore-first, and zero AI calls when a draft exists', () => {
  it('5/7. a stored draft is restored verbatim', () => {
    const d = draftOf({ record: EDITED });
    const m = { ...meeting(), reviewDraft: d };
    const restored = restorableDraft(m);
    expect(restored.record).toBe(EDITED);
    expect(restored.recordOriginal).toBe(RECORD);
    expect(restored.summary).toBe('Key facts.');
    expect(restored.risk).toEqual({ rating: 'MEDIUM', summary: 'Some gaps.' });
  });

  it('6/8. re-entry restores instead of generating — no AI path is taken', () => {
    const i = appCode.indexOf('const openReviewForMeeting =');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    const restore = body.indexOf('const existingDraft = restorableDraft(meeting);');
    const generate = body.indexOf('setReviewReopenFor(meeting.id)');
    expect(restore).toBeGreaterThan(-1);
    expect(generate).toBeGreaterThan(restore);            // generation is the ELSE branch
    expect(body).toContain('} else if(notes.length) {');
    // Since the 2026-09-25 boundary fix the restore splits first, so the
    // editable surface receives the employee-facing half only.
    expect(body).toContain('setReviewOutput(restored.employeeFacing)');
    expect(body).toContain('const restored = splitMeetingRecord(existingDraft.record)');
  });

  it('9/10. an edited draft is what comes back, not a fresh generation', () => {
    const edited = markDraftEdited(draftOf({ record: EDITED }), { by: 'Alex HR', now: '2026-09-25T11:00:00.000Z' });
    const m = { ...meeting(), reviewDraft: edited };
    const restored = restorableDraft(m);
    expect(restored.record).toBe(EDITED);
    expect(restored.editedByUser).toBe(true);
    expect(restored.editedBy).toBe('Alex HR');
  });

  it('11. the first human edit stamps editedByUser, editedAt and editedBy', () => {
    const clean = draftOf();
    expect(clean.editedByUser).toBe(false);
    expect(clean.editedAt).toBeNull();
    const marked = markDraftEdited(clean, { by: 'Alex HR', now: '2026-09-25T11:00:00.000Z' });
    expect(marked.editedByUser).toBe(true);
    expect(marked.editedAt).toBe('2026-09-25T11:00:00.000Z');
    expect(marked.editedBy).toBe('Alex HR');
  });

  it('12. restoration does NOT mark the draft as edited', () => {
    // buildReviewDraft carries previous provenance rather than inventing it,
    // and only the edit entry point sets the flag.
    const rebuilt = buildReviewDraft({ record: RECORD, recordOriginal: RECORD, summary: '',
      risk: null, transcript: NOTES, previous: draftOf() });
    expect(rebuilt.editedByUser).toBe(false);
    expect(rebuilt.generatedAt).toBe('2026-09-25T10:31:00.000Z');   // preserved
    const i = appCode.indexOf('const openReviewForMeeting =');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('draftEditedRef.current = !!existingDraft.editedByUser');
    expect(body).not.toContain('markDraftEdited');
  });

  it('13. no draft plus a transcript generates exactly once, then persists', () => {
    const m = meeting();                       // no reviewDraft
    expect(restorableDraft(m)).toBeNull();
    const i = appCode.indexOf('const openReviewForMeeting =');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    // exactly one generation trigger in the whole handler
    expect((body.match(/setReviewReopenFor\(/g) || []).length).toBe(1);
  });

  it('a truthful empty state only when the transcript is genuinely absent', () => {
    const i = appCode.indexOf('const openReviewForMeeting =');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    const msg = body.indexOf('No meeting notes were saved with this meeting');
    const elseIf = body.indexOf('} else if(notes.length) {');
    expect(msg).toBeGreaterThan(elseIf);       // reachable only when notes are empty
  });

  it('a superseded stub is never restored as a working draft', () => {
    const stub = supersedeReviewDraft(draftOf(), { now: '2026-09-25T12:00:00.000Z' });
    expect(restorableDraft({ ...meeting(), reviewDraft: stub })).toBeNull();
    expect(restorableDraft({ ...meeting(), reviewDraft: { record: '' } })).toBeNull();
    expect(restorableDraft({ ...meeting(), reviewDraft: null })).toBeNull();
  });
});

describe('26-32. failure and concurrency semantics', () => {
  it('26. an ordinary persistence failure keeps the local draft', async () => {
    const st = makeDraftStore([caseWith(meeting())], { fail: 'error' });
    const r = await st.write(draftOf());
    expect(r.ok).toBe(false);
    expect(st.meeting().reviewDraft).toBeUndefined();   // nothing half-written
  });

  it('27/28/29. a conflict keeps the draft, suspends autosave and NEVER auto-retries', async () => {
    const st = makeDraftStore([caseWith(meeting())], { fail: 'conflict' });
    const r = await st.write(draftOf());
    expect(r.reason).toBe('conflict');
    expect(st.meeting().reviewDraft).toBeUndefined();

    const i = appCode.indexOf('const persistReviewDraft = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain("if(result?.reason === \"conflict\")");
    expect(body).toContain('draftSuspendedRef.current = true');
    expect(body).toContain('setDraftStatus("conflict")');
    // the autosave effect refuses to run while suspended, and nothing re-arms it
    const eff = appCode.slice(appCode.indexOf('if(draftSuspendedRef.current) return;'), appCode.indexOf('}, [screen, caseInfo.caseId'));
    expect(eff).toContain('draftSuspendedRef.current');
    expect(body).not.toContain('loadCasesFromDB');
    expect(body).not.toContain('setTimeout');
  });

  it('30. explicit reconciliation can subsequently succeed', async () => {
    const st = makeDraftStore([caseWith(meeting())]);
    const r = await st.write(draftOf());
    expect(r.ok).toBe(true);
    const i = appCode.indexOf('const retryReviewDraft = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('draftSuspendedRef.current = false');
    expect(body).toContain('await persistReviewDraft()');
  });

  it('31/32. a stale draft write cannot overwrite a completed record', async () => {
    const completed = meeting({ status: MEETING_STATUS.COMPLETED, record: 'THE CONFIRMED RECORD' });
    const st = makeDraftStore([caseWith(completed)]);
    const r = await st.write(draftOf({ record: 'stale draft text' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    expect(st.meeting().record).toBe('THE CONFIRMED RECORD');   // authority wins
    expect(st.meeting().reviewDraft).toBeUndefined();
    expect(st.saveCases).not.toHaveBeenCalled();
    // and it is a hard stop, not a retry
    const i = appCode.indexOf('const persistReviewDraft = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('WRITE_FAILURE.STALE_STATUS');
    expect(body).toContain('setDraftStatus("superseded")');
  });

  it('a foreign or missing meeting is rejected', async () => {
    const st = makeDraftStore([caseWith(meeting())]);
    expect((await st.write(draftOf(), { meetingId: 'nope' })).reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect((await st.write(draftOf(), { caseId: 'nope' })).reason).toBe(WRITE_FAILURE.NOT_FOUND);
  });

  it('37. autosave debounces to one write per edit burst', () => {
    const i = appCode.indexOf('if(draftTimerRef.current) clearTimeout(draftTimerRef.current);');
    expect(i).toBeGreaterThan(-1);
    const eff = appCode.slice(i, i + 420);
    expect(eff).toContain('setTimeout(() => { persistReviewDraft(); }, 1500)');
    expect(eff).toContain('return () => { if(draftTimerRef.current) clearTimeout(draftTimerRef.current); };');
    // and an unchanged record never triggers a write at all
    expect(appCode).toContain('if(reviewOutput === draftLastWrittenRef.current) return;');
    expect(appCode).toContain('if(aiProcessing) return;');
  });
});

describe('21-25. completion still owns the authoritative record', () => {
  it('23/24. completion replaces the draft with a provenance stub and drops the text', () => {
    const edited = markDraftEdited(draftOf({ record: EDITED }), { by: 'Alex HR', now: '2026-09-25T11:00:00.000Z' });
    const stub = supersedeReviewDraft(edited, { now: '2026-09-25T12:00:00.000Z' });
    expect(stub.record).toBeUndefined();
    expect(stub.recordOriginal).toBeUndefined();
    expect(stub.summary).toBeUndefined();
    expect(stub.risk).toBeUndefined();
    expect(stub.editedByUser).toBe(true);
    expect(stub.editedBy).toBe('Alex HR');
    expect(stub.generatedAt).toBe('2026-09-25T10:31:00.000Z');
    expect(stub.supersededAt).toBe('2026-09-25T12:00:00.000Z');
    expect(stub.generationVersion).toBe(REVIEW_DRAFT_GENERATION_VERSION);
  });

  it('21/22/25. Save promotes the reviewed text and the stub is written with it', () => {
    // The saved object takes record from reviewOutput — the reviewed/edited text
    // that the draft was holding — and stubs the draft in the same patch.
    expect(appCode).toContain('record: reviewOutput,');
    expect(appCode).toContain('...(lifecycleMeetingId ? { reviewDraft: supersedeReviewDraft(draftMetaRef.current) } : {}),');
    // completion is still Slice 1's boundary, unchanged
    expect(appCode).toContain('allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED]');
    expect(appCode).toContain('toStatus: MEETING_STATUS.COMPLETED, patch: stampedMeeting, saveCases,');
  });

  it('the draft session is closed once the meeting completes', () => {
    const i = appCode.indexOf('if(lifecycleMeetingId) {');
    const body = appCode.slice(i, i + 420);
    expect(body).toContain('draftSuspendedRef.current = true');
    expect(body).toContain('draftMetaRef.current = null');
  });

  it('a legacy meeting is never given a draft', () => {
    const legacy = meeting({ record: 'Held long ago.' }); delete legacy.status;
    expect(restorableDraft(legacy)).toBeNull();
    expect(declaredStatus(legacy)).toBeNull();
    expect(isMeetingComplete(legacy)).toBe(true);     // Phase 1 floor unchanged
  });

  it('33. legacy compatibility across all four cases', () => {
    const legacyCompleted = meeting({ record: 'Held.' }); delete legacyCompleted.status;
    expect(isMeetingComplete(legacyCompleted)).toBe(true);
    const legacyNoRecord = meeting({ record: '', transcript: [] }); delete legacyNoRecord.status;
    expect(isMeetingComplete(legacyNoRecord)).toBe(false);
    expect(restorableDraft(meeting())).toBeNull();                               // review_draft, no draft
    expect(restorableDraft({ ...meeting(), reviewDraft: draftOf() })).not.toBeNull();  // review_draft with draft
  });

  it('34. the draft path never writes chairUserId', async () => {
    const CHAIR = '11111111-1111-1111-1111-111111111111';
    const st = makeDraftStore([caseWith(meeting({ type: 'Disciplinary Appeal', chairUserId: CHAIR }))]);
    await st.write(draftOf());
    expect(st.meeting().chairUserId).toBe(CHAIR);
    const i = appCode.indexOf('const persistReviewDraft = async ()');
    expect(appCode.slice(i, appCode.indexOf('\n  };', i))).not.toContain('chairUserId');
  });

  it('35. no permission surface is introduced — the draft rides the case write', () => {
    const i = appCode.indexOf('const persistReviewDraft = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('saveCases');                 // the existing case write path
    for (const forbidden of ['service_role', 'supabase.from', 'authedFetch', 'platform_admin']) {
      expect(body).not.toContain(forbidden);
    }
    expect(libCode).not.toContain('supabase');
  });
});

describe('36. Retry-generation cannot silently overwrite an edited draft', () => {
  it('the edited flag is available to gate it, and NEW-27 is not implemented here', () => {
    expect(markDraftEdited(draftOf()).editedByUser).toBe(true);
    // no Regenerate control was added in this slice
    expect(reviewCode).not.toContain('Regenerate');
    expect(appCode).not.toContain('regenerateReviewDraft');
  });

  it('Retry is still only offered when generation actually failed', () => {
    expect(reviewCode).toContain('{reviewGenerationFailed&&!editingRecord&&(');
    // and an edited draft is tracked, so 3C has the gate it needs
    expect(appCode).toContain('draftEditedRef.current');
  });
});

// ── the rendered status line ──
const noop = () => {};
const renderReview = (over = {}) => render(<ReviewScreen
  caseInfo={{ employee: 'Sam Patel', manager: 'Jane Smith', caseId: CASE_ID, meetingId: MID, date: '2026-10-04' }}
  meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} isHR cases={[caseWith(meeting())]}
  requestHrReview={noop} reviewOutput={RECORD} reviewOutputOriginal={RECORD} meetingSummary=""
  confirmDialog={noop} setShowShareModal={noop} saveMeetingToCase={noop} setScreen={noop}
  showToast={noop} askCompassInput="" setAskCompassInput={noop} askCompassHistory={[]}
  setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
  askCompassProcessing={false} editProcessing={false} editRecord={noop} editingRecord={false}
  setEditingRecord={noop} aiProcessing={false} aiError="" setReviewOutput={noop}
  setShowSignModal={noop} onSaveAndSendForSignature={noop} riskScore={null}
  reviewGenerationFailed={false} onRetryGeneration={noop} {...over} />);

describe('38. the Review status line renders each state truthfully', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('saving', () => { renderReview({ draftStatus: 'saving' });
    expect(screen.getByText('Saving draft…')).toBeInTheDocument(); });

  it('saved', () => { renderReview({ draftStatus: 'saved' });
    expect(screen.getByText('Draft saved')).toBeInTheDocument(); });

  it('error keeps the user’s work and promises a retry', () => {
    renderReview({ draftStatus: 'error' });
    expect(screen.getByText(/your changes are still here/)).toBeInTheDocument();
  });

  it('conflict shows the required wording and an explicit retry', () => {
    const onRetryReviewDraft = vi.fn();
    renderReview({ draftStatus: 'conflict', onRetryReviewDraft });
    expect(screen.getByText(/This case changed elsewhere\. Your draft is still here\. Review the latest case before trying again\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try saving again' })).toBeEnabled();
  });

  it('superseded explains that the record was confirmed elsewhere', () => {
    renderReview({ draftStatus: 'superseded' });
    expect(screen.getByText(/confirmed elsewhere/)).toBeInTheDocument();
  });

  it('nothing is shown when there is no draft status', () => {
    renderReview({ draftStatus: null });
    expect(screen.queryByText('Draft saved')).toBeNull();
    expect(screen.queryByText('Saving draft…')).toBeNull();
  });

  it('there is no second "Save draft" button', () => {
    renderReview({ draftStatus: 'saved' });
    expect(screen.queryByRole('button', { name: /Save draft/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save to case' })).toBeInTheDocument();
  });

  it('a human edit routes through the edit handler, not the raw setter', () => {
    expect(reviewCode).toContain('onChange={e=>(onEditReviewRecord||setReviewOutput)(e.target.value)}');
    const i = appCode.indexOf('const onEditReviewRecord = (next)');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('markDraftEdited');
    expect(body).toContain('draftEditedRef.current = true');
  });
});
