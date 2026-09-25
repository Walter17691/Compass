import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import { MEETING_STATUS, declaredStatus, isMeetingComplete } from '../lib/meetingLifecycle.js';
import { WRITE_FAILURE, transitionMeeting } from '../lib/meetingWrites.js';
import { getNextStep } from '../lib/nextStep.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase 3B slice 1 — ONE authoritative review_draft → completed boundary.
// Closes NEW-36 (P1).
//
// The defect was architectural, not a stray button: the single writer of
// `status: completed` had no allowed-from guard, so every UI action reaching it
// defined "completed" for itself. "Send for signature" did it as a SIDE EFFECT,
// after already creating a signing row and emailing the record.
//
// Completion is now the canonical transitionMeeting with
// allowedFrom [review_draft, completed]. Signature is gated twice — on the
// rendered button and independently in the action, before anything leaves.
//
// These tests render the real ReviewScreen and click the real buttons, because
// the previous escape happened when only getNextStep was tested.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
const strip = src => src.split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const appCode = strip(app);
const reviewCode = strip(review);

const CASE_ID = 'case-3b';
const MID = 'meeting_3b_disciplinary';
const STARTED = '2026-09-25T09:00:00.000Z';
const ENDED = '2026-09-25T10:30:00.000Z';
const RECORD = '## Meeting Details\n\nType: Disciplinary Hearing\n\n## Meeting Dialogue\n\nHR: Noted.';
const clone = v => JSON.parse(JSON.stringify(v));

const meeting = (over = {}) => ({
  id: MID, caseId: CASE_ID, type: 'Disciplinary', status: MEETING_STATUS.REVIEW_DRAFT,
  schedule: { date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-10-04', createdAt: '2026-09-25T08:17:02.782Z', createdBy: 'UAT - HR Manager',
  startedAt: STARTED, endedAt: ENDED, chairUserId: null, manager: 'Jane Smith',
  participants: [{ name: 'Jane Smith', role: 'Chair' }],
  record: null, transcript: [{ id: 'u1', speaker: 'HR', text: 'Noted.' }],
  invitation: null, calendar: null, ...over,
});
const caseWith = (...ms) => ({ id: CASE_ID, employeeName: 'Sam Patel', meetings: ms });

// Models saveMeetingToCaseImpl's lifecycle branch: the canonical transition.
const makeSaver = (initial) => {
  let db = clone(initial);
  const changedIds = [];
  const saveCases = vi.fn(async (next, changedId) => { changedIds.push(changedId); db = clone(next); return { ok: true }; });
  const save = async ({ caseId = CASE_ID, meetingId = MID, record = RECORD, signatureInfo = {} } = {}) => {
    const patch = { record, summary: 'Key facts.', savedAt: '2026-09-25T10:45:00.000Z', savedBy: 'UAT - HR Manager',
      signId: signatureInfo.signId ?? null, signStatus: signatureInfo.signStatus ?? null };
    const r = await transitionMeeting({
      cases: db, caseId, meetingId,
      allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED],
      toStatus: MEETING_STATUS.COMPLETED, patch, saveCases,
    });
    return r?.ok ? { ok: true, meetingId } : { ok: false, reason: r?.reason };
  };
  return { save, saveCases, changedIds, cases: () => db,
    meetings: () => db.find(c => c.id === CASE_ID).meetings,
    meeting: id => db.find(c => c.id === CASE_ID).meetings.find(m => m.id === id) };
};

describe('3/4/5. Save is the authoritative confirmation', () => {
  it('3/4. review_draft → Save → the SAME meeting becomes completed', async () => {
    const h = makeSaver([caseWith(meeting())]);
    const res = await h.save();
    expect(res).toEqual({ ok: true, meetingId: MID });
    expect(h.meeting(MID).status).toBe(MEETING_STATUS.COMPLETED);
    expect(h.meetings()).toHaveLength(1);           // 11. no duplicate
    expect(isMeetingComplete(h.meeting(MID))).toBe(true);
  });

  it('5. completion preserves identity, timing, transcript, schedule, parentage', async () => {
    const before = meeting();
    const h = makeSaver([caseWith(before)]);
    await h.save();
    const after = h.meeting(MID);
    expect(after.id).toBe(MID);
    expect(after.caseId).toBe(CASE_ID);
    expect(after.startedAt).toBe(STARTED);
    expect(after.endedAt).toBe(ENDED);
    expect(after.transcript).toEqual(before.transcript);
    expect(after.schedule).toEqual(before.schedule);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.createdBy).toBe(before.createdBy);
    expect(after.chairUserId).toBe(before.chairUserId);
    expect(after.record).toBe(RECORD);              // the authoritative record
  });

  it('a completed meeting is workflow-complete and unlocks the next step', () => {
    const cs = { id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
      meetings: [
        { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
          record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
        meeting({ status: MEETING_STATUS.COMPLETED, record: RECORD }),
      ] };
    expect(getNextStep(cs, { isHR: true }).action).toBe('send_signature');
  });

  it('one single-case write with changedId — never sync-all', async () => {
    const h = makeSaver([caseWith(meeting())]);
    await h.save();
    expect(h.saveCases).toHaveBeenCalledTimes(1);
    expect(h.changedIds).toEqual([CASE_ID]);
  });
});

describe('6–10/12. invalid completion is rejected', () => {
  it('6/7/8. scheduled, in_progress and cancelled cannot be completed', async () => {
    for (const status of [MEETING_STATUS.SCHEDULED, MEETING_STATUS.IN_PROGRESS, MEETING_STATUS.CANCELLED]) {
      const h = makeSaver([caseWith(meeting({ status }))]);
      const res = await h.save();
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(WRITE_FAILURE.STALE_STATUS);
      expect(h.meeting(MID).status).toBe(status);      // unchanged
      expect(h.meeting(MID).record).toBeNull();        // no record written
      expect(h.saveCases).not.toHaveBeenCalled();
      expect(h.meetings()).toHaveLength(1);
    }
  });

  it('a legacy no-status meeting is never swept into completion', async () => {
    const legacy = meeting(); delete legacy.status;
    const h = makeSaver([caseWith(legacy)]);
    const res = await h.save();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(WRITE_FAILURE.STALE_STATUS);
    expect(declaredStatus(h.meeting(MID))).toBeNull();
  });

  it('9. a foreign meeting is rejected', async () => {
    const other = { id: 'case-other', employeeName: 'Someone Else',
      meetings: [meeting({ id: 'meeting_foreign', caseId: 'case-other' })] };
    const h = makeSaver([caseWith(meeting()), other]);
    const res = await h.save({ meetingId: 'meeting_foreign' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect(h.cases().find(c => c.id === 'case-other').meetings[0].status).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });

  it('10. a missing meeting and a missing case are rejected', async () => {
    const h = makeSaver([caseWith(meeting())]);
    expect((await h.save({ meetingId: 'nope' })).reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect((await h.save({ caseId: 'nope' })).reason).toBe(WRITE_FAILURE.NOT_FOUND);
    expect(h.saveCases).not.toHaveBeenCalled();
  });

  it('completion is idempotent — a double click cannot complete twice', async () => {
    const h = makeSaver([caseWith(meeting())]);
    const a = await h.save();
    const b = await h.save();
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);                           // not an error
    expect(h.meetings()).toHaveLength(1);              // no replay vulnerability
    expect(h.meeting(MID).startedAt).toBe(STARTED);
    expect(h.meeting(MID).endedAt).toBe(ENDED);
  });

  it('12. a concurrency conflict neither replays nor creates another meeting', async () => {
    const db = clone([caseWith(meeting())]);
    const saveCases = vi.fn(async () => ({ ok: false, reason: 'conflict' }));
    const r = await transitionMeeting({
      cases: db, caseId: CASE_ID, meetingId: MID,
      allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED],
      toStatus: MEETING_STATUS.COMPLETED, patch: { record: RECORD }, saveCases,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('conflict');
    expect(db.find(c => c.id === CASE_ID).meetings).toHaveLength(1);
    expect(db.find(c => c.id === CASE_ID).meetings[0].status).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });
});

// ── the rendered Review screen: the layer the previous defect escaped through ──
const noop = () => {};
let spies;
beforeEach(() => {
  spies = { setShowSignModal: vi.fn(), saveMeetingToCase: vi.fn(async () => ({ ok: true })), setScreen: vi.fn() };
});
const renderReview = (over = {}) => render(<ReviewScreen
  caseInfo={{ employee: 'Sam Patel', manager: 'Jane Smith', caseId: CASE_ID, meetingId: MID, date: '2026-10-04' }}
  meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} isHR cases={[caseWith(meeting())]}
  requestHrReview={noop} reviewOutput={RECORD} reviewOutputOriginal={RECORD} meetingSummary=""
  confirmDialog={noop} setShowShareModal={noop} saveMeetingToCase={spies.saveMeetingToCase}
  setScreen={spies.setScreen} showToast={noop} askCompassInput="" setAskCompassInput={noop}
  askCompassHistory={[]} setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
  askCompassProcessing={false} editProcessing={false} editRecord={noop} editingRecord={false}
  setEditingRecord={noop} aiProcessing={false} aiError="" setReviewOutput={noop}
  setShowSignModal={spies.setShowSignModal} riskScore={null} reviewGenerationFailed={false}
  onRetryGeneration={noop} {...over} />);

const signBtn = () => screen.queryByRole('button', { name: /Send for signature/ });

describe('1/16. the rendered signature button respects the boundary', () => {
  it('1. review_draft WITH generated output shows NO signature button', () => {
    renderReview({ signatureEligible: false });
    expect(signBtn()).toBeNull();
  });

  it('13/16. a completed meeting with an authoritative record DOES show it', () => {
    renderReview({ signatureEligible: true });
    expect(signBtn()).not.toBeNull();
    fireEvent.click(signBtn());
    expect(spies.setShowSignModal).toHaveBeenCalledWith(true);
  });

  it('eligibility alone is not enough — there must still be review output', () => {
    renderReview({ signatureEligible: true, reviewOutput: '' });
    expect(signBtn()).toBeNull();
  });

  it('the Save buttons remain available in review_draft — Save IS the confirmation', () => {
    renderReview({ signatureEligible: false });
    expect(screen.getByRole('button', { name: 'Save to case' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Save and go to case/ })).toBeEnabled();
  });

  it('the render gate is signatureEligible, not merely generated text', () => {
    // Phase 4C.3 added a !standalone conjunct: a standalone record has no case
    // to confirm against, so neither send block may render for one. The
    // guarantee asserted here is unchanged — the gate is signatureEligible, not
    // merely the presence of generated text.
    expect(reviewCode).toContain('{!standalone&&signatureEligible&&reviewOutput&&!editingRecord&&(');
    // and never ungated: every occurrence of that condition must carry the
    // eligibility prefix (a bare `not.toContain` would false-positive, because
    // the gated form contains the ungated string).
    const occurrences = reviewCode.split('{reviewOutput&&!editingRecord&&(').length - 1;
    const gated = reviewCode.split('{!standalone&&signatureEligible&&reviewOutput&&!editingRecord&&(').length - 1;
    expect(occurrences).toBe(gated);
  });
});

describe('2/8/14. the action boundary, independent of the button', () => {
  it('2. signature initiation checks the persisted meeting before anything leaves', () => {
    const i = appCode.indexOf('const sendForSignature = async (employeeEmail)');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    const guard = body.indexOf('if(!signatureEligibleIn(casesRef.current, ids))');
    expect(guard).toBeGreaterThan(-1);
    // the guard precedes BOTH the signing-row creation and the email
    expect(guard).toBeLessThan(body.indexOf('sendDocumentForSignature('));
    expect(body.indexOf('return;', guard)).toBeLessThan(body.indexOf('sendDocumentForSignature('));
  });

  it('eligibility requires completed status AND a saved record', () => {
    const i = appCode.indexOf('const signatureEligibleIn = (list, ids)');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('declaredStatus(m) === MEETING_STATUS.COMPLETED');
    expect(body).toContain('m.record.trim().length > 0');
    expect(body).not.toContain('employeeName');
    expect(body).not.toContain('reviewOutput');   // never the volatile local text
    // the ids it judges come from the authoritative pair, never a name lookup
    const idsFn = appCode.slice(appCode.indexOf('const signatureIds = ()'), appCode.indexOf('const signatureMeetingIn'));
    expect(idsFn).toContain('caseInfo.caseId');
    expect(idsFn).toContain('caseInfo.meetingId');
  });

  it('14. signature can never itself create completion', () => {
    // Completion's own allowed-from set stays as it is,
    expect(appCode).toContain('allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED]');
    // and the signature write is explicitly allowed only FROM completed, so it
    // can attach signId but can never be what completes a meeting.
    const i = appCode.indexOf('const sendForSignature = async (employeeEmail)');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('allowedFrom: [MEETING_STATUS.COMPLETED], toStatus: MEETING_STATUS.COMPLETED,');
    expect(body).toContain("patch: { signId, signStatus: \"sent\" }");
    expect(body).not.toContain('MEETING_STATUS.REVIEW_DRAFT');
    // and it never re-enters the save, which would append a duplicate now that
    // caseInfo.meetingId has been cleared
    expect(body).not.toContain('saveMeetingToCase(');
  });

  it('signature attaches signId to an already-completed meeting without re-completing', async () => {
    const h = makeSaver([caseWith(meeting({ status: MEETING_STATUS.COMPLETED, record: RECORD }))]);
    const res = await h.save({ signatureInfo: { signId: 'sig_1', signStatus: 'sent' } });
    expect(res.ok).toBe(true);
    expect(h.meeting(MID).signId).toBe('sig_1');
    expect(h.meeting(MID).signStatus).toBe('sent');
    expect(h.meeting(MID).status).toBe(MEETING_STATUS.COMPLETED);
    expect(h.meetings()).toHaveLength(1);
  });
});

describe('15. review_draft unlocks no downstream workflow', () => {
  const discCase = over => ({
    id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
    meetings: [
      { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
        record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
      meeting(over),
    ] });

  it('no signature, outcome, appeal outcome or closure from review_draft', () => {
    const step = getNextStep(discCase({}), { isHR: true });
    for (const blocked of ['send_signature', 'outcome_letter', 'appeal_letter', 'close_case', 'post_outcome']) {
      expect(step.action).not.toBe(blocked);
    }
    expect(step.action).toBe('review_meeting_record');
  });

  it('isMeetingComplete stays false for review_draft even with a record present', () => {
    expect(isMeetingComplete(meeting({ record: RECORD }))).toBe(false);
  });
});

describe('17–20. Phase 3A and earlier remain intact', () => {
  it('17. End still transitions in_progress → review_draft and does NOT complete', async () => {
    let db = clone([caseWith(meeting({ status: MEETING_STATUS.IN_PROGRESS, endedAt: null }))]);
    const saveCases = vi.fn(async (next) => { db = clone(next); return { ok: true }; });
    const r = await transitionMeeting({
      cases: db, caseId: CASE_ID, meetingId: MID,
      allowedFrom: [MEETING_STATUS.IN_PROGRESS], toStatus: MEETING_STATUS.REVIEW_DRAFT,
      patch: { endedAt: ENDED, transcript: [{ id: 'u1', text: 'Noted.' }] }, saveCases,
    });
    expect(r.ok).toBe(true);
    const m = db.find(c => c.id === CASE_ID).meetings[0];
    expect(m.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(isMeetingComplete(m)).toBe(false);
    expect(appCode).toContain('toStatus: MEETING_STATUS.REVIEW_DRAFT');
  });

  it('18. Review re-entry from review_draft still works and writes nothing', () => {
    const i = appCode.indexOf('const openReviewForMeeting =');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('setScreen(SCREENS.REVIEW)');
    for (const forbidden of ['saveCases', 'transitionMeeting', 'MEETING_STATUS.COMPLETED']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('19. scheduled → in_progress continuity is untouched', () => {
    expect(appCode).toContain('allowedFrom: [MEETING_STATUS.SCHEDULED]');
    expect(appCode).toContain('startScheduledMeeting(cs, plan.meeting)');
  });

  it('20. the completion path never writes chairUserId, so appeal chair stays historical', async () => {
    const CHAIR = '11111111-1111-1111-1111-111111111111';
    const h = makeSaver([caseWith(meeting({ type: 'Disciplinary Appeal', chairUserId: CHAIR }))]);
    await h.save();
    expect(h.meeting(MID).chairUserId).toBe(CHAIR);
    expect(h.meeting(MID).status).toBe(MEETING_STATUS.COMPLETED);
  });

  it('the meeting object no longer asserts its own completion', () => {
    // The inline `status: COMPLETED` that made every caller an authority is gone.
    expect(appCode).not.toContain('...(lifecycleMeetingId ? { status: MEETING_STATUS.COMPLETED } : {})');
  });
});
