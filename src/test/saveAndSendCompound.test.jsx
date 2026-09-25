import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import { MEETING_STATUS, isMeetingComplete, declaredStatus } from '../lib/meetingLifecycle.js';
import { WRITE_FAILURE, transitionMeeting } from '../lib/meetingWrites.js';
import { getNextStep } from '../lib/nextStep.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase 3B slice 1 — UX refinement of the NEW-36 boundary.
//
// Slice 1 was architecturally right but forced Review → Save → Case View →
// Send for signature. Review now offers both legitimate choices while the record
// is a review_draft: "Save to case", and the compound
// "Save & send for signature".
//
// The compound action is an ORCHESTRATION of two existing operations in the only
// safe order — CONFIRM FIRST, THEN SIGNATURE — not a bypass. There is exactly one
// authoritative save; the second button reuses it.
//
// A bare "Send for signature" during review_draft stays forbidden: that wording
// conceals that it also confirms and completes the record.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
const strip = src => src.split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const appCode = strip(app);
const reviewCode = strip(review);

const CASE_ID = 'case-compound';
const MID = 'meeting_compound_disciplinary';
const STARTED = '2026-09-25T09:00:00.000Z';
const ENDED = '2026-09-25T10:30:00.000Z';
const PERSISTED_RECORD = '## Meeting Details\n\nType: Disciplinary Hearing\n\n## Meeting Dialogue\n\nHR: Confirmed.';
const LOCAL_DRAFT = '## Meeting Details\n\nSTALE LOCAL TEXT THAT MUST NEVER BE SENT';
const clone = v => JSON.parse(JSON.stringify(v));

const meeting = (over = {}) => ({
  id: MID, caseId: CASE_ID, type: 'Disciplinary', status: MEETING_STATUS.REVIEW_DRAFT,
  schedule: { date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-10-04', createdAt: '2026-09-25T08:17:02.782Z', createdBy: 'UAT - HR Manager',
  startedAt: STARTED, endedAt: ENDED, chairUserId: null, manager: 'Jane Smith', participants: [],
  record: null, transcript: [{ id: 'u1', speaker: 'HR', text: 'Confirmed.' }],
  signId: null, signStatus: null, invitation: null, calendar: null, ...over,
});
const caseWith = (...ms) => ({ id: CASE_ID, employeeName: 'Sam Patel', meetings: ms });

// Faithful model of the deployed orchestration: ONE authoritative save, then —
// only on success — signature, which independently re-reads persisted state.
const makeFlow = (initial, { saveFails = null, sendFails = false } = {}) => {
  let db = clone(initial);
  let caseInfoMeetingId = MID;          // cleared by a successful save (Phase 2.2)
  let pendingSignature = null;
  const events = [];
  const saveCases = vi.fn(async (next, changedId) => {
    events.push(['saveCases', changedId]); db = clone(next); return { ok: true };
  });
  const sendDocument = vi.fn(async ({ document }) => {
    events.push(['external_send', document]);
    return sendFails ? { success: false } : { success: true, signId: 'sig_new' };
  });

  const find = ids => {
    const cs = db.find(c => c && c.id === ids?.caseId);
    return (cs?.meetings || []).find(m => m && m.id === ids?.meetingId) || null;
  };
  const eligible = ids => {
    const m = find(ids);
    return !!m && declaredStatus(m) === MEETING_STATUS.COMPLETED
      && typeof m.record === 'string' && m.record.trim().length > 0;
  };

  // The ONE authoritative confirmation, shared by both buttons.
  const saveMeetingToCase = async () => {
    events.push(['save_attempt']);
    if (saveFails) { events.push(['save_failed', saveFails]); return { ok: false, reason: saveFails }; }
    const r = await transitionMeeting({
      cases: db, caseId: CASE_ID, meetingId: caseInfoMeetingId,
      allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED],
      toStatus: MEETING_STATUS.COMPLETED,
      patch: { record: PERSISTED_RECORD, savedAt: '2026-09-25T10:45:00.000Z', savedBy: 'UAT - HR Manager' },
      saveCases,
    });
    if (!r?.ok) { events.push(['save_failed', r?.reason]); return { ok: false, reason: r?.reason }; }
    caseInfoMeetingId = null;           // the real post-save cleanup
    events.push(['saved']);
    return { ok: true };
  };

  const sendForSignature = async () => {
    const ids = pendingSignature || { caseId: CASE_ID, meetingId: caseInfoMeetingId };
    const m = find(ids);
    if (!eligible(ids)) { events.push(['signature_rejected']); pendingSignature = null; return { ok: false }; }
    const { success, signId } = await sendDocument({ document: m.record });
    if (!success) { events.push(['send_failed']); return { ok: false }; }
    pendingSignature = null;
    const attached = await transitionMeeting({
      cases: db, caseId: ids.caseId, meetingId: ids.meetingId,
      allowedFrom: [MEETING_STATUS.COMPLETED], toStatus: MEETING_STATUS.COMPLETED,
      patch: { signId, signStatus: 'sent' }, saveCases,
    });
    return { ok: !!attached?.ok };
  };

  const saveAndSend = async () => {
    const ids = { caseId: CASE_ID, meetingId: caseInfoMeetingId };   // captured FIRST
    const saved = await saveMeetingToCase();
    if (!saved?.ok) return saved;                                    // Stage 2 never runs
    pendingSignature = ids;
    return await sendForSignature();
  };

  return { saveMeetingToCase, sendForSignature, saveAndSend, sendDocument, saveCases, events,
    meetings: () => db.find(c => c.id === CASE_ID).meetings,
    meeting: () => db.find(c => c.id === CASE_ID).meetings.find(m => m.id === MID) };
};

describe('3/4/11-15. the two legitimate choices', () => {
  it('3. Save to case completes and creates no signing request', async () => {
    const f = makeFlow([caseWith(meeting())]);
    const r = await f.saveMeetingToCase();
    expect(r.ok).toBe(true);
    expect(f.meeting().status).toBe(MEETING_STATUS.COMPLETED);
    expect(f.sendDocument).not.toHaveBeenCalled();
    expect(f.meeting().signId).toBeNull();
    expect(f.meeting().signStatus).toBeNull();
  });

  it('4. Save & send saves FIRST, then evaluates signature eligibility', async () => {
    const f = makeFlow([caseWith(meeting())]);
    const r = await f.saveAndSend();
    expect(r.ok).toBe(true);
    const order = f.events.map(e => e[0]);
    expect(order.indexOf('saved')).toBeLessThan(order.indexOf('external_send'));
    expect(order).not.toContain('signature_rejected');
    expect(f.meeting().status).toBe(MEETING_STATUS.COMPLETED);
    expect(f.meeting().signStatus).toBe('sent');
    expect(f.meeting().signId).toBe('sig_new');
  });

  it('11/12/13/14/15. one id throughout, no duplicate, timing and transcript intact', async () => {
    const before = meeting();
    const f = makeFlow([caseWith(before)]);
    await f.saveAndSend();
    const after = f.meeting();
    expect(after.id).toBe(MID);
    expect(after.caseId).toBe(CASE_ID);
    expect(f.meetings()).toHaveLength(1);
    expect(after.transcript).toEqual(before.transcript);
    expect(after.startedAt).toBe(STARTED);
    expect(after.endedAt).toBe(ENDED);
    expect(after.schedule).toEqual(before.schedule);
  });

  it('16. the document sent is the PERSISTED record, never stale local text', async () => {
    const f = makeFlow([caseWith(meeting())]);
    await f.saveAndSend();
    const sent = f.sendDocument.mock.calls[0][0].document;
    expect(sent).toBe(PERSISTED_RECORD);
    expect(sent).not.toContain('STALE LOCAL TEXT');
    // and the source asserts it reads the persisted record, not reviewOutput
    const i = appCode.indexOf('const sendForSignature = async (employeeEmail)');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    // The persisted record, AND employee-facing only since the 2026-09-25
    // boundary fix — legacy records still carry both halves mixed.
    expect(body).toContain('splitMeetingRecord(signMeeting.record).employeeFacing');
    expect(body).not.toContain('const full = reviewOutput;');
  });
});

describe('5/6/7. a failed save sends absolutely nothing', () => {
  for (const [label, reason] of [
    ['a stale updated_at / concurrency conflict', 'conflict'],
    ['an invalid lifecycle state', WRITE_FAILURE.STALE_STATUS],
    ['a missing or foreign meeting', WRITE_FAILURE.NOT_FOUND],
    ['a server failure', 'error'],
  ]) {
    it(`5/6/7. ${label} → no signing request, no email`, async () => {
      const f = makeFlow([caseWith(meeting())], { saveFails: reason });
      const r = await f.saveAndSend();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(reason);
      expect(f.sendDocument).not.toHaveBeenCalled();
      expect(f.events.map(e => e[0])).not.toContain('external_send');
      expect(f.meeting().status).toBe(MEETING_STATUS.REVIEW_DRAFT);   // untouched
      expect(f.meeting().signId).toBeNull();
    });
  }

  it('7b. a real invalid state is rejected by the transition itself', async () => {
    for (const status of [MEETING_STATUS.SCHEDULED, MEETING_STATUS.IN_PROGRESS, MEETING_STATUS.CANCELLED]) {
      const f = makeFlow([caseWith(meeting({ status }))]);
      const r = await f.saveAndSend();
      expect(r.ok).toBe(false);
      expect(f.sendDocument).not.toHaveBeenCalled();
      expect(f.meeting().status).toBe(status);
      expect(f.meeting().record).toBeNull();
    }
  });
});

describe('8/9/10. signature cannot complete, and a failed send is non-destructive', () => {
  it('8/9. signature against review_draft is rejected and completes nothing', async () => {
    const f = makeFlow([caseWith(meeting())]);
    const r = await f.sendForSignature();          // standalone, no save first
    expect(r.ok).toBe(false);
    expect(f.events.map(e => e[0])).toContain('signature_rejected');
    expect(f.sendDocument).not.toHaveBeenCalled();
    expect(f.meeting().status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(isMeetingComplete(f.meeting())).toBe(false);
  });

  it('10. save succeeds but sending fails → still completed, no rollback, retryable', async () => {
    const f = makeFlow([caseWith(meeting())], { sendFails: true });
    const r = await f.saveAndSend();
    expect(r.ok).toBe(false);
    expect(f.events.map(e => e[0])).toContain('send_failed');
    // the record is authoritative and stays that way
    expect(f.meeting().status).toBe(MEETING_STATUS.COMPLETED);
    expect(f.meeting().record).toBe(PERSISTED_RECORD);
    expect(f.meeting().signStatus).toBeNull();     // nothing falsely recorded as sent
    expect(f.meetings()).toHaveLength(1);
    // and signature can be retried later, because it is now eligible
    const retry = await f.sendForSignature();
    expect(retry.ok).toBe(false);                  // this flow still fails to send
    const f2 = makeFlow([caseWith(meeting({ status: MEETING_STATUS.COMPLETED, record: PERSISTED_RECORD }))]);
    expect((await f2.sendForSignature()).ok).toBe(true);
  });

  it('the source never rolls a completed meeting back to review_draft', () => {
    const i = appCode.indexOf('const saveAndSendForSignature = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).not.toContain('REVIEW_DRAFT');
    expect(body).not.toContain('rollback');
    // and Stage 2 only runs after Stage 1 reports ok
    expect(body).toContain('if(!saved?.ok) return saved;');
    expect(body.indexOf('const saved = await saveMeetingToCase();'))
      .toBeLessThan(body.indexOf('setShowSignModal(true);'));
  });

  it('there is ONE authoritative save — the compound action reuses it', () => {
    const i = appCode.indexOf('const saveAndSendForSignature = async ()');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('await saveMeetingToCase()');
    // no divergent second implementation
    expect(appCode).not.toContain('saveMeetingToCaseForSignature');
    expect(appCode).not.toContain('saveMeetingToCaseForNormalSave');
    expect((appCode.match(/allowedFrom: \[MEETING_STATUS\.REVIEW_DRAFT, MEETING_STATUS\.COMPLETED\]/g) || []).length).toBe(1);
  });
});

// ── the rendered Review screen ──
const noop = () => {};
let spies;
beforeEach(() => {
  spies = { setShowSignModal: vi.fn(), saveMeetingToCase: vi.fn(async () => ({ ok: true })),
    onSaveAndSendForSignature: vi.fn(async () => ({ ok: true })), setScreen: vi.fn() };
});
const renderReview = (over = {}) => render(<ReviewScreen
  caseInfo={{ employee: 'Sam Patel', manager: 'Jane Smith', caseId: CASE_ID, meetingId: MID, date: '2026-10-04' }}
  meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} isHR cases={[caseWith(meeting())]}
  requestHrReview={noop} reviewOutput={LOCAL_DRAFT} reviewOutputOriginal={LOCAL_DRAFT} meetingSummary=""
  confirmDialog={noop} setShowShareModal={noop} saveMeetingToCase={spies.saveMeetingToCase}
  setScreen={spies.setScreen} showToast={noop} askCompassInput="" setAskCompassInput={noop}
  askCompassHistory={[]} setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
  askCompassProcessing={false} editProcessing={false} editRecord={noop} editingRecord={false}
  setEditingRecord={noop} aiProcessing={false} aiError="" setReviewOutput={noop}
  setShowSignModal={spies.setShowSignModal} onSaveAndSendForSignature={spies.onSaveAndSendForSignature}
  riskScore={null} reviewGenerationFailed={false} onRetryGeneration={noop} {...over} />);

describe('1/2/18. the rendered Review offers the right two choices', () => {
  it('1. review_draft renders Save to case AND Save & send for signature', () => {
    renderReview({ signatureEligible: false });
    expect(screen.getByRole('button', { name: 'Save to case' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Save & send for signature/ })).toBeEnabled();
  });

  it('2. review_draft renders NO bare "Send for signature"', () => {
    renderReview({ signatureEligible: false });
    const buttons = screen.getAllByRole('button').map(b => b.textContent.trim());
    expect(buttons).not.toContain('Send for signature →');
    expect(buttons.some(t => t.startsWith('Save & send for signature'))).toBe(true);
  });

  it('the compound button invokes the compound handler, not the bare save', () => {
    renderReview({ signatureEligible: false });
    fireEvent.click(screen.getByRole('button', { name: /Save & send for signature/ }));
    expect(spies.onSaveAndSendForSignature).toHaveBeenCalledTimes(1);
    expect(spies.setShowSignModal).not.toHaveBeenCalled();   // the handler owns the ordering
  });

  it('its label states the confirmation rather than concealing it', () => {
    renderReview({ signatureEligible: false });
    expect(screen.getByText(/Confirms this record on the case file, then sends it/)).toBeInTheDocument();
  });

  it('18. an already completed meeting shows the plain signature action, not the compound one', () => {
    renderReview({ signatureEligible: true });
    expect(screen.getByRole('button', { name: /Send for signature/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Save & send for signature/ })).toBeNull();
  });

  it('neither appears without a record to review', () => {
    renderReview({ signatureEligible: false, reviewOutput: '' });
    expect(screen.queryByRole('button', { name: /Save & send for signature/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Send for signature/ })).toBeNull();
  });

  it('the two blocks are mutually exclusive in source', () => {
    expect(reviewCode).toContain('{!signatureEligible&&reviewOutput&&!editingRecord&&(');
    expect(reviewCode).toContain('{signatureEligible&&reviewOutput&&!editingRecord&&(');
  });
});

describe('17/19/20. nothing else regressed', () => {
  it('17. Case View still offers signature after a plain Save to case', () => {
    const cs = { id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
      meetings: [
        { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
          record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
        meeting({ status: MEETING_STATUS.COMPLETED, record: PERSISTED_RECORD }),
      ] };
    expect(getNextStep(cs, { isHR: true }).action).toBe('send_signature');
  });

  it('review_draft still offers only Review, never signature or outcome', () => {
    const cs = { id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
      meetings: [
        { id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
          record: 'Investigation record.', transcript: [1], signStatus: 'signed' },
        meeting(),
      ] };
    expect(getNextStep(cs, { isHR: true }).action).toBe('review_meeting_record');
  });

  it('19. Phase 3A End and Review re-entry are untouched', () => {
    expect(appCode).toContain('toStatus: MEETING_STATUS.REVIEW_DRAFT');
    expect(appCode).toContain('patch: { endedAt: meetingEndTimeVal, transcript: allNotes }');
    const i = appCode.indexOf('const openReviewForMeeting =');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('setScreen(SCREENS.REVIEW)');
    expect(body).not.toContain('MEETING_STATUS.COMPLETED');
  });

  it('20. the compound flow never writes chairUserId — appeal chair stays historical', async () => {
    const CHAIR = '11111111-1111-1111-1111-111111111111';
    const f = makeFlow([caseWith(meeting({ type: 'Disciplinary Appeal', chairUserId: CHAIR }))]);
    await f.saveAndSend();
    expect(f.meeting().chairUserId).toBe(CHAIR);
    expect(f.meeting().status).toBe(MEETING_STATUS.COMPLETED);
    const i = appCode.indexOf('const saveAndSendForSignature = async ()');
    expect(appCode.slice(i, appCode.indexOf('\n  };', i))).not.toContain('chairUserId');
  });
});
