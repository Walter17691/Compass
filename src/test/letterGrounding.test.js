import { describe, it, expect } from 'vitest';
import { resolveLetterGrounding, buildRecipientInstruction, buildAppealDeadlineInstruction, buildAppealOutcomeInstruction, buildAppealHearingLogisticsInstruction, buildAppealGroundsInstruction } from '../lib/letterGrounding.js';

const goldenPathEmployee = 'UAT - Test Employee (Golden Path)';

// Defect #20 remediation — the actual production bug: a caller does
// setCaseInfo(...) then calls handleLetter(...) synchronously in the same
// handler, but handleLetter reads caseInfo via closure, so it sees
// whatever caseInfo held from the LAST completed render, not the value
// the caller just requested. These tests reproduce that exact shape
// directly (old/empty caseInfo + a caller-supplied override), without
// needing to simulate React's render timing at all.
describe('resolveLetterGrounding — Defect #20 stale-state reproduction', () => {
  it('uses the caller-supplied override for employee/manager/date even when caseInfo still holds the old (empty) values', () => {
    const staleCaseInfo = { employee: '', manager: '', date: '' };
    const result = resolveLetterGrounding({
      caseInfo: staleCaseInfo,
      overrides: { employeeName: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' },
    });
    expect(result).toEqual({ employee: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' });
  });

  it('falls back to caseInfo when no override is supplied (existing "Regenerate" call sites, which never pass overrides)', () => {
    const settledCaseInfo = { employee: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' };
    const result = resolveLetterGrounding({ caseInfo: settledCaseInfo, overrides: {} });
    expect(result).toEqual({ employee: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' });
  });

  it('falls back to caseInfo when overrides is omitted entirely', () => {
    const settledCaseInfo = { employee: goldenPathEmployee, manager: '', date: '' };
    expect(resolveLetterGrounding({ caseInfo: settledCaseInfo })).toEqual({ employee: goldenPathEmployee, manager: '', date: '' });
  });

  it('a real (non-empty) override always wins over caseInfo, even if caseInfo also happens to be correct — the override is the authoritative, just-computed value', () => {
    const caseInfo = { employee: 'Some Other Name', manager: 'Some Other Manager', date: '2020-01-01' };
    const result = resolveLetterGrounding({ caseInfo, overrides: { employeeName: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' } });
    expect(result.employee).toBe(goldenPathEmployee);
    expect(result.manager).toBe('Walter Carta');
    expect(result.date).toBe('2026-09-07');
  });

  it('does not throw when caseInfo itself is missing', () => {
    expect(() => resolveLetterGrounding({ overrides: { employeeName: goldenPathEmployee } })).not.toThrow();
    expect(resolveLetterGrounding({ overrides: { employeeName: goldenPathEmployee } }).employee).toBe(goldenPathEmployee);
  });
});

// Defect #11/#19/#20 remediation — proves the AI context/instruction
// unambiguously identifies the correct employee as recipient, scoped only
// to employee-directed letter types, and never itself depends on or
// mentions any other narrative person (e.g. O'Brien-Test) — it simply
// doesn't reference them at all, which is the point: the model is told
// who to address, not told who NOT to address by name.
describe('buildRecipientInstruction — Golden Path generation context (Defect #11/#19/#20)', () => {
  it('names the known employee explicitly as the intended recipient for an outcome letter', () => {
    const instruction = buildRecipientInstruction(goldenPathEmployee, 'outcome');
    expect(instruction).toContain('INTENDED RECIPIENT: ' + goldenPathEmployee);
    expect(instruction).toContain(`Dear ${goldenPathEmployee},`);
  });

  it('never mentions any other narrative person (e.g. O\'Brien-Test) — it only ever names the known employee', () => {
    const instruction = buildRecipientInstruction(goldenPathEmployee, 'outcome');
    expect(instruction).not.toContain("O'Brien-Test");
  });

  it('instructs the model not to substitute another named person or leave a placeholder', () => {
    const instruction = buildRecipientInstruction(goldenPathEmployee, 'outcome');
    expect(instruction.toLowerCase()).toMatch(/do not address it to any other person/);
    expect(instruction.toLowerCase()).toMatch(/do not leave the recipient's name as a placeholder/);
  });

  it.each(['outcome', 'invite', 'appeal', 'suspension', 'no-case-answer', 'grievance'])(
    'is produced for the employee-directed letter type "%s" when the employee is known',
    (letterType) => {
      expect(buildRecipientInstruction(goldenPathEmployee, letterType)).not.toBe('');
    }
  );

  it('is not produced for a non-employee-directed letter type (witness invitation — legitimately addressed to someone else)', () => {
    expect(buildRecipientInstruction(goldenPathEmployee, 'witness-invitation')).toBe('');
  });

  it('is not produced for an internal, non-addressed document type (investigation report)', () => {
    expect(buildRecipientInstruction(goldenPathEmployee, 'investigation-report')).toBe('');
  });

  it('is not produced when the employee is not actually known', () => {
    expect(buildRecipientInstruction('', 'outcome')).toBe('');
    expect(buildRecipientInstruction(null, 'outcome')).toBe('');
    expect(buildRecipientInstruction(undefined, 'outcome')).toBe('');
  });
});

// NEW-1 remediation — the authoritative appeal deadline supplied as a
// deterministic fact, the same pattern buildRecipientInstruction above
// already established.
describe('buildAppealDeadlineInstruction (NEW-1)', () => {
  it('states the Golden Path exact deadline in long-form English', () => {
    const instruction = buildAppealDeadlineInstruction('2026-09-14', 'outcome');
    expect(instruction).toContain('14 September 2026');
    expect(instruction).toContain('AUTHORITATIVE APPEAL DEADLINE');
  });

  it('instructs the model not to derive the date from the letter\'s own document date', () => {
    const instruction = buildAppealDeadlineInstruction('2026-09-14', 'outcome');
    expect(instruction.toLowerCase()).toMatch(/not derive a different date from this letter/);
    expect(instruction.toLowerCase()).toMatch(/never write that the appeal window runs from the date of this letter/);
  });

  it('is only produced for outcome letters, not other letter types', () => {
    expect(buildAppealDeadlineInstruction('2026-09-14', 'invite')).toBe('');
    expect(buildAppealDeadlineInstruction('2026-09-14', 'appeal')).toBe('');
    expect(buildAppealDeadlineInstruction('2026-09-14', 'dismissal')).toBe('');
  });

  it('is not produced when no authoritative deadline is known (never fabricates one)', () => {
    expect(buildAppealDeadlineInstruction(null, 'outcome')).toBe('');
    expect(buildAppealDeadlineInstruction(undefined, 'outcome')).toBe('');
    expect(buildAppealDeadlineInstruction('', 'outcome')).toBe('');
  });
});

// Final pre-deployment review (2026-09-16) — "upheld" is genuinely
// ambiguous read in isolation: "the appeal is upheld" (employee succeeds)
// and "the original decision is upheld" (employee's appeal fails) are
// opposite outcomes. Proves, for all four stored appeal_outcome values,
// that the generated instruction states the correct, unambiguous effect
// on the original decision and can never be read as the inverted result —
// closing the risk at the deterministic-grounding layer Compass actually
// controls, the same layer buildAppealDeadlineInstruction/
// buildRecipientInstruction already close their own risks at.
describe('buildAppealOutcomeInstruction (final pre-deployment review)', () => {
  const baseAllegation = { title: 'Unauthorised absence', status: 'substantiated', appealReasoning: 'New evidence changes the picture.', appealDecidedAt: '2026-09-10T00:00:00.000Z' };

  it('upheld: states the appeal succeeded AND that the original decision is overturned — never that the decision is upheld', () => {
    const instruction = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'upheld' }, 'Priya Shah');
    expect(instruction).toContain('AUTHORITATIVE APPEAL OUTCOME (state exactly this result — never invent or infer a different one): Appeal upheld');
    expect(instruction).toContain('the original decision is overturned and does not stand');
    expect(instruction.toLowerCase()).not.toMatch(/original decision (is unchanged|remains in force)/);
  });

  it('partially_upheld: states the original decision is varied, not simply upheld or overturned', () => {
    const instruction = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'partially_upheld' }, 'Priya Shah');
    expect(instruction).toContain('AUTHORITATIVE APPEAL OUTCOME (state exactly this result — never invent or infer a different one): Partially upheld');
    expect(instruction).toContain('the original decision is varied');
  });

  it('not_upheld: states the original decision stands — never that the appeal succeeded', () => {
    const instruction = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'not_upheld' }, 'Priya Shah');
    expect(instruction).toContain('AUTHORITATIVE APPEAL OUTCOME (state exactly this result — never invent or infer a different one): Not upheld');
    expect(instruction).toContain('the original decision is unchanged and remains in force');
    expect(instruction.toLowerCase()).not.toMatch(/original decision is overturned/);
  });

  it('further_investigation_required: states the outcome but makes no claim about the original decision\'s fate', () => {
    const instruction = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'further_investigation_required' }, null);
    expect(instruction).toContain('Further investigation required');
    expect(instruction).not.toContain('Effect on the original decision');
  });

  it('warns the model against deriving the effect from the bare word "upheld"', () => {
    const instruction = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'upheld' }, 'Priya Shah');
    expect(instruction.toLowerCase()).toContain('describes whether the appeal succeeded, not the original decision');
  });

  it('states the appeal officer and decision date when given, and omits them cleanly when not', () => {
    const withOfficer = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'upheld' }, 'Priya Shah');
    expect(withOfficer).toContain('Appeal decided by: Priya Shah');
    expect(withOfficer).toContain('Appeal decided on: 10/09/2026');
    const withoutOfficer = buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: 'upheld', appealDecidedAt: null }, null);
    expect(withoutOfficer).not.toContain('Appeal decided by:');
    expect(withoutOfficer).not.toContain('Appeal decided on:');
  });

  it('returns empty for an allegation with no recorded appeal outcome (never fabricates one)', () => {
    expect(buildAppealOutcomeInstruction({ ...baseAllegation, appealOutcome: null }, null)).toBe('');
    expect(buildAppealOutcomeInstruction(null, null)).toBe('');
  });
});

describe('buildAppealHearingLogisticsInstruction (Appeal Invitation UAT P1 remediation)', () => {
  const logistics = { date: '2026-10-01', time: '10:30', locationOrMethod: 'Microsoft Teams' };

  it('returns empty when hearingLogistics is missing or any of the three fields is absent', () => {
    expect(buildAppealHearingLogisticsInstruction(null)).toBe('');
    expect(buildAppealHearingLogisticsInstruction(undefined)).toBe('');
    expect(buildAppealHearingLogisticsInstruction({ time: '10:30', locationOrMethod: 'Teams' })).toBe('');
    expect(buildAppealHearingLogisticsInstruction({ date: '2026-10-01', locationOrMethod: 'Teams' })).toBe('');
    expect(buildAppealHearingLogisticsInstruction({ date: '2026-10-01', time: '10:30' })).toBe('');
  });

  it('states the exact date (formatted), time, and location/method as authoritative facts', () => {
    const instruction = buildAppealHearingLogisticsInstruction(logistics);
    expect(instruction).toContain('1 October 2026');
    expect(instruction).toContain('10:30');
    expect(instruction).toContain('Microsoft Teams');
    expect(instruction.toLowerCase()).toContain('never calculate, infer, or substitute');
  });

  it('explicitly disambiguates the hearing location from the employee\'s own work location', () => {
    const instruction = buildAppealHearingLogisticsInstruction(logistics);
    expect(instruction.toLowerCase()).toContain("employee's own normal work location");
  });
});

describe('buildAppealGroundsInstruction (Appeal Invitation UAT P1 remediation)', () => {
  it('states the exact recorded grounds when appealText is populated', () => {
    const instruction = buildAppealGroundsInstruction('I believe the sanction was disproportionate.');
    expect(instruction).toContain('I believe the sanction was disproportionate.');
    expect(instruction.toLowerCase()).toContain('never substitute the original allegation');
  });

  it('trims whitespace-only appealText and treats it as unrecorded', () => {
    const instruction = buildAppealGroundsInstruction('   ');
    expect(instruction.toLowerCase()).toContain('not recorded');
  });

  it('explicitly instructs not to fabricate grounds when appealText is null/undefined', () => {
    expect(buildAppealGroundsInstruction(null).toLowerCase()).toContain('not recorded');
    expect(buildAppealGroundsInstruction(undefined).toLowerCase()).toContain('do not invent');
  });
});
