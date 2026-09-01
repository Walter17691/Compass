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

    // Human UAT remediation, Batch 2 hardening — a disciplinary hearing
    // invitation used to satisfy the exact same "some disciplinary meeting
    // has a letterOutput" check as a real outcome letter, so drafting and
    // saving an invitation could skip "Draft outcome letter" entirely and
    // jump straight to "Outcome issued — close or appeal" before the
    // hearing had even happened. letterType (now stamped alongside
    // letterOutput on save) lets this distinguish the two.
    it('still recommends drafting the outcome letter when the only letterOutput present is an invitation, not an outcome', () => {
      const step = getNextStep({
        stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterOutput: 'Dear Sam, please attend a disciplinary hearing...', letterType: 'invite' }],
      });
      expect(step.action).toBe('outcome_letter');
    });

    it('legacy meetings with no recorded letterType keep the old behaviour (any letterOutput reads as the outcome)', () => {
      const step = getNextStep({
        stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterOutput: '...' /* no letterType */ }],
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

    // Human UAT remediation, Batch 2 hardening — an appeal HEARING
    // invitation (letterType "invite", drafted before the appeal hearing
    // has even happened) used to satisfy the same "some appeal meeting has
    // a letterOutput" check as the real appeal outcome letter, wrongly
    // implying the appeal had already been decided.
    it('still recommends drafting the appeal outcome letter when the only letterOutput present is an appeal-hearing invitation', () => {
      const step = getNextStep({
        stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'signed', letterOutput: 'Dear Sam, please attend your appeal hearing...', letterType: 'invite' }],
      });
      expect(step.action).toBe('appeal_letter');
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

    it('still recommends drafting the outcome letter when the only letterOutput present is a hearing invitation, same fix as disciplinary', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'signed', letterOutput: 'Dear Sam, please attend a grievance hearing...', letterType: 'invite' }]));
      expect(step.action).toBe('outcome_letter');
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

// P2 — regular-case-flow probation/flexible working/long-term sickness.
// caseType dispatch (not stage-value dispatch like grievance above) since
// these three each carry their own distinct stage vocabulary from
// processStages.js, entirely separate from the disciplinary/grievance ids.
describe('getNextStep — probation-shaped cases', () => {
  const probationCase = (stage) => ({ caseType: 'probation', stage, meetings: [] });

  it('recommends a check-in from probation_started, using the generic formal meeting type (not DevelopScreen\'s dedicated one)', () => {
    const step = getNextStep(probationCase('probation_started'));
    expect(step.action).toBe('check_in');
    expect(step.meetingType).toBe('formal');
  });

  it('recommends closing the case at the outcome stage', () => {
    expect(getNextStep(probationCase('outcome')).action).toBe('close_case');
  });

  it('never returns a disciplinary-only action for a probation stage id the disciplinary switch wouldn\'t recognise', () => {
    const step = getNextStep(probationCase('concerns_raised'));
    expect(step.action).toBe('extension_or_review');
  });
});

describe('getNextStep — flexible working-shaped cases', () => {
  it('recommends assessing the request from request_received', () => {
    const step = getNextStep({ caseType: 'flexible working', stage: 'request_received', meetings: [] });
    expect(step.action).toBe('assessment');
  });

  it('is not sensitive to the underscore-vs-space spelling', () => {
    const step = getNextStep({ caseType: 'flexible_working', stage: 'decision', meetings: [] });
    expect(step.action).toBe('close_case');
  });

  it('recommends hearing the appeal at the appeal stage', () => {
    const step = getNextStep({ caseType: 'flexible working', stage: 'appeal', meetings: [] });
    expect(step.action).toBe('start_appeal_meeting');
  });
});

describe('getNextStep — long-term sickness-shaped cases', () => {
  const sicknessCase = (stage) => ({ caseType: 'long-term sickness', stage, meetings: [] });

  it('recommends contacting the employee from absence_identified, using the Return to Work meeting type', () => {
    const step = getNextStep(sicknessCase('absence_identified'));
    expect(step.action).toBe('contact_employee');
    expect(step.meetingType).toBe('return');
  });

  it('shifts to the generic formal meeting type once it reaches capability consideration', () => {
    const step = getNextStep(sicknessCase('capability_consideration'));
    expect(step.meetingType).toBe('formal');
  });

  it('recommends closing the case at the decision stage', () => {
    expect(getNextStep(sicknessCase('decision')).action).toBe('close_case');
  });
});
