import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, LETTER_STATUS,
  meetingKind, meetingStatus, isGenuineMeeting, isMeetingComplete, lastGenuineMeeting,
} from '../lib/meetingLifecycle.js';
import { isLetterOnlyRecord, isGenuineMeetingRecord, hasLetterType } from '../lib/caseStage.js';
import { getNextStep } from '../lib/nextStep.js';
import fixture from './fixtures/productionCaseShapes.json';

// Release 1 Phase 1 — the meeting lifecycle primitive.
//
// Phase 0's read-only production audit (2026-09-22) invalidated two
// assumptions in the originally approved design and these tests pin the
// corrected model:
//
//   1. 99 of 880 genuine production meetings carry NO record, yet all 99
//      carry savedAt (49 carry a transcript, 18 are appeal-type). Treating
//      "no explicit status" as "completed" for WORKFLOW purposes would have
//      advanced 20 live cases to a different next step.
//
//   2. 3 of the 4 stored letter artefacts carry real record content — they
//      are genuine hearings that ALSO produced an outcome letter. Treating
//      "letterType present" as "letter" would have erased those hearings.
//      caseStage.js's isLetterOnlyRecord already gets this right and stays
//      canonical; this module delegates rather than re-deriving.
//
// The resulting compatibility boundary is the thing these tests exist to
// protect: meetingStatus and isMeetingComplete are allowed to disagree for
// legacy data, and must not for declared data.

const legacyMeeting = (over = {}) => ({ id: 'm1', type: 'Investigation', record: 'Full record text.', transcript: [{ seq: 1 }], ...over });
const readSource = rel => readFileSync(rel, 'utf8');

describe('1. malformed / absent historical input is never fatal', () => {
  const junk = [null, undefined, 0, '', 'meeting', 42, true, [], NaN];

  it('no accessor throws on any malformed value', () => {
    for (const v of junk) {
      expect(() => meetingKind(v)).not.toThrow();
      expect(() => meetingStatus(v)).not.toThrow();
      expect(() => isGenuineMeeting(v)).not.toThrow();
      expect(() => isMeetingComplete(v)).not.toThrow();
    }
  });

  it('nothing malformed is ever a genuine or complete meeting', () => {
    for (const v of junk) {
      expect(isGenuineMeeting(v)).toBe(false);
      expect(isMeetingComplete(v)).toBe(false);
    }
  });

  it('meetingStatus reports unknown rather than claiming completion', () => {
    expect(meetingStatus(null)).toBeNull();
    expect(meetingStatus(undefined)).toBeNull();
    expect(meetingStatus('not an object')).toBeNull();
  });

  it('an empty object is a legacy meeting with nothing recorded — incomplete', () => {
    expect(meetingKind({})).toBe('meeting');
    expect(isGenuineMeeting({})).toBe(true);
    expect(isMeetingComplete({})).toBe(false);
  });

  it('a non-string record is not a meaningful record', () => {
    for (const record of [null, undefined, 0, 123, {}, [], '   ', '\n\t ']) {
      expect(isMeetingComplete(legacyMeeting({ record }))).toBe(false);
    }
  });

  it('lastGenuineMeeting tolerates absent and non-array input', () => {
    expect(lastGenuineMeeting(undefined)).toBeUndefined();
    expect(lastGenuineMeeting(null)).toBeUndefined();
    expect(lastGenuineMeeting('nope')).toBeUndefined();
    expect(lastGenuineMeeting([])).toBeUndefined();
  });
});

describe('2. legacy letter-only artefact', () => {
  const letter = { id: 'l1', type: 'Disciplinary Appeal', letterType: 'invite', letterOutput: 'Dear Sam...', record: '', transcript: [] };

  it('is a letter, not a meeting', () => {
    expect(meetingKind(letter)).toBe(LETTER_STATUS);
    expect(isGenuineMeeting(letter)).toBe(false);
  });

  it('reports the letter pseudo-status and is never workflow-complete', () => {
    expect(meetingStatus(letter)).toBe(LETTER_STATUS);
    expect(isMeetingComplete(letter)).toBe(false);
  });

  it('agrees exactly with the canonical classifier — no second implementation', () => {
    expect(isLetterOnlyRecord(letter)).toBe(true);
    expect(isGenuineMeeting(letter)).toBe(isGenuineMeetingRecord(letter));
  });
});

describe('3/4. a genuine hearing that ALSO produced a letter stays a meeting', () => {
  // The exact production shape: 3 of 4 stored letter artefacts look like this.
  const hearingWithLetter = { id: 'h1', type: 'Disciplinary', letterType: 'outcome', letterOutput: 'Outcome letter text', record: 'Full hearing record.', transcript: [] };
  const hearingWithTranscript = { id: 'h2', type: 'Disciplinary', letterType: 'outcome', letterOutput: 'Outcome letter text', record: '', transcript: [{ seq: 1 }, { seq: 2 }] };

  it('3. letterType + record is a genuine meeting', () => {
    expect(meetingKind(hearingWithLetter)).toBe('meeting');
    expect(isGenuineMeeting(hearingWithLetter)).toBe(true);
    expect(isMeetingComplete(hearingWithLetter)).toBe(true);
  });

  it('4. letterType + transcript is a genuine meeting', () => {
    expect(meetingKind(hearingWithTranscript)).toBe('meeting');
    expect(isGenuineMeeting(hearingWithTranscript)).toBe(true);
  });

  it('4b. but with no record it is still workflow-incomplete under the legacy rule', () => {
    expect(isMeetingComplete(hearingWithTranscript)).toBe(false);
  });
});

describe('5/6. legacy compatibility rule — no explicit status', () => {
  it('5. genuine meeting WITH a meaningful record is workflow-complete', () => {
    const m = legacyMeeting();
    expect(m.status).toBeUndefined();
    expect(isMeetingComplete(m)).toBe(true);
  });

  it('6. genuine meeting WITHOUT a record is workflow-incomplete', () => {
    const m = legacyMeeting({ record: '', savedAt: '2026-05-01T10:00:00.000Z' });
    expect(isMeetingComplete(m)).toBe(false);
  });

  it('6b. the production shape — saved, transcript present, no record — stays incomplete', () => {
    // 49 of the 99 audited no-record meetings look exactly like this.
    const m = { id: 'm9', type: 'Investigation', record: '', transcript: [{ seq: 1 }, { seq: 2 }], savedAt: '2026-05-01T10:00:00.000Z', letterOutput: null, letterType: null };
    expect(isGenuineMeeting(m)).toBe(true);
    expect(isMeetingComplete(m)).toBe(false);
  });
});

describe('THE COMPATIBILITY BOUNDARY — meetingStatus and isMeetingComplete may disagree', () => {
  it('a legacy no-record meeting semantically happened but is workflow-incomplete', () => {
    const m = legacyMeeting({ record: '', savedAt: '2026-05-01T10:00:00.000Z' });
    expect(meetingStatus(m)).toBe(MEETING_STATUS.COMPLETED); // it was saved: it happened
    expect(isMeetingComplete(m)).toBe(false);                // the engine still waits for a record
  });

  it('for DECLARED lifecycle objects the two never disagree', () => {
    for (const status of Object.values(MEETING_STATUS)) {
      const withRecord = legacyMeeting({ status });
      const withoutRecord = legacyMeeting({ status, record: '' });
      expect(meetingStatus(withRecord)).toBe(status);
      expect(meetingStatus(withoutRecord)).toBe(status);
      expect(isMeetingComplete(withRecord)).toBe(status === MEETING_STATUS.COMPLETED);
      expect(isMeetingComplete(withoutRecord)).toBe(status === MEETING_STATUS.COMPLETED);
    }
  });

  it('record presence is irrelevant once a status is declared — in both directions', () => {
    expect(isMeetingComplete(legacyMeeting({ status: MEETING_STATUS.COMPLETED, record: '' }))).toBe(true);
    expect(isMeetingComplete(legacyMeeting({ status: MEETING_STATUS.IN_PROGRESS, record: 'lots of text' }))).toBe(false);
  });
});

describe('7-11. declared lifecycle status is authoritative', () => {
  it('7. scheduled with no record is NOT complete', () => {
    expect(isMeetingComplete({ id: 's', type: 'Investigation', status: MEETING_STATUS.SCHEDULED, record: '' })).toBe(false);
  });

  it('8. in_progress WITH a record is NOT complete', () => {
    expect(isMeetingComplete({ id: 's', type: 'Investigation', status: MEETING_STATUS.IN_PROGRESS, record: 'partial notes' })).toBe(false);
  });

  it('9. review_draft holding generated content is NOT complete', () => {
    const m = { id: 's', type: 'Investigation', status: MEETING_STATUS.REVIEW_DRAFT, record: '', reviewDraft: { record: 'Generated record awaiting review.', summary: 'x' } };
    expect(isMeetingComplete(m)).toBe(false);
    expect(meetingStatus(m)).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });

  it('10. completed with NO record IS complete — status wins', () => {
    expect(isMeetingComplete({ id: 's', type: 'Investigation', status: MEETING_STATUS.COMPLETED, record: '' })).toBe(true);
  });

  it('11. cancelled is not complete', () => {
    const m = { id: 's', type: 'Investigation', status: MEETING_STATUS.CANCELLED, record: '' };
    expect(isMeetingComplete(m)).toBe(false);
    expect(meetingStatus(m)).toBe(MEETING_STATUS.CANCELLED);
  });

  it('an unrecognised status is not silently treated as complete', () => {
    expect(isMeetingComplete(legacyMeeting({ status: 'something_new' }))).toBe(false);
    expect(meetingStatus(legacyMeeting({ status: 'something_new' }))).toBe('something_new');
  });

  it('whitespace-only status falls back to the legacy rule rather than blocking', () => {
    expect(isMeetingComplete(legacyMeeting({ status: '   ' }))).toBe(true);
  });

  it('a declared status never overrides letter classification', () => {
    const letter = { id: 'l', type: 'Disciplinary', letterType: 'outcome', record: '', transcript: [] };
    expect(meetingKind({ ...letter, status: MEETING_STATUS.COMPLETED })).toBe(LETTER_STATUS);
  });
});

describe('12/13. same array, different questions', () => {
  // The exact UAT "Fresh Golden Path 2" shape that broke the first attempt.
  const meetings = [
    { id: 'm1', type: 'Investigation', record: 'inv record', transcript: [{ seq: 1 }] },
    { id: 'm2', type: 'Disciplinary', record: 'hearing record', transcript: [{ seq: 1 }] },
    { id: 'm3', type: 'Disciplinary', record: 'hearing record', letterType: 'outcome', letterOutput: 'outcome letter', transcript: [{ seq: 1 }] },
    { id: 'm4', type: 'Disciplinary Appeal', record: '', letterType: 'invite', letterOutput: 'invitation letter', transcript: [] },
    { id: 'm5', type: 'Disciplinary Appeal', record: 'appeal hearing record', transcript: [{ seq: 1 }] },
  ];

  it('12. "which genuine meeting happened last" skips the letter-only artefact', () => {
    const appeals = meetings.filter(m => (m.type || '').toLowerCase().includes('appeal'));
    expect(appeals.map(m => m.id)).toEqual(['m4', 'm5']);
    expect(lastGenuineMeeting(appeals).id).toBe('m5');
  });

  it('12b. and skips it even when the letter is the last element', () => {
    const trailingLetter = [meetings[4], meetings[3]];
    expect(lastGenuineMeeting(trailingLetter).id).toBe('m5');
  });

  it('13. "was a letter of type X ever saved" still sees the letter artefact', () => {
    const appeals = meetings.filter(m => (m.type || '').toLowerCase().includes('appeal'));
    expect(hasLetterType(appeals, 'invite')).toBe(true);
    expect(hasLetterType(meetings.filter(m => (m.type || '').toLowerCase() === 'disciplinary'), 'outcome')).toBe(true);
  });

  it('13b. filtering letters out of the letter lookup would lose the invitation — the regression this prevents', () => {
    const appeals = meetings.filter(m => (m.type || '').toLowerCase().includes('appeal'));
    expect(hasLetterType(appeals.filter(isGenuineMeeting), 'invite')).toBe(false);
  });

  it('13c. nextStep.js applies the filter to last-meeting picks and NOT to letter lookups', () => {
    const src = readSource('src/lib/nextStep.js');
    expect(src).toContain('const lastInv = lastGenuineMeeting(invMeetings);');
    expect(src).toContain('const lastDisc = lastGenuineMeeting(discMeetings);');
    expect(src).toContain('const lastAppeal = lastGenuineMeeting(appealMeetings);');
    expect(src).toContain('const lastHearing = lastGenuineMeeting(hearingMeetings);');
    // letter lookups read the UNFILTERED collections
    expect(src).toContain('hasLetterType(discMeetings, "outcome")');
    expect(src).toContain('hasLetterType(appealMeetings, "invite")');
    expect(src).toContain('hasLetterType(hearingMeetings, "outcome")');
    expect(src).not.toMatch(/hasLetterType\(\s*\w+\.filter/);
  });

  it('13d. record is no longer used as workflow state, but stays available as content', () => {
    const src = readSource('src/lib/nextStep.js');
    expect(src).not.toMatch(/if\(!last\w+\?\.record\)/);
    expect(src).toContain('isMeetingComplete(lastInv)');
    expect(src).toContain('isMeetingComplete(lastDisc)');
    expect(src).toContain('isMeetingComplete(lastAppeal)');
    expect(src).toContain('isMeetingComplete(lastHearing)');
    // signature checks are a different question and are untouched
    expect(src).toContain('lastInv?.signStatus!=="signed"');
  });
});

describe('PLATFORM PRIMITIVE — no case-type forks', () => {
  it('contains no case-type or process-recipe logic', () => {
    const src = readSource('src/lib/meetingLifecycle.js');
    const body = src.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .filter(l => !l.trim().startsWith('import '))   // the delegation import names caseStage by design
      .join('\n');
    for (const word of ['misconduct', 'grievance', 'disciplinary', 'appeal', 'probation', 'capability', 'redundancy', 'getnextstep', 'recipe']) {
      expect(body.toLowerCase()).not.toContain(word);
    }
  });

  it('has no I/O, AI, Supabase or mutation dependency', () => {
    const src = readSource('src/lib/meetingLifecycle.js');
    expect(src).not.toMatch(/authedFetch|\/api\/|supabase|streamClaude|localStorage|fetch\(/);
    expect(src.match(/^import .*$/gm)).toEqual(["import { isLetterOnlyRecord, isGenuineMeetingRecord } from './caseStage.js';"]);
  });

  it('delegates classification rather than re-deriving it', () => {
    const src = readSource('src/lib/meetingLifecycle.js');
    // the letterType/record/transcript rule must exist in exactly one place
    expect(src).not.toMatch(/meeting\.letterType|Array\.isArray\(\s*\w+\.transcript\s*\)/);
  });

  it('lifecycle semantics apply identically across every meeting type', () => {
    const types = ['Investigation', 'Disciplinary', 'Disciplinary Appeal', 'Grievance', 'Return to Work', 'Formal Meeting', 'Informal / 1-1', 'Probation Review', 'Consultation'];
    for (const type of types) {
      expect(isMeetingComplete({ type, status: MEETING_STATUS.COMPLETED, record: '' })).toBe(true);
      expect(isMeetingComplete({ type, status: MEETING_STATUS.SCHEDULED, record: 'x' })).toBe(false);
      expect(isMeetingComplete({ type, record: 'x' })).toBe(true);
      expect(isMeetingComplete({ type, record: '' })).toBe(false);
    }
  });
});

describe('14. production parity — all 58 shapes, all 774 cases', () => {
  const toCase = s => ({
    id: 'x', stage: s.stage, caseType: s.caseType,
    outcome: s.outcome ? 'decided' : null,
    investigationReport: s.invReport ? 'R' : null,
    ohReportReceivedDate: s.oh1 ? '2026-01-01' : null,
    ohReferralDate: s.oh2 ? '2026-01-01' : null,
    fitNoteEndDate: s.fit ? '2026-01-01' : null,
    meetings: (s.meetings || []).map((m, i) => ({
      id: 'm' + i, type: m.type,
      record: m.rec ? 'RECORD' : '',
      transcript: Array.from({ length: m.tx }, (_, k) => ({ seq: k })),
      signStatus: m.sign, letterOutput: m.lo ? 'LETTER' : null, letterType: m.lt,
    })),
  });

  it('the fixture covers every production case carrying meetings', () => {
    expect(fixture.shapes.length).toBe(58);
    expect(fixture.totalCases).toBe(774);
    expect(fixture.shapes.reduce((a, b) => a + b.n, 0)).toBe(774);
  });

  it('every shape produces the pre-Phase-1 action under every ctx — zero drift', () => {
    const drift = [];
    for (const { n, shape, expect: expected } of fixture.shapes) {
      const cs = toCase(shape);
      fixture.ctxPermutations.forEach((ctx, i) => {
        const result = getNextStep(cs, ctx);
        const action = result ? result.action : null;
        if (action !== expected[i]) drift.push({ n, ctx, before: expected[i], after: action });
      });
    }
    expect(drift).toEqual([]);
  });

  it('no production case changes its next step (case-weighted count is zero)', () => {
    let affected = 0;
    for (const { n, shape, expect: expected } of fixture.shapes) {
      const cs = toCase(shape);
      const differs = fixture.ctxPermutations.some((ctx, i) => {
        const r = getNextStep(cs, ctx);
        return (r ? r.action : null) !== expected[i];
      });
      if (differs) affected += n;
    }
    expect(affected).toBe(0);
  });

  it('the 99 no-record legacy meetings are still read as workflow-incomplete', () => {
    // This exact shape occurs 49 times in production: investigation meeting,
    // no record. Its next step is asserted against the captured pre-Phase-1
    // baseline rather than a hand-written guess.
    const target = fixture.shapes.find(s =>
      s.shape.meetings.length === 1 && s.shape.meetings[0].type === 'investigation' &&
      s.shape.meetings[0].rec === false && s.shape.meetings[0].tx === 0 && s.shape.stage === 'open');
    expect(target).toBeDefined();
    expect(target.n).toBe(49);
    const cs = toCase(target.shape);
    expect(isMeetingComplete(cs.meetings[0])).toBe(false);
    expect(getNextStep(cs, {}).action).toBe(target.expect[0]);
  });
});
