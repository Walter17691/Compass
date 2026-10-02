import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getNextStep } from '../lib/nextStep.js';
import { getCaseStage } from '../lib/caseStage.js';

describe('getNextStep', () => {
  it('returns null for a closed case', () => {
    expect(getNextStep({ caseType: 'misconduct', stage: 'closed', meetings: [] })).toBeNull();
  });

  it('recommends starting an investigation for a fresh intake with no meetings', () => {
    const step = getNextStep({ caseType: 'misconduct', stage: 'intake', meetings: [] });
    expect(step.action).toBe('start_investigation');
    expect(step.reason).toMatch(/ACAS/);
  });

  describe('investigation stage', () => {
    it('recommends starting the meeting when none has been recorded', () => {
      const step = getNextStep({ caseType: 'misconduct', stage: 'investigation', meetings: [] });
      expect(step.action).toBe('start_investigation');
    });

    it('recommends signature once a record exists but is unsigned', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'investigation',
        meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'pending' }],
      });
      expect(step.action).toBe('send_signature');
    });

    it('recommends generating the report once the record is signed', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'investigation',
        meetings: [{ type: 'Investigation', record: 'notes', signStatus: 'signed' }],
      });
      expect(step.action).toBe('inv_report');
    });

    it('only considers the most recent investigation meeting', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'investigation',
        meetings: [
          { type: 'Investigation', record: 'notes', signStatus: 'signed' },
          { type: 'Investigation', record: null, signStatus: null },
        ],
      });
      expect(step.action).toBe('start_investigation');
    });
  });

  it('recommends the disciplinary invite from inv_report stage, with a no-case-to-answer secondary option', () => {
    const step = getNextStep({ caseType: 'misconduct', stage: 'inv_report', meetings: [] });
    expect(step.action).toBe('disciplinary_invite');
    expect(step.secondary.action).toBe('close_no_case');
  });

  describe('disciplinary stage', () => {
    it('recommends starting the hearing when none has been recorded', () => {
      const step = getNextStep({ caseType: 'misconduct', stage: 'disciplinary', meetings: [] });
      expect(step.action).toBe('start_disciplinary');
    });

    it('recommends signature once a hearing record exists but is unsigned', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'pending' }],
      });
      expect(step.action).toBe('send_signature');
    });

    // D1 COMPLETION — the decision comes before its communication. Signed with
    // no outcome recorded now asks for the DECISION; the letter follows once
    // one exists. Previously this jumped straight to the letter, which is how
    // "Record outcome" became unreachable until a letter had been drafted.
    it('asks for the decision once signed with no outcome yet', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed' }],
      });
      expect(step.action).toBe('outcome');
      expect(step.label).toBe('Record outcome');
    });

    it('recommends drafting the outcome letter once an outcome HAS been recorded', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'disciplinary', outcome: 'First written warning',
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
        caseType: 'misconduct', stage: 'disciplinary',
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
    it('an invitation letter is not an outcome letter, so the decision is still what is asked for', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'disciplinary',
        meetings: [{ type: 'Disciplinary', record: 'notes', signStatus: 'signed', letterOutput: 'Dear Sam, please attend a disciplinary hearing...', letterType: 'invite' }],
      });
      expect(step.action).toBe('outcome');
    });

    it('legacy meetings with no recorded letterType keep the old behaviour (any letterOutput reads as the outcome)', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'disciplinary',
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
    const step = getNextStep({ caseType: 'misconduct', stage: 'outcome', meetings: [] });
    expect(step.action).toBe('outcome_letter');
  });

  it('recommends closing the case at the outcome stage once the letter has actually been saved', () => {
    const step = getNextStep({
      caseType: 'misconduct', stage: 'outcome',
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
    it('B. hearing held and signed, no outcome yet -> RECORD the outcome (D1: decision before communication)', () => {
      const cs = openCase({ meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: 'signed' }] });
      expect(getCaseStage(cs)).toBe('disciplinary');
      expect(getNextStep(cs).action).toBe('outcome');
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
      // D1: it still fabricates nothing — it now asks for the decision itself
      // rather than for a letter stating a decision nobody has recorded.
      expect(getNextStep(cs).action).toBe('outcome');
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
      const step = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [] });
      expect(step.action).toBe('start_appeal_meeting');
    });

    it('recommends signature once an appeal record exists but is unsigned', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'pending' }],
      });
      expect(step.action).toBe('send_signature');
    });

    it('recommends drafting the appeal outcome letter once signed', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'signed' }],
      });
      expect(step.action).toBe('appeal_letter');
    });

    // Same getCaseStage fix as the disciplinary case above — a signed
    // appeal meeting with its outcome letter attached no longer
    // auto-closes the case before this final branch is reached.
    it('recommends closing once the appeal outcome is issued, rather than being short-circuited to a false "closed"', () => {
      const step = getNextStep({
        caseType: 'misconduct', stage: 'appeal',
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
        caseType: 'misconduct', stage: 'appeal',
        meetings: [{ type: 'Appeal', record: 'notes', signStatus: 'signed', letterOutput: 'Dear Sam, please attend your appeal hearing...', letterType: 'invite' }],
      });
      expect(step.action).toBe('appeal_letter');
    });

    // Appeal Independence P1 (2026-09-18) — the sequencing fix: an
    // appeal at this stage with no appeal_manager yet must not suggest
    // "Start appeal hearing" before an impartial officer exists.
    describe('appeal officer sequencing (ctx)', () => {
      it('HR viewer, no appeal_manager yet: suggests appointing an appeal officer instead of starting the hearing', () => {
        const step = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [] }, { hasAppealManager: false, isHR: true });
        expect(step.action).toBe('appoint_appeal_officer');
        expect(step.label).toBe('Appoint appeal officer');
      });

      // Appeal Hearing Control Remediation (2026-09-18) — closes the gap
      // this file's own header now documents: an officer being appointed
      // is not the same as an invitation existing.
      it('HR viewer, appeal_manager assigned but no invitation drafted yet: suggests drafting the appeal hearing invitation, not starting the hearing', () => {
        const step = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [] }, { hasAppealManager: true, isHR: true });
        expect(step.action).toBe('appeal_invite');
        expect(step.label).toBe('Draft appeal hearing invitation');
      });

      it('HR viewer, appeal_manager assigned AND invitation already drafted: falls through to the existing "Start appeal hearing" logic unchanged', () => {
        const step = getNextStep({
          caseType: 'misconduct', stage: 'appeal',
          meetings: [{ type: 'Disciplinary Appeal', letterOutput: 'Dear Sam, please attend your appeal hearing...', letterType: 'invite' }],
        }, { hasAppealManager: true, isHR: true });
        expect(step.action).toBe('start_appeal_meeting');
      });

      it('non-HR viewer, no appeal_manager yet: does NOT suggest appointing (matches the existing isHR-only gate on the manual button) — falls through to the unchanged default', () => {
        const step = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [] }, { hasAppealManager: false, isHR: false });
        expect(step.action).toBe('start_appeal_meeting');
      });

      it('omitting ctx entirely (every pre-existing caller) behaves exactly as before — no crash, no new suggestion', () => {
        const step = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [] });
        expect(step.action).toBe('start_appeal_meeting');
      });

      it('existing downstream appeal next-steps (signature, outcome letter, close) are unaffected once an appeal_manager exists and an invitation has already been drafted', () => {
        const invite = { type: 'Disciplinary Appeal', letterOutput: 'invite text', letterType: 'invite' };
        const signed = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [invite, { type: 'Appeal', record: 'notes', signStatus: 'signed' }] }, { hasAppealManager: true, isHR: true });
        expect(signed.action).toBe('appeal_letter');
        const issued = getNextStep({ caseType: 'misconduct', stage: 'appeal', meetings: [invite, { type: 'Appeal', record: 'notes', signStatus: 'signed', letterOutput: '...' }] }, { hasAppealManager: true, isHR: true });
        expect(issued.action).toBe('close_case');
      });
    });
  });

  it('returns null for an unrecognised stage', () => {
    expect(getNextStep({ caseType: 'misconduct', stage: 'some_future_stage', meetings: [] })).toBeNull();
  });

  it('every branch carries a meetingType so consumers never re-derive it from the action name', () => {
    const step = getNextStep({ caseType: 'misconduct', stage: 'investigation', meetings: [] });
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

    it('asks for the decision once signed with no outcome yet — not the disciplinary inv_report branch', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'signed' }]));
      expect(step.action).toBe('outcome');
    });

    it('reaches post_outcome once signed with an outcome letter present, same appeal-window protection as disciplinary', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'signed', letterOutput: '...' }]));
      expect(step.action).toBe('post_outcome');
    });

    it('an invitation letter is not an outcome letter, so the decision is still what is asked for (grievance)', () => {
      const step = getNextStep(grievanceCase('hearing', [{ type: 'Grievance', record: 'notes', signStatus: 'signed', letterOutput: 'Dear Sam, please attend a grievance hearing...', letterType: 'invite' }]));
      expect(step.action).toBe('outcome');
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

    // Appeal Independence P1 (2026-09-18) — same appointment-sequencing
    // rule shared with disciplinaryNextStep via appointOfficerStepIfNeeded.
    it('HR viewer, no appeal_manager yet: suggests appointing an appeal officer instead of starting the hearing', () => {
      const step = getNextStep(grievanceCase('appeal'), { hasAppealManager: false, isHR: true });
      expect(step.action).toBe('appoint_appeal_officer');
    });

    // Appeal Hearing Control Remediation (2026-09-18)
    it('appeal_manager assigned but no invitation drafted yet: suggests drafting the appeal hearing invitation', () => {
      const step = getNextStep(grievanceCase('appeal'), { hasAppealManager: true, isHR: true });
      expect(step.action).toBe('appeal_invite');
      expect(step.meetingType).toBe('appeal-grievance');
    });

    it('appeal_manager assigned AND invitation already drafted: unchanged grievance-appeal behaviour', () => {
      const step = getNextStep(grievanceCase('appeal', [{ type: 'Grievance Appeal', letterOutput: 'invite text', letterType: 'invite' }]), { hasAppealManager: true, isHR: true });
      expect(step.action).toBe('start_appeal_meeting');
      expect(step.meetingType).toBe('appeal-grievance');
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

  it('HR viewer, no appeal_manager yet: suggests appointing an appeal officer instead of hearing the appeal', () => {
    const step = getNextStep({ caseType: 'flexible working', stage: 'appeal', meetings: [] }, { hasAppealManager: false, isHR: true });
    expect(step.action).toBe('appoint_appeal_officer');
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.4 — recipe fail-safe.
//
// Until this phase, getNextStep ended in an unconditional
//   `return isGrievanceCase(cs) ? grievanceNextStep(...) : disciplinaryNextStep(...)`
// so ANY case type without a dedicated branch silently received DISCIPLINARY
// guidance. In production that was 162 capability cases, 28 absence cases and
// 566 cases with no type at all — told to invite an employee to a disciplinary
// hearing because Compass had no recipe for what they actually were.
//
// Routing is now an explicit allow-list keyed on the canonical PROCESS_TYPES
// registry. A process type with no validated recipe gets NO guided next step.
describe('E1.4 — no process type falls through to another process recipe', () => {
  // Shaped so that, under the OLD fall-through, disciplinaryNextStep would
  // certainly have returned a step: an open case with a completed investigation
  // meeting is exactly where the disciplinary recipe has most to say.
  const openCase = (caseType) => ({
    id: 'c1', caseType, stage: 'investigation',
    meetings: [{ id: 'm1', type: 'Investigation', date: '01/03/2026', status: 'completed', record: 'x' }],
  });

  describe('validated recipes keep working, unchanged', () => {
    it('misconduct keeps the disciplinary recipe', () => {
      expect(getNextStep(openCase('misconduct'))).not.toBeNull();
    });

    it('investigation keeps the disciplinary recipe — it is that recipe\'s first stage', () => {
      // PROCESS_TYPES maps "investigation" into the misconduct family.
      expect(getNextStep(openCase('investigation'))).not.toBeNull();
    });

    it('disciplinary and conduct concern keep it too', () => {
      expect(getNextStep(openCase('disciplinary'))).not.toBeNull();
      expect(getNextStep(openCase('conduct concern'))).not.toBeNull();
    });

    it('grievance keeps its own recipe', () => {
      const step = getNextStep({ id: 'g', caseType: 'grievance', stage: 'intake', meetings: [] });
      expect(step).not.toBeNull();
      // Grievance-shaped, not disciplinary-shaped.
      expect(step.label.toLowerCase()).not.toMatch(/disciplinary/);
    });

    it('probation, flexible working and long-term sickness keep theirs', () => {
      // Each of these recipes is keyed on ITS OWN stage vocabulary, not the
      // disciplinary one — so the case must be shaped with a stage that recipe
      // actually recognises, which is also the proof it is being routed there.
      [['probation', 'probation_started'],
       ['flexible working', 'request_received'], ['flexible_working', 'request_received'],
       ['long-term sickness', 'absence_identified'],
       ['long term sickness', 'absence_identified'],
       ['long_term_sickness', 'absence_identified']].forEach(([caseType, stage]) => {
        expect(getNextStep({ id: 'x', caseType, stage, meetings: [] }), caseType).not.toBeNull();
      });
    });

    it('a supported type at a stage its own recipe does not cover already returned null', () => {
      // Pre-existing behaviour, asserted so the fail-safe cannot be mistaken
      // for the cause of it: every recipe has always ended in `default: null`.
      expect(getNextStep({ id: 'x', caseType: 'probation', stage: 'intake', meetings: [] })).toBeNull();
    });

    it('a closed case still returns null, as it always did', () => {
      expect(getNextStep({ stage: 'closed', caseType: 'misconduct', meetings: [] })).toBeNull();
    });
  });

  describe('unsupported types get NO guided step — never another recipe', () => {
    // These are the real production populations.
    const unsupported = [
      ['capability', 162], ['performance', 0], ['absence', 28], ['attendance', 0],
      ['redundancy', 0], ['other', 0], ['informal', 14],
      ['something nobody has ever configured', 0],
    ];
    unsupported.forEach(([type, productionRows]) => {
      it(`${type} (${productionRows} production cases) gets no guided next step`, () => {
        expect(getNextStep(openCase(type))).toBeNull();
      });
    });

    it('an untyped case gets no guided next step — all 566 of them', () => {
      [undefined, null, '', '   '].forEach(t => {
        expect(getNextStep(openCase(t))).toBeNull();
      });
      // And a case object with no caseType key at all.
      expect(getNextStep({ id: 'c', stage: 'investigation', meetings: [] })).toBeNull();
    });

    it('the refusal is total — no stage of an unsupported type produces a step', () => {
      ['intake', 'investigation', 'inv_report', 'disciplinary', 'outcome', 'appeal'].forEach(stage => {
        expect(getNextStep({ id: 'c', caseType: 'capability', stage, meetings: [] }), stage).toBeNull();
      });
    });
  });

  describe('adversarial — restoring a default recipe must be caught', () => {
    it('capability and misconduct must NOT share an answer', () => {
      // The single assertion that fails the moment a default fall-through
      // returns: if unsupported types are routed anywhere, this pair converges.
      const misconduct = getNextStep(openCase('misconduct'));
      const capability = getNextStep(openCase('capability'));
      expect(misconduct).not.toBeNull();
      expect(capability).toBeNull();
      expect(capability).not.toEqual(misconduct);
    });

    it('routing is keyed on the canonical registry, not a second hand-written list', () => {
      // A parallel list would drift from PROCESS_TYPES — which is precisely the
      // class of bug this phase removes.
      const src = readFileSync('src/lib/nextStep.js', 'utf8');
      const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      expect(code).toContain('getProcessType');
      // The unconditional fall-through is gone.
      expect(code).not.toMatch(/return\s+isGrievanceCase\(cs\)\s*\?[\s\S]{0,120}disciplinaryNextStep\(cs, stage, ctx\);/);
    });
  });
});
