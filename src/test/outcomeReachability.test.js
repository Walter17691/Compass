import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  outcomeStageId, hasReachedOutcomeStage, hearingForOutcome,
  canRecordOutcome, outcomeDestinationAvailable,
} from '../lib/outcomeReachability.js';
import { caseWorkspaceDestinations } from '../lib/caseWorkspace.js';
import { getNextStep } from '../lib/nextStep.js';
import { getCaseStage } from '../lib/caseStage.js';

// ─────────────────────────────────────────────────────────────────────────
// D1 COMPLETION — the route still encoded the order D1 removed.
//
// Reproduced from production. AT - Phase 3A Final UAT (640ba406): a misconduct
// case with a COMPLETED disciplinary hearing carrying a real record, no
// outcome, no outcome letter, signStatus null.
//
// Before: the Outcome destination was offered on
//   !!cs.outcome || stage === "outcome" || caseClosed
// all of which become true only AFTER a decision exists. Both entry points to
// the outcome modal live on that destination, so recording a first outcome was
// unreachable — you had to draft the outcome LETTER, which flipped the stage,
// which revealed the destination. Communication before decision.
// ─────────────────────────────────────────────────────────────────────────

// The production fixture's shape.
const PHASE_3A = {
  id: '640ba406', caseType: 'misconduct', outcome: '',
  meetings: [{
    type: 'Disciplinary', date: '2026-09-25', status: 'completed',
    record: 'A real hearing record of some length, as saved by Review.',
    transcript: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
    signStatus: null,
  }],
};

const destinationIds = over =>
  caseWorkspaceDestinations({
    cs: PHASE_3A, genuineMeetings: PHASE_3A.meetings, documents: [], communications: [],
    participants: [], openTasks: [], ...over,
  }).primary.map(d => d.id);

describe('THE BUG — a case ready for a decision could not reach one', () => {
  it('the production fixture is genuinely ready: hearing complete, no outcome, no letter', () => {
    expect(getCaseStage(PHASE_3A)).toBe('disciplinary');
    expect(PHASE_3A.outcome).toBeFalsy();
    expect(PHASE_3A.meetings.some(m => m.letterType === 'outcome')).toBe(false);
    expect(canRecordOutcome(PHASE_3A, 'disciplinary')).toBe(true);
  });

  // Fails against the pre-fix implementation, which passed only hasOutcome.
  it('the Outcome destination EXISTS when the case is ready, with no outcome yet', () => {
    expect(destinationIds({ hasOutcome: false, outcomeReachable: true })).toContain('outcome');
  });

  it('the pre-fix predicate alone would still hide it — which is the defect', () => {
    expect(destinationIds({ hasOutcome: false, outcomeReachable: false })).not.toContain('outcome');
  });

  it('the workflow asks for the DECISION, not for a letter stating one nobody recorded', () => {
    const step = getNextStep(PHASE_3A);
    // signature has not been sent yet, so that is still suggested first
    expect(step.action).toBe('send_signature');
    const signed = { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: 'signed' }] };
    expect(getNextStep(signed).action).toBe('outcome');
    expect(getNextStep(signed).label).toBe('Record outcome');
  });

  it('and once an outcome exists, the letter is what is asked for', () => {
    const decided = {
      ...PHASE_3A, outcome: 'First written warning',
      meetings: [{ ...PHASE_3A.meetings[0], signStatus: 'signed' }],
    };
    expect(getNextStep(decided).action).toBe('outcome_letter');
  });
});

describe('the inverse — not prematurely available', () => {
  it('a hearing still in progress is not ready for a decision', () => {
    const live = { ...PHASE_3A, meetings: [{ type: 'Disciplinary', status: 'in_progress', record: '', transcript: [] }] };
    expect(canRecordOutcome(live, 'disciplinary')).toBe(false);
  });

  it('a case with no hearing at all is not ready', () => {
    expect(canRecordOutcome({ caseType: 'misconduct', meetings: [] }, 'disciplinary')).toBe(false);
  });

  it('an earlier stage is not ready', () => {
    expect(hasReachedOutcomeStage(PHASE_3A, 'investigation')).toBe(false);
    expect(canRecordOutcome(PHASE_3A, 'investigation')).toBe(false);
  });

  it('a case that already has an outcome cannot "record" another', () => {
    expect(canRecordOutcome({ ...PHASE_3A, outcome: 'First written warning' }, 'disciplinary')).toBe(false);
  });
});

describe('SIGNATURE IS NOT A PREREQUISITE — and refusal is not a dead end', () => {
  it.each([null, undefined, 'sent', 'opened', 'declined', 'expired', 'signed', 'acknowledged'])(
    'a decision can be recorded with signStatus %s', status => {
      const cs = { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: status }] };
      expect(canRecordOutcome(cs, 'disciplinary')).toBe(true);
    });

  // Pre-V1 Trust Slice — this list was keyed on TERMINAL, and `expired` is
  // terminal. So an ignored request moved the workflow on, which is "silence
  // authorises progression": the participant was asked, said nothing, and the
  // process advanced as though that were an answer.
  //
  // The predicate is now SETTLED: the participant engaged, or a named human
  // recorded a decision to proceed. `expired` moves to the asks-first group
  // below, and the two states that mean a real response join this one.
  it.each(['declined', 'disputed', 'proceeded', 'signed', 'acknowledged'])(
    'the workflow moves past a SETTLED signature state (%s) instead of repeating it forever', status => {
      const cs = { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: status }] };
      expect(getNextStep(cs).action).toBe('outcome');
    });

  it.each(['sent', 'opened', 'expired'])('an UNSETTLED signature state (%s) still asks for the record first', status => {
    const cs = { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: status }] };
    expect(getNextStep(cs).action).toBe('send_signature');
  });

  it('expiry asks again rather than progressing — but never blocks RECORDING a decision', () => {
    // The two halves of section 8 held apart: the confirmation lifecycle gates
    // the suggested next step; it has never gated the decision itself, and must
    // not start to.
    const cs = { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: 'expired' }] };
    expect(getNextStep(cs).action).toBe('send_signature');
    expect(canRecordOutcome(cs, 'disciplinary')).toBe(true);
  });
});

describe('ONE predicate, not several', () => {
  it('OutcomeTab uses the shared predicate rather than its own copy', () => {
    const tab = readFileSync('src/components/caseTabs/OutcomeTab.jsx', 'utf8');
    expect(tab).toContain("from '../../lib/outcomeReachability'");
    expect(tab).not.toContain('const stageIds = getProcessType');
  });

  it('Case View passes both ideas separately, never one overloaded flag', () => {
    const cv = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    expect(cv).toContain('hasOutcome: !!cs.outcome || stage === "outcome" || caseClosed,');
    expect(cv).toContain('outcomeReachable: canRecordOutcome(cs, stage),');
  });

  it('the Record outcome action actually navigates somewhere', () => {
    const cv = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    expect(cv).toContain('nextStep.action==="outcome"');
  });

  it('honours process types that call the stage "decision" rather than "outcome"', () => {
    expect(outcomeStageId('misconduct')).toBe('outcome');
    const probation = outcomeStageId('probation');
    expect(['outcome', 'decision', null]).toContain(probation);
  });

  it('picks the hearing, and only a real one', () => {
    expect(hearingForOutcome(PHASE_3A).type).toBe('Disciplinary');
    expect(hearingForOutcome({ meetings: [{ type: 'Investigation', record: 'x' }] })).toBeNull();
  });
});

describe('nextStep and the workspace agree', () => {
  const states = [
    ['ready, unsigned', { ...PHASE_3A }],
    ['ready, signed', { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: 'signed' }] }],
    ['ready, declined', { ...PHASE_3A, meetings: [{ ...PHASE_3A.meetings[0], signStatus: 'declined' }] }],
    ['decided', { ...PHASE_3A, outcome: 'First written warning' }],
  ];

  it.each(states)('%s — if the workflow says Record outcome, the destination exists', (_label, cs) => {
    const stage = getCaseStage(cs);
    const step = getNextStep(cs);
    if (step.action === 'outcome') {
      expect(outcomeDestinationAvailable({ caseObj: cs, stage })).toBe(true);
    }
  });

  it.each(states)('%s — it never asks for a letter with no outcome recorded and no letter present', (_label, cs) => {
    const step = getNextStep(cs);
    if (step.action === 'outcome_letter') {
      const hasLetter = (cs.meetings || []).some(m => m.letterType === 'outcome');
      expect(!!cs.outcome || hasLetter).toBe(true);
    }
  });
});

describe('historical cases are not broken', () => {
  it('a legacy case with an outcome LETTER but no cs.outcome keeps its behaviour', () => {
    const legacy = {
      caseType: 'misconduct', outcome: '',
      meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterType: 'outcome', letterOutput: 'Dear Sam' }],
    };
    // it is NOT asked to record an outcome — that would rewrite history for the
    // 890 historical meetings that predate cs.outcome existing
    expect(getNextStep(legacy).action).not.toBe('outcome');
  });

  it('a decided case can still inspect its Outcome', () => {
    const decided = { ...PHASE_3A, outcome: 'Final written warning' };
    expect(outcomeDestinationAvailable({ caseObj: decided, stage: 'outcome' })).toBe(true);
  });

  it('a closed case can still inspect its Outcome', () => {
    // Deliberately a case that is reachable for NO other reason: no outcome and
    // no completed hearing, so only `caseClosed` can make the destination
    // available. PHASE_3A would have passed via canRecordOutcome, making the
    // mutation that drops caseClosed inert.
    const closedNoOutcome = {
      caseType: 'misconduct', outcome: '',
      meetings: [{ type: 'Disciplinary', status: 'in_progress', record: '', transcript: [] }],
    };
    expect(canRecordOutcome(closedNoOutcome, 'closed')).toBe(false);
    expect(outcomeDestinationAvailable({ caseObj: closedNoOutcome, stage: 'closed', caseClosed: true })).toBe(true);
    expect(outcomeDestinationAvailable({ caseObj: closedNoOutcome, stage: 'closed', caseClosed: false })).toBe(false);
  });

  it('an appeal-stage case is unaffected', () => {
    const appeal = {
      ...PHASE_3A, outcome: 'First written warning',
      meetings: [...PHASE_3A.meetings, { type: 'Disciplinary Appeal', record: 'appeal record' }],
    };
    expect(getCaseStage(appeal)).toBe('appeal');
    expect(outcomeDestinationAvailable({ caseObj: appeal, stage: 'appeal' })).toBe(true);
  });
});

describe('visibility is not authority', () => {
  it('making the destination reachable grants no write permission', () => {
    const reach = readFileSync('src/lib/outcomeReachability.js', 'utf8');
    for (const forbidden of ['isHR', 'canDecide', 'role', 'supabase', 'auth']) {
      expect(reach).not.toContain(`${forbidden}(`);
    }
    // the write gate stays where it was
    const sql = readFileSync('supabase/protect_case_outcome_2026-08-27.sql', 'utf8');
    expect(sql).toContain("Only HR or this case''s disciplinary officer can set the case outcome");
    const tab = readFileSync('src/components/caseTabs/OutcomeTab.jsx', 'utf8');
    expect(tab).toContain('canDecide');
  });
});
