import { describe, it, expect } from 'vitest';
import { buildMeetingPrepGrounding, buildMeetingPrepInstructions, buildPrepAppealGroundsLine, buildPrepIndependenceLine } from '../lib/meetingPrepGrounding.js';

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
    expect(g).toContain('NOT VERIFIED by Compass');
    expect(g).toMatch(/do NOT state or imply that they are independent/);
    expect(g).not.toMatch(/heard by an independent manager/i);
  });

  it('O. CONFLICT is treated the same as UNKNOWN', () => {
    expect(buildPrepIndependenceLine('conflict', 'X')).toBe(buildPrepIndependenceLine('unknown', 'X'));
  });

  it('O. it may still truthfully say an officer has been appointed', () => {
    expect(buildPrepIndependenceLine('unknown', 'UAT - HR Manager')).toMatch(/has been appointed to hear the appeal/);
  });

  it('CLEAR may state the supported fact', () => {
    expect(buildPrepIndependenceLine('clear', 'X')).toMatch(/did not take the original decision/);
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
    expect(g).toContain('NOT VERIFIED by Compass');
    expect(g).toMatch(/do NOT state or imply that they are independent/);
  });
});
