import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEmployeeFile } from '../lib/employeeFile.js';
import { resolvePrimaryAction, EMPLOYEE_FILE_ACTION, ACTION_PRIORITY, conversationIntents } from '../lib/employeeFileActions.js';
import { ACTIVITY_TYPES } from '../lib/employeeActivities.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE A — the ONE primary action, and what it must never reveal.
//
// The resolver is pure, so these run it directly rather than through React. The
// input is always a real buildEmployeeFile output, because the whole safety
// argument rests on `file` being built from RLS-filtered collections: an
// inaccessible case is ABSENT, not hidden, and therefore cannot reach a label.
// Testing the resolver against a hand-made `file` would prove nothing about that.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const NOW = new Date('2026-09-29T09:00:00Z');
const EMP = 'emp-john';
const iso = d => new Date(d).toISOString();

const employee = (over = {}) => ({
  id: EMP, orgId: 'org-1', name: 'John Smith', jobTitle: 'Operative',
  locationId: 'loc-1', employmentStatus: 'active', ...over,
});

const build = (data = {}, viewer = { isHR: true }) => buildEmployeeFile(EMP, {
  employeeRecords: [employee(data.employeeOver)],
  cases: [], wellbeingNotes: [], concernReferrals: [], dsarRequests: [],
  dueSoon: [], allegations: [],
  employeeActivities: [], employeeActivityRecords: [], employmentEvents: [],
  now: NOW,
  ...data,
}, viewer);

const act = (data, viewer) => resolvePrimaryAction(build(data, viewer), { now: NOW });

// A case the viewer CAN see. Anything inaccessible is simply not passed, which is
// what the real RLS-filtered collections do.
const openCase = (over = {}) => ({
  id: 'case-1', employeeId: EMP, employeeName: 'John Smith',
  caseType: 'misconduct', stage: 'investigation', createdAt: '2026-09-20',
  meetings: [], ...over,
});

const activity = (over = {}) => ({
  id: 'act-1', employeeId: EMP, activityType: 'one_to_one',
  title: 'Monthly catch-up', occurredAt: iso('2026-09-01'),
  createdAt: iso('2026-09-01'), lifecycleState: 'completed', ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — the default is a conversation, not a case', () => {
  it('A. an active employee with no active work → Start conversation', () => {
    const a = act({});
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
    expect(a.label).toBe('Start conversation');
  });

  it('the default is NOT "New case", and NOT "Start 1:1"', () => {
    const a = act({});
    expect(a.label).not.toBe('New case');
    // Compass supports more than 1:1s, so the universal default must not name one.
    expect(a.label).not.toMatch(/1:1/);
  });

  it('F. a CLOSED case only → still Start conversation', () => {
    const a = act({ cases: [openCase({ stage: 'closed', outcome: 'No further action' })] });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
  });

  it('a live formal WARNING is context, never the primary action', () => {
    // The outcome string must be the REAL vocabulary — WARNING_OUTCOME_TYPES is
    // ["First written warning", "Final written warning"], lower case. Title-cased
    // here, isWarningOutcome returns false, no warning is derived, and this
    // assertion passes while proving nothing. It did exactly that until a mutation
    // that made a warning the primary action survived.
    const data = {
      cases: [openCase({
        stage: 'closed', outcome: 'First written warning',
        outcomeIssuedAt: '2026-09-11', warningExpiresAt: '2027-03-11',
        warningDurationMonths: 6,
      })],
    };
    expect(build(data).currentWarnings).toHaveLength(1);   // the fixture is real
    expect(act(data).kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
  });

  it('G. a future employment change alone → Start conversation', () => {
    const a = act({
      employmentEvents: [{
        id: 'ev-1', employeeId: EMP, eventType: 'job_title_changed',
        effectiveDate: '2026-12-01', newText: 'Senior Operative',
        documentationStatus: 'not_required', createdAt: iso('2026-09-20'),
      }],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
  });

  it('H. a FUTURE leaver is still a current employee → Start conversation', () => {
    const a = act({
      employmentEvents: [{
        id: 'ev-end', employeeId: EMP, eventType: 'employment_ended',
        effectiveDate: '2026-12-31', documentationStatus: 'not_required',
        createdAt: iso('2026-09-20'),
      }],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
  });

  it('I. a FORMER employee is offered nothing — not a conversation', () => {
    // There is no conversation to have with someone who has left, and offering
    // one would be the same category of mistake as offering everyone "New case".
    const file = build({
      employmentEvents: [{
        id: 'ev-end', employeeId: EMP, eventType: 'employment_ended',
        effectiveDate: '2026-09-01', documentationStatus: 'not_required',
        createdAt: iso('2026-08-20'),
      }],
    });
    expect(file.isCurrentEmployee).toBe(false);
    expect(resolvePrimaryAction(file, { now: NOW })).toBeNull();
  });

  it('...but a former employee with outstanding WORK still gets that action', () => {
    const file = build({
      employmentEvents: [{
        id: 'ev-end', employeeId: EMP, eventType: 'employment_ended',
        effectiveDate: '2026-09-01', documentationStatus: 'not_required',
        createdAt: iso('2026-08-20'),
      }],
      cases: [openCase({
        meetings: [{ id: 'm-live', type: 'Disciplinary', status: 'in_progress',
                     date: '2026-09-28', record: '', transcript: [] }],
      })],
    });
    expect(resolvePrimaryAction(file, { now: NOW }).kind).toBe(EMPLOYEE_FILE_ACTION.RESUME_MEETING);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — the most immediate work wins', () => {
  it('D. a meeting IN PROGRESS outranks everything', () => {
    const a = act({
      cases: [openCase({
        meetings: [{ id: 'm-live', type: 'Disciplinary', status: 'in_progress',
                     date: '2026-09-28', record: '', transcript: [] }],
      })],
      employeeActivities: [activity({ lifecycleState: 'open', activityType: 'management_concern',
                                      concernState: 'open', followUpDate: '2026-09-01' })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.RESUME_MEETING);
    expect(a.meetingId).toBe('m-live');
    expect(a.caseId).toBe('case-1');
  });

  it('E. an unfinished REVIEW outranks arranging anything new', () => {
    const a = act({
      cases: [openCase({
        meetings: [{ id: 'm-rev', type: 'Disciplinary', status: 'review_draft',
                     date: '2026-09-25', record: 'draft', transcript: [] }],
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.COMPLETE_REVIEW);
    expect(a.meetingId).toBe('m-rev');
  });

  it('a meeting scheduled for TODAY or earlier → Start meeting', () => {
    const a = act({
      cases: [openCase({
        meetings: [{ id: 'm-today', type: 'Investigation', status: 'scheduled',
                     date: '2026-09-29', schedule: { date: '2026-09-29', time: '10:00' },
                     record: '', transcript: [] }],
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_MEETING);
  });

  it('C. a meeting scheduled AHEAD → Prepare for meeting', () => {
    const a = act({
      cases: [openCase({
        meetings: [{ id: 'm-future', type: 'Investigation', status: 'scheduled',
                     date: '2026-10-06', schedule: { date: '2026-10-06', time: '10:00' },
                     record: '', transcript: [] }],
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.PREPARE_MEETING);
    expect(a.meetingId).toBe('m-future');
  });

  it('a document out for signature → Chase signature', () => {
    const a = act({
      cases: [openCase({
        meetings: [{ id: 'm-sign', type: 'Disciplinary', date: '2026-09-20',
                     record: 'Held.', transcript: [], signStatus: 'pending' }],
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.CHASE_SIGNATURE);
  });

  it('a SIGNED document is finished work and is not an action', () => {
    const a = act({
      cases: [openCase({
        meetings: [{ id: 'm-signed', type: 'Disciplinary', date: '2026-09-20',
                     record: 'Held.', transcript: [], signStatus: 'signed' }],
      })],
    });
    expect(a.kind).not.toBe(EMPLOYEE_FILE_ACTION.CHASE_SIGNATURE);
  });

  it('B. an open concern with a follow-up DUE → Record follow-up', () => {
    const a = act({
      employeeActivities: [activity({
        id: 'act-concern', activityType: 'management_concern',
        concernState: 'open', followUpDate: '2026-09-25',
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.RECORD_FOLLOW_UP);
    expect(a.activityId).toBe('act-concern');
  });

  it('an open concern with NOTHING due → Continue concern', () => {
    const a = act({
      employeeActivities: [activity({
        id: 'act-concern', activityType: 'management_concern', concernState: 'open',
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.CONTINUE_CONCERN);
    expect(a.activityId).toBe('act-concern');
  });

  it('a RESOLVED concern is history and produces no action', () => {
    const a = act({
      employeeActivities: [activity({
        id: 'act-done', activityType: 'management_concern',
        concernState: 'resolved', resolvedAt: iso('2026-09-10'),
      })],
    });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
  });

  it('the process\'s OWN next step is used, never a relabelling of it', () => {
    const file = build({ cases: [openCase()] });
    const next = file.attention.find(x => x.kind === 'next_step');
    const a = resolvePrimaryAction(file, { now: NOW });
    if (next) {
      // Whatever the validated recipe says, verbatim — so Employee File and Case
      // View cannot disagree about what happens next.
      expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.PROCESS_NEXT_STEP);
      expect(a.label).toBe(next.label);
    } else {
      // No recipe for this type is a real state, and it must not invent one.
      expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
    }
  });

  it('the documented priority order is the order the resolver walks', () => {
    expect(ACTION_PRIORITY[0]).toBe(EMPLOYEE_FILE_ACTION.RESUME_MEETING);
    expect(ACTION_PRIORITY[ACTION_PRIORITY.length - 1]).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
    expect(ACTION_PRIORITY).toHaveLength(Object.keys(EMPLOYEE_FILE_ACTION).length);
    // Every named action is in the order exactly once.
    expect(new Set(ACTION_PRIORITY).size).toBe(ACTION_PRIORITY.length);
  });

  it('there is exactly ONE primary action, never a list', () => {
    const a = act({
      cases: [openCase({
        meetings: [
          { id: 'm-live', type: 'Disciplinary', status: 'in_progress', date: '2026-09-28', record: '', transcript: [] },
          { id: 'm-rev', type: 'Investigation', status: 'review_draft', date: '2026-09-25', record: 'd', transcript: [] },
        ],
      })],
      employeeActivities: [activity({ activityType: 'management_concern', concernState: 'open', followUpDate: '2026-09-01' })],
    });
    expect(Array.isArray(a)).toBe(false);
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.RESUME_MEETING);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — the action cannot reveal what the viewer cannot see', () => {
  it('J. an inaccessible confidential case is ABSENT, so it cannot be named', () => {
    // The real boundary: RLS never hands the case over, so it is not in `cases`.
    // The resolver is given exactly what the viewer may read.
    const withoutIt = act({ cases: [] });
    expect(withoutIt.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
    expect(JSON.stringify(withoutIt)).not.toMatch(/disciplinary|confidential|case-secret/i);
  });

  it('K. an inaccessible meeting cannot be named either', () => {
    // A meeting lives inside its case. No case, no meeting — structurally.
    const a = act({ cases: [] });
    expect(a.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
    expect(a.meetingId).toBeUndefined();
    expect(a.caseId).toBeUndefined();
  });

  it('the resolver has exactly ONE data source, and it is the authorised file', () => {
    // This is the whole safety argument. There is no second parameter and no other
    // collection to reach: everything the resolver sees came through
    // buildEmployeeFile, which was given RLS-filtered data. A mutation that tries to
    // widen the source has nowhere to widen it to.
    // 1, not 2: the options argument is defaulted, and defaulted parameters do not
    // count toward Function.length. What matters is that there is no THIRD source.
    expect(resolvePrimaryAction).toHaveLength(1);
    const src = stripJs(read('src/lib/employeeFileActions.js'));
    expect(src).toContain('(file?.context?.cases || [])');
    // No other collection is read for meetings.
    expect(src).not.toContain('file.allCases');
    expect(src).not.toContain('file.processes');
    expect(src).not.toContain('authorisedData');
  });

  it('the resolver never filters by permission itself', () => {
    // If it did, it would become a second permission boundary that could drift
    // from the real one. It must only ever compose already-authorised data.
    const src = stripJs(read('src/lib/employeeFileActions.js'));
    ['confidential', 'case_access', 'caseAccessLevel', 'is_hr', 'role ===']
      .forEach(t => expect(src, t).not.toContain(t));
  });

  it('a viewer who sees the employee but no cases gets the neutral default', () => {
    const lm = act({}, { isHR: false, role: 'location_manager' });
    expect(lm.kind).toBe(EMPLOYEE_FILE_ACTION.START_CONVERSATION);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — the intent chooser speaks in intentions', () => {
  it('offers only conversation types Compass actually supports', () => {
    const intents = conversationIntents(ACTIVITY_TYPES);
    expect(intents.map(i => i.label)).toEqual(['1:1', 'Return to Work', 'Conversation', 'Management Concern']);
  });

  it('exposes no database or object vocabulary', () => {
    const intents = JSON.stringify(conversationIntents(ACTIVITY_TYPES));
    ['employee_activity', 'record_type', 'parentage', 'case_id', 'meeting_id']
      .forEach(t => expect(intents, t).not.toContain(t));
  });

  it('is derived, not retyped — so it cannot offer what the domain refuses', () => {
    expect(conversationIntents(ACTIVITY_TYPES)).toHaveLength(ACTIVITY_TYPES.length);
    expect(conversationIntents([])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — no AI, no invention', () => {
  it('the resolver is deterministic and recommends nothing', () => {
    const src = stripJs(read('src/lib/employeeFileActions.js'));
    ['askCompass', 'streamClaude', 'recommend', 'suggest', 'Math.random', 'prediction', 'riskScore']
      .forEach(t => expect(src, t).not.toContain(t));
  });

  it('the same input always gives the same answer', () => {
    const data = { cases: [openCase()] };
    expect(act(data)).toEqual(act(data));
  });
});
