import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_STATUS, LETTER_STATUS, declaredStatus, isGenuineMeeting, isMeetingComplete,
  scheduledMeetingsFor, resumableMeetingFor, meetingStatus, lastGenuineMeeting,
} from '../lib/meetingLifecycle.js';
import { getNextStep, withExistingMeeting } from '../lib/nextStep.js';

// ─────────────────────────────────────────────────────────────────────────
// Lifecycle reader consistency, after Phase 2.3 closed.
//
// Human UAT reached a state where Compass said both things at once: the amber
// banner offered to RESUME a live Disciplinary hearing, while the suggested next
// step said "Start disciplinary hearing". Following the suggestion would have
// started a second hearing.
//
// The recipes ask isMeetingComplete, which is deliberately the WORKFLOW question
// ("may the process move on?"). in_progress and review_draft are both correctly
// "not complete", so every recipe read them as "no hearing yet". Only the
// scheduled case had been routed through the shared post-processor.
//
// The states do NOT all behave the same, and that is the point:
//   in_progress   -> Resume, never Start
//   review_draft  -> neither Start nor Resume
//   scheduled     -> resolve to the existing meeting (pre-existing behaviour)
//   cancelled     -> NOT held, NOT existing: a replacement may be recommended
//   completed     -> downstream recipe behaviour untouched
//   legacy (null) -> Phase 1 compatibility preserved exactly
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const caseView = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
const nextStepSrc = readFileSync('src/lib/nextStep.js', 'utf8');

const stripComments = src => src
  .split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');

const appCode = stripComments(app);
const caseViewCode = stripComments(caseView);

const CASE_ID = 'case-lrc';
const HR = { isHR: true };

const disc = (over = {}) => ({
  id: 'm_disc', caseId: CASE_ID, type: 'Disciplinary',
  schedule: { date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-10-04', createdAt: '2026-09-25T09:55:02.484Z', createdBy: 'UAT - HR Manager',
  startedAt: null, endedAt: null, chairUserId: null, record: '', transcript: [],
  participants: [], manager: '', invitation: null, calendar: null, ...over,
});

const completedInvestigation = (over = {}) => ({
  id: 'm_inv', caseId: CASE_ID, type: 'Investigation', status: MEETING_STATUS.COMPLETED,
  date: '2026-09-20', record: 'Investigation record — the employee gave their account.',
  transcript: [1, 2], startedAt: '2026-09-20T09:00:00.000Z', endedAt: '2026-09-20T09:40:00.000Z',
  signStatus: 'signed', ...over,
});

// A disciplinary-stage case: investigation done and signed, so the recipe is
// asking about the hearing itself.
const discCase = (...meetings) => ({
  id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
  meetings: [completedInvestigation(), ...meetings],
});

describe('1. scheduled — never recommend starting a new hearing', () => {
  it('1.1 resolves to the existing scheduled meeting', () => {
    const step = getNextStep(discCase(disc({ status: MEETING_STATUS.SCHEDULED })), HR);
    expect(step.action).toBe('start_scheduled_meeting');
    expect(step.scheduledMeetingId).toBe('m_disc');
    expect(step.label).not.toBe('Start disciplinary hearing');
  });

  it('1.2 the scheduled meeting is still offered by the banner selector', () => {
    const cs = discCase(disc({ status: MEETING_STATUS.SCHEDULED }));
    expect(scheduledMeetingsFor(cs).map(m => m.id)).toEqual(['m_disc']);
    expect(resumableMeetingFor(cs).meeting).toBeNull();
  });
});

describe('2. in_progress — Resume, never Start', () => {
  const live = () => disc({ status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-09-25T09:55:30.265Z' });

  it('2.1 getNextStep does NOT return "Start disciplinary hearing"', () => {
    const step = getNextStep(discCase(live()), HR);
    expect(step.action).not.toBe('start_disciplinary');
    expect(step.label).not.toBe('Start disciplinary hearing');
  });

  it('2.2 it returns Resume, naming that exact meeting', () => {
    const step = getNextStep(discCase(live()), HR);
    expect(step.action).toBe('resume_meeting');
    expect(step.label).toBe('Resume meeting');
    expect(step.resumeMeetingId).toBe('m_disc');
  });

  it('2.3 the step and the amber banner agree on which meeting is live', () => {
    const cs = discCase(live());
    expect(getNextStep(cs, HR).resumeMeetingId).toBe(resumableMeetingFor(cs).meeting.id);
    // and nothing is still advertised as scheduled
    expect(scheduledMeetingsFor(cs)).toEqual([]);
  });

  it('2.4 two live meetings resolve to the same one the banner shows', () => {
    const cs = discCase(
      disc({ id: 'm_a', status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-09-25T08:00:00.000Z' }),
      disc({ id: 'm_b', status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-09-25T09:00:00.000Z' }),
    );
    const live2 = resumableMeetingFor(cs);
    expect(live2.ambiguous).toBe(true);
    const step = getNextStep(cs, HR);
    expect(step.action).toBe('resume_meeting');
    expect(step.resumeMeetingId).toBe(live2.meeting.id);
    expect(step.reason).toContain('marked in progress');
  });

  it('2.5 a live meeting of ANOTHER type does not hijack the step', () => {
    // An investigation still running must not turn the disciplinary step into
    // "resume" — that would resume the wrong meeting.
    const cs = {
      id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'disciplinary',
      meetings: [completedInvestigation({ id: 'm_inv2', status: MEETING_STATUS.IN_PROGRESS, endedAt: null })],
    };
    const step = getNextStep(cs, HR);
    expect(step.action).not.toBe('resume_meeting');
  });
});

describe('3. review_draft — neither Start nor Resume', () => {
  const inReview = () => disc({
    status: MEETING_STATUS.REVIEW_DRAFT, startedAt: '2026-09-25T09:55:30.265Z',
    endedAt: '2026-09-25T10:40:00.000Z', record: 'Draft hearing record awaiting finalisation.',
  });

  it('3.1 does not return Start', () => {
    const step = getNextStep(discCase(inReview()), HR);
    expect(step.action).not.toBe('start_disciplinary');
    expect(step.label).not.toBe('Start disciplinary hearing');
  });

  it('3.2 does not return Resume either', () => {
    const step = getNextStep(discCase(inReview()), HR);
    expect(step.action).not.toBe('resume_meeting');
  });

  it('3.3 surfaces the record for confirmation, naming that meeting', () => {
    const step = getNextStep(discCase(inReview()), HR);
    expect(step.action).toBe('review_meeting_record');
    expect(step.reviewMeetingId).toBe('m_disc');
  });

  it('3.4 review_draft is not treated as workflow-complete', () => {
    expect(isMeetingComplete(inReview())).toBe(false);
    expect(meetingStatus(inReview())).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });
});

describe('4. completed — downstream recipe behaviour unchanged', () => {
  it('4.1 a completed hearing moves on to signature, not Start or Resume', () => {
    const step = getNextStep(discCase(disc({
      status: MEETING_STATUS.COMPLETED, startedAt: '2026-09-25T09:55:30.265Z',
      endedAt: '2026-09-25T10:40:00.000Z', record: 'The hearing was held.',
    })), HR);
    expect(step.action).toBe('send_signature');
    expect(step.action).not.toBe('resume_meeting');
  });

  it('4.2 a completed AND signed hearing proceeds to the outcome letter', () => {
    const step = getNextStep(discCase(disc({
      status: MEETING_STATUS.COMPLETED, record: 'The hearing was held.',
      signStatus: 'signed', endedAt: '2026-09-25T10:40:00.000Z',
    })), HR);
    expect(step.action).toBe('outcome_letter');
  });

  it('4.3 the post-processor leaves non-schedulable actions completely alone', () => {
    const cs = discCase(disc({ status: MEETING_STATUS.IN_PROGRESS }));
    const untouched = { action: 'outcome_letter', label: 'Draft outcome letter', meetingType: 'disciplinary' };
    expect(withExistingMeeting(cs, untouched)).toBe(untouched);
    expect(withExistingMeeting(cs, null)).toBeNull();
  });
});

describe('5. cancelled — not held, and a replacement may be recommended', () => {
  const cancelled = () => disc({
    status: MEETING_STATUS.CANCELLED, cancelledAt: '2026-09-25T11:00:00.000Z',
    cancelledReason: 'Employee unwell',
  });

  it('5.1 a cancelled hearing does not count as completed', () => {
    expect(isMeetingComplete(cancelled())).toBe(false);
    expect(meetingStatus(cancelled())).toBe(MEETING_STATUS.CANCELLED);
  });

  it('5.2 a replacement hearing IS still recommended', () => {
    const step = getNextStep(discCase(cancelled()), HR);
    expect(step.action).toBe('start_disciplinary');
    expect(step.label).toBe('Start disciplinary hearing');
  });

  it('5.3 a cancelled meeting is neither scheduled nor resumable', () => {
    const cs = discCase(cancelled());
    expect(scheduledMeetingsFor(cs)).toEqual([]);
    expect(resumableMeetingFor(cs).meeting).toBeNull();
  });

  it('5.4 cancelling one and scheduling another resolves to the live one', () => {
    const cs = discCase(cancelled(), disc({ id: 'm_new', status: MEETING_STATUS.SCHEDULED }));
    const step = getNextStep(cs, HR);
    expect(step.action).toBe('start_scheduled_meeting');
    expect(step.scheduledMeetingId).toBe('m_new');
  });
});

describe('6. legacy — Phase 1 compatibility preserved exactly', () => {
  it('6.1 a legacy genuine meeting with a record still reads as complete', () => {
    const legacy = disc({ record: 'The hearing was held and the employee responded.', transcript: [1] });
    delete legacy.status;
    expect(declaredStatus(legacy)).toBeNull();
    expect(isMeetingComplete(legacy)).toBe(true);
    expect(getNextStep(discCase(legacy), HR).action).toBe('send_signature');
  });

  it('6.2 a legacy genuine meeting with no record still reads as not held', () => {
    const legacy = disc({ record: '', transcript: [] });
    delete legacy.status;
    expect(isMeetingComplete(legacy)).toBe(false);
    expect(getNextStep(discCase(legacy), HR).action).toBe('start_disciplinary');
  });

  it('6.3 a legacy row is never swept into Resume or Review', () => {
    const legacy = disc({ record: '', transcript: [] });
    delete legacy.status;
    const step = getNextStep(discCase(legacy), HR);
    expect(step.action).not.toBe('resume_meeting');
    expect(step.action).not.toBe('review_meeting_record');
  });
});

describe('7/8. letter artefacts vs genuine hearings', () => {
  it('7.1 a letter-only artefact does not satisfy the meeting requirement', () => {
    const letter = { id: 'm_letter', caseId: CASE_ID, type: 'Disciplinary', letterType: 'invite',
      letterOutput: 'Dear Sam, you are invited…', record: '', transcript: [] };
    expect(isGenuineMeeting(letter)).toBe(false);
    expect(meetingStatus(letter)).toBe(LETTER_STATUS);
    // the hearing still has to happen
    expect(getNextStep(discCase(letter), HR).action).toBe('start_disciplinary');
  });

  it('7.2 a letter artefact cannot become Resume or Review even if it claims a status', () => {
    const letter = { id: 'm_letter', caseId: CASE_ID, type: 'Disciplinary', letterType: 'invite',
      letterOutput: 'Dear Sam…', record: '', transcript: [], status: MEETING_STATUS.REVIEW_DRAFT };
    expect(isGenuineMeeting(letter)).toBe(false);
    const step = getNextStep(discCase(letter), HR);
    expect(step.action).not.toBe('review_meeting_record');
    expect(step.action).not.toBe('resume_meeting');
  });

  it('8.1 a genuine hearing carrying letterType AND a record remains genuine', () => {
    const both = disc({ letterType: 'invite', letterOutput: 'Dear Sam…',
      record: 'The hearing was held and the employee responded.', transcript: [1, 2] });
    delete both.status;
    expect(isGenuineMeeting(both)).toBe(true);
    expect(isMeetingComplete(both)).toBe(true);
    expect(lastGenuineMeeting([both]).id).toBe('m_disc');
  });

  it('8.2 a genuine in-progress hearing carrying letterType still resumes', () => {
    const both = disc({ status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-09-25T09:00:00.000Z',
      letterType: 'invite', letterOutput: 'Dear Sam…', record: 'Partial notes so far.' });
    expect(getNextStep(discCase(both), HR).action).toBe('resume_meeting');
  });
});

describe('9/10. investigation and appeal equivalents do not regress', () => {
  const invCase = (...meetings) => ({
    id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'investigation', meetings,
  });
  const inv = (over = {}) => ({ id: 'm_i', caseId: CASE_ID, type: 'Investigation',
    date: '2026-10-01', record: '', transcript: [], ...over });

  it('9.1 a live investigation resumes rather than starting another', () => {
    const step = getNextStep(invCase(inv({ status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-09-25T09:00:00.000Z' })), HR);
    expect(step.action).toBe('resume_meeting');
    expect(step.resumeMeetingId).toBe('m_i');
  });

  it('9.2 a scheduled investigation still resolves to the existing meeting', () => {
    const step = getNextStep(invCase(inv({ status: MEETING_STATUS.SCHEDULED,
      schedule: { date: '2026-10-01', time: '10:00' } })), HR);
    expect(step.action).toBe('start_scheduled_meeting');
  });

  it('9.3 no investigation meeting at all still recommends starting one', () => {
    expect(getNextStep(invCase(), HR).action).toBe('start_investigation');
  });

  it('10.1 a live appeal hearing resumes rather than starting another', () => {
    const cs = { id: CASE_ID, employeeName: 'Sam Patel', caseType: 'Misconduct', stage: 'appeal',
      appealText: 'I appeal the decision.', outcome: 'Final written warning',
      meetings: [
        completedInvestigation(),
        disc({ id: 'm_d', status: MEETING_STATUS.COMPLETED, record: 'Held.', signStatus: 'signed' }),
        // the appeal branch asks for an invitation before it asks about the
        // hearing, so the letter artefact has to be present
        { id: 'm_ap_inv', caseId: CASE_ID, type: 'Disciplinary Appeal', letterType: 'invite',
          letterOutput: 'Dear Sam, your appeal will be heard…', record: '', transcript: [] },
        { id: 'm_ap', caseId: CASE_ID, type: 'Disciplinary Appeal', status: MEETING_STATUS.IN_PROGRESS,
          startedAt: '2026-09-25T09:00:00.000Z', record: '', transcript: [], chairUserId: 'officer-1' },
      ] };
    const step = getNextStep(cs, { isHR: true, hasAppealManager: true });
    expect(step.action).toBe('resume_meeting');
    expect(step.resumeMeetingId).toBe('m_ap');
  });

  it('10.2 the appeal chair is never touched by a reader', () => {
    expect(nextStepSrc).not.toContain('chairUserId =');
    expect(stripComments(nextStepSrc)).not.toContain('chairUserId');
  });
});

describe('11. the canonical selectors themselves remain correct', () => {
  it('11.1 scheduledMeetingsFor only ever returns declared scheduled genuine meetings', () => {
    const cs = discCase(
      disc({ id: 'm1', status: MEETING_STATUS.SCHEDULED }),
      disc({ id: 'm2', status: MEETING_STATUS.IN_PROGRESS }),
      disc({ id: 'm3', status: MEETING_STATUS.CANCELLED }),
      disc({ id: 'm4', status: MEETING_STATUS.COMPLETED, record: 'x' }),
    );
    expect(scheduledMeetingsFor(cs).map(m => m.id)).toEqual(['m1']);
  });

  it('11.2 resumableMeetingFor only ever returns declared in_progress genuine meetings', () => {
    const cs = discCase(
      disc({ id: 'm1', status: MEETING_STATUS.SCHEDULED }),
      disc({ id: 'm2', status: MEETING_STATUS.IN_PROGRESS, startedAt: '2026-09-25T09:00:00.000Z' }),
      disc({ id: 'm3', status: MEETING_STATUS.CANCELLED }),
    );
    expect(resumableMeetingFor(cs).meeting.id).toBe('m2');
    expect(resumableMeetingFor(cs).ambiguous).toBe(false);
  });
});

describe('12. no write behaviour is introduced by a reader', () => {
  it('12.1 the post-processor is pure — no writes, no id minting', () => {
    const i = nextStepSrc.indexOf('export function withExistingMeeting');
    const body = stripComments(nextStepSrc.slice(i, nextStepSrc.indexOf('\n}', i)));
    for (const forbidden of ['saveCases', 'persistMeeting', 'transitionMeeting', 'newId(', 'await', 'Date.now', 'new Date']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('12.2 the resume CTA reuses the banner callback rather than starting anything', () => {
    const i = caseViewCode.indexOf('nextStep.action==="resume_meeting"');
    expect(i).toBeGreaterThan(-1);
    const branch = caseViewCode.slice(i, i + 320);
    expect(branch).toContain('onResumeMeeting?.(cs, m)');
    expect(branch).not.toContain('onStartScheduledMeeting');
    expect(branch).not.toContain('beginMeeting');
  });

  it('12.3 recipes still own WHAT comes next — they never call the post-processor', () => {
    // sliced from the first recipe, matching the existing suite's convention:
    // the post-processor is defined above them in the file.
    const recipes = nextStepSrc.slice(nextStepSrc.indexOf('function disciplinaryNextStep'));
    expect(recipes).not.toContain('withExistingMeeting');
    expect(recipes).not.toContain('resumableMeetingFor');
    expect(nextStepSrc).toContain('return withExistingMeeting(cs, baseNextStep(cs, ctx));');
  });
});

describe('13. the status badge reads the same semantics', () => {
  it('13.1 the badge distinguishes scheduled from in progress', () => {
    expect(appCode).toContain('label:"Disciplinary scheduled"');
    expect(appCode).toContain('label:"Disciplinary in progress"');
    expect(appCode).toContain('onlyScheduledOfType("disciplinary")');
  });

  it('13.2 the badge no longer reads the raw type list', () => {
    const i = appCode.indexOf('const getCaseStatus = (cs) =>');
    const body = appCode.slice(i, i + 3200);
    expect(body).not.toContain('types.some(t=>t.includes("disciplinary"))');
    expect(body).not.toContain('types.some(t=>t.includes("appeal"))');
    expect(body).not.toContain('types.some(t=>t.includes("investigation"))');
  });

  it('13.3 a cancelled meeting is excluded from the badge', () => {
    const i = appCode.indexOf('const activeOfType =');
    const body = appCode.slice(i, i + 420);
    expect(body).toContain('declaredStatus(m) !== MEETING_STATUS.CANCELLED');
  });

  it('13.4 only declared statuses are reinterpreted, so legacy rows are untouched', () => {
    // A legacy row's declaredStatus is null, which is never CANCELLED and never
    // SCHEDULED, so it stays "present" and not "only scheduled" — the existing
    // badge for all 884 pre-lifecycle production meetings is preserved.
    const legacy = disc({ record: 'Held.' });
    delete legacy.status;
    expect(declaredStatus(legacy)).toBeNull();
    expect(declaredStatus(legacy)).not.toBe(MEETING_STATUS.CANCELLED);
    expect(declaredStatus(legacy)).not.toBe(MEETING_STATUS.SCHEDULED);
  });
});

describe('14. the exact production shape from the human retest', () => {
  // case b3400735, meeting_df599cb1-66be-4203-b956-7725721bf318
  const production = () => ({
    id: 'meeting_df599cb1-66be-4203-b956-7725721bf318',
    caseId: 'b3400735-f884-4f50-89dc-1012e3546d4b',
    type: 'Disciplinary', status: 'in_progress',
    schedule: { date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' },
    date: '2026-10-04', createdAt: '2026-09-25T09:55:02.484Z', createdBy: 'UAT - HR Manager',
    startedAt: '2026-09-25T09:55:30.265Z', endedAt: null, chairUserId: null,
    record: '', transcript: [], participants: [], manager: '', invitation: null, calendar: null,
  });
  const productionCase = () => ({
    id: 'b3400735-f884-4f50-89dc-1012e3546d4b', employeeName: 'AT - Continuity Retest',
    caseType: 'Misconduct', stage: 'open', meetings: [production()],
  });

  it('14.1 the existing meeting is recognised and Resume is available', () => {
    const live = resumableMeetingFor(productionCase());
    expect(live.meeting.id).toBe('meeting_df599cb1-66be-4203-b956-7725721bf318');
    expect(live.ambiguous).toBe(false);
  });

  it('14.2 there is NO "Start disciplinary hearing" recommendation', () => {
    const step = getNextStep(productionCase(), HR);
    expect(step.label).not.toBe('Start disciplinary hearing');
    expect(step.action).not.toBe('start_disciplinary');
    expect(step.action).toBe('resume_meeting');
    expect(step.resumeMeetingId).toBe('meeting_df599cb1-66be-4203-b956-7725721bf318');
  });

  it('14.3 nothing is advertised as scheduled, and the schedule is still attached', () => {
    expect(scheduledMeetingsFor(productionCase())).toEqual([]);
    expect(production().schedule).toEqual({ date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' });
    expect(production().endedAt).toBeNull();
  });

  it('14.4 the forked case still resumes one meeting and offers no second start', () => {
    // AT - Scheduling Phase 2.3 as it stands: completed + stranded scheduled +
    // live duplicate. The reader must resolve to the live one.
    const forked = {
      id: 'e2d474da', employeeName: 'AT - Scheduling Phase 2.3', caseType: 'Misconduct', stage: 'open',
      meetings: [
        completedInvestigation({ id: 'meeting_cad06fdb', signStatus: null }),
        disc({ id: 'meeting_6a8bdb7c', status: MEETING_STATUS.SCHEDULED }),
        disc({ id: 'meeting_352722cc', status: MEETING_STATUS.IN_PROGRESS,
               startedAt: '2026-09-25T08:53:41.718Z', schedule: undefined }),
      ],
    };
    const step = getNextStep(forked, HR);
    expect(step.action).toBe('resume_meeting');
    expect(step.resumeMeetingId).toBe('meeting_352722cc');
    // the stranded one is no longer promoted into the CTA
    expect(step.action).not.toBe('start_scheduled_meeting');
  });
});
