import { describe, it, expect } from 'vitest';
import { buildMeetingPrepGrounding, buildMeetingPrepInstructions, buildPrepAppealGroundsLine, buildPrepIndependenceLine } from '../lib/meetingPrepGrounding.js';
import { classifyAppealIndependence } from '../lib/appealIndependence.js';
import { buildAppealDeadlineInstruction } from '../lib/letterGrounding.js';
import { readFileSync } from 'node:fs';

// Appeal Prep Pack P1 (Human UAT, 2026-09-20) — the prep pack was generated
// from six values (type label, employee, date, an editable chair name, the
// free-text Background box, participants) with no case facts and no
// anti-fabrication rules, so a chair preparing a real appeal hearing could be
// handed invented allegations, warnings, grounds and evidence.
//
// Fixtures are the exact shapes read from production case
// 3e99e129-9053-47de-82d1-ccce24925051.
const APPEAL_TYPE = { id: 'appeal-disciplinary', label: 'Disciplinary Appeal — ACAS S5' };
const DISCIPLINARY_TYPE = { id: 'disciplinary', label: 'Disciplinary' };

const CASE = {
  id: '3e99e129', employeeName: 'UAT - Fresh Golden Path 2', caseType: 'misconduct', stage: 'appeal',
  description: 'Fictional allegation: unauthorised use of company vehicle for personal errands on two occasions.',
  outcome: 'First written warning', outcomeIssuedAt: '2026-09-11T09:55:41.693Z', outcomeNotes: null,
  warningDurationMonths: 6, warningExpiresAt: '2027-03-11', appealText: null,
  meetings: [
    { id: 'm1', type: 'Investigation', date: '2026-09-11', record: 'INVESTIGATION_TRANSCRIPT_BODY'.repeat(120), transcript: new Array(10).fill({ text: 'x' }) },
    { id: 'm2', type: 'Disciplinary', date: '2026-09-11', record: 'DISCIPLINARY_TRANSCRIPT_BODY'.repeat(110), transcript: new Array(7).fill({ text: 'x' }) },
    { id: 'm3', type: 'Disciplinary', date: '2026-09-11', letterType: 'outcome', record: 'OUTCOME_MEETING_BODY'.repeat(150), transcript: new Array(7).fill({ text: 'x' }), letterOutput: 'LETTER_BODY'.repeat(600) },
    { id: 'm4', type: 'Disciplinary Appeal', date: '2026-09-20', letterType: 'invite', record: '', transcript: [], letterOutput: 'INVITE_BODY'.repeat(300), hearingDate: '2026-09-22', hearingTime: '10:00', hearingLocationOrMethod: 'Microsoft Teams', savedAt: '2026-09-20T09:11:01.213Z' },
  ],
};
const OPEN_QUESTIONS = [{ title: 'Has evidence been gathered confirming whether the vehicle-use policy was communicated to this employee?', reasoning: 'The investigation record flags it.' }];
const OPEN_INCONSISTENCIES = [{ title: 'Potential inconsistency: Investigation vs Disciplinary', reasoning: 'Positions differ between the two meetings.' }];

const appealGrounding = (overrides = {}) => buildMeetingPrepGrounding({
  caseObj: CASE, meetingType: APPEAL_TYPE, appealOfficerName: 'UAT - HR Manager',
  appealIndependenceStatus: 'unknown', allegations: [],
  openQuestions: OPEN_QUESTIONS, openInconsistencies: OPEN_INCONSISTENCIES, ...overrides,
});

describe('buildMeetingPrepGrounding — authoritative case facts (A, E, F, G, J)', () => {
  const g = appealGrounding();

  it('A. supplies the linked case context instead of leaving the model with nothing', () => {
    expect(g).toContain('AUTHORITATIVE COMPASS CASE CONTEXT');
    expect(g).toContain('UAT - Fresh Golden Path 2');
    expect(g).toContain('misconduct');
    expect(g).toContain('unauthorised use of company vehicle');
  });

  it('E. grounds the original decision exactly', () => {
    expect(g).toContain('Original decision/outcome already issued: First written warning.');
    expect(g).toContain('Outcome issued on: 11 September 2026.');
  });

  it('F. grounds warning duration and expiry from the structured fields', () => {
    expect(g).toContain('Warning duration on record: 6 months.');
    expect(g).toContain('Warning expires on: 11 March 2027.');
  });

  it('G. names the appointed appeal officer as authoritative', () => {
    expect(g).toContain('Appointed appeal officer who will chair this hearing: UAT - HR Manager');
    expect(g).toMatch(/do not name anyone else as chair/i);
  });

  it('J. includes the hearing date, time and method from the saved invitation', () => {
    expect(g).toContain('22 September 2026 at 10:00, Microsoft Teams');
  });

  it('returns empty for an ad-hoc meeting with no case, leaving existing behaviour intact', () => {
    expect(buildMeetingPrepGrounding({ caseObj: null, meetingType: APPEAL_TYPE })).toBe('');
    expect(buildMeetingPrepGrounding({})).toBe('');
  });
});

describe('historical meeting content is bounded, never dumped (grounding size)', () => {
  const g = appealGrounding();

  it('includes prior meetings as metadata only', () => {
    expect(g).toContain('Investigation on 11 September 2026 (record on file)');
    expect(g).toMatch(/metadata only/i);
  });

  it('never injects transcript, record or letter bodies', () => {
    expect(g).not.toContain('INVESTIGATION_TRANSCRIPT_BODY');
    expect(g).not.toContain('DISCIPLINARY_TRANSCRIPT_BODY');
    expect(g).not.toContain('OUTCOME_MEETING_BODY');
    expect(g).not.toContain('LETTER_BODY');
    expect(g).not.toContain('INVITE_BODY');
  });

  it('stays compact rather than growing with case size', () => {
    expect(g.length).toBeLessThan(6000);
  });

  it('excludes the letter-only invitation from the meetings-held list', () => {
    expect(g).not.toMatch(/Disciplinary Appeal on 20 September/);
  });

  it('caps long free-text and long lists', () => {
    const many = { ...CASE, description: 'D'.repeat(2000), meetings: Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, type: 'Investigation', date: '2026-09-11', record: 'notes', transcript: [{ text: 'x' }] })) };
    const out = buildMeetingPrepGrounding({ caseObj: many, meetingType: APPEAL_TYPE, openQuestions: new Array(30).fill(OPEN_QUESTIONS[0]) });
    expect(out).not.toContain('D'.repeat(1000));
    expect((out.match(/Investigation on /g) || []).length).toBeLessThanOrEqual(6);
    expect((out.match(/vehicle-use policy/g) || []).length).toBeLessThanOrEqual(8);
  });
});

describe('appeal grounds (C, D)', () => {
  it('C. null appeal_text is stated explicitly and can never become invented grounds', () => {
    const g = appealGrounding();
    expect(g).toContain('Grounds of appeal: NOT RECORDED in Compass');
    expect(g).toMatch(/Do not infer, invent or reconstruct/);
    expect(g).toMatch(/fair opportunity to explain their grounds at the hearing/);
    expect(g).toMatch(/which part of the original decision is being challenged/);
  });

  it('C. missing grounds is never an error that blocks preparation', () => {
    expect(appealGrounding()).toBeTruthy();
    expect(buildPrepAppealGroundsLine(null)).toBeTruthy();
    expect(buildPrepAppealGroundsLine('')).toBeTruthy();
    expect(buildPrepAppealGroundsLine('   ')).toMatch(/NOT RECORDED/);
  });

  it('D. recorded grounds are used exactly and not replaced by the allegation', () => {
    const g = appealGrounding({ caseObj: { ...CASE, appealText: 'The sanction was disproportionate to the conduct.' } });
    expect(g).toContain('The sanction was disproportionate to the conduct.');
    expect(g).not.toContain('NOT RECORDED');
    expect(g).toMatch(/do not substitute the original allegation/i);
  });
});

describe('open signals stay unresolved (M, N)', () => {
  it('M. open questions are labelled as questions, never findings', () => {
    const g = appealGrounding();
    expect(g).toContain('UNRESOLVED QUESTIONS');
    expect(g).toMatch(/not findings and not established facts/);
    expect(g).toMatch(/Never restate any of them as though it had been answered or proven/);
    expect(g).toContain('vehicle-use policy');
  });

  it('M. inconsistencies are framed as observations, not proven contradictions', () => {
    const g = appealGrounding();
    expect(g).toMatch(/NOT proven contradictions and NOT evidence of dishonesty/);
  });

  // N — the builder only ever receives already-filtered OPEN signals from
  // openSignalsForCase, so resolved/not-relevant ones cannot reach it.
  it('N. nothing is emitted when no open signals are supplied', () => {
    const g = appealGrounding({ openQuestions: [], openInconsistencies: [] });
    expect(g).not.toContain('UNRESOLVED QUESTIONS');
    expect(g).not.toContain('POTENTIAL INCONSISTENCIES');
  });
});

describe('appeal independence (O)', () => {
  it('O. UNKNOWN is never described as independent', () => {
    const g = appealGrounding({ appealIndependenceStatus: 'unknown' });
    expect(g).toContain('NOT VERIFIED');
    expect(g).toMatch(/Do not describe them as independent/);
    expect(g).not.toMatch(/heard by an independent manager/i);
  });

  // Reversed by the advisory cleanup: treating a proven conflict identically
  // to an unverified one told the model to stay silent about a conflict the
  // record actually establishes. See the dedicated suite below.
  it('O. CONFLICT is NOT treated the same as UNKNOWN', () => {
    expect(buildPrepIndependenceLine('conflict', 'X')).not.toBe(buildPrepIndependenceLine('unknown', 'X'));
  });

  it('O. UNKNOWN still names the officer without asserting anything about their involvement', () => {
    const line = buildPrepIndependenceLine('unknown', 'UAT - HR Manager');
    expect(line).toContain('UAT - HR Manager');
    expect(line).toMatch(/NOT a finding that they were involved/);
  });

  it('CLEAR may state the supported fact', () => {
    expect(buildPrepIndependenceLine('clear', 'X')).toMatch(/does not identify X as having taken the original decision/);
  });

  it('emits nothing when there is no classification', () => {
    expect(buildPrepIndependenceLine(null, 'X')).toBe('');
  });
});

describe('buildMeetingPrepInstructions (K, L, P, Q, R, S)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true, hasAdditionalContext: true });

  it('R. prohibits invention of allegations, grounds, warnings, evidence and procedural facts', () => {
    expect(appealRules).toMatch(/Do not invent allegations, appeal grounds, warnings, sanctions, evidence, prior decisions, procedural events, dates or reasonable adjustments/);
    expect(appealRules).toMatch(/never fill the gap with an assumption/);
  });

  it('R. keeps allegations, questions and decisions distinct', () => {
    expect(appealRules).toMatch(/an allegation is not a finding/);
    expect(appealRules).toMatch(/an unresolved question is not an established fact/);
  });

  it('P. frames an appeal as a review of an existing decision, not a fresh disciplinary', () => {
    expect(appealRules).toMatch(/review of a decision that has already been taken/);
    expect(appealRules).toMatch(/NOT a fresh disciplinary hearing/);
    expect(appealRules).toMatch(/grounds of appeal/);
    expect(appealRules).toMatch(/outcome or remedy the employee is seeking/);
  });

  it('P. still permits legitimate reconsideration of the underlying evidence', () => {
    expect(appealRules).toMatch(/reconsidering evidence is part of a fair review/);
  });

  it('Q. prohibits recommending or predetermining the appeal outcome', () => {
    expect(appealRules).toMatch(/not recommend, predict or predetermine the outcome/);
    expect(appealRules).toMatch(/belongs solely to the appeal officer/);
  });

  it('K/L. additional context augments and conflicts are flagged, never silently resolved', () => {
    expect(appealRules).toMatch(/Treat it as supplementary/);
    expect(appealRules).toMatch(/must not silently override them/);
    expect(appealRules).toMatch(/do not pick a side — flag the discrepancy/);
  });

  it('K. the additional-context rule is omitted when the user supplied none', () => {
    const noExtra = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true, hasAdditionalContext: false });
    expect(noExtra).not.toMatch(/ADDITIONAL CONTEXT below/);
    expect(noExtra).toMatch(/Do not invent allegations/);
  });

  it('S. non-appeal meetings get the anti-fabrication rules but no appeal review framing', () => {
    const disciplinary = buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: true });
    expect(disciplinary).toMatch(/Do not invent allegations/);
    expect(disciplinary).not.toMatch(/review of a decision that has already been taken/);
    expect(disciplinary).not.toMatch(/predetermine the outcome/);
  });

  it('T. an ad-hoc meeting with no case context gets no grounding rules imposed', () => {
    expect(buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: false })).toBe('');
  });
});

// B — preparedCaseId and _linkedCaseId are different concepts and must stay
// that way. _linkedCaseId means "file this record as witness evidence on a
// parent case" and drives saveMeetingToCaseImpl's persistence routing;
// preparedCaseId only ever grounds preparation. Reusing the former for
// grounding (the original bug's tempting shortcut) would misfile appeal
// hearings into case evidence.
describe('preparedCaseId is separate from _linkedCaseId witness routing (B)', () => {
  // Mirrors saveMeetingToCaseImpl's routing branch exactly.
  const routesAsWitnessEvidence = caseInfo => !!caseInfo._linkedCaseId;
  // Mirrors handlePrepare's resolution.
  const groundsPrepFrom = caseInfo => caseInfo.preparedCaseId || caseInfo._linkedCaseId;

  it('the structured appeal route grounds prep without triggering witness routing', () => {
    const appealRoute = { _linkedCaseId: null, preparedCaseId: '3e99e129' };
    expect(groundsPrepFrom(appealRoute)).toBe('3e99e129');
    expect(routesAsWitnessEvidence(appealRoute)).toBe(false);
  });

  it('the witness route still routes to parent-case evidence, unchanged', () => {
    const witnessRoute = { _linkedCaseId: 'parent-case', _linkedCaseName: 'Sam' };
    expect(routesAsWitnessEvidence(witnessRoute)).toBe(true);
    expect(groundsPrepFrom(witnessRoute)).toBe('parent-case');
  });

  it('setting preparedCaseId never makes a meeting route as witness evidence', () => {
    expect(routesAsWitnessEvidence({ preparedCaseId: 'c1', _linkedCaseId: null })).toBe(false);
    expect(routesAsWitnessEvidence({ preparedCaseId: 'c1' })).toBe(false);
  });

  it('an ad-hoc meeting grounds from neither', () => {
    expect(groundsPrepFrom({})).toBeFalsy();
    expect(routesAsWitnessEvidence({})).toBe(false);
  });
});

// U — generation must stay read-only. handlePrepare calls the AI endpoint and
// sets transient state; it must never write a case, meeting, audit row or
// workflow transition.
describe('prep generation is non-mutating (U)', () => {
  it('the grounding builders are pure and mutate nothing they are given', () => {
    const snapshot = JSON.parse(JSON.stringify(CASE));
    const questions = JSON.parse(JSON.stringify(OPEN_QUESTIONS));
    buildMeetingPrepGrounding({
      caseObj: CASE, meetingType: APPEAL_TYPE, appealOfficerName: 'UAT - HR Manager',
      appealIndependenceStatus: 'unknown', allegations: [], openQuestions: OPEN_QUESTIONS, openInconsistencies: OPEN_INCONSISTENCIES,
    });
    buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true, hasAdditionalContext: true });
    expect(CASE).toEqual(snapshot);
    expect(OPEN_QUESTIONS).toEqual(questions);
  });

  it('they return strings only — no writes, no side-effect handles', () => {
    expect(typeof buildMeetingPrepGrounding({ caseObj: CASE, meetingType: APPEAL_TYPE })).toBe('string');
    expect(typeof buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true })).toBe('string');
  });
});

// Advisory accuracy P1 (Human UAT, 2026-09-20) — the generated pack asserted
// that "the absence of a notetaker is a procedural risk" and that a blank
// notetaker field was "a procedural gap in the original process", and escalated
// unrecorded appeal grounds into "the hearing cannot be properly conducted
// until this is clear". None of those came from Compass: no rule anywhere
// requires a separate notetaker, the underlying signal was the neutral
// question "Who is the notetaker … and was one present?", and the grounds
// instruction never mentioned the hearing being unable to proceed. The earlier
// rules stopped the model inventing FACTS; they said nothing about inventing
// CONCLUSIONS from a true absence.
//
// These test the deterministic prompt invariants we control, not probabilistic
// model output.
describe('absence-is-not-defect invariant (1, 2)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true, hasAdditionalContext: true });
  const disciplinaryRules = buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: true });

  it('1. states the invariant explicitly', () => {
    expect(appealRules).toMatch(/ABSENCE IS NOT A DEFECT/);
    expect(appealRules).toMatch(/missing or unrecorded information is not evidence that something did not happen/i);
    expect(appealRules).toMatch(/or that the process was defective/i);
  });

  it('1. permits describing an absence, and noting it as something to confirm', () => {
    expect(appealRules).toMatch(/describe only that fact — that it is not recorded/i);
    expect(appealRules).toMatch(/note it as something to confirm/i);
  });

  it('2. names every adverse conclusion that must not be inferred from absence alone', () => {
    ['procedural defect', 'legal breach', 'unfairness', 'non-compliance', 'procedural risk'].forEach(term => {
      expect(appealRules.toLowerCase()).toContain(term);
    });
    expect(appealRules).toMatch(/from the absence alone/i);
  });

  it('2. separates the epistemic state from the conclusion', () => {
    expect(appealRules).toMatch(/describe the state of the RECORD, and are not themselves problems with the process/);
    expect(appealRules).toMatch(/is a CONCLUSION, and needs affirmative support/);
    expect(appealRules).toMatch(/Never convert the first into the second/);
  });

  it('2. forbids converting an unknown into a defect just to fill a section', () => {
    expect(appealRules).toMatch(/never do so simply to have something to put under a heading/i);
  });

  it('1. preserves the ability to surface genuinely supported concerns', () => {
    expect(appealRules).toMatch(/only where the supplied case context explicitly supports it/i);
  });

  it('9. ordinary non-appeal prep receives the same invariant', () => {
    expect(disciplinaryRules).toMatch(/ABSENCE IS NOT A DEFECT/);
    expect(disciplinaryRules).toMatch(/from the absence alone/i);
    // …and keeps its existing behaviour: no appeal review framing.
    expect(disciplinaryRules).not.toMatch(/review of a decision that has already been taken/);
    expect(disciplinaryRules).toMatch(/Do not invent allegations/);
  });
});

describe('Risk Flags / Legal Checklist are not filled for their own sake (4)', () => {
  const rules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });

  it('constrains both sections to supported matters', () => {
    expect(rules).toMatch(/For Risk Flags and Legal Checklist, include only matters actually supported by the supplied case context/);
  });

  it('permits them to be empty or minimal', () => {
    expect(rules).toMatch(/do not have to be filled/i);
    expect(rules).toMatch(/none is identified from the information recorded|keep the section minimal/i);
  });

  it('forbids manufacturing a risk from blank detail', () => {
    expect(rules).toMatch(/Never manufacture a procedural or legal risk out of blank, missing or unrecorded detail/);
  });
});

describe('stored signals are contextual, not legal authority (10)', () => {
  const rules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });

  it('frames supplied signals as material to pursue or verify', () => {
    expect(rules).toMatch(/contextual case material/i);
    expect(rules).toMatch(/questions to pursue or matters to verify/i);
  });

  it('stops their normative wording becoming Compass\'s own conclusion', () => {
    expect(rules).toMatch(/not automatically Compass's own conclusion/i);
    expect(rules).toMatch(/do not restate it as settled law, established non-compliance or a proven procedural failing/i);
    expect(rules).toMatch(/unless the authoritative context independently supports that/i);
  });
});

describe('missing appeal grounds do not block the hearing (3, 4, 5, 6)', () => {
  const line = buildPrepAppealGroundsLine(null);

  it('3. still states the grounds are not recorded', () => {
    expect(line).toContain('Grounds of appeal: NOT RECORDED in Compass');
  });

  it('4. still forbids inventing or reconstructing them', () => {
    expect(line).toMatch(/Do not infer, invent or reconstruct/);
  });

  it('5. directs the chair to establish and record them at the outset', () => {
    expect(line).toMatch(/establish and record the grounds at the outset/i);
    expect(line).toMatch(/before moving into the substantive appeal issues/i);
    expect(line).toMatch(/fair opportunity to explain their grounds at the hearing/i);
  });

  it('6. states the absence does not prevent the hearing going ahead', () => {
    expect(line).toMatch(/does NOT prevent the appeal hearing from going ahead/);
  });

  it('6. forbids every blocking or blame formulation', () => {
    expect(line).toMatch(/Do not say or imply that the hearing cannot proceed/);
    expect(line).toMatch(/cannot properly be conducted/);
    expect(line).toMatch(/is defective/);
    expect(line).toMatch(/the employee has failed to follow procedure/);
    expect(line).toMatch(/merely because the grounds were not recorded beforehand/);
  });

  it('recorded grounds are unaffected by the new wording', () => {
    const recorded = buildPrepAppealGroundsLine('The sanction was disproportionate.');
    expect(recorded).toContain('The sanction was disproportionate.');
    expect(recorded).not.toMatch(/NOT RECORDED/);
    expect(recorded).not.toMatch(/does NOT prevent the appeal hearing/);
  });
});

describe('the invariant does not suppress genuine recorded concerns (8)', () => {
  // The real open process_risk on the production case: a deterministic
  // guardrail finding with explicit ACAS reasoning. It is supported by the
  // record, so it must still reach the model.
  const RECORDED_CONCERN = {
    title: 'Same person chaired the investigation and the disciplinary hearing',
    reasoning: 'Walter Carta chaired both the investigation and the disciplinary hearing. The ACAS Code of Practice expects the investigating manager and the person deciding the outcome to be different people.',
  };

  it('8. a genuinely recorded procedural concern is still supplied', () => {
    const g = appealGrounding({ openInconsistencies: [RECORDED_CONCERN] });
    expect(g).toContain('Same person chaired the investigation and the disciplinary hearing');
    expect(g).toContain('ACAS Code of Practice');
  });

  it('8. the neutral notetaker question is still supplied, as a question', () => {
    const notetaker = { title: 'Who is the notetaker for the disciplinary hearing, and was one present?', reasoning: "The disciplinary hearing record explicitly states the notetaker as 'Not specified', leaving this role unconfirmed." };
    const g = appealGrounding({ openQuestions: [notetaker] });
    expect(g).toContain('Who is the notetaker');
    expect(g).toMatch(/UNRESOLVED QUESTIONS/);
    // The supplied material itself must not assert any defect.
    expect(g).not.toMatch(/procedural gap/i);
    expect(g).not.toMatch(/procedural risk/i);
  });

  it('7. unknown chair independence is still never converted into a claim of independence', () => {
    const g = appealGrounding({ appealIndependenceStatus: 'unknown' });
    expect(g).toContain('NOT VERIFIED');
    expect(g).toMatch(/Do not describe them as independent/);
  });
});

// Final advisory cleanup (Human UAT, 2026-09-20).
//
// A — the three independence states had collapsed into two behaviours. UNKNOWN
// and CONFLICT returned an identical string ending "Say nothing about their
// prior involvement either way", so the prep pack stayed silent both when
// Compass could not verify involvement AND when the record affirmatively
// proved the appointed officer took the original decision. The earlier pack
// surfaced the UNKNOWN warning only because other prompt pressure overrode
// that instruction; once the absence-is-not-defect work removed that pressure,
// the model obeyed the literal instruction and the warning vanished.
//
// classifyAppealIndependence remains the only classifier — these tests assert
// the three states are rendered distinctly, not that a second model exists.
describe('appeal officer independence — three distinct states (A1-A11)', () => {
  const OFFICER = 'UAT - HR Manager';
  const clear = buildPrepIndependenceLine('clear', OFFICER);
  const conflict = buildPrepIndependenceLine('conflict', OFFICER);
  const unknown = buildPrepIndependenceLine('unknown', OFFICER);

  it('A1/A9. all three states are semantically distinct', () => {
    expect(clear).not.toBe(conflict);
    expect(clear).not.toBe(unknown);
    expect(conflict).not.toBe(unknown);
    [clear, conflict, unknown].forEach(line => expect(line.length).toBeGreaterThan(0));
  });

  describe('CLEAR', () => {
    it('A2. raises no verify-before-proceeding warning', () => {
      expect(clear).not.toMatch(/should be confirmed before the hearing/i);
      expect(clear).toMatch(/nothing here needs confirming/i);
    });

    it('A2. states only what the classifier supports, not a guarantee of impartiality', () => {
      expect(clear).toMatch(/does not identify .* as having taken the original decision/);
      expect(clear).toMatch(/Do not overstate this into a general guarantee of impartiality/);
    });
  });

  describe('CONFLICT', () => {
    it('A3. surfaces the recorded conflict plainly rather than suppressing it', () => {
      expect(conflict).toMatch(/RECORDED CONFLICT/);
      expect(conflict).toMatch(/having made or taken part in the original decision/);
      expect(conflict).toMatch(/Surface it plainly/);
      expect(conflict).not.toMatch(/Say nothing/i);
    });

    it('A3. marks it as an affirmative record finding, not an inference from a gap', () => {
      expect(conflict).toMatch(/affirmative finding in the structured record/);
      expect(conflict).toMatch(/not an inference drawn from missing information/);
    });

    it('A3. directs it to be addressed before the hearing proceeds', () => {
      expect(conflict).toMatch(/addressed before the appeal hearing proceeds/);
    });

    it('A4. never describes the officer as independent', () => {
      expect(conflict).toMatch(/Do NOT describe this officer as independent or uninvolved/);
    });

    it('A4. draws no legal conclusion beyond the recorded conflict', () => {
      expect(conflict).toMatch(/Do not draw any further legal conclusion/);
    });
  });

  describe('UNKNOWN', () => {
    it('A5. says involvement has not been verified from the structured record', () => {
      expect(unknown).toMatch(/NOT VERIFIED/);
      expect(unknown).toMatch(/cannot establish from the structured case record/);
    });

    it('A6. asserts none of independent / uninvolved / conflicted / involved as fact', () => {
      expect(unknown).toMatch(/NOT a finding that they were involved/);
      expect(unknown).toMatch(/NOT confirmation that they were not/);
      expect(unknown).toMatch(/Do not describe them as independent, impartial by virtue of non-involvement, uninvolved, or conflicted/);
      expect(unknown).toMatch(/none of those is established/);
    });

    it('A7. directs the user to confirm before the hearing proceeds', () => {
      expect(unknown).toMatch(/should be confirmed before the hearing proceeds/);
    });

    it('A8. stays a verification gap, not a defect — coexisting with absence-is-not-defect', () => {
      expect(unknown).toMatch(/a gap in the record/);
      expect(unknown).toMatch(/Do not treat it as evidence of unfairness, procedural defect, breach or non-compliance/);
      expect(unknown).toMatch(/something to check, not a failing/);
    });

    it('A9. is not the old shared prohibition', () => {
      expect(unknown).not.toMatch(/Say nothing about their prior involvement/);
    });
  });

  it('A10. classifyAppealIndependence stays the source of truth and drives the grounding', () => {
    const CASE_UNKNOWN = { id: 'c1', employeeName: 'X', stage: 'appeal', disciplinaryDecidedBy: null, appealText: null, meetings: [] };
    const status = classifyAppealIndependence({ caseRecord: CASE_UNKNOWN, allegations: [], appealOfficerUserId: 'officer-uuid' });
    const g = buildMeetingPrepGrounding({ caseObj: CASE_UNKNOWN, meetingType: APPEAL_TYPE, appealOfficerName: OFFICER, appealIndependenceStatus: status });
    expect(status).toBe('unknown');
    expect(g).toContain('NOT VERIFIED');
  });

  it('A11. the live legacy UAT shape still classifies UNKNOWN', () => {
    // disciplinary_decided_by null, zero allegations — production 3e99e129.
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: null }, allegations: [], appealOfficerUserId: '522293f3-817a-4226-980a-f32abbaefef9',
    })).toBe('unknown');
  });

  it('emits nothing for an unrecognised or absent status', () => {
    expect(buildPrepIndependenceLine(null, OFFICER)).toBe('');
    expect(buildPrepIndependenceLine(undefined, OFFICER)).toBe('');
    expect(buildPrepIndependenceLine('something-else', OFFICER)).toBe('');
  });

  it('falls back to a neutral descriptor when the officer is unnamed', () => {
    [buildPrepIndependenceLine('clear'), buildPrepIndependenceLine('conflict'), buildPrepIndependenceLine('unknown')]
      .forEach(line => expect(line).toContain('the appointed appeal officer'));
  });
});

// B — the pack asserted "best practice is to aim to communicate the outcome …
// within five to ten working days". No prep rule, case field, policy or
// constant supplied that; it was invented.
describe('appeal outcome timescales are never invented (B1-B5)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });
  const disciplinaryRules = buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: true });

  it('B1. prohibits inventing any numeric appeal timescale', () => {
    expect(appealRules).toMatch(/TIMESCALES:/);
    expect(appealRules).toMatch(/do not state or invent any specific number of hours, days, working days or weeks/i);
    expect(appealRules).toMatch(/unless that exact timeframe is given to you in the authoritative case context or company policy/i);
  });

  it('B1. blocks the "typical" / "best practice" framing the model used', () => {
    expect(appealRules).toMatch(/Do not present a figure of your own as best practice, as typical, or as what is usually expected/);
  });

  it('B2. gives the safe fallback wording', () => {
    expect(appealRules).toMatch(/confirmed in writing/);
    expect(appealRules).toMatch(/as soon as possible/);
    expect(appealRules).toMatch(/without unreasonable delay/);
    expect(appealRules).toMatch(/realistic updated timeframe/);
    expect(appealRules).toMatch(/further enquiry or investigation is required/);
  });

  it('B3. the rule itself introduces no numeric day/week value', () => {
    const rule = appealRules.slice(appealRules.indexOf('TIMESCALES:'));
    expect(rule).not.toMatch(/\b\d+\s*(?:working\s*)?(?:hour|day|week)s?\b/i);
    expect(rule).not.toMatch(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:working\s+)?(?:hour|day|week)s?\b/i);
  });

  it('B5. non-appeal prep is not given the appeal-outcome timescale rule', () => {
    expect(disciplinaryRules).not.toMatch(/TIMESCALES:/);
    // …while keeping the shared protections.
    expect(disciplinaryRules).toMatch(/ABSENCE IS NOT A DEFECT/);
  });
});

// B4 — the employee's 5-working-day window to LODGE an appeal is a separate,
// authoritative figure owned by deadlines.js and buildAppealDeadlineInstruction
// (scoped to outcome letters). The timescale rule above concerns only when the
// appeal OUTCOME is communicated, and must not touch it.
describe('appeal-submission deadline logic is separate and untouched (B4)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });

  it('the prep timescale rule says nothing about the appeal-submission window', () => {
    const rule = appealRules.slice(appealRules.indexOf('TIMESCALES:'));
    expect(rule).not.toMatch(/submission|lodge|window to appeal|right to appeal/i);
  });

  it('deadlines.js still owns the ACAS-recommended appeal window', () => {
    const deadlines = readFileSync('src/lib/deadlines.js', 'utf8');
    expect(deadlines).toContain('Employee appeal window (ACAS-recommended: 5 working days)');
    expect(deadlines).toContain('Disciplinary outcome letter due (ACAS-recommended: 5 working days)');
  });

  it('buildAppealDeadlineInstruction still grounds the authoritative appeal deadline for outcome letters only', () => {
    expect(buildAppealDeadlineInstruction('2026-09-18', 'outcome')).toMatch(/AUTHORITATIVE APPEAL DEADLINE/);
    expect(buildAppealDeadlineInstruction('2026-09-18', 'invite')).toBe('');
    expect(buildAppealDeadlineInstruction('2026-09-18', 'appeal')).toBe('');
  });
});

// Final advisory wording fix (Human UAT, 2026-09-20) — Closing Points told the
// chair to confirm "that no further submissions will be accepted after this
// point unless genuinely new evidence comes to light". Compass holds no
// authoritative policy or case context establishing any such evidential
// cut-off, and an appeal chair may properly need further clarification,
// enquiry or investigation before deciding. Same class as the invented
// timescale: a procedural restriction asserted with nothing behind it.
describe('post-hearing evidential cut-off is never asserted (1-6)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });
  const disciplinaryRules = buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: true });
  const closingRule = appealRules.slice(appealRules.indexOf('CLOSING THE HEARING:'), appealRules.indexOf('TIMESCALES:'));

  it('1. prohibits blanket "no further submissions" wording unless authoritatively grounded', () => {
    expect(appealRules).toMatch(/CLOSING THE HEARING:/);
    expect(closingRule).toMatch(/do not tell the chair to say that no further submissions will be accepted/i);
    expect(closingRule).toMatch(/evidence or submissions are closed once the hearing ends/i);
    expect(closingRule).toMatch(/unless such a restriction is explicitly set out in the authoritative case context or company policy/i);
  });

  it('1. names the general shape so equivalent phrasings are caught too', () => {
    expect(closingRule).toMatch(/blanket cut-off on evidence or representations/i);
  });

  it('2. prohibits "only genuinely new evidence" as a default post-hearing restriction', () => {
    expect(closingRule).toMatch(/only genuinely new evidence can be considered afterwards/i);
  });

  it('3. permits further clarification, enquiry, investigation or information before deciding', () => {
    expect(closingRule).toMatch(/may properly need further clarification, enquiry, investigation or information/i);
    expect(closingRule).toMatch(/anything reasonably required to decide the appeal can still be obtained or considered/i);
  });

  it('3. still allows the legitimate closing statements', () => {
    expect(closingRule).toMatch(/the hearing itself is concluding/i);
    expect(closingRule).toMatch(/the chair will consider everything heard/i);
    expect(closingRule).toMatch(/told if any further step materially affects the decision or the timetable/i);
    expect(closingRule).toMatch(/final outcome will be confirmed in writing/i);
  });

  it('3. does not hard-code a new procedural entitlement or promise', () => {
    expect(closingRule).toMatch(/Do not promise the employee any specific procedural entitlement or right beyond this/i);
  });

  it('4. reintroduces no numeric appeal deadline of any kind', () => {
    expect(closingRule).not.toMatch(/\b\d+\s*(?:working\s*)?(?:hour|day|week)s?\b/i);
    expect(closingRule).not.toMatch(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:working\s+)?(?:hour|day|week)s?\b/i);
    // …and the existing timescale rule is still present and still numeric-free.
    const timescaleRule = appealRules.slice(appealRules.indexOf('TIMESCALES:'));
    expect(timescaleRule).toMatch(/without unreasonable delay/);
    expect(timescaleRule).not.toMatch(/\b\d+\s*(?:working\s*)?(?:hour|day|week)s?\b/i);
  });

  it('6. non-appeal prep is not given the closing-the-hearing rule', () => {
    expect(disciplinaryRules).not.toMatch(/CLOSING THE HEARING:/);
    // …while keeping the shared protections it already had.
    expect(disciplinaryRules).toMatch(/ABSENCE IS NOT A DEFECT/);
    expect(disciplinaryRules).toMatch(/Do not invent allegations/);
  });

  // The appeal-type rules (review framing, no predetermined outcome, and now
  // closing/timescales) have never been gated on hasCaseContext — only the
  // case-grounding rules are. This records that existing contract rather than
  // changing it: an ad-hoc NON-appeal meeting still gets nothing at all.
  it('6. ad-hoc non-appeal prep is still given no instructions at all', () => {
    expect(buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: false })).toBe('');
  });

  it('6. an ungrounded appeal keeps only the appeal-type rules, and gains no case-grounding rules', () => {
    const ungroundedAppeal = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: false });
    expect(ungroundedAppeal).toMatch(/CLOSING THE HEARING:/);
    expect(ungroundedAppeal).toMatch(/TIMESCALES:/);
    expect(ungroundedAppeal).toMatch(/review of a decision that has already been taken/);
    // Case-grounding rules stay gated on hasCaseContext, exactly as before.
    expect(ungroundedAppeal).not.toMatch(/ABSENCE IS NOT A DEFECT/);
    expect(ungroundedAppeal).not.toMatch(/For Risk Flags and Legal Checklist/);
    expect(ungroundedAppeal).not.toMatch(/AUTHORITATIVE COMPASS CASE CONTEXT/);
  });

  it('5. every previously-passed appeal protection is still present alongside it', () => {
    expect(appealRules).toMatch(/ABSENCE IS NOT A DEFECT/);
    expect(appealRules).toMatch(/describe the state of the RECORD/);
    expect(appealRules).toMatch(/For Risk Flags and Legal Checklist, include only matters actually supported/);
    expect(appealRules).toMatch(/contextual case material/);
    expect(appealRules).toMatch(/review of a decision that has already been taken/);
    expect(appealRules).toMatch(/not recommend, predict or predetermine the outcome/);
    expect(appealRules).toMatch(/TIMESCALES:/);
  });

  it('5. independence and missing-grounds behaviour is untouched', () => {
    expect(buildPrepIndependenceLine('unknown', 'X')).toMatch(/NOT VERIFIED/);
    expect(buildPrepIndependenceLine('conflict', 'X')).toMatch(/RECORDED CONFLICT/);
    expect(buildPrepIndependenceLine('conflict', 'X')).not.toBe(buildPrepIndependenceLine('unknown', 'X'));
    expect(buildPrepAppealGroundsLine(null)).toMatch(/NOT RECORDED in Compass/);
    expect(buildPrepAppealGroundsLine(null)).toMatch(/does NOT prevent the appeal hearing from going ahead/);
  });
});

// Recording accuracy (Human UAT, 2026-09-20) — the Opening Script told the
// chair to say aloud "This hearing is being recorded for the purposes of
// producing a formal record". No recording-status field exists anywhere in
// Compass, and the only capture features are opt-in speech-to-TEXT on the live
// meeting screen which retain no audio or video. The cause was lexical rather
// than an absence inference: 19 occurrences of "record" reach the model from
// the grounding (case record, recorded fact, written record, record the
// grounds) and it selected the wrong sense for a spoken opening. Shared, not
// appeal-only — every case-grounded meeting type gets the same Opening Script.
describe('recording and note-taking accuracy (1-13)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });
  const disciplinaryRules = buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: true });
  const recordingRule = appealRules.slice(appealRules.indexOf('RECORDING AND NOTE-TAKING ACCURACY:'));

  it('1. prohibits claiming the meeting is being recorded absent authoritative confirmation', () => {
    expect(appealRules).toMatch(/RECORDING AND NOTE-TAKING ACCURACY:/);
    expect(recordingRule).toMatch(/Never state or imply that this meeting or hearing is being audio-recorded, video-recorded, transcribed or otherwise electronically recorded/i);
    expect(recordingRule).toMatch(/unless authoritative supplied context explicitly confirms that mechanism/i);
  });

  it('2. states that a formal case or meeting record does not imply electronic recording', () => {
    expect(recordingRule).toMatch(/a formal case or meeting record/i);
    expect(recordingRule).toMatch(/NOT evidence that electronic recording is happening/i);
  });

  it('3. states that notes, a transcript field and AI-generated notes do not imply recording', () => {
    expect(recordingRule).toMatch(/Compass meeting notes, a transcript field, AI-generated notes/i);
  });

  it('4. prohibits invented recording consent or a right to record', () => {
    expect(recordingRule).toMatch(/Do not invent recording consent requirements/i);
    expect(recordingRule).toMatch(/a right to audio or video recording/i);
  });

  it('5. prohibits invented transcription and electronic recording arrangements', () => {
    expect(recordingRule).toMatch(/transcription arrangements/i);
    expect(recordingRule).toMatch(/electronic recording arrangements/i);
  });

  it('6. prohibits invented notetaker attendance', () => {
    expect(recordingRule).toMatch(/notetaker attendance/i);
  });

  it('7. prohibits invented formally agreed minutes', () => {
    expect(recordingRule).toMatch(/formally agreed minutes/i);
    expect(recordingRule).toMatch(/or any other note-taking or recording mechanism the supplied context does not establish/i);
  });

  it('8. still permits legitimate written-record and note-keeping wording', () => {
    expect(recordingRule).toMatch(/You may say that appropriate notes or a written record should be kept where that is supported/i);
  });

  it('9. disambiguates the senses of "record" rather than banning the word', () => {
    expect(recordingRule).toMatch(/refer to the WRITTEN record unless authoritative context explicitly says otherwise/i);
    // The grounding's own legitimate uses must survive untouched.
    const g = appealGrounding();
    expect(g).toMatch(/Original issue as recorded when the case was opened/);
    expect(g).toMatch(/\(record on file\)/);
    expect(g).toMatch(/NOT RECORDED in Compass/);
    expect(buildPrepAppealGroundsLine(null)).toMatch(/establish and record the grounds at the outset/);
  });

  it('yields to a genuine recording mechanism if authoritative context ever confirms one', () => {
    // No such field exists today; the rule is written conditionally so a
    // future authoritative status would be stated truthfully rather than
    // suppressed. Asserting the conditional, not inventing a fixture.
    expect(recordingRule).toMatch(/and if it ever does, state it truthfully/i);
  });

  it('10. reaches appeal case-grounded prep', () => {
    expect(appealRules).toMatch(/RECORDING AND NOTE-TAKING ACCURACY:/);
  });

  it('11. reaches non-appeal case-grounded prep too', () => {
    expect(disciplinaryRules).toMatch(/RECORDING AND NOTE-TAKING ACCURACY:/);
    expect(disciplinaryRules).toMatch(/Never state or imply that this meeting or hearing is being audio-recorded/i);
    // …without acquiring appeal-only rules.
    expect(disciplinaryRules).not.toMatch(/review of a decision that has already been taken/);
    expect(disciplinaryRules).not.toMatch(/CLOSING THE HEARING:/);
    expect(disciplinaryRules).not.toMatch(/TIMESCALES:/);
  });

  it('12. ad-hoc non-case-grounded prep is unchanged', () => {
    expect(buildMeetingPrepInstructions({ meetingType: DISCIPLINARY_TYPE, hasCaseContext: false })).toBe('');
    const ungroundedAppeal = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: false });
    expect(ungroundedAppeal).not.toMatch(/RECORDING AND NOTE-TAKING ACCURACY:/);
    expect(ungroundedAppeal).not.toMatch(/thank the employee and anyone attending with them/i);
  });

  it('13. Closing Points now names the thanks and close explicitly', () => {
    expect(appealRules).toMatch(/the chair should thank the employee and anyone attending with them, and close the hearing/i);
    expect(disciplinaryRules).toMatch(/thank the employee and anyone attending with them/i);
  });
});

// 14 — every previously deployed safeguard must survive this addition.
describe('all previously deployed prep safeguards remain intact (14)', () => {
  const appealRules = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true, hasAdditionalContext: true });

  it('appeal is a review, not a fresh disciplinary, with no predetermined outcome', () => {
    expect(appealRules).toMatch(/review of a decision that has already been taken/);
    expect(appealRules).toMatch(/NOT a fresh disciplinary hearing/);
    expect(appealRules).toMatch(/not recommend, predict or predetermine the outcome/);
  });

  it('absence-is-not-defect and UNKNOWN-vs-DEFECT survive', () => {
    expect(appealRules).toMatch(/ABSENCE IS NOT A DEFECT/);
    expect(appealRules).toMatch(/from the absence alone/);
    expect(appealRules).toMatch(/describe the state of the RECORD, and are not themselves problems with the process/);
    expect(appealRules).toMatch(/is a CONCLUSION, and needs affirmative support/);
  });

  it('Risk Flags / Legal Checklist restraint and signals-as-context survive', () => {
    expect(appealRules).toMatch(/For Risk Flags and Legal Checklist, include only matters actually supported/);
    expect(appealRules).toMatch(/Never manufacture a procedural or legal risk/);
    expect(appealRules).toMatch(/contextual case material/);
    expect(appealRules).toMatch(/not automatically Compass's own conclusion/);
  });

  it('timescale guard and post-hearing evidence guard survive', () => {
    expect(appealRules).toMatch(/TIMESCALES:/);
    expect(appealRules).toMatch(/without unreasonable delay/);
    expect(appealRules).toMatch(/CLOSING THE HEARING:/);
    expect(appealRules).toMatch(/no further submissions will be accepted/);
    expect(appealRules).toMatch(/anything reasonably required to decide the appeal can still be obtained or considered/);
  });

  it('independence UNKNOWN stays distinct from CONFLICT, and missing grounds still do not block the hearing', () => {
    expect(buildPrepIndependenceLine('unknown', 'X')).toMatch(/NOT VERIFIED/);
    expect(buildPrepIndependenceLine('conflict', 'X')).toMatch(/RECORDED CONFLICT/);
    expect(buildPrepIndependenceLine('conflict', 'X')).not.toBe(buildPrepIndependenceLine('unknown', 'X'));
    expect(buildPrepAppealGroundsLine(null)).toMatch(/NOT RECORDED in Compass/);
    expect(buildPrepAppealGroundsLine(null)).toMatch(/does NOT prevent the appeal hearing from going ahead/);
  });

  it('the grounding builder remains pure', () => {
    const snapshot = JSON.parse(JSON.stringify(CASE));
    appealGrounding();
    buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });
    expect(CASE).toEqual(snapshot);
  });
});

// ── Issue A (Human UAT, regeneration 2026-09-20) — the deployed rule stopped
// the pack CLAIMING a notetaker was present. It did not stop the inverse
// failure: the pack told the chair a notetaker had to be arranged and that
// note-taking arrangements had to be confirmed before the hearing could
// proceed, purely because the notetaker field was blank. UNKNOWN != DEFECT.
describe('notetaker arrangements are never invented or required (Issue A)', () => {
  const r = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });

  it('A1. forbids requiring a separate notetaker, or saying one must be present', () => {
    expect(r).toContain('Compass holds no requirement that a separate notetaker attends');
    expect(r).toMatch(/not state or imply that a notetaker is required, that one must be present or arranged/);
  });

  it('A2. forbids making note-taking arrangements a precondition of the hearing proceeding', () => {
    expect(r).toMatch(/note-taking arrangements must be confirmed or agreed before the hearing can proceed/);
  });

  it('A3. forbids telling the chair they must personally take the notes', () => {
    expect(r).toMatch(/must not|Do not/);
    expect(r).toContain('must personally take the notes');
  });

  it('A4. forbids telling the chair they must ensure someone else takes notes', () => {
    expect(r).toContain('must ensure someone else takes them');
  });

  it('A5. a blank / null / "Not specified" notetaker is not evidence of any defect', () => {
    expect(r).toMatch(/blank, empty, null, unknown or shown as "Not specified"/);
    expect(r).toContain('NOT evidence that no adequate written record exists');
    expect(r).toMatch(/incomplete or inaccurate/);
    expect(r).toMatch(/that the process was defective/);
    expect(r).toMatch(/that there was a procedural failing/);
    expect(r).toMatch(/that the hearing cannot properly proceed/);
    expect(r).toContain('UNKNOWN or NOT RECORDED is not a DEFECT');
  });

  it('A6. a blank notetaker must not be raised as a risk, concern, unanswered issue or point to confirm', () => {
    expect(r).toMatch(/Do not raise it on that basis as a risk, a procedural concern, an unanswered issue or a point to confirm/);
  });

  it('A7. PRESERVES genuine affirmative record concerns — this restrains inference, not reporting', () => {
    expect(r).toContain('You must still raise, plainly, any genuine concern the supplied case context affirmatively supports');
    expect(r).toMatch(/notes taken were inaccurate or incomplete/);
    expect(r).toMatch(/no adequate record was kept/);
    expect(r).toMatch(/the employee disputes the record/);
    expect(r).toMatch(/the handling of the record is itself a ground of appeal/);
    // Keeping an appropriate written record is still legitimate advice.
    expect(r).toContain('an appropriate written record of the hearing should be kept');
  });

  it('A8. the existing electronic-recording safeguards are NOT removed or weakened', () => {
    expect(r).toContain('RECORDING AND NOTE-TAKING ACCURACY');
    expect(r).toMatch(/Never state or imply that this meeting or hearing is being audio-recorded, video-recorded, transcribed/);
    expect(r).toMatch(/Do not invent recording consent requirements/);
    expect(r).toMatch(/transcription arrangements/);
    expect(r).toMatch(/formally agreed minutes/);
    expect(r).toMatch(/notetaker attendance/);
  });
});

// ── Issue B (Human UAT, regeneration 2026-09-20) — the pack told the chair
// there had been "a shift in position" between two accounts, and speculated
// about why, on nothing more than the two witnesses having worded the same
// events differently. The existing guard only covered "proven contradiction"
// and "evidence of dishonesty", so this third inference passed straight
// through.
describe('differing accounts are not converted into inconsistency (Issue B)', () => {
  const r = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });

  it('B1. permits neutrally reproducing or summarising what each person said', () => {
    expect(r).toContain('DIFFERING ACCOUNTS');
    expect(r).toMatch(/neutrally reproduce or summarise what each of them said/);
  });

  it('B2. permits saying the wording differs where objectively supported', () => {
    expect(r).toMatch(/note that the wording differs where that is objectively supported/);
  });

  it('B3. permits inviting clarification where it matters to a ground of appeal or the original decision', () => {
    expect(r).toMatch(/invite clarification where the difference is genuinely relevant to a ground of appeal, to the original decision/);
    expect(r).toMatch(/something the chair needs to understand/);
  });

  it('B4. forbids inferring a shift or change in position from differing wording alone', () => {
    expect(r).toMatch(/must NOT infer from differing wording alone/);
    expect(r).toContain('a shift in position');
    expect(r).toContain('a change in position');
    expect(r).toMatch(/a changed story or changed account/);
  });

  it('B5. forbids inferring inconsistency, credibility issues, dishonesty or unreliability', () => {
    for (const term of ['inconsistency', 'a credibility issue', 'dishonesty', 'unreliability']) {
      expect(r).toContain(term);
    }
  });

  it('B6. forbids inferring motive or evasiveness', () => {
    expect(r).toContain('a motive');
    expect(r).toContain('evasiveness');
  });

  it('B7. forbids speculating about WHY the wording differs', () => {
    expect(r).toMatch(/Do not speculate about why the wording differs/);
    expect(r).toMatch(/People describe the same events differently for many ordinary reasons/);
  });

  it('B8. forbids inventing explanations merely to populate Potential Inconsistencies', () => {
    expect(r).toMatch(/do not offer explanations merely to populate Potential Inconsistencies/);
    expect(r).toMatch(/that section may be brief, or record that nothing further is identified/);
  });

  it('B9. PRESERVES genuinely recorded inconsistency evidence', () => {
    expect(r).toMatch(/affirmatively records an inconsistency, a retraction, an account that actually changed, or a disputed fact, state it plainly/);
    expect(r).toContain('this rule restrains inference, it does not suppress recorded inconsistency evidence');
    // And the historical signal source itself is untouched — the flagged
    // inconsistency signals still reach the model as context to explore.
    const g = appealGrounding();
    expect(g).toContain('POTENTIAL INCONSISTENCIES Compass has flagged');
    expect(g).toContain('NOT proven contradictions and NOT evidence of dishonesty');
    expect(g).toContain('Potential inconsistency: Investigation vs Disciplinary');
  });
});

// ── Issue C4 — concision, so a properly bounded pack fits the unchanged
// 2048-token budget, without sacrificing any required section.
describe('prep pack concision instructions (Issue C4)', () => {
  const r = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });

  it('C4a. instructs concision and forbids repeating the same point across headings', () => {
    expect(r).toContain('BE CONCISE');
    expect(r).toMatch(/Do not repeat the same point under more than one heading/);
    expect(r).toMatch(/do not restate the case background supplied above/);
    expect(r).toMatch(/Do not pad a section to make it look substantial/);
  });

  it('C4b. explicitly allows "None identified from the supplied case context." for the optional sections', () => {
    expect(r).toContain('None identified from the supplied case context.');
    expect(r).toMatch(/For Risk Flags and Legal Checklist/);
  });

  it('C4c. does NOT permit dropping a required section to save tokens', () => {
    expect(r).toMatch(/Every required heading must still appear: never drop, merge or omit one to save space/);
  });
});

// ── Both AI calls share ONE instruction layer (no second rule architecture).
describe('the interactive prep questions inherit the same rules (A + B)', () => {
  const app = readFileSync('src/App.jsx', 'utf8');

  it('the narrative call and generatePrepQuestions receive the same prepInstructions', () => {
    const fn = app.slice(app.indexOf('const prepInstructions = buildMeetingPrepInstructions'), app.indexOf('} catch(e) {', app.indexOf('const prepInstructions = buildMeetingPrepInstructions')));
    expect(fn).toContain('generatePrepQuestions(carriedContext, prepInstructions)');
    expect(fn).toContain('${prepInstructions?"\\n\\n"+prepInstructions:""}');
    // Exactly one instruction builder — no parallel rule set.
    expect(app.match(/buildMeetingPrepInstructions\(/g).length).toBe(1);
  });

  it('the narrative prompt defers to the rules rather than force-carrying every signal', () => {
    expect(app).toContain('Where a rule above tells you not to raise a particular matter, that rule takes precedence');
  });

  it('the new rules are gated on case context, like the rest of the shared layer', () => {
    const ungrounded = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: false });
    expect(ungrounded).not.toContain('NOTETAKER AND NOTE-TAKING ARRANGEMENTS');
    expect(ungrounded).not.toContain('DIFFERING ACCOUNTS');
    // The appeal-process anti-invention rules stay ungated, as ratified.
    expect(ungrounded).toContain('THIS IS AN APPEAL HEARING');
    expect(ungrounded).toContain('CLOSING THE HEARING');
    expect(ungrounded).toContain('TIMESCALES');
  });

  it('the instruction builder remains pure and stable across calls', () => {
    const a = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });
    const b = buildMeetingPrepInstructions({ meetingType: APPEAL_TYPE, hasCaseContext: true });
    expect(a).toBe(b);
  });
});
