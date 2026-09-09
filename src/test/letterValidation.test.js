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

// Defect #12 remediation — a variant with the duration/expiry sentence
// fully controllable, for the warning-duration-specific checks below
// (outcomeLetterAddressedTo above always hardcodes "6 months", which
// isn't useful for testing what happens when the stated duration is
// wrong, missing, or an unresolved placeholder).
function outcomeLetterWithDuration(name, { outcome = 'First written warning', durationSentence = '', expirySentence = '' } = {}) {
  return `[Company Name]\n\n8 September 2026\n\nDear ${name},\n\nThe sanction imposed is: ${outcome}. ${durationSentence} ${expirySentence} You have the right to appeal within 5 working days.\n\nYours sincerely,\n[Hearing Manager Name]`;
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

  // Defect #19 remediation — the message wording itself is no longer
  // tied to one exact bracket phrasing (see letterValidation.js's own
  // hasEmployeeIdentityPlaceholder comment); asserting on the generic
  // "unresolved employee-name placeholder" wording instead of the old
  // literal "[Employee Name]" substring.
  it('flags an unresolved [Employee Name] placeholder even without a distinct wrong-name salutation', () => {
    const letter = 'Dear [Employee Name],\n\nOutcome: First written warning.';
    const result = validateFormalLetter(letter, {employeeName: 'Sarah Jones', outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(true);
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

// UAT Golden Path remediation (Defect #12) — the exact production
// scenario: employee "UAT - Test Employee (Golden Path)", hearing
// decision of "First written warning" with a real 6-month duration
// (warning_duration_months=6), letter incorrectly generated a bare
// "[12 months]" placeholder. Every scenario the remediation's own test
// plan named explicitly.
describe('validateFormalLetter — warning duration (Defect #12, Golden Path fixture)', () => {
  const employeeName = goldenPathEmployee;
  const outcome = 'First written warning';
  const warningDurationMonths = 6;
  const warningExpiresAt = '2027-03-07'; // 2026-09-07 + 6 calendar months

  it('the recorded 6-month duration, correctly stated, is valid', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file for a period of 6 months.'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(true);
  });

  it('a stated 12 months cannot pass validation when the recorded duration is 6', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file for a period of 12 months.'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /12 months|6 months/.test(i))).toBe(true);
  });

  it('an unresolved "[12 months]" placeholder cannot pass validation even though a duration is recorded', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file for a period of [12 months].'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
  });

  it('an unresolved generic "[X months]" placeholder cannot pass validation either', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file for a period of [X months].'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
  });

  it('omitting the duration entirely cannot pass validation when a duration is recorded', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file.'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
  });

  it('the correct calculated expiry date, stated, is valid', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome,
      durationSentence: 'This warning will remain active on your file for a period of 6 months,',
      expirySentence: 'and will expire on 07 March 2027.',
    });
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths, warningExpiresAt});
    expect(result.valid).toBe(true);
  });

  it('a wrong stated expiry date cannot pass validation', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome,
      durationSentence: 'This warning will remain active on your file for a period of 6 months,',
      expirySentence: 'and will expire on 07 September 2027.',
    });
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths, warningExpiresAt});
    expect(result.valid).toBe(false);
  });

  it('does not check duration/expiry at all when no structured duration is recorded (e.g. a historical case awaiting completion)', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file for a period of [X months].'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths: null, warningExpiresAt: null});
    expect(result.valid).toBe(true);
  });

  it('does not require a warning duration for a non-warning outcome', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome: 'No further action', durationSentence: ''});
    const result = validateFormalLetter(letter, {employeeName, outcome: 'No further action', letterType: 'outcome', warningDurationMonths: null});
    expect(result.valid).toBe(true);
  });

  it('a letter mentioning an unrelated month figure (e.g. length of service) does not falsely trigger the wrong-duration check', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome,
      durationSentence: 'This warning will remain active on your file for a period of 6 months.',
      expirySentence: 'You have been employed here for 18 months prior to this hearing.',
    });
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(true);
  });
});

// Defect #18 remediation — the false-positive repro: a bare "[Month]"
// calendar-month placeholder in the incident narrative (nothing to do
// with warning duration) used to trip the old zero-or-more-digit regex.
describe('validateFormalLetter — Defect #18: calendar/date placeholders are not warning-duration placeholders', () => {
  const employeeName = goldenPathEmployee;
  const outcome = 'First written warning';
  const warningDurationMonths = 6;

  it.each([
    'during [Month] 2026',
    '[Month] 2026',
    'occurred in [Date]',
    'on [Date 1] and [Date 2]',
  ])('a letter mentioning "%s" alongside the correct 6-month duration is not blocked as a duration placeholder', (incidentText) => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome,
      durationSentence: `The allegation occurred ${incidentText}. This warning will remain active on your file for a period of 6 months.`,
    });
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.issues.some(i => /warning-duration placeholder/i.test(i))).toBe(false);
    expect(result.valid).toBe(true);
  });
});

describe('validateFormalLetter — Defect #18: genuine warning-duration placeholders still fail', () => {
  const employeeName = goldenPathEmployee;
  const outcome = 'First written warning';
  const warningDurationMonths = 6;

  it.each([
    '[12 months]',
    '[X months]',
    '[x months]',
    '[XX months]',
    '[warning duration]',
    '[insert warning duration]',
    '[number of months]',
  ])('an unresolved duration placeholder "%s" still fails validation', (placeholder) => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome,
      durationSentence: `This warning will remain active on your file for a period of ${placeholder}.`,
    });
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /warning-duration placeholder/i.test(i))).toBe(true);
  });

  it('a concrete but wrong duration ("12 months", no brackets) still fails', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file for a period of 12 months.'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
  });

  it('an entirely omitted duration still fails', () => {
    const letter = outcomeLetterWithDuration(employeeName, {outcome, durationSentence: 'This warning will remain active on your file.'});
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths});
    expect(result.valid).toBe(false);
  });
});

// Defect #19 remediation — the false-negative repro: "[Employee Full
// Name]" (and other reasonable phrasing variants) escaping the old
// single-exact-regex check.
describe('validateFormalLetter — Defect #19: employee-identity placeholder variants', () => {
  const employeeName = goldenPathEmployee;

  it.each([
    'Employee Name',
    'Employee Full Name',
    "Employee's Name",
    'Employee’s Name',
    'Full Employee Name',
    'Name of Employee',
    'EMPLOYEE NAME',
    'EMPLOYEE FULL NAME',
  ])('a salutation of "Dear [%s]," fails recipient validation', (variant) => {
    const letter = outcomeLetterAddressedTo(`[${variant}]`);
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(true);
  });

  it('the correct known employee as recipient passes recipient validation', () => {
    const letter = outcomeLetterAddressedTo(employeeName);
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(true);
  });

  it('an unresolved placeholder in the address block still fails even when the salutation itself is correctly resolved', () => {
    const letter = `[Employee Full Name]\n[Employee Address]\n\nDear ${employeeName},\n\nOutcome: First written warning.`;
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(true);
  });

  it('does not flag unrelated brackets that merely contain the word "name" (e.g. Company Name)', () => {
    const letter = `[Company Name]\n\nDear ${employeeName},\n\nOutcome: First written warning.`;
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(false);
  });
});

describe("validateFormalLetter — Defect #11 regression (O'Brien-Test must never be a valid recipient)", () => {
  const employeeName = goldenPathEmployee;

  it("O'Brien-Test as recipient still fails, distinctly from an unresolved placeholder", () => {
    const letter = outcomeLetterAddressedTo("O'Brien-Test");
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("O'Brien-Test"))).toBe(true);
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(false);
  });

  it('the correct employee still passes', () => {
    const letter = outcomeLetterAddressedTo(employeeName);
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(true);
  });

  it('an unresolved employee placeholder still fails, distinctly from a wrong named person', () => {
    const letter = outcomeLetterAddressedTo('[Employee Full Name]');
    const result = validateFormalLetter(letter, {employeeName, outcome: 'First written warning', letterType: 'outcome'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(true);
    expect(result.issues.some(i => i.startsWith('Letter is addressed to'))).toBe(false);
  });
});

// Combined reproduction of the exact production Golden Path draft shape
// (Defects #18/#19 together) — the letter that actually surfaced both
// bugs in production UAT.
describe('validateFormalLetter — combined production-draft fixture (Defects #18/#19)', () => {
  const employeeName = goldenPathEmployee;
  const outcome = 'First written warning';
  const warningDurationMonths = 6;
  const warningExpiresAt = '2027-03-07';

  function goldenPathProductionLetter(recipient) {
    return `[Company Name]\n\n9 September 2026\n\nPrivate and Confidential\n\n${recipient}\n[Employee Address]\n\nDear ${recipient},\n\nOutcome of Disciplinary Hearing – First Written Warning\n\nThe allegation considered at the hearing was as follows: that on three separate occasions during [Month] 2026, you arrived late to work without providing prior notice.\n\nSanction: First Written Warning\n\nAs a result of the above finding, you are hereby issued with a First Written Warning.\n\nThis warning will remain active on your personnel file for a period of 6 months from the date of this letter, and will expire on 7 March 2027, after which time it will be disregarded.\n\nYours sincerely,\n[Hearing Manager Name]`;
  }

  it('the exact production draft shape fails on the unresolved recipient, not on the [Month] incident placeholder', () => {
    const letter = goldenPathProductionLetter('[Employee Full Name]');
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths, warningExpiresAt});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /unresolved employee-name placeholder/i.test(i))).toBe(true);
    expect(result.issues.some(i => /warning-duration placeholder/i.test(i))).toBe(false);
  });

  it('correcting only the recipient makes the same draft fully valid — duration/expiry were already correct', () => {
    const letter = goldenPathProductionLetter(employeeName);
    const result = validateFormalLetter(letter, {employeeName, outcome, letterType: 'outcome', warningDurationMonths, warningExpiresAt});
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
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
