// UAT Golden Path remediation (Defects #11/#12/#13) — a formal,
// employee-directed letter (outcome, invitation, appeal, etc.) is
// grounded on caseInfo.employee, set deterministically from
// cases.employee_name by every real call site that starts a letter draft
// (CaseViewScreen.jsx's next-step actions, startCaseCorrespondence).
// OutcomeModal's own "Issue outcome & generate letter" button was the one
// call site that never set caseInfo at all before calling handleLetter —
// with no explicit "Employee: X" fact in its prompt, the AI fell back to
// inferring the recipient from the case's own free-text description,
// which named a different real participant (a reporting manager) in a
// way that read, out of context, as if they were the subject of the
// allegation. Grounding that one call site (see OutcomeModal.jsx) closes
// the specific repro. This is the defense-in-depth backstop: whatever
// grounded the prompt, verify the AI's own response actually reflects
// it before a formal letter can be treated as a valid, saveable/
// sendable draft — protecting every current and future call site that
// shares this same generation path (App.jsx's handleLetter), not just
// the one that was broken.

const SALUTATION_RE = /Dear\s+([^,\n]+),/i;

export function extractLetterSalutation(letterText) {
  const m = (letterText || "").match(SALUTATION_RE);
  return m ? m[1].trim() : null;
}

function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/^(mr|mrs|ms|miss|mx|dr)\.?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBracketedPlaceholder(value) {
  return /^\[.*\]$/.test((value || "").trim());
}

// Letter types genuinely addressed to the case's own employee. Witness
// invitations and evidence requests go to a different, unrelated
// recipient by design; an investigation report is an internal document,
// not a letter to anyone — none of those should be checked against
// employeeName.
export const EMPLOYEE_DIRECTED_LETTER_TYPES = [
  "outcome", "invite", "appeal", "suspension", "meeting-confirmation",
  "no-case-answer", "warning", "dismissal", "grievance", "oh-consent-request",
];

// Returns { valid, issues[] }. Deliberately narrow: only checks facts
// that are now genuinely deterministic (recipient identity, recorded
// outcome) rather than attempting to verify free-text narrative
// (findings, mitigation wording) an AI is legitimately trusted to
// compose. Never invents a missing fact to "fix" a check — an unresolved
// [placeholder] for something Compass genuinely doesn't hold structured
// data for (e.g. company address) is not flagged here.
export function validateFormalLetter(letterText, { employeeName, outcome, letterType } = {}) {
  const issues = [];
  if (!EMPLOYEE_DIRECTED_LETTER_TYPES.includes(letterType)) {
    return { valid: true, issues };
  }

  if (employeeName) {
    const salutation = extractLetterSalutation(letterText);
    if (!salutation) {
      issues.push("Could not find a recipient salutation (\"Dear ...,\") in the generated letter.");
    } else if (!isBracketedPlaceholder(salutation)) {
      const normSalutation = normalizeName(salutation);
      const normEmployee = normalizeName(employeeName);
      const matches = !!normSalutation && !!normEmployee
        && (normSalutation.includes(normEmployee) || normEmployee.includes(normSalutation));
      if (!matches) {
        issues.push(`Letter is addressed to "${salutation}", not the case's employee ("${employeeName}").`);
      }
    }
    if (/\[\s*employee'?s?\s*name\s*\]/i.test(letterText || "")) {
      issues.push("Letter contains an unresolved [Employee Name] placeholder even though the employee's name is known.");
    }
  }

  if (letterType === "outcome" && outcome) {
    const hasOutcome = (letterText || "").toLowerCase().includes(outcome.toLowerCase());
    if (!hasOutcome) {
      issues.push(`Letter does not appear to state the recorded outcome ("${outcome}").`);
    }
  }

  return { valid: issues.length === 0, issues };
}
