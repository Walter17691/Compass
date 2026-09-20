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
