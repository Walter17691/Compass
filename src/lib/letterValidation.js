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

// Defect #19 remediation — semantic, wording-agnostic detection of an
// unresolved employee-identity placeholder, rather than one fixed regex
// tied to a single exact phrasing (the previous /\[\s*employee'?s?\s*name\s*\]/i
// missed the AI's actual "[Employee Full Name]" output because of the
// inserted word "Full"). Checks each bracketed span's own words rather
// than the whole letter at once, so "[Appeal Officer Name and Job Title]"
// or "[Company Name]" — genuinely different, out-of-scope placeholders
// (see #13) — never match just because "name" appears somewhere in the
// letter. A bracket counts as an employee-identity placeholder once its
// own contents include both "employee" and "name" as whole words, in
// either order, tolerating filler words ("full", "of") and a possessive
// apostrophe (straight or curly) — covering every variant named in the
// #19 remediation brief without hardcoding each one individually.
function hasEmployeeIdentityPlaceholder(text) {
  const brackets = (text || "").match(/\[[^\]]{0,60}\]/g) || [];
  return brackets.some(b => {
    const words = b
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      .replace(/[^a-z]+/g, " ")
      .split(" ")
      .filter(Boolean);
    return words.includes("employee") && words.includes("name");
  });
}

// Defect #18 remediation — semantic, wording-agnostic detection of an
// unresolved warning-DURATION placeholder, replacing the previous
// /\[\s*[\dXx]*\s*months?\s*\]/i, whose `*` (zero-or-more) quantifier
// matched a bare "[Month]" — an entirely unrelated calendar-month
// placeholder in the incident narrative — as if it were a duration
// placeholder. Two independent shapes, both requiring at least one
// digit/X character actually inside (or immediately preceding, for the
// "[X] months" split form) the bracket, so a content-only word like
// "Month" can never match on its own:
//   - a count placeholder directly paired with "month(s)": [12 months],
//     [X months], [XX months], [6 months], optionally "insert"-prefixed,
//     or the same count split across the bracket boundary: [X] months.
//   - a semantic duration-word placeholder with no count at all:
//     [duration], [warning duration], [insert warning duration],
//     [warning period], [number of months].
// Deliberately still scoped to duration-shaped wording, not every
// bracket in the letter — a bare [Month], [Date], [Date 1] etc. never
// matches either shape, so this doesn't regress into #18's own bug in
// the opposite direction (see the remediation's own "do not create a
// generic square-brackets rule" instruction).
function hasWarningDurationPlaceholder(text) {
  const t = text || "";
  const countPlaceholderRe = /\[\s*(?:insert\s+)?[\dXx]+\s*months?\s*\]/i;
  const splitCountPlaceholderRe = /\[\s*[\dXx]+\s*\]\s*months?\b/i;
  const semanticPlaceholderRe = /\[\s*(?:insert\s+)?(?:the\s+)?(?:warning\s+)?(?:duration|period)\s*\]|\[\s*number\s+of\s+months\s*\]/i;
  return countPlaceholderRe.test(t) || splitCountPlaceholderRe.test(t) || semanticPlaceholderRe.test(t);
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
export function validateFormalLetter(letterText, { employeeName, outcome, letterType, warningDurationMonths, warningExpiresAt } = {}) {
  const issues = [];
  if (!EMPLOYEE_DIRECTED_LETTER_TYPES.includes(letterType)) {
    return { valid: true, issues };
  }

  if (employeeName) {
    const salutation = extractLetterSalutation(letterText);
    let recipientIssueFlagged = false;
    if (!salutation) {
      issues.push("Could not find a recipient salutation (\"Dear ...,\") in the generated letter.");
      recipientIssueFlagged = true;
    } else if (isBracketedPlaceholder(salutation)) {
      // Defect #19 remediation — a bracketed salutation can never
      // deterministically "resolve to" the known employee regardless of
      // its exact wording, so this no longer depends on recognising any
      // specific placeholder phrasing: any "Dear [...]," is unresolved on
      // its own terms. See hasEmployeeIdentityPlaceholder's own comment
      // for the secondary, wording-based net below.
      issues.push("Letter still contains an unresolved employee-name placeholder.");
      recipientIssueFlagged = true;
    } else {
      const normSalutation = normalizeName(salutation);
      const normEmployee = normalizeName(employeeName);
      const matches = !!normSalutation && !!normEmployee
        && (normSalutation.includes(normEmployee) || normEmployee.includes(normSalutation));
      if (!matches) {
        issues.push(`Letter is addressed to "${salutation}", not the case's employee ("${employeeName}").`);
        recipientIssueFlagged = true;
      }
    }
    // Defense-in-depth: an employee-identity placeholder elsewhere in the
    // letter (e.g. the address block above an otherwise-resolved-looking
    // salutation) even when the salutation check above didn't already
    // catch it. Skipped once the salutation check already flagged an
    // issue, so a single root cause doesn't produce two near-duplicate
    // messages in the banner.
    if (!recipientIssueFlagged && hasEmployeeIdentityPlaceholder(letterText)) {
      issues.push("Letter still contains an unresolved employee-name placeholder.");
    }
  }

  if (letterType === "outcome" && outcome) {
    const hasOutcome = (letterText || "").toLowerCase().includes(outcome.toLowerCase());
    if (!hasOutcome) {
      issues.push(`Letter does not appear to state the recorded outcome ("${outcome}").`);
    }
  }

  // Defect #12 remediation — deterministic warning-duration/expiry
  // checks. Only runs for outcome letters where a structured duration is
  // actually recorded (non-warning outcomes, and warnings decided before
  // this remediation existed, correctly have nothing to check here — see
  // OutcomeTab's own "Complete outcome details" path for the latter).
  if (letterType === "outcome" && warningDurationMonths) {
    const text = letterText || "";
    const correctDurationRe = new RegExp(`\\b${warningDurationMonths}\\s*months?\\b`, "i");
    if (!correctDurationRe.test(text)) {
      issues.push(`Letter does not state the recorded warning duration ("${warningDurationMonths} months").`);
    }
    // A stray different duration mentioned near warning/duration wording
    // (e.g. the model reverting to a generic "12 months" example) even
    // if the correct figure also happens to appear elsewhere. Proximity-
    // scoped to warning-ish wording rather than any "N months" anywhere,
    // since a letter can legitimately mention unrelated month figures
    // (e.g. length of service).
    const warningContextRe = /(?:remain|active|period|duration|warning|file|record)[^.]{0,60}?(\d{1,3})\s*months?/gi;
    const mentionedDurations = [...text.matchAll(warningContextRe)].map(m => Number(m[1]));
    if (mentionedDurations.some(n => n !== Number(warningDurationMonths))) {
      issues.push(`Letter states a warning duration other than the recorded ${warningDurationMonths} months.`);
    }
    if (hasWarningDurationPlaceholder(text)) {
      issues.push("Letter still contains an unresolved warning-duration placeholder.");
    }
  }

  if (letterType === "outcome" && warningExpiresAt) {
    const text = letterText || "";
    const expiryMentionIdx = text.search(/expir/i);
    if (expiryMentionIdx !== -1) {
      const window = text.slice(Math.max(0, expiryMentionIdx - 80), expiryMentionIdx + 80);
      const expiry = new Date(warningExpiresAt);
      const correctYear = String(expiry.getFullYear());
      const correctMonthLong = expiry.toLocaleDateString("en-GB", {month: "long"});
      const correctMonthShort = expiry.toLocaleDateString("en-GB", {month: "short"});
      const correctSlashMonth = `/${String(expiry.getMonth() + 1).padStart(2, "0")}/`;
      const mentionsCorrectDate = window.includes(correctYear)
        && (window.toLowerCase().includes(correctMonthLong.toLowerCase()) || window.toLowerCase().includes(correctMonthShort.toLowerCase()) || window.includes(correctSlashMonth));
      const mentionsAnyDate = /\d{1,2}\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)|\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(window);
      if (mentionsAnyDate && !mentionsCorrectDate) {
        issues.push(`Letter appears to state an expiry date other than the recorded ${expiry.toLocaleDateString("en-GB")}.`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
