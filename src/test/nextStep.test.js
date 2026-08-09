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

    // getCaseStage() used to auto-classify a case as "closed" the moment
    // any meeting was signed and any meeting carried a letter output —
    // exactly what a signed hearing + saved outcome letter produces —
    // which pre-empted this "outcome issued, appeal window may still be
    // open" recommendation before it could ever be reached. Fixed by
    // making the explicitly-tracked stage ('disciplinary' here) win over
    // that heuristic.
    it('reaches post_outcome once signed with an outcome letter present, rather than being short-circuited to a false "closed"', () => {
      const step = getNextStep({
        stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterOutput: '...' }],
      });
      expect(step.action).toBe('post_outcome');
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

    // Same getCaseStage fix as the disciplinary case above — a signed
    // appeal meeting with its outcome letter attached no longer
    // auto-closes the case before this final branch is reached.
    it('recommends closing once the appeal outcome is issued, rather than being short-circuited to a false "closed"', () => {
      const step = getNextStep({
        stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'signed', letterOutput: '...' }],
      });
      expect(step.action).toBe('close_case');
    });
  });

  it('returns null for an unrecognised stage', () => {
    expect(getNextStep({ stage: 'some_future_stage', meetings: [] })).toBeNull();
  });

  it('every branch carries a meetingType so consumers never re-derive it from the action name', () => {
    const step = getNextStep({ stage: 'investigation', meetings: [] });
    expect(step.meetingType).toBe('investigation');
  });
});

describe('getNextStep — grievance-shaped cases', () => {
  const grievanceCase = (stage, meetings = []) => ({ caseType: 'grievance', stage, meetings });

  it('recommends scheduling a grievance meeting from intake, not an investigation', () => {
    const step = getNextStep(grievanceCase('intake'));
    expect(step.action).toBe('start_hearing');
    expect(step.meetingType).toBe('grievance');
  });

  describe('hearing stage', () => {
    it('recommends starting the meeting when none has been recorded', () => {
      const step = getNextStep(grievanceCase('hearing'));
      expect(step.action).toBe('start_hearing');
    });

    it('recommends signature once a record exists but is unsigned', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'pending' }]));
      expect(step.action).toBe('send_signature');
      expect(step.meetingType).toBe('grievance');
    });

    it('recommends drafting the outcome letter once signed with no outcome yet — not the disciplinary inv_report branch', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'signed' }]));
      expect(step.action).toBe('outcome_letter');
    });

    it('reaches post_outcome once signed with an outcome letter present, same appeal-window protection as disciplinary', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'signed', letterOutput: '...' }]));
      expect(step.action).toBe('post_outcome');
    });
  });

  it('recommends closing at the outcome stage', () => {
    expect(getNextStep(grievanceCase('outcome')).action).toBe('close_case');
  });

  describe('appeal stage', () => {
    it('recommends starting the grievance appeal hearing, with the grievance-appeal meetingType', () => {
      const step = getNextStep(grievanceCase('appeal'));
      expect(step.action).toBe('start_appeal_meeting');
      expect(step.meetingType).toBe('appeal-grievance');
    });

    it('recommends closing once the appeal outcome is issued', () => {
      const step = getNextStep(grievanceCase('appeal', [{ type: 'Grievance Appeal', record: 'notes', signStatus: 'signed', letterOutput: '...' }]));
      expect(step.action).toBe('close_case');
    });
  });

  it('never returns a disciplinary-only action like inv_report or disciplinary_invite', () => {
    const allActions = ['intake','hearing','outcome','appeal'].map(stage => getNextStep(grievanceCase(stage))?.action);
    expect(allActions).not.toContain('inv_report');
    expect(allActions).not.toContain('disciplinary_invite');
  });
});
