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
  return `Compass LTD\n\n8 September 2026\n\nPrivate and Confidential\n\nDear ${name},\n\nOutcome of Disciplinary Hearing\n\nI am writing to confirm the outcome of the disciplinary hearing. The sanction imposed is: ${outcome}. This warning will remain on your file for 6 months. You have the right to appeal within 5 working days.\n\nYours sincerely,\n[Hearing Manager Name]`;
}

// Defect #12 remediation — a variant with the duration/expiry sentence
// fully controllable, for the warning-duration-specific checks below
// (outcomeLetterAddressedTo above always hardcodes "6 months", which
// isn't useful for testing what happens when the stated duration is
// wrong, missing, or an unresolved placeholder).
function outcomeLetterWithDuration(name, { outcome = 'First written warning', durationSentence = '', expirySentence = '' } = {}) {
  return `Compass LTD\n\n8 September 2026\n\nDear ${name},\n\nThe sanction imposed is: ${outcome}. ${durationSentence} ${expirySentence} You have the right to appeal within 5 working days.\n\nYours sincerely,\n[Hearing Manager Name]`;
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

// Independent appeal officer workflow (2026-09-16) — same deterministic
// check, one stage later: the appeal outcome letter must state the real,
// recorded appeal outcome, not a different or invented one.
describe('validateFormalLetter — appeal outcome check', () => {
  const employeeName = 'Sarah Jones';
  function appealLetterAddressedTo(name, { resultText = 'Not upheld' } = {}) {
    return `Compass LTD\n\nDear ${name},\n\nAppeal Outcome\n\nHaving considered the grounds of appeal, the outcome of your appeal is: ${resultText}. This is the final stage of the internal procedure.\n\nYours sincerely,\n[Appeal Officer Name]`;
  }

  it('accepts a letter that states the recorded appeal outcome', () => {
    const letter = appealLetterAddressedTo(employeeName, {resultText: 'Not upheld'});
    const result = validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Not upheld'});
    expect(result.valid).toBe(true);
  });

  it('rejects a letter stating a different appeal outcome than the one actually recorded', () => {
    const letter = appealLetterAddressedTo(employeeName, {resultText: 'Upheld'});
    const result = validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Not upheld'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Not upheld'))).toBe(true);
  });

  it('skips the check when no single authoritative appeal outcome was resolved (e.g. multi-allegation split decision)', () => {
    const letter = appealLetterAddressedTo(employeeName, {resultText: 'Something unrelated'});
    const result = validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealOutcomeLabel: null});
    expect(result.valid).toBe(true);
  });
});

// Final pre-deployment review (2026-09-16) — defense in depth against the
// letter inverting "upheld"'s meaning: catches a stray sentence near
// "original decision" wording that contradicts the recorded appeal
// outcome's real effect, even if the correct outcome label also appears
// correctly elsewhere in the letter.
describe('validateFormalLetter — appeal outcome inversion check (final pre-deployment review)', () => {
  const employeeName = 'Sarah Jones';

  it('flags a letter that says the original decision "stands" when the appeal was actually upheld (overturned)', () => {
    const letter = `Dear ${employeeName},\n\nYour appeal outcome is: Appeal upheld.\n\nThe original decision stands and remains in effect.\n\nYours sincerely,\n[Appeal Officer Name]`;
    const result = validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Appeal upheld', appealEffectTag: 'overturned'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('overturned'))).toBe(true);
  });

  it('flags a letter that says the original decision was "overturned" when the appeal was actually not upheld (unchanged)', () => {
    const letter = `Dear ${employeeName},\n\nYour appeal outcome is: Not upheld.\n\nThe original decision has been overturned.\n\nYours sincerely,\n[Appeal Officer Name]`;
    const result = validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Not upheld', appealEffectTag: 'unchanged'});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('unchanged'))).toBe(true);
  });

  it('accepts a correctly-worded letter for each effect tag', () => {
    const upheldLetter = `Dear ${employeeName},\n\nYour appeal outcome is: Appeal upheld.\n\nThe original decision is overturned with immediate effect.\n\nYours sincerely,\n[Appeal Officer Name]`;
    expect(validateFormalLetter(upheldLetter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Appeal upheld', appealEffectTag: 'overturned'}).valid).toBe(true);

    const unchangedLetter = `Dear ${employeeName},\n\nYour appeal outcome is: Not upheld.\n\nThe original decision remains unchanged.\n\nYours sincerely,\n[Appeal Officer Name]`;
    expect(validateFormalLetter(unchangedLetter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Not upheld', appealEffectTag: 'unchanged'}).valid).toBe(true);
  });

  it('does not flag "upheld" wording when the letter never mentions "original decision" at all (nothing to scan)', () => {
    const letter = `Dear ${employeeName},\n\nYour appeal outcome is: Appeal upheld. The final written warning issued on 1 August 2026 no longer applies.\n\nYours sincerely,\n[Appeal Officer Name]`;
    const result = validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealOutcomeLabel: 'Appeal upheld', appealEffectTag: 'overturned'});
    expect(result.valid).toBe(true);
  });

  it('is skipped for non-appeal letter types and when no effect tag is known', () => {
    const letter = `Dear ${employeeName},\n\nThe original decision stands.\n\nYours sincerely,\n[Hearing Manager]`;
    expect(validateFormalLetter(letter, {employeeName, letterType: 'outcome', appealEffectTag: 'overturned'}).valid).toBe(true);
    expect(validateFormalLetter(letter, {employeeName, letterType: 'appeal', appealEffectTag: null}).valid).toBe(true);
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
    const letter = `Compass LTD\n\nDear ${employeeName},\n\nOutcome: First written warning.`;
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
    return `Compass LTD\n\n9 September 2026\n\nPrivate and Confidential\n\n${recipient}\n[Employee Address]\n\nDear ${recipient},\n\nOutcome of Disciplinary Hearing – First Written Warning\n\nThe allegation considered at the hearing was as follows: that on three separate occasions during [Month] 2026, you arrived late to work without providing prior notice.\n\nSanction: First Written Warning\n\nAs a result of the above finding, you are hereby issued with a First Written Warning.\n\nThis warning will remain active on your personnel file for a period of 6 months from the date of this letter, and will expire on 7 March 2027, after which time it will be disregarded.\n\nYours sincerely,\n[Hearing Manager Name]`;
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

// NEW-1 remediation — the exact acceptance matrix from the remediation
// brief. outcome_issued_at = 2026-09-07 (Monday), authoritative deadline
// = 2026-09-14 (Monday, 5 working days later) throughout, matching the
// Golden Path fixture and computeAuthoritativeAppealDeadline's own test
// coverage (deadlines.test.js).
describe('validateFormalLetter — appeal deadline (NEW-1)', () => {
  const employeeName = goldenPathEmployee;
  const outcome = 'First written warning';
  const appealDeadline = '2026-09-14';

  function outcomeLetterWithAppeal(name, { letterDate = '10 September 2026', appealSentence } = {}) {
    return `Compass LTD\n\n${letterDate}\n\nDear ${name},\n\nThe sanction imposed is: ${outcome}. This warning will remain on your file for 6 months. ${appealSentence}\n\nYours sincerely,\n[Hearing Manager Name]`;
  }

  it('A. issue and letter dated the same day, explicit correct deadline -> PASS', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { letterDate: '7 September 2026', appealSentence: 'If you wish to appeal, you must submit your appeal by 14 September 2026.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(true);
  });

  it('B. letter dated later than issue, explicit correct deadline -> PASS', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'If you wish to appeal, you must submit your appeal by 14 September 2026.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(true);
  });

  it('C. letter dated later, explicit WRONG concrete deadline (17 September) -> FAIL', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'If you wish to appeal, you must submit your appeal by 17 September 2026.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /appeal deadline other than the authoritative date/i.test(i))).toBe(true);
  });

  it('D. only relative "date of this letter" wording, no explicit date -> FAIL (this is the exact original repro)', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'You must appeal in writing within 5 working days of the date of this letter.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /does not state the authoritative appeal deadline/i.test(i))).toBe(true);
  });

  it('E. letter regenerated after the deadline has passed, still states the correct original deadline -> PASS', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { letterDate: '15 September 2026', appealSentence: 'If you wish to appeal, you must submit your appeal by 14 September 2026.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(true);
  });

  it('F. correct explicit deadline plus harmless generic relative wording -> PASS', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'You must submit your appeal by 14 September 2026, within the appeal period.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(true);
  });

  it('G. correct explicit deadline plus contradictory "date of this letter" wording -> FAIL even though the correct date is also present', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'You must submit your appeal by 14 September 2026, being within five working days from the date of this letter.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => /ties the appeal deadline to the date of this letter/i.test(i))).toBe(true);
  });

  it('H. no computable authoritative deadline -> no fabricated deadline, relative-only wording passes', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'You must appeal in writing within 5 working days of the date of this letter.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline: null });
    expect(result.valid).toBe(true);
  });

  it('I. recipient/outcome/duration/expiry checks are unaffected by the new appeal-deadline check', () => {
    const letter = outcomeLetterWithDuration(employeeName, { outcome, durationSentence: 'This warning will remain active on your file for a period of 6 months,', expirySentence: 'and will expire on 07 March 2027. You must submit your appeal by 14 September 2026.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', warningDurationMonths: 6, warningExpiresAt: '2027-03-07', appealDeadline });
    expect(result.valid).toBe(true);
  });

  it('J. Golden Path exact fixture: 14 September 2026 is required', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'If you wish to appeal, you must submit your appeal by 14 September 2026.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'outcome', appealDeadline: '2026-09-14' });
    expect(result.valid).toBe(true);
    const wrongLetter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'You must appeal in writing within 5 working days of the date of this letter.' });
    expect(validateFormalLetter(wrongLetter, { employeeName, outcome, letterType: 'outcome', appealDeadline: '2026-09-14' }).valid).toBe(false);
  });

  it('does not run this check at all for non-outcome letter types', () => {
    const letter = outcomeLetterWithAppeal(employeeName, { appealSentence: 'You must appeal in writing within 5 working days of the date of this letter.' });
    const result = validateFormalLetter(letter, { employeeName, outcome, letterType: 'appeal', appealDeadline });
    expect(result.valid).toBe(true);
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

// Appeal Invitation UAT P1 remediation (2026-09-19) — the deterministic
// final-letter safety net, independent of generation-time grounding.
// Scoped to letterType==="invite" && isAppealHearingInvitation only; an
// ordinary disciplinary/grievance/witness "invite" (isAppealHearingInvitation
// false/undefined) must be completely unaffected by these checks.
// Dates are computed relative to "now", never hardcoded: the validator
// genuinely rejects a past hearing date, so a literal future date baked
// into a fixture silently becomes a failing test the day it goes by.
function futureHearing(daysAhead = 30) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
  const day = d.getDate();
  const suffix = (day % 10 === 1 && day !== 11) ? 'st' : (day % 10 === 2 && day !== 12) ? 'nd' : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
  const pad = n => String(n).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`,
    long: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    ordinal: `${day}${suffix} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`,
    slash: `${pad(day)}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
  };
}

function appealInviteLetter(name, { dateText, time = '10:30', location = 'Microsoft Teams' } = {}) {
  const resolvedDate = dateText === undefined ? futureHearing().long : dateText;
  return `Compass LTD\n\n19 September 2026\n\nDear ${name},\n\nAppeal Hearing Invitation\n\nYou are invited to an appeal hearing on ${resolvedDate} at ${time}, to be held at ${location}.\n\nYours sincerely,\n[Hearing Manager Name]`;
}

describe('validateFormalLetter — appeal hearing invitation logistics (Appeal Invitation UAT P1)', () => {
  const hearing = futureHearing();
  const validArgs = {
    employeeName: goldenPathEmployee,
    letterType: 'invite',
    isAppealHearingInvitation: true,
    hearingDate: hearing.iso,
    hearingTime: '10:30',
    hearingLocationOrMethod: 'Microsoft Teams',
  };

  it('a letter stating the exact agreed date, time, and location is valid', () => {
    const letter = appealInviteLetter(goldenPathEmployee);
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('is not applied to an ordinary (non-appeal-hearing) invite letter', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { dateText: '[Date of Hearing]', time: '[Time of Hearing]', location: '[Venue]' });
    const result = validateFormalLetter(letter, { employeeName: goldenPathEmployee, letterType: 'invite' });
    expect(result.valid).toBe(true);
  });

  it('rejects a missing hearing date', () => {
    const letter = appealInviteLetter(goldenPathEmployee);
    const result = validateFormalLetter(letter, { ...validArgs, hearingDate: '' });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Add the hearing date'))).toBe(true);
  });

  it('rejects a past hearing date', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { dateText: '1 January 2020' });
    const result = validateFormalLetter(letter, { ...validArgs, hearingDate: '2020-01-01' });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('cannot be in the past'))).toBe(true);
  });

  it('rejects an unresolved hearing-date placeholder still present in the text', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { dateText: '[Date of Hearing]' });
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('hearing-date placeholder'))).toBe(true);
  });

  it('rejects a letter stating a different date to the one agreed', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { dateText: futureHearing(60).long });
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('does not appear to state the agreed hearing date'))).toBe(true);
  });

  it('rejects a missing hearing time', () => {
    const letter = appealInviteLetter(goldenPathEmployee);
    const result = validateFormalLetter(letter, { ...validArgs, hearingTime: '' });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Add the hearing time'))).toBe(true);
  });

  it('rejects an unresolved [Time of Hearing] placeholder', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { time: '[Time of Hearing]' });
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('hearing-time placeholder'))).toBe(true);
  });

  it('rejects a letter stating a different time to the one agreed', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { time: '14:00' });
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('does not appear to state the agreed hearing time'))).toBe(true);
  });

  it('rejects a missing hearing location/method', () => {
    const letter = appealInviteLetter(goldenPathEmployee);
    const result = validateFormalLetter(letter, { ...validArgs, hearingLocationOrMethod: '' });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Add the hearing location or method'))).toBe(true);
  });

  it('rejects an unresolved [Venue Name and Address] placeholder', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { location: '[Venue Name and Address]' });
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('location/method placeholder'))).toBe(true);
  });

  it('rejects a letter using the employee\'s own work location instead of the agreed hearing venue', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { location: 'Manchester' });
    const result = validateFormalLetter(letter, validArgs);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('does not appear to state the agreed hearing location'))).toBe(true);
  });
});

// Appeal Invitation final validation check (2026-09-19) — the validator must
// protect against factual SUBSTITUTION without demanding character-for-
// character reproduction of the internal <input type="date">/<input
// type="time"> formats. These lock in exactly which equivalent formal-letter
// renderings are accepted and which materially different values are not.
describe('validateFormalLetter — appeal invitation logistics, equivalent representations', () => {
  const hearing = futureHearing();
  const validArgs = {
    employeeName: goldenPathEmployee,
    letterType: 'invite',
    isAppealHearingInvitation: true,
    hearingDate: hearing.iso,
    hearingTime: '10:00',
    hearingLocationOrMethod: 'Microsoft Teams',
  };
  const check = over => validateFormalLetter(
    appealInviteLetter(goldenPathEmployee, { dateText: hearing.long, time: '10:00', location: 'Microsoft Teams', ...(over.text || {}) }),
    { ...validArgs, ...(over.args || {}) },
  );

  // --- date ---
  it('1. an ISO structured date rendered as a human-readable UK date passes', () => {
    expect(check({ text: { dateText: hearing.long } }).valid).toBe(true);
  });

  it('2. the ordinal rendering ("22nd September 2026") passes', () => {
    expect(check({ text: { dateText: hearing.ordinal } }).valid).toBe(true);
  });

  it('2b. the slash rendering ("22/09/2026") passes', () => {
    expect(check({ text: { dateText: hearing.slash } }).valid).toBe(true);
  });

  it('2c. a weekday-prefixed rendering passes', () => {
    expect(check({ text: { dateText: `Tuesday ${hearing.long}` } }).valid).toBe(true);
  });

  it('3. a materially different date fails (day before and day after)', () => {
    expect(check({ text: { dateText: futureHearing(29).long } }).valid).toBe(false);
    expect(check({ text: { dateText: futureHearing(31).long } }).valid).toBe(false);
  });

  it('4. an unresolved date placeholder fails', () => {
    const result = check({ text: { dateText: '[Date of Hearing]' } });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('hearing-date placeholder'))).toBe(true);
  });

  it('4b. a structured date that is itself in the past fails, regardless of what the letter says', () => {
    const result = check({ args: { hearingDate: '2020-01-01' }, text: { dateText: '1 January 2020' } });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('cannot be in the past'))).toBe(true);
  });

  // --- time ---
  it('5. structured 10:00 rendered as "10:00" passes', () => {
    expect(check({ text: { time: '10:00' } }).valid).toBe(true);
  });

  it('6. structured 10:00 rendered as "10:00 am" passes', () => {
    expect(check({ text: { time: '10:00 am' } }).valid).toBe(true);
  });

  it('7. structured 10:00 rendered as "10:00am" passes', () => {
    expect(check({ text: { time: '10:00am' } }).valid).toBe(true);
  });

  it('8. structured 10:00 rendered as "10.00 am" and "10.00" passes', () => {
    expect(check({ text: { time: '10.00 am' } }).valid).toBe(true);
    expect(check({ text: { time: '10.00' } }).valid).toBe(true);
  });

  it('8b. structured 10:00 rendered as "10:00 a.m." passes', () => {
    expect(check({ text: { time: '10:00 a.m.' } }).valid).toBe(true);
  });

  it('9. a materially different time ("11:00") fails', () => {
    expect(check({ text: { time: '11:00' } }).valid).toBe(false);
  });

  it('9b. "10:00 pm" fails against a structured 10:00 — 22:00 is a different time, not an equivalent rendering', () => {
    const result = check({ text: { time: '10:00 pm' } });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('does not appear to state the agreed hearing time'))).toBe(true);
  });

  it('9c. an afternoon structured time is matched by its 12-hour rendering ("2:00 pm" for 14:00)', () => {
    expect(check({ args: { hearingTime: '14:00' }, text: { time: '2:00 pm' } }).valid).toBe(true);
    expect(check({ args: { hearingTime: '14:00' }, text: { time: '2:00 am' } }).valid).toBe(false);
  });

  // --- location ---
  it('10. location comparison tolerates casing and outer/inner whitespace', () => {
    expect(check({ text: { location: 'microsoft teams' } }).valid).toBe(true);
    expect(check({ text: { location: 'MICROSOFT TEAMS' } }).valid).toBe(true);
    expect(check({ args: { hearingLocationOrMethod: '  Microsoft Teams  ' } }).valid).toBe(true);
    expect(check({ args: { hearingLocationOrMethod: 'Microsoft  Teams' } }).valid).toBe(true);
  });

  it('11. a materially different location fails — no fuzzy/semantic matching', () => {
    expect(check({ text: { location: 'Zoom' } }).valid).toBe(false);
    expect(check({ text: { location: 'Manchester' } }).valid).toBe(false);
    expect(check({ text: { location: 'Microsoft Outlook' } }).valid).toBe(false);
    expect(check({ args: { hearingLocationOrMethod: 'Leeds Head Office' }, text: { location: 'Leeds Branch Office' } }).valid).toBe(false);
  });

  // --- editor safety (re-validation of the CURRENT edited letter) ---
  it('12. a valid letter edited to a different time is re-blocked', () => {
    expect(check({ text: { time: '10:00' } }).valid).toBe(true);
    expect(check({ text: { time: '11:00' } }).valid).toBe(false);
  });

  it('13. an invalid letter edited back to an authoritative equivalent is permitted again', () => {
    expect(check({ text: { time: '11:00' } }).valid).toBe(false);
    expect(check({ text: { time: '10.00 am' } }).valid).toBe(true);
  });

  // --- scoping ---
  it('14. a non-appeal invitation is entirely unaffected by every one of these checks', () => {
    const letter = appealInviteLetter(goldenPathEmployee, { dateText: '[Date of Hearing]', time: '[Time of Hearing]', location: '[Venue]' });
    expect(validateFormalLetter(letter, { employeeName: goldenPathEmployee, letterType: 'invite' }).valid).toBe(true);
  });
});

// Human UAT hotfix (2026-09-19) — the first venue matcher fired on the bare
// word "address", so [Company Address Line 1] / [Employee Address Line 1] /
// [HR Contact Email Address] — placeholders the letter system prompt itself
// instructs the model to produce, present in essentially every formal
// letter — were read as unresolved HEARING venue placeholders. A live,
// factually correct production invitation (venue resolved to "Microsoft
// Teams") was blocked from being saved or sent as a result.
describe('validateFormalLetter — hearing venue placeholder discrimination (Human UAT hotfix)', () => {
  const hearing = futureHearing();
  const args = {
    employeeName: goldenPathEmployee,
    letterType: 'invite',
    isAppealHearingInvitation: true,
    hearingDate: hearing.iso,
    hearingTime: '10:00',
    hearingLocationOrMethod: 'Microsoft Teams',
  };
  // Everything except the placeholder under test is correct, so any failure
  // is unambiguously attributable to the venue-placeholder check.
  const flagsVenuePlaceholder = placeholder => validateFormalLetter(
    `Dear ${goldenPathEmployee},\n\nThe hearing is on ${hearing.long} at 10:00, by Microsoft Teams. Held at ${placeholder}.`,
    args,
  ).issues.some(i => i.toLowerCase().includes('location/method placeholder'));

  it.each([
    '[Venue]', '[Venue Name]', '[Venue Name and Address]', '[Hearing Venue]',
    '[Hearing Location]', '[Location of Hearing]', '[Hearing Address]',
    '[Meeting Venue]', '[Meeting Location]', '[Appeal Hearing Venue]',
    '[Appeal Hearing Location]', '[Microsoft Teams Link]', '[Video Link]', '[Meeting Link]',
  ])('still detects the genuine hearing-venue placeholder %s', placeholder => {
    expect(flagsVenuePlaceholder(placeholder)).toBe(true);
  });

  it.each([
    '[Company Address Line 1]', '[Company Address Line 2]', '[Company Address Line 3]',
    '[Employee Address Line 1]', '[Employee Address Line 2]', '[Employee Address Line 3]',
    '[HR Contact Email Address]', '[Contact Email Address]', '[Company Name]',
    '[Employee Name]', '[Postcode]', '[HR Contact Name and Job Title]',
    '[HR Contact Telephone Number]', '[Contact Telephone Number]', '[Job Title]',
  ])('does not treat the legitimate letter placeholder %s as a hearing venue', placeholder => {
    expect(flagsVenuePlaceholder(placeholder)).toBe(false);
  });

  // The fix is positive matching on the logistics concept, NOT an owner
  // exclusion list — an owner word must never suppress an explicit
  // hearing/meeting venue reference.
  it('detects [Employee hearing location] — "hearing location" wins over the ownership word', () => {
    expect(flagsVenuePlaceholder('[Employee hearing location]')).toBe(true);
  });

  it('detects [Company meeting venue] — "meeting venue" wins over the ownership word', () => {
    expect(flagsVenuePlaceholder('[Company meeting venue]')).toBe(true);
  });

  it('a full formal letter carrying the normal company/employee/HR-contact placeholders now validates clean', () => {
    const letter = `Compass LTD\n[Company Address Line 1]\n[Company Address Line 2]\n[Postcode]\n\n`
      + `${goldenPathEmployee}\n[Employee Address Line 1]\n[Postcode]\n\nDear ${goldenPathEmployee},\n\n`
      + `Invitation to Appeal Hearing\n\nDate: ${hearing.long}\nTime: 10:00\nMethod: Microsoft Teams\n\n`
      // Deadline wording is deliberately neutral here: this fixture exists to
      // prove venue-placeholder discrimination, and a substantive deadline
      // placeholder is separately (and correctly) blocked by the procedural
      // deadline check below.
      + `Please respond to Dana Rees, HR Manager at dana.rees@example.com as soon as possible.\n\n`
      + `Yours sincerely,\n[Job Title]`;
    const result = validateFormalLetter(letter, args);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // Placeholder scanning passing must never be sufficient on its own.
  it('authoritative containment is still enforced independently of placeholder scanning', () => {
    const wrongVenue = `Dear ${goldenPathEmployee},\n\nThe hearing is on ${hearing.long} at 10:00, by Zoom.`;
    expect(validateFormalLetter(wrongVenue, args).valid).toBe(false);
    const noVenue = `Dear ${goldenPathEmployee},\n\nThe hearing is on ${hearing.long} at 10:00.`;
    expect(validateFormalLetter(noVenue, args).valid).toBe(false);
    const differentMethod = `Dear ${goldenPathEmployee},\n\nThe hearing is on ${hearing.long} at 10:00, by Google Meet.`;
    expect(validateFormalLetter(differentMethod, args).valid).toBe(false);
  });
});

// Procedural placeholder remediation (2026-09-19) — a live production
// invitation validated clean while containing four instances of [X working
// days] in substantive employee instructions (grounds/evidence submission,
// companion details, attendance response, alternative hearing timing),
// because nothing in this module inspected placeholders other than the
// hearing date/time/venue. That letter was fully issuable: Save to case,
// Approve, Send, Download, Print and Copy were all available.
describe('validateFormalLetter — substantive procedural deadline placeholders (P1 remediation)', () => {
  const hearing = futureHearing();
  const args = {
    employeeName: goldenPathEmployee,
    letterType: 'invite',
    isAppealHearingInvitation: true,
    hearingDate: hearing.iso,
    hearingTime: '10:00',
    hearingLocationOrMethod: 'Microsoft Teams',
  };
  // Everything except the placeholder under test is correct, so any failure
  // is unambiguously attributable to the deadline check.
  const blocksAsDeadline = placeholder => validateFormalLetter(
    `Dear ${goldenPathEmployee},\n\nDate: ${hearing.long}\nTime: 10:00\nMethod: Microsoft Teams\n\nPlease respond ${placeholder}.`,
    args,
  ).issues.some(i => i.includes('unresolved response deadline'));

  it.each([
    '[X working days]', '[X days]', '[X weeks]', '[5 working days]',
    '[Insert number of days]', '[Number of working days]', '[Notice period]',
    '[Response deadline]', '[Deadline]', '[Insert deadline]',
  ])('blocks the substantive deadline placeholder %s', placeholder => {
    expect(blocksAsDeadline(placeholder)).toBe(true);
  });

  it.each([
    '[ x WORKING DAYS ]', '[insert Number Of Days]', '[X  days]', '[NOTICE PERIOD]',
  ])('is insensitive to casing and spacing: %s', placeholder => {
    expect(blocksAsDeadline(placeholder)).toBe(true);
  });

  it.each(['[X hours]', '[3 months]', '[timeframe]', '[timescale]'])(
    'also blocks the equivalent period form %s', placeholder => {
      expect(blocksAsDeadline(placeholder)).toBe(true);
    });

  // The deliberate "cosmetic placeholders are permitted" stance must survive
  // — this must never become a blanket "no brackets allowed" validator.
  it.each([
    '[Company Name]', '[Company Address Line 1]', '[Company Address Line 2]',
    '[Company Address Line 3]', '[Employee Address Line 1]', '[Employee Address Line 2]',
    '[Employee Address Line 3]', '[Postcode]', '[HR Contact Name and Job Title]',
    '[HR Contact Email / Telephone]', '[Company Email / Telephone]',
    '[Signatory Name]', '[Job Title]', '[Date]',
  ])('does not block the ordinary document/contact placeholder %s', placeholder => {
    expect(blocksAsDeadline(placeholder)).toBe(false);
  });

  it('[Date] is not confused with a deadline — the hearing date has its own dedicated check', () => {
    expect(blocksAsDeadline('[Date]')).toBe(false);
    const missingHearingDate = `Dear ${goldenPathEmployee},\n\nDate: [Date of Hearing]\nTime: 10:00\nMethod: Microsoft Teams`;
    const issues = validateFormalLetter(missingHearingDate, args).issues;
    expect(issues.some(i => i.toLowerCase().includes('hearing-date placeholder'))).toBe(true);
  });

  it('is scoped to appeal-hearing invitations — ordinary invitations and other letter types are unaffected', () => {
    const text = `Dear ${goldenPathEmployee},\n\nPlease respond no later than [X working days] before the hearing.`;
    expect(validateFormalLetter(text, { employeeName: goldenPathEmployee, letterType: 'invite' }).valid).toBe(true);
    expect(validateFormalLetter(text, { employeeName: goldenPathEmployee, letterType: 'outcome' }).valid).toBe(true);
    expect(validateFormalLetter(text, { employeeName: goldenPathEmployee, letterType: 'appeal' }).valid).toBe(true);
  });

  // Reproduces the shape of the real production letter end to end.
  describe('full production-shaped invitation', () => {
    const letter = deadlineWording => `Compass LTD\n[Company Address Line 1]\n[Company Address Line 2]\n[Postcode]\nhr@compass.example.com\n\n`
      + `${goldenPathEmployee}\n[Employee Address Line 1]\n[Postcode]\n\nPRIVATE AND CONFIDENTIAL\n\nDear ${goldenPathEmployee},\n\n`
      + `Invitation to Disciplinary Appeal Hearing\n\nYou were issued with a First Written Warning. That warning has a duration of 6 months and is recorded as expiring on 11 March 2027.\n\n`
      + `Date: ${hearing.long}\nTime: 10:00\nMethod: Microsoft Teams\n\nThe hearing will be chaired by UAT - HR Manager.\n\n`
      + `As the grounds of appeal have not been formally recorded, you are invited to set them out at the hearing. `
      + `Please contact Dana Rees, HR Manager at dana.rees@example.com ${deadlineWording}\n\n`
      + `Yours sincerely,\nDana Rees\n[Job Title]\nCompass LTD\n[Date]`;

    const fullArgs = { ...args, outcome: 'First written warning', warningDurationMonths: 6, warningExpiresAt: '2027-03-11' };

    it('fails deterministically while a substantive deadline placeholder remains', () => {
      const result = validateFormalLetter(letter('no later than [X working days] before the hearing.'), fullArgs);
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(['The invitation still contains an unresolved response deadline — replace it or remove the deadline wording.']);
    });

    it('passes once the deadline wording is neutralised, with every ordinary placeholder still present', () => {
      const neutral = letter('sufficiently in advance of the hearing for it to be considered.');
      const result = validateFormalLetter(neutral, fullArgs);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      // Placeholders Compass has no data for stay permitted — the identity/
      // contact P1 that followed deliberately did NOT make these blocking,
      // since doing so would leave every letter permanently unissuable.
      // (The sender/organisation/contact placeholders this fixture once
      // carried are now blocking and were replaced with real values above.)
      expect(neutral).toContain('[Company Address Line 1]');
      expect(neutral).toContain('[Job Title]');
      expect(neutral).toContain('[Date]');
    });

    it('still enforces the hearing logistics alongside the new deadline check', () => {
      const neutral = letter('as soon as possible.');
      expect(validateFormalLetter(neutral, { ...fullArgs, hearingTime: '14:00' }).valid).toBe(false);
      expect(validateFormalLetter(neutral, { ...fullArgs, hearingLocationOrMethod: 'Zoom' }).valid).toBe(false);
      expect(validateFormalLetter(neutral, { ...fullArgs, hearingDate: '2020-01-01' }).valid).toBe(false);
    });
  });
});

// Appeal independence P1 (Human UAT, 2026-09-20) — the BACKSTOP behind the
// generation grounding. The two sentences below are the verbatim shapes the
// production invitation produced on a case classified UNKNOWN.
describe('validateFormalLetter — appeal officer independence assertions (P1)', () => {
  const EMP = goldenPathEmployee;
  const PROD_PURPOSE = 'The purpose of this appeal hearing is to provide you with the opportunity to present your grounds of appeal in full and for those grounds to be considered by a manager who was not involved in the original disciplinary process.';
  const PROD_CHAIR = 'The appeal hearing will be chaired by UAT - HR Manager, [Job Title], who was not involved in the original investigation or disciplinary hearing.';
  const letter = body => `Dear ${EMP},\n\n${body}`;
  const check = (body, status, letterType = 'appeal') =>
    validateFormalLetter(letter(body), { employeeName: EMP, letterType, appealIndependenceStatus: status });
  const flags = result => result.issues.some(i => i.includes('not previously involved, but Compass has not verified'));

  it('blocks the exact production wording under UNKNOWN', () => {
    const result = check(`${PROD_PURPOSE}\n\n${PROD_CHAIR}`, 'unknown');
    expect(result.valid).toBe(false);
    expect(flags(result)).toBe(true);
  });

  it('blocks the exact production wording under CONFLICT — an authorised override does not make it true', () => {
    const result = check(`${PROD_PURPOSE}\n\n${PROD_CHAIR}`, 'conflict');
    expect(result.valid).toBe(false);
    expect(flags(result)).toBe(true);
  });

  it('allows the same wording under CLEAR, where structured attribution supports it', () => {
    expect(check(`${PROD_PURPOSE}\n\n${PROD_CHAIR}`, 'clear').valid).toBe(true);
  });

  it('is inert for letters carrying no independence status (every non-appeal letter type)', () => {
    expect(check(`${PROD_PURPOSE}\n\n${PROD_CHAIR}`, undefined).valid).toBe(true);
    expect(validateFormalLetter(letter(PROD_CHAIR), { employeeName: EMP, letterType: 'outcome' }).valid).toBe(true);
  });

  it.each([
    'The chair was not involved.',
    "The chair wasn't involved in the earlier process.",
    'The officer has not been involved in this matter before.',
    'The chair had no involvement in the original decision.',
    'The appeal officer took no part in the original hearing.',
    'The chair did not take part in the disciplinary hearing.',
    'The officer was not previously involved in the process.',
    'The chair is independent of the original disciplinary process.',
    'The officer played no role in the original decision.',
    'The chair was uninvolved in the earlier proceedings.',
    'Their independence has been verified by HR.',
  ])('blocks the materially equivalent claim: %s', body => {
    expect(flags(check(body, 'unknown'))).toBe(true);
  });

  // The matcher must stay a targeted claim-about-history check, never a
  // blanket ban on "independent", "impartial" or "fair".
  it.each([
    'The appeal hearing will be chaired by Jane Smith.',
    'The appeal will be considered fairly and impartially.',
    'Your appeal will receive a fair and impartial hearing.',
    'You have the right to an independent appeal process.',
    'The hearing will be conducted in accordance with the ACAS Code of Practice.',
    'The appeal officer will consider all of the information presented.',
    'This is an independent stage of the Company procedure.',
  ])('allows legitimate process wording: %s', body => {
    expect(check(body, 'unknown').valid).toBe(true);
  });

  it('applies to the appeal hearing invitation as well as the appeal outcome letter', () => {
    const inviteResult = validateFormalLetter(letter(PROD_CHAIR), {
      employeeName: EMP, letterType: 'invite', appealIndependenceStatus: 'unknown',
    });
    expect(inviteResult.valid).toBe(false);
    expect(flags(inviteResult)).toBe(true);
  });

  it('leaves cosmetic placeholders and the existing logistics/deadline checks unchanged', () => {
    const hearing = futureHearing();
    const args = {
      employeeName: EMP, letterType: 'invite', isAppealHearingInvitation: true,
      hearingDate: hearing.iso, hearingTime: '10:00', hearingLocationOrMethod: 'Microsoft Teams',
      appealIndependenceStatus: 'unknown',
    };
    const clean = `Dear ${EMP},\n\nCompass LTD\n[Company Address Line 1]\ndana.rees@example.com\nDana Rees\n[Date]\n\n`
      + `Date: ${hearing.long}\nTime: 10:00\nMethod: Microsoft Teams\n\nThe appeal hearing will be chaired by Priya Shah. Please respond as soon as possible.`;
    expect(validateFormalLetter(clean, args).valid).toBe(true);

    // Deadline check still fires independently.
    const withDeadline = clean.replace('as soon as possible', 'no later than [X working days] before the hearing');
    expect(validateFormalLetter(withDeadline, args).issues.some(i => i.includes('unresolved response deadline'))).toBe(true);
    // Logistics checks still fire independently.
    expect(validateFormalLetter(clean, { ...args, hearingTime: '14:00' }).valid).toBe(false);
  });
});

// Formal-letter identity/contact P1 (Human UAT, 2026-09-20) — a letter
// signed "[Sender's Full Name]" telling the employee to reply to "[HR
// Contact Email]" gives them no way to respond at all, on a document
// carrying a fixed hearing date and statutory accompaniment rights. That is
// an operative failure, not a cosmetic one, and it was fully issuable.
describe('validateFormalLetter — unresolved identity/contact placeholders (P1)', () => {
  const EMP = goldenPathEmployee;
  const MESSAGE = 'The letter still contains unresolved sender, organisation or contact details. Complete these details before issuing the letter.';
  const flags = placeholder => validateFormalLetter(
    `Dear ${EMP},\n\nPlease contact ${placeholder} to confirm.`,
    { employeeName: EMP, letterType: 'invite' },
  ).issues.includes(MESSAGE);

  it.each([
    '[Company Name]', '[Organisation Name]', "[Sender's Full Name]", '[Signatory Name]',
    '[HR Contact Name]', '[HR Contact Name and Job Title]', '[Contact Name]',
    '[HR Contact Email]', '[HR Contact Email / Telephone Number]', '[Email Address]',
    '[Contact Email Address]', '[Company Email / Telephone]',
  ])('blocks the essential identity/contact placeholder %s', placeholder => {
    expect(flags(placeholder)).toBe(true);
  });

  it('retains the existing employee-identity protection', () => {
    const result = validateFormalLetter('Dear [Employee Name],\n\nSome text.', { employeeName: EMP, letterType: 'invite' });
    expect(result.valid).toBe(false);
  });

  // Blocking these would make every letter permanently unissuable, since
  // Compass stores none of the underlying data.
  it.each([
    '[Company Address Line 1]', '[Company Address Line 2]', '[Company Address Line 3]',
    '[Employee Address Line 1]', '[Employee Address Line 2]', '[Employee Address Line 3]',
    '[Postcode]', '[Job Title]', '[Department]', '[Telephone Number]', '[Contact Telephone Number]',
  ])('does not block the optional, uncollected detail %s', placeholder => {
    expect(flags(placeholder)).toBe(false);
  });

  // False-positive protection — the live letter contained this exact string.
  it.each([
    '[HR / your line manager / the company intranet]',
    '[insert any local detail here]',
    '[Name]',
    '[Hearing Manager Name]',
    '[Appeal Officer Name and Job Title]',
  ])('does not treat bracketed prose or an ambiguous name as an identity placeholder: %s', placeholder => {
    expect(flags(placeholder)).toBe(false);
  });

  it('is scoped to employee-directed letters — witness and internal content is unaffected', () => {
    const text = `Dear X,\n\nContact [HR Contact Email] and [Company Name].`;
    ['witness-invitation', 'investigation-report', 'evidence-request'].forEach(letterType => {
      expect(validateFormalLetter(text, { employeeName: EMP, letterType }).valid).toBe(true);
    });
  });

  describe('full production-shaped invitation', () => {
    const letter = (company, contact, signatory) => `${company}\n[Company Address Line 1]\n[Postcode]\n\n`
      + `${EMP}\n[Employee Address Line 1]\n[Postcode]\n\nDear ${EMP},\n\n`
      + `INVITATION TO APPEAL HEARING\n\nDate: 22 September 2099\nTime: 10:00\nMethod: Microsoft Teams\n\n`
      + `The appeal hearing will be chaired by UAT - HR Manager.\n\n`
      + `Please confirm your attendance by contacting ${contact}.\n\n`
      + `A copy of the policy is available from [HR / your line manager / the company intranet].\n\n`
      + `Yours sincerely,\n${signatory}\n[Job Title]\n[Date]`;
    const args = { employeeName: EMP, letterType: 'invite' };

    it('fails while sender, organisation or contact details are unresolved', () => {
      const result = validateFormalLetter(letter('[Company Name]', '[HR Contact Name and Job Title] at [HR Contact Email]', "[Sender's Full Name]"), args);
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual([MESSAGE]);
    });

    it('passes once those are populated, with optional absent values still bracketed', () => {
      const populated = letter('Compass LTD', 'UAT - HR Manager at uat@example.com', 'UAT - HR Manager');
      const result = validateFormalLetter(populated, args);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      // Optional, genuinely uncollected details do not block issuance.
      expect(populated).toContain('[Company Address Line 1]');
      expect(populated).toContain('[Postcode]');
      expect(populated).toContain('[Job Title]');
      expect(populated).toContain('[Date]');
      expect(populated).toContain('[HR / your line manager / the company intranet]');
    });

    it('does not disturb the hearing logistics, deadline or independence checks', () => {
      const populated = letter('Compass LTD', 'UAT - HR Manager at uat@example.com', 'UAT - HR Manager');
      const hearing = futureHearing();
      const dated = populated.replace('22 September 2099', hearing.long);
      const logisticsArgs = {
        ...args, isAppealHearingInvitation: true, hearingDate: hearing.iso,
        hearingTime: '10:00', hearingLocationOrMethod: 'Microsoft Teams', appealIndependenceStatus: 'unknown',
      };
      expect(validateFormalLetter(dated, logisticsArgs).valid).toBe(true);
      expect(validateFormalLetter(dated, { ...logisticsArgs, hearingTime: '14:00' }).valid).toBe(false);
      expect(validateFormalLetter(dated.replace('as soon as possible', 'x') + ' Reply within [X working days].', logisticsArgs).valid).toBe(false);
      expect(validateFormalLetter(dated + ' The chair was not involved.', logisticsArgs).valid).toBe(false);
    });
  });
});
