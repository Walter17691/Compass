import { describe, it, expect } from 'vitest';
import { validateFormalLetter, extractLetterSalutation, EMPLOYEE_DIRECTED_LETTER_TYPES } from '../lib/letterValidation.js';

// UAT Golden Path remediation (Defects #11/#12/#13) — the real bug: an
// AI-generated outcome letter for the Golden Path case (employeeName
// "UAT - Test Employee (Golden Path)") was addressed to "O'Brien-Test",
// a manager named prominently in the case's own free-text description
// as the person who raised the concern — not the employee. These tests
// reproduce that exact shape as a fixture, both correctly and
// incorrectly grounded, per the Golden Path regression requirement.
const goldenPathEmployee = 'UAT - Test Employee (Golden Path)';

function outcomeLetterAddressedTo(name, { outcome = 'First written warning' } = {}) {
  return `[Company Name]\n\n8 September 2026\n\nPrivate and Confidential\n\nDear ${name},\n\nOutcome of Disciplinary Hearing\n\nI am writing to confirm the outcome of the disciplinary hearing. The sanction imposed is: ${outcome}. This warning will remain on your file for 6 months. You have the right to appeal within 5 working days.\n\nYours sincerely,\n[Hearing Manager Name]`;
}

describe('extractLetterSalutation', () => {
  it('extracts the name from a "Dear X," salutation', () => {
    expect(extractLetterSalutation('Private and Confidential\n\nDear Jane Smith,\n\nBody...')).toBe('Jane Smith');
  });

  it('returns null when there is no salutation at all (malformed/empty response)', () => {
    expect(extractLetterSalutation('')).toBeNull();
    expect(extractLetterSalutation('Some text with no greeting line.')).toBeNull();
  });
});

describe('validateFormalLetter — Golden Path fixture (Defect #11 exact repro)', () => {
  it('a correctly grounded letter addressed to the real employee is valid', () => {
    const letter = outcomeLetterAddressedTo(goldenPathEmployee);
    const result = validateFormalLetter(letter, {employeeName: goldenPathEmployee, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('a letter attempting to substitute the reporting manager as recipient is rejected', () => {
    const letter = outcomeLetterAddressedTo("O'Brien-Test");
    const result = validateFormalLetter(letter, {employeeName: goldenPathEmployee, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("O'Brien-Test"))).toBe(true);
  });
});

describe('validateFormalLetter — recipient checks', () => {
  it('accepts a title-prefixed salutation that still matches the employee', () => {
    const letter = outcomeLetterAddressedTo('Ms Sarah Jones', {outcome: 'No further action'});
    const result = validateFormalLetter(letter, {employeeName: 'Sarah Jones', outcome: 'No further action', letterType: 'outcome'});
    expect(result.valid).toBe(true);
  });

  it('rejects when the salutation names an entirely different person', () => {
    const letter = outcomeLetterAddressedTo('Mark Owen', {outcome: 'No further action'});
    const result = validateFormalLetter(letter, {employeeName: 'Sarah Jones', outcome: 'No further action', letterType: 'outcome'});
    expect(result.valid).toBe(false);
  });

  it('rejects a missing recipient (no salutation found in a malformed/empty response)', () => {
    const result = validateFormalLetter('', {employeeName: 'Sarah Jones', outcome: 'No further action', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/salutation/i);
  });

  it('accepts a placeholder salutation as an honest "unknown", not a wrong-person error', () => {
    const letter = outcomeLetterAddressedTo('[Employee Name]');
    const result = validateFormalLetter(letter, {employeeName: 'Sarah Jones', outcome: 'No further action', letterType: 'outcome'});
    // The salutation itself is an honest placeholder, but the letter also
    // now fails the separate "unresolved known placeholder" check below —
    // both are legitimate failures for the same underlying reason.
    expect(result.valid).toBe(false);
  });

  it('flags an unresolved [Employee Name] placeholder even without a distinct wrong-name salutation', () => {
    const letter = 'Dear [Employee Name],\n\nOutcome: First written warning.';
    const result = validateFormalLetter(letter, {employeeName: 'Sarah Jones', outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /\[Employee Name\]/i.test(i))).toBe(true);
  });

  it('does not check recipient at all when employeeName is not known', () => {
    const letter = outcomeLetterAddressedTo('Whoever Reads This', {outcome: 'No further action'});
    const result = validateFormalLetter(letter, {employeeName: '', outcome: 'No further action', letterType: 'outcome'});
    expect(result.valid).toBe(true);
  });
});

describe('validateFormalLetter — outcome checks, across every outcome type', () => {
  const employeeName = 'Sarah Jones';

  it.each([
    'First written warning',
    'Final written warning',
    'Dismissal with notice',
    'Summary dismissal (gross misconduct)',
  ])('accepts a letter that states the recorded outcome ("%s")', (outcome) => {
    const letter = outcomeLetterAddressedTo(employeeName, {outcome});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome'});
    expect(result.valid).toBe(true);
  });

  it('rejects a letter stating a different outcome than the one actually recorded', () => {
    const letter = outcomeLetterAddressedTo(employeeName, {outcome: 'Final written warning'});
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('First written warning'))).toBe(true);
  });

  it('does not check outcome content for non-outcome letter types', () => {
    const letter = outcomeLetterAddressedTo(employeeName, {outcome: 'Something else entirely'});
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'invite'});
    expect(result.valid).toBe(true);
  });
});

describe('validateFormalLetter — letter-type scope', () => {
  it('skips validation entirely for an internal, non-employee-directed type (investigation report)', () => {
    const letter = outcomeLetterAddressedTo("O'Brien-Test");
    const result = validateFormalLetter(letter, {employeeName: goldenPathEmployee, outcome: 'First written warning', letterType: 'investigation-report'});
    expect(result.valid).toBe(true);
  });

  it('skips validation for a witness invitation, which is legitimately addressed to someone other than the employee', () => {
    const letter = outcomeLetterAddressedTo("O'Brien-Test");
    const result = validateFormalLetter(letter, {employeeName: goldenPathEmployee, outcome: '', letterType: 'witness-invitation'});
    expect(result.valid).toBe(true);
  });

  it('every listed employee-directed type is actually checked', () => {
    for (const letterType of EMPLOYEE_DIRECTED_LETTER_TYPES) {
      const wrongLetter = outcomeLetterAddressedTo('Someone Else');
      const result = validateFormalLetter(wrongLetter, {employeeName: goldenPathEmployee, outcome: '', letterType});
      expect(result.valid, `expected ${letterType} to be validated`).toBe(false);
    }
  });
});

describe('validateFormalLetter — malformed/empty AI response', () => {
  it('treats an empty string as invalid for an employee-directed letter with a known employee', () => {
    const result = validateFormalLetter('', {employeeName: goldenPathEmployee, outcome: '', letterType: 'outcome'});
    expect(result.valid).toBe(false);
  });

  it('does not throw on undefined/null letter text', () => {
    expect(() => validateFormalLetter(undefined, {employeeName: goldenPathEmployee, letterType: 'outcome'})).not.toThrow();
    expect(() => validateFormalLetter(null, {employeeName: goldenPathEmployee, letterType: 'outcome'})).not.toThrow();
  });
});
