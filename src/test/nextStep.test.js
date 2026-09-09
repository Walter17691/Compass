import { describe, it, expect } from 'vitest';
import { getNextStep } from '../lib/nextStep.js';
import { getCaseStage } from '../lib/caseStage.js';

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

  // Defect #17 remediation — "outcome" stage no longer implies a saved
  // letter already exists (see caseStage.js's inferDisciplinaryStage,
  // which now reaches "outcome" from cs.outcome alone). With zero
  // meetings there is definitely no saved outcome letter, so the correct
  // recommendation is to draft one, not to close the case with no written
  // confirmation ever having been issued to the employee.
  it('recommends drafting the outcome letter at the outcome stage when none has been saved yet', () => {
    const step = getNextStep({ stage: 'outcome', meetings: [] });
    expect(step.action).toBe('outcome_letter');
  });

  it('recommends closing the case at the outcome stage once the letter has actually been saved', () => {
    const step = getNextStep({
      stage: 'outcome',
      meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterOutput: '...', letterType: 'outcome' }],
    });
    expect(step.action).toBe('close_case');
  });

  // Defect #17 remediation — full state matrix (Scenarios A-J from the
  // remediation report), run through the real getCaseStage(cs) -> getNextStep(cs)
  // pipeline together, not a hand-picked literal `stage`, since the actual
  // bug was in how the two functions' assumptions interacted — a case
  // with cs.stage still "open" (the untouched lifecycle placeholder every
  // real case starts with — see caseStage.js's Defect #8 comment).
  describe('Defect #17 — full state matrix (getCaseStage + getNextStep together)', () => {
    const openCase = (overrides = {}) => ({ stage: 'open', caseType: 'misconduct', meetings: [], ...overrides });

    // A. Disciplinary hearing completed, no outcome, hearing unsigned.
    it('A. hearing held and unsigned, no outcome yet -> send hearing record for signature', () => {
      const cs = openCase({ meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: null }] });
      expect(getCaseStage(cs)).toBe('disciplinary');
      expect(getNextStep(cs).action).toBe('send_signature');
    });

    // B. Disciplinary hearing completed, no outcome, hearing signed.
    it('B. hearing held and signed, no outcome yet -> draft outcome letter (pre-decision Copilot suggestion, unchanged)', () => {
      const cs = openCase({ meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: 'signed' }] });
      expect(getCaseStage(cs)).toBe('disciplinary');
      expect(getNextStep(cs).action).toBe('outcome_letter');
    });

    // C. Outcome issued, no outcome letter, hearing unsigned — THE Defect
    // #17 reproduction case (Golden Path's exact shape).
    it('C. outcome issued, no letter saved, hearing unsigned -> outcome letter reachable, not stuck on signature', () => {
      const cs = openCase({
        outcome: 'First written warning',
        meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: null }],
      });
      expect(getCaseStage(cs)).toBe('outcome');
      expect(getNextStep(cs).action).toBe('outcome_letter');
    });

    // D. Outcome issued, no outcome letter, hearing signed.
    it('D. outcome issued, no letter saved, hearing signed -> outcome letter reachable', () => {
      const cs = openCase({
        outcome: 'First written warning',
        meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: 'signed' }],
      });
      expect(getCaseStage(cs)).toBe('outcome');
      expect(getNextStep(cs).action).toBe('outcome_letter');
    });

    // E. Outcome issued, letter saved, hearing unsigned — the decision's
    // own existence must not be hidden just because a document-level
    // acknowledgement (hearing signature) never happened.
    it('E. outcome issued, letter saved, hearing unsigned -> close or appeal, unsigned hearing does not block this', () => {
      const cs = openCase({
        outcome: 'First written warning',
        meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: null, letterOutput: 'the letter', letterType: 'outcome' }],
      });
      expect(getCaseStage(cs)).toBe('outcome');
      expect(getNextStep(cs).action).toBe('close_case');
    });

    // F. Outcome issued, letter saved, hearing signed.
    it('F. outcome issued, letter saved, hearing signed -> close or appeal', () => {
      const cs = openCase({
        outcome: 'First written warning',
        meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: 'signed', letterOutput: 'the letter', letterType: 'outcome' }],
      });
      expect(getCaseStage(cs)).toBe('outcome');
      expect(getNextStep(cs).action).toBe('close_case');
    });

    // G. Outcome letter sent/acknowledgement pending — sending/acknowledgement
    // status lives on the meeting/signing-request records, not on stage;
    // once the letter is saved (letterOutput set, regardless of whether it
    // has since been sent for acknowledgement), stage/next-step read the
    // same as F. Nothing in this remediation introduces a third
    // "sent, awaiting acknowledgement" stage.
    it('G. outcome letter saved and already sent for acknowledgement -> same as F, stage does not regress while awaiting acknowledgement', () => {
      const cs = openCase({
        outcome: 'First written warning',
        meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: 'signed', letterOutput: 'the letter', letterType: 'outcome' }],
      });
      expect(getCaseStage(cs)).toBe('outcome');
      expect(getNextStep(cs).action).toBe('close_case');
    });

    // H. Closed case — historical unsigned meetings must never pull a
    // closed case backward.
    it('H. case explicitly closed -> stays closed regardless of unsigned historical meetings', () => {
      const cs = { stage: 'closed', caseType: 'misconduct', outcome: 'First written warning', meetings: [{ type: 'Disciplinary', record: 'x', signStatus: null }] };
      expect(getCaseStage(cs)).toBe('closed');
      expect(getNextStep(cs)).toBeNull();
    });

    // I. Appealed case — appeal stays authoritative, not pulled backward by
    // an unsigned historical disciplinary hearing record.
    it('I. case appealed -> appeal stays authoritative, not pulled back to "disciplinary" by an unsigned original hearing', () => {
      const cs = openCase({
        outcome: 'First written warning',
        meetings: [
          { type: 'Disciplinary', record: 'x', signStatus: null, letterOutput: 'the letter', letterType: 'outcome' },
          { type: 'Appeal', record: null },
        ],
      });
      expect(getCaseStage(cs)).toBe('appeal');
      expect(getNextStep(cs).action).toBe('start_appeal_meeting');
    });

    // J. No outcome, but a letter artifact exists on a meeting that was
    // never actually saved as one (no letterOutput at all — an ephemeral,
    // unsaved AI draft never reaches this far; see App.jsx's
    // saveMeetingToCase, the only place letterOutput is ever written).
    // This must not fabricate a decision that was never made.
    it('J. no outcome, no saved letter artifact -> does not fabricate a decision; case stays at its real pre-decision stage', () => {
      const cs = openCase({ meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: 'signed' }] });
      expect(cs.outcome).toBeFalsy();
      expect(getCaseStage(cs)).toBe('disciplinary');
      expect(getNextStep(cs).action).toBe('outcome_letter');
    });

    // The exact Golden Path production fixture (case
    // fff06d56-c3bb-4627-92f9-c7066d74b295) as it stood when Defect #17
    // was discovered: stage="open", outcome decided and fully detailed,
    // disciplinary meeting recorded but never signed, no letter ever saved.
    it('Golden Path fixture: getCaseStage resolves to "outcome" and the outcome letter is reachable with no signature send and no re-issue required', () => {
      const goldenPath = {
        stage: 'open',
        caseType: 'misconduct',
        outcome: 'First written warning',
        outcomeIssuedAt: '2026-09-07T00:00:00.000Z',
        warningDurationMonths: 6,
        warningExpiresAt: '2027-03-07',
        meetings: [
          { type: 'Investigation', record: 'the investigation record', signStatus: null, letterOutput: null, letterType: null },
          { type: 'Disciplinary', record: 'the disciplinary hearing record', signStatus: null, letterOutput: null, letterType: null },
        ],
      };
      expect(getCaseStage(goldenPath)).toBe('outcome');
      const step = getNextStep(goldenPath);
      expect(step.action).toBe('outcome_letter');
      expect(step.label).toBe('Draft outcome letter');
    });
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

  // Defect #17 remediation — same fix as the disciplinary "outcome" stage
  // test above, mirrored for grievance.
  it('recommends drafting the outcome letter at the outcome stage when none has been saved yet', () => {
    expect(getNextStep(grievanceCase('outcome')).action).toBe('outcome_letter');
  });

  it('recommends closing at the outcome stage once the letter has actually been saved', () => {
    const step = getNextStep(grievanceCase('outcome', [{ type: 'Grievance', record: 'notes', signStatus: 'signed', letterOutput: '...', letterType: 'outcome' }]));
    expect(step.action).toBe('close_case');
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
