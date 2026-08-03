import { describe, it, expect } from 'vitest';
import { getNextStep } from '../lib/nextStep.js';

describe('getNextStep', () => {
  it('returns null for a closed case', () => {
    expect(getNextStep({ stage: 'closed', meetings: [] })).toBeNull();
  });

  it('recommends starting an investigation for a fresh intake with no meetings', () => {
    const step = getNextStep({ stage: 'intake', meetings: [] });
    expect(step.action).toBe('start_investigation');
    expect(step.reason).toMatch(/ACAS/);
  });

  describe('investigation stage', () => {
    it('recommends starting the meeting when none has been recorded', () => {
      const step = getNextStep({ stage: 'investigation', meetings: [] });
      expect(step.action).toBe('start_investigation');
    });

    it('recommends signature once a record exists but is unsigned', () => {
      const step = getNextStep({
        stage: 'investigation',
        meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'pending' }],
      });
      expect(step.action).toBe('send_signature');
    });

    it('recommends generating the report once the record is signed', () => {
      const step = getNextStep({
        stage: 'investigation',
        meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'signed' }],
      });
      expect(step.action).toBe('inv_report');
    });

    it('only considers the most recent investigation meeting', () => {
      const step = getNextStep({
        stage: 'investigation',
        meetings: [
          { type: 'Investigation', record: 'notes', signStatus: 'signed' },
          { type: 'Investigation', record: null, signStatus: null },
        ],
      });
      expect(step.action).toBe('start_investigation');
    });
  });

  it('recommends the disciplinary invite from inv_report stage, with a no-case-to-answer secondary option', () => {
    const step = getNextStep({ stage: 'inv_report', meetings: [] });
    expect(step.action).toBe('disciplinary_invite');
    expect(step.secondary.action).toBe('close_no_case');
  });

  describe('disciplinary stage', () => {
    it('recommends starting the hearing when none has been recorded', () => {
      const step = getNextStep({ stage: 'disciplinary', meetings: [] });
      expect(step.action).toBe('start_disciplinary');
    });

    it('recommends signature once a hearing record exists but is unsigned', () => {
      const step = getNextStep({
        stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'pending' }],
      });
      expect(step.action).toBe('send_signature');
    });

    it('recommends drafting the outcome letter once signed with no outcome yet', () => {
      const step = getNextStep({
        stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed' }],
      });
      expect(step.action).toBe('outcome_letter');
      expect(step.reason).toMatch(/5 working days/);
    });

    // NOTE: this does NOT reach getNextStep's "post_outcome" branch. Once
    // any meeting in the case is signed AND any meeting carries a letter
    // output, getCaseStage()'s blanket closed-detection classifies the
    // whole case as "closed" first — regardless of appeal status — so
    // getNextStep short-circuits to null before the switch runs. In real
    // usage this is exactly what happens once a signed disciplinary
    // hearing has its outcome letter saved (a separate meeting entry via
    // saveMeetingToCase), which also means the 5-working-day appeal-window
    // deadline in deadlines.js never fires for it, since computeDueSoon
    // skips closed cases too. Asserting the current (surprising) behavior
    // here rather than the unreachable intent — see conversation for the
    // getCaseStage fix this points at.
    it('is short-circuited to null once the case is auto-classified "closed" (signed + outcome letter present anywhere)', () => {
      const step = getNextStep({
        stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterOutput: '...' }],
      });
      expect(step).toBeNull();
    });
  });

  it('recommends closing the case at the outcome stage', () => {
    const step = getNextStep({ stage: 'outcome', meetings: [] });
    expect(step.action).toBe('close_case');
  });

  describe('appeal stage', () => {
    it('recommends starting the appeal hearing when none has been recorded', () => {
      const step = getNextStep({ stage: 'appeal', meetings: [] });
      expect(step.action).toBe('start_appeal_meeting');
    });

    it('recommends signature once an appeal record exists but is unsigned', () => {
      const step = getNextStep({
        stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'pending' }],
      });
      expect(step.action).toBe('send_signature');
    });

    it('recommends drafting the appeal outcome letter once signed', () => {
      const step = getNextStep({
        stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'signed' }],
      });
      expect(step.action).toBe('appeal_letter');
    });

    // Same getCaseStage interaction as the disciplinary case above — a
    // signed appeal meeting with its outcome letter attached auto-closes
    // the case before this branch is ever reached.
    it('is short-circuited to null once the case is auto-classified "closed" (signed + appeal outcome present anywhere)', () => {
      const step = getNextStep({
        stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'signed', letterOutput: '...' }],
      });
      expect(step).toBeNull();
    });
  });

  it('returns null for an unrecognised stage', () => {
    expect(getNextStep({ stage: 'some_future_stage', meetings: [] })).toBeNull();
  });
});
