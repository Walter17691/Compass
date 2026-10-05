import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingsTab } from '../components/caseTabs/MeetingsTab.jsx';
import {
  NEXT_STEP_TARGET, resolveNextStepMeeting, describeUnresolvedNextStep,
} from '../lib/nextStepTarget.js';
import { getNextStep } from '../lib/nextStep.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { canIssueFirstConfirmation } from '../lib/meetingIdentity.js';
import { restorableDraft } from '../lib/reviewDraft.js';

// ═══════════════════════════════════════════════════════════════════════════
// TRUST SLICE UAT DEFECT — "REVIEW & SEND" DID NOTHING.
//
// Human production UAT, case ZZ UAT Trust Slice. Three Investigation meetings:
//
//   [0] 2026-10-04  review_draft  record: ""      (blocker-2 forensic record)
//   [1] 2026-10-05  review_draft  record: ""      (fidelity UAT)
//   [2] 2026-10-05  completed     record: 1146    (saved to case — the one)
//
// The case CTA reasoned about [2] (lastGenuineMeeting) and then re-derived the
// meeting itself as FIRST type match by array position — [0] — whose record is
// empty, and read `if(m?.record){ … }` with no else. The click was swallowed.
//
// Two faults compounding: resolution by type and position instead of identity,
// and a guard with no failure path.
// ═══════════════════════════════════════════════════════════════════════════

const CASE_ID = '065d5a28-54a0-47f0-99a3-3ecb13f180bf';
const M_OLD = 'meeting_a0302155-9be5-4a10-a669-86dab2655ed2';
const M_MID = 'meeting_3c794857-406f-43cd-a92b-1413062da198';
const M_SAVED = 'meeting_1d809b4a-252a-4cc3-ac2a-6287e2681860';
const CHAIR = 'UAT D4.3 (test)';
const RECORD = '## Meeting Details\n\nType: Investigation Meeting\n\n## Record of Discussion\n\nThe chair raised the missing stock count on 2 October.';

const meeting = (id, date, status, record, over = {}) => ({
  id, caseId: CASE_ID, date, type: 'Investigation', status,
  manager: CHAIR, record,
  transcript: [1, 2, 3, 4].map(i => ({ id: `${id}-n${i}`, captureId: `${id}-n${i}`, channel: 'typing', text: `note ${i}`, ts: '20:45:40' })),
  ...over,
});

// The saved meeting as production actually holds it: the review draft is
// METADATA ONLY and superseded; the authoritative content is top level.
const savedMeeting = (over = {}) => meeting(M_SAVED, '2026-10-05', MEETING_STATUS.COMPLETED, RECORD, {
  summary: 'A triage summary.',
  advisorNotes: 'Internal advice.',
  riskScore: { rating: 'LOW', summary: 'Low.' },
  savedAt: '2026-10-05T20:10:44.834Z',
  reviewDraft: {
    generatedAt: '2026-10-05T20:08:43.413Z',
    supersededAt: '2026-10-05T20:10:44.834Z',
    editedAt: null, editedBy: null, editedByUser: false, generationVersion: 1,
  },
  ...over,
});

const uatCase = (over = {}) => ({
  id: CASE_ID, employeeName: 'ZZ UAT Trust Slice — Sam Testcase',
  caseType: 'misconduct', type: 'misconduct', stage: 'open', manager: CHAIR,
  meetings: [
    meeting(M_OLD, '2026-10-04', MEETING_STATUS.REVIEW_DRAFT, ''),
    meeting(M_MID, '2026-10-05', MEETING_STATUS.REVIEW_DRAFT, ''),
    savedMeeting(),
  ],
  allegations: [], evidence: [], tasks: [],
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the defect, reproduced and closed', () => {
  it('1. CONTROL: the OLD resolver picked the wrong meeting — first type match by position', () => {
    // Reproduced verbatim so the suite has detection power. If this ever stops
    // selecting the record-less meeting, the tests below prove nothing.
    const cs = uatCase();
    const searchTerm = 'investigation';
    const old = cs.meetings.filter(m => (m.type || '').toLowerCase().includes(searchTerm))[0]
      || cs.meetings[cs.meetings.length - 1];
    expect(old.id).toBe(M_OLD);
    expect(old.record).toBe('');
    // …and the old guard `if(m?.record)` therefore did nothing at all.
    expect(!!old.record).toBe(false);
  });

  it('2. the engine names the meeting it reasoned about, and it is the SAVED one', () => {
    const step = getNextStep(uatCase(), { allegations: [] });
    expect(step.action).toBe('send_signature');
    expect(step.reviewMeetingId).toBe(M_SAVED);
  });

  it('3. resolution is by that exact id — not type, date, position or "latest"', () => {
    const r = resolveNextStepMeeting(uatCase(), { reviewMeetingId: M_SAVED });
    expect(r.kind).toBe(NEXT_STEP_TARGET.RESOLVED);
    expect(r.meeting.id).toBe(M_SAVED);
    expect(r.meeting.record).toBe(RECORD);
  });

  it('4. an OLD awaiting-review meeting is never opened by accident', () => {
    const r = resolveNextStepMeeting(uatCase(), { reviewMeetingId: M_SAVED });
    expect(r.meeting.id).not.toBe(M_OLD);
    expect(r.meeting.id).not.toBe(M_MID);
  });

  it('5. multiple awaiting-review meetings resolve by exact id, both of them', () => {
    const cs = uatCase();
    for (const id of [M_OLD, M_MID]) {
      const r = resolveNextStepMeeting(cs, { reviewMeetingId: id }, { requireRecord: false });
      expect(r.kind).toBe(NEXT_STEP_TARGET.RESOLVED);
      expect(r.meeting.id).toBe(id);
    }
  });

  it('6. the resolver NEVER falls back to a guess', () => {
    const cs = uatCase();
    expect(resolveNextStepMeeting(cs, { reviewMeetingId: null }).kind).toBe(NEXT_STEP_TARGET.NO_ID);
    expect(resolveNextStepMeeting(cs, {}).kind).toBe(NEXT_STEP_TARGET.NO_ID);
    expect(resolveNextStepMeeting(cs, { reviewMeetingId: 'meeting_nope' }).kind).toBe(NEXT_STEP_TARGET.NOT_FOUND);
    // Crucially: no meeting object comes back with a guessed identity.
    expect(resolveNextStepMeeting(cs, { reviewMeetingId: 'meeting_nope' }).meeting).toBeUndefined();
  });

  it('7. a meeting with no saved record is reported, not silently skipped', () => {
    const r = resolveNextStepMeeting(uatCase(), { reviewMeetingId: M_OLD });
    expect(r.kind).toBe(NEXT_STEP_TARGET.NO_RECORD);
    expect(describeUnresolvedNextStep(r.kind)).toMatch(/hasn't been saved yet/);
  });

  it('8. every unresolved outcome has a message — the missing `else` cannot return', () => {
    for (const kind of Object.values(NEXT_STEP_TARGET)) {
      if (kind === NEXT_STEP_TARGET.RESOLVED) continue;
      expect(describeUnresolvedNextStep(kind), kind).toMatch(/Meetings tab/);
    }
    expect(describeUnresolvedNextStep(undefined)).toMatch(/Meetings tab/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. the case CTA no longer promises a send it does not perform', () => {
  it('9. the investigation CTA is labelled for what it opens', () => {
    const step = getNextStep(uatCase(), { allegations: [] });
    expect(step.label).toBe('Review & send investigation record');
    expect(step.label).not.toMatch(/^Send /);
  });

  it('10. every signature step carries an id and a Review label', () => {
    const src = readFileSync('src/lib/nextStep.js', 'utf8');
    const steps = [...src.matchAll(/\{label:"([^"]+)", action:"send_signature"[^}]*\}/g)];
    expect(steps.length).toBe(5);
    for (const [whole, label] of steps) {
      expect(whole, label).toMatch(/reviewMeetingId:/);
      expect(label).toMatch(/^Review & send /);
    }
  });

  it('11. the handler opens REVIEW, never the signature modal — reopening is not issuing', () => {
    const view = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    const i = view.indexOf('else if(nextStep.action==="send_signature")');
    expect(i).toBeGreaterThan(-1);
    const block = view.slice(i, i + 900);
    expect(block).toContain('resolveNextStepMeeting(cs, nextStep)');
    expect(block).toContain('onPresentMeetingRecord?.(m,');
    expect(block).not.toContain('setShowSignModal');
    expect(block).toContain('showToast?.(describeUnresolvedNextStep(target.kind)');
  });

  it('12. relevantMeeting() no longer decides which record gets issued', () => {
    const view = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    const i = view.indexOf('else if(nextStep.action==="send_signature")');
    const block = view.slice(i, i + 900);
    expect(block).not.toContain('relevantMeeting()');
  });

  it('13. no automatic signature request and no automatic issue', () => {
    const view = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    const i = view.indexOf('else if(nextStep.action==="send_signature")');
    const block = view.slice(i, i + 900);
    for (const f of ['send-for-signature', 'signing', 'setShowSignModal', 'fetch(']) {
      expect(block, f).not.toContain(f);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. the Meetings tab row resolves the same exact meeting', () => {
  const noop = () => {};
  const props = (over = {}) => ({
    cs: uatCase(), cases: [uatCase()], saveCases: noop, activeCaseStage: 'investigation',
    setActiveCaseStage: noop, setMeetingSetup: noop, setCaseInfo: noop,
    getEmployeeRecord: () => null, orgMembers: [], setScreen: noop, screens: {},
    onPresentMeetingRecord: noop, meetingTypes: [{ id: 'investigation', label: 'Investigation' }],
    fmtDate: d => d, attemptSubmitInvestigation: noop, concludingInvestigation: false,
    investigationReportDraft: '', setShowHandoffModal: noop, setLetterOutput: noop,
    onAcceptSavedSuggestion: noop, onDismissSavedSuggestion: noop, promptDialog: noop,
    audit: noop, loadSignedSnapshot: noop, loadRequestHistory: noop,
    proceedWithoutConfirmation: noop, onResendReminder: noop,
    ...over,
  });

  it('14. only the SAVED meeting offers Review & send', () => {
    expect(canIssueFirstConfirmation(savedMeeting())).toBe(true);
    expect(canIssueFirstConfirmation(uatCase().meetings[0])).toBe(false);
    expect(canIssueFirstConfirmation(uatCase().meetings[1])).toBe(false);
    render(<MeetingsTab {...props()} />);
    expect(screen.getAllByRole('button', { name: /Review & send/ })).toHaveLength(1);
  });

  it('15. clicking it hands over the exact meeting and case id', async () => {
    const onPresentMeetingRecord = vi.fn();
    render(<MeetingsTab {...props({ onPresentMeetingRecord })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(onPresentMeetingRecord).toHaveBeenCalledTimes(1);
    const [source, opts] = onPresentMeetingRecord.mock.calls[0];
    expect(source.id).toBe(M_SAVED);
    expect(opts.caseInfo.caseId).toBe(CASE_ID);
  });

  it('16. the row control and the case CTA resolve to the SAME meeting', async () => {
    const onPresentMeetingRecord = vi.fn();
    render(<MeetingsTab {...props({ onPresentMeetingRecord })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    const fromRow = onPresentMeetingRecord.mock.calls[0][0].id;
    const fromCta = resolveNextStepMeeting(uatCase(), getNextStep(uatCase(), { allegations: [] })).meeting.id;
    expect(fromRow).toBe(fromCta);
    expect(fromRow).toBe(M_SAVED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. what "Save to case" persists, and what Review reuses', () => {
  it('17. the review draft on a completed meeting is METADATA ONLY, and superseded', () => {
    const d = savedMeeting().reviewDraft;
    expect(d.supersededAt).toBeTruthy();
    expect(d.record).toBeUndefined();
    expect(d.summary).toBeUndefined();
    expect(d.advisorNotes).toBeUndefined();
    // So restore-first correctly declines it: a completion stub is not a draft.
    expect(restorableDraft(savedMeeting())).toBeNull();
  });

  it('18. the authoritative content is TOP LEVEL, which is what Review reads', () => {
    const m = savedMeeting();
    expect(m.record).toBe(RECORD);
    expect(m.summary).toBeTruthy();
    expect(m.advisorNotes).toBeTruthy();
    expect(m.riskScore).toBeTruthy();
  });

  it('19. so reopening REUSES the saved record — it does not regenerate', () => {
    // groundingFromMeeting is what presentMeetingRecord reads, and every field
    // it needs is present on the persisted meeting. No AI call is required to
    // show the record that was saved.
    const app = readFileSync('src/App.jsx', 'utf8');
    const i = app.indexOf('const presentMeetingRecord =');
    expect(i).toBeGreaterThan(-1);
    const block = app.slice(i, app.indexOf('};', app.indexOf('setScreen(SCREENS.REVIEW);', i)));
    expect(block).toContain('groundingFromMeeting(source)');
    expect(block).toContain('setScreen(SCREENS.REVIEW)');
    // No generation, no transition, no save.
    for (const f of ['handleReview', 'streamClaude', 'saveCases', 'transitionMeeting', 'setReviewReopenFor']) {
      expect(block, f).not.toContain(f);
    }
  });

  it('20. reopening creates no second meeting and no second draft', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    const i = app.indexOf('const presentMeetingRecord =');
    const block = app.slice(i, app.indexOf('};', app.indexOf('setScreen(SCREENS.REVIEW);', i)));
    expect(block).not.toContain('crypto.randomUUID');
    expect(block).not.toContain('persistReviewDraft');
    expect(block).not.toContain('buildReviewDraft');
  });

  it('21. the autosave cannot rewrite an unchanged reopened record', () => {
    // presentMeetingRecord primes draftLastWrittenRef with exactly what it shows,
    // and the autosave returns early when they match — so merely LOOKING at a
    // saved record never writes to the case.
    const app = readFileSync('src/App.jsx', 'utf8');
    const i = app.indexOf('const presentMeetingRecord =');
    const block = app.slice(i, app.indexOf('};', app.indexOf('setScreen(SCREENS.REVIEW);', i)));
    expect(block).toContain('draftLastWrittenRef.current = g.record;');
    expect(app).toContain('if(reviewOutput === draftLastWrittenRef.current) return;');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. identity and tenancy are not weakened', () => {
  it('22. resolution is scoped to the case the manager already has open', () => {
    // A meeting id belonging to a DIFFERENT case is not resolvable here, so the
    // id alone grants nothing: the caller must already hold that case.
    const other = { ...uatCase(), id: 'c-other' };
    const mine = { ...uatCase(), meetings: [uatCase().meetings[0]] };
    expect(resolveNextStepMeeting(mine, { reviewMeetingId: M_SAVED }).kind).toBe(NEXT_STEP_TARGET.NOT_FOUND);
    expect(resolveNextStepMeeting(other, { reviewMeetingId: M_SAVED }).meeting.id).toBe(M_SAVED);
  });

  it('23. the resolver reads only the case it is given — no global lookup', () => {
    const lib = readFileSync('src/lib/nextStepTarget.js', 'utf8');
    for (const f of ['supabase', 'fetch', 'cases', 'org_id', 'service_role']) {
      expect(lib, f).not.toMatch(new RegExp(`\\b${f}\\b`));
    }
  });

  it('24. and it never resolves by anything but the id', () => {
    const lib = readFileSync('src/lib/nextStepTarget.js', 'utf8');
    const fn = lib.slice(lib.indexOf('export function resolveNextStepMeeting'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    for (const f of ['\\.type', '\\.date', 'length - 1', 'filter\\(', 'includes\\(']) {
      expect(body, f).not.toMatch(new RegExp(f));
    }
    expect(body).toContain('m.id === id');
  });

  it('25. a malformed case or step cannot throw', () => {
    for (const cs of [null, undefined, {}, { meetings: null }, { meetings: 'x' }]) {
      for (const st of [null, undefined, {}, { reviewMeetingId: 5 }, { reviewMeetingId: '' }]) {
        expect(() => resolveNextStepMeeting(cs, st)).not.toThrow();
      }
    }
    expect(resolveNextStepMeeting({ meetings: [null, undefined] }, { reviewMeetingId: 'x' }).kind)
      .toBe(NEXT_STEP_TARGET.NOT_FOUND);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. the lifecycle around it is unchanged', () => {
  it('26. a review_draft meeting still routes to the restore-first path', () => {
    const draftOnly = {
      ...uatCase(),
      meetings: [meeting(M_MID, '2026-10-05', MEETING_STATUS.REVIEW_DRAFT, '', {
        reviewDraft: { record: RECORD, recordOriginal: RECORD, generatedAt: 'T', summary: 's', advisorNotes: 'a', risk: null },
      })],
    };
    const step = getNextStep(draftOnly, { allegations: [] });
    expect(step.action).toBe('review_meeting_record');
    expect(step.reviewMeetingId).toBe(M_MID);
    // And that draft IS restorable — it has content and is not superseded.
    expect(restorableDraft(draftOnly.meetings[0])).toBeTruthy();
  });

  it('27. the two reopen paths are kept apart by what the meeting actually holds', () => {
    // review_draft with content -> restore the working draft.
    // completed with a saved record -> show the authoritative record.
    expect(restorableDraft(savedMeeting())).toBeNull();
    const live = meeting(M_MID, '2026-10-05', MEETING_STATUS.REVIEW_DRAFT, '', {
      reviewDraft: { record: RECORD, generatedAt: 'T' },
    });
    expect(restorableDraft(live)).toBeTruthy();
  });

  it('28. the signature step still waits for the record to be settled', () => {
    const settled = { ...uatCase(), meetings: [savedMeeting({ signStatus: 'signed', signId: 's1' })] };
    const step = getNextStep(settled, { allegations: [] });
    expect(step.action).not.toBe('send_signature');
  });

  it('29. an unsaved record keeps the case on the earlier step, not on a dead CTA', () => {
    const noneSaved = {
      ...uatCase(),
      meetings: [meeting(M_OLD, '2026-10-04', MEETING_STATUS.REVIEW_DRAFT, '')],
    };
    const step = getNextStep(noneSaved, { allegations: [] });
    expect(step.action).not.toBe('send_signature');
  });
});
