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

import { isPastLocalDate } from './dates';

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

// Appeal Invitation UAT P1 remediation (2026-09-19) — same bracket-
// content, wording-agnostic approach as hasWarningDurationPlaceholder
// above: a bracket counts as an unresolved hearing-date/time/venue
// placeholder once its own words match, regardless of the model's exact
// phrasing ("[Date of Hearing]", "[Hearing Date]", "[Insert Time]",
// "[Venue Name and Address]", "[Location/Method]", etc.), never by
// hardcoding one fixed phrase.
function hasHearingDatePlaceholder(text) {
  const brackets = (text || "").match(/\[[^\]]{0,60}\]/g) || [];
  return brackets.some(b => {
    const words = b.toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter(Boolean);
    return words.includes("date") && (words.includes("hearing") || words.includes("appeal"));
  });
}
function hasHearingTimePlaceholder(text) {
  const brackets = (text || "").match(/\[[^\]]{0,60}\]/g) || [];
  return brackets.some(b => {
    const words = b.toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter(Boolean);
    return words.includes("time");
  });
}
// Appeal Invitation final validation check (2026-09-19) — the structured
// hearing time is an <input type="time"> value ("HH:MM", 24-hour), but a
// formal letter legitimately renders the same fact as "10:00", "10:00 am",
// "10:00am", "10.00 am" or "10.00". The original check was a raw
// text.includes(hearingTime) substring test, which was wrong in BOTH
// directions: it rejected the dot-separated forms above (a valid letter
// blocked), and — the real defect — it ACCEPTED "10:00 pm" for a 10:00
// hearing, because the substring "10:00" is present. 10:00 pm is 22:00:
// a materially different time, i.e. exactly the factual substitution this
// check exists to catch. Comparing normalised minutes-since-midnight
// fixes both: every time-like token in the letter is parsed, meridiem
// applied, and compared numerically to the authoritative value.
function parseStructuredTimeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!m) return null;
  const hours = Number(m[1]), minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function letterStatesHearingTime(text, structuredTime) {
  const target = parseStructuredTimeToMinutes(structuredTime);
  if (target === null) return false;
  // Deliberately a presence check across the whole letter (the same shape
  // the date and location checks use), not a position-sensitive parse:
  // this verifies the agreed fact appears, and that no materially
  // different time is stated in its place.
  const tokenRe = /\b(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/gi;
  let match;
  while ((match = tokenRe.exec(text || "")) !== null) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59) continue;
    const meridiem = (match[3] || "").replace(/[^apm]/gi, "").toLowerCase();
    if (meridiem === "am") {
      if (hours === 12) hours = 0;
      else if (hours > 12) continue;
    } else if (meridiem === "pm") {
      if (hours > 12) continue;
      if (hours !== 12) hours += 12;
    } else if (hours > 23) continue;
    if (hours * 60 + minutes === target) return true;
  }
  return false;
}

// Case- and whitespace-insensitive containment, nothing more. Deliberately
// NOT fuzzy/semantic matching: a different venue must never normalise into
// a match, so only casing and runs of whitespace (including a line break
// falling mid-venue-name) are neutralised. The human-entered value stays
// authoritative.
function normalizeForLooseContains(value) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Procedural placeholder remediation (2026-09-19) — a SUBSTANTIVE placeholder
// is categorically different from a cosmetic one. [Company Address Line 1] is
// a formatting gap a human fills before printing; [X working days] is an
// instruction to the employee about when they must act, and an invitation
// issued with it literally unresolved tells them nothing usable — or invites
// HR to invent an employer deadline Compass has no basis for. The deliberate
// "unresolved [placeholder]s are permitted" stance in this module's own
// header still holds for the cosmetic class; this narrows it for time
// periods and deadlines only.
//
// Matched on the bracket's own words, the same convention the hearing
// date/time/venue detectors use. A bare time unit (day/week/hour/month) is
// enough on its own: no legitimate document/contact placeholder contains
// one, while every substantive-deadline form does ([X working days], [X
// weeks], [Insert number of days], [Number of working days]). Deadline
// nouns are matched separately so [Deadline], [Notice period] and [Response
// deadline] are caught even with no unit word present. Note "date" is
// deliberately NOT a trigger — [Date] is an ordinary signature-block
// placeholder, and the hearing date has its own dedicated check.
const SUBSTANTIVE_PERIOD_UNIT_WORDS = ["day", "days", "week", "weeks", "hour", "hours", "month", "months", "working"];
const SUBSTANTIVE_DEADLINE_WORDS = ["deadline", "notice", "period", "timeframe", "timescale"];

function hasSubstantiveDeadlinePlaceholder(text) {
  const brackets = (text || "").match(/\[[^\]]{0,60}\]/g) || [];
  return brackets.some(b => {
    const words = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
    return words.some(w => SUBSTANTIVE_PERIOD_UNIT_WORDS.includes(w))
      || words.some(w => SUBSTANTIVE_DEADLINE_WORDS.includes(w));
  });
}

// Human UAT hotfix (2026-09-19) — the first version of this matched any
// bracket containing the bare word "address", which made it fire on
// [Company Address Line 1], [Employee Address Line 1] and [HR Contact
// Email Address]: legitimate placeholders the letter system prompt
// explicitly instructs the model to produce. Every real appeal invitation
// contains them, so a correct invitation (hearing venue fully resolved to
// "Microsoft Teams") was blocked from being saved or sent.
//
// Now positive matching on the hearing/meeting-logistics CONCEPT rather
// than on a place-word keyword, mirroring hasHearingDatePlaceholder's own
// "date" + hearing/appeal qualifier convention. Deliberately not an owner
// exclusion list ("ignore anything containing 'company'/'employee'"):
// that would create the opposite false negative on [Employee hearing
// location] or [Company meeting venue], where the logistics meaning is
// explicit and must win over the incidental ownership word.
const HEARING_CONTEXT_WORDS = ["hearing", "meeting", "appeal"];
const PLACE_WORDS = ["location", "address", "room", "building", "site", "premises"];
// A remote hearing's joining details are the venue for these purposes: an
// unresolved [Video Link] leaves the employee unable to attend just as
// surely as an unresolved [Venue] would.
const LINK_WORDS = ["link", "url", "joining", "dial"];
const VIDEO_WORDS = ["video", "teams", "zoom", "meet", "webex", "call", "conference"];

function hasHearingVenuePlaceholder(text) {
  const brackets = (text || "").match(/\[[^\]]{0,60}\]/g) || [];
  return brackets.some(b => {
    const words = b.toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter(Boolean);
    // "venue" only ever means the place an event is held — it needs no
    // qualifier, and no legitimate company/employee/contact placeholder
    // uses it.
    if (words.includes("venue")) return true;
    const hasHearingContext = words.some(w => HEARING_CONTEXT_WORDS.includes(w));
    // A place word counts only when tied to the hearing/meeting itself,
    // which is exactly what separates [Hearing Address] from [Company
    // Address Line 1].
    if (hasHearingContext && words.some(w => PLACE_WORDS.includes(w))) return true;
    if (hasHearingContext && words.includes("method")) return true;
    if (words.some(w => LINK_WORDS.includes(w))
      && (hasHearingContext || words.some(w => VIDEO_WORDS.includes(w)))) return true;
    return false;
  });
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
export function validateFormalLetter(letterText, { employeeName, outcome, letterType, warningDurationMonths, warningExpiresAt, appealDeadline, appealOutcomeLabel, appealEffectTag, isAppealHearingInvitation, hearingDate, hearingTime, hearingLocationOrMethod } = {}) {
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

  // Independent appeal officer workflow (2026-09-16) — same deterministic
  // check, one stage later. appealOutcomeLabel is only ever passed when
  // exactly one allegation on the case has a recorded appeal outcome (see
  // App.jsx's own call site) — a case with several allegations that were
  // each decided differently on appeal has no single "the" outcome to
  // check the letter against, so this deliberately stays silent rather
  // than flagging a false mismatch.
  if (letterType === "appeal" && appealOutcomeLabel) {
    const hasAppealOutcome = (letterText || "").toLowerCase().includes(appealOutcomeLabel.toLowerCase());
    if (!hasAppealOutcome) {
      issues.push(`Letter does not appear to state the recorded appeal outcome ("${appealOutcomeLabel}").`);
    }
  }

  // Final pre-deployment review (2026-09-16) — "upheld" is genuinely
  // ambiguous read in isolation ("the appeal is upheld" vs. "the original
  // decision is upheld" are opposite outcomes). buildAppealOutcomeInstruction
  // (letterGrounding.js) already gives the model the correct, unambiguous
  // effect on the original decision as a deterministic fact; this is
  // defense in depth against a stray contradicting sentence slipping
  // through anyway. Proximity-scoped to "original decision" wording, same
  // shape as the warning-duration check above, rather than scanning the
  // whole letter for any use of "upheld"/"overturned" — those words
  // legitimately also appear describing the original hearing's own
  // outcome earlier in the letter.
  if (letterType === "appeal" && appealEffectTag) {
    const text = letterText || "";
    const decisionMentions = [...text.matchAll(/original decision[^.]{0,120}/gi)].map(m => m[0].toLowerCase());
    const mentionsAny = (phrases) => decisionMentions.some(m => phrases.some(p => m.includes(p)));
    if (appealEffectTag === "overturned" && mentionsAny(["upheld", "stands", "remains in force", "unchanged"])) {
      issues.push("Letter may state that the original decision stands/is upheld, but the recorded appeal outcome means it was overturned.");
    }
    if (appealEffectTag === "unchanged" && mentionsAny(["overturned", "overturn", "quashed", "set aside"])) {
      issues.push("Letter may state that the original decision was overturned, but the recorded appeal outcome means it is unchanged.");
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

  // NEW-1 remediation — deterministic appeal-deadline check. appealDeadline
  // is the same authoritative, cs.outcomeIssuedAt-anchored date #16
  // already computes (see computeAuthoritativeAppealDeadline in
  // deadlines.js); this only runs once Compass actually has one to check
  // against (a historical case with no computable anchor is never held
  // to a fabricated deadline — see deadlines.js's own comment on that
  // fallback). Deliberately narrow: this never tries to parse the
  // letter's own printed document date out of its free text (fragile,
  // and the wrong thing to fix — the letter is allowed to be dated
  // whenever it's actually produced; see letterGrounding.js's own
  // comment). It only checks, near the letter's own appeal-rights
  // wording, whether (a) the correct date is stated anywhere at all, (b)
  // a different concrete date is stated instead, and (c) the letter ties
  // the window to the letter's own date/receipt — a fixed, narrow phrase
  // set — regardless of whether that specific phrasing happens to be
  // numerically correct in this instance, since once an authoritative
  // date exists the letter should state it plainly rather than leave the
  // reader to compute their own from a self-referential anchor that can
  // silently drift on a future redraft.
  if (letterType === "outcome" && appealDeadline) {
    const text = letterText || "";
    const deadline = new Date(appealDeadline);
    const correctYear = String(deadline.getFullYear());
    const correctMonthLong = deadline.toLocaleDateString("en-GB", { month: "long" });
    const correctMonthShort = deadline.toLocaleDateString("en-GB", { month: "short" });
    const correctDay = deadline.getDate();
    const correctSlash = `${String(correctDay).padStart(2, "0")}/${String(deadline.getMonth() + 1).padStart(2, "0")}/${correctYear}`;
    const correctDateRe = new RegExp(`\\b0?${correctDay}(?:st|nd|rd|th)?\\s+(?:${correctMonthLong}|${correctMonthShort})\\.?,?\\s+${correctYear}\\b`, "i");
    const formattedCorrect = deadline.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const statesCorrectDate = correctDateRe.test(text) || text.includes(correctSlash);

    // Narrow window around each "appeal" mention — the known
    // formal-letter appeal section — rather than scanning the whole
    // letter for any date.
    const appealWindows = [...text.matchAll(/appeal/gi)].map(m => text.slice(Math.max(0, m.index - 100), m.index + 250));
    const combinedAppealText = appealWindows.join(" ");
    const anyDateRe = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;
    const wrongDateNearAppeal = anyDateRe.test(combinedAppealText) && !correctDateRe.test(combinedAppealText) && !combinedAppealText.includes(correctSlash);
    const relativeLetterAnchorRe = /date\s+of\s+this\s+letter|this\s+letter'?s?\s+date|letter\s+date|date\s+you\s+receiv\w*\s+this\s+letter|receipt\s+of\s+this\s+letter/i;
    const hasRelativeLetterAnchor = relativeLetterAnchorRe.test(combinedAppealText);

    if (wrongDateNearAppeal) {
      issues.push(`Letter states an appeal deadline other than the authoritative date (${formattedCorrect}).`);
    } else if (!statesCorrectDate) {
      issues.push(`Letter does not state the authoritative appeal deadline (${formattedCorrect}).`);
    }
    if (hasRelativeLetterAnchor) {
      issues.push(`Letter ties the appeal deadline to the date of this letter, which can differ from the authoritative deadline (${formattedCorrect}).`);
    }
  }

  // Appeal Invitation UAT P1 remediation (2026-09-19) — a formal appeal
  // hearing invitation is uniquely load-bearing among letter types: unlike
  // an outcome/appeal-outcome letter (which reports a decision already
  // made), it commits the organisation to a specific future date/time/
  // place, and getting any of the three wrong or left unresolved directly
  // undermines the fairness of the process. Generation-time grounding
  // (buildAppealHearingLogisticsInstruction, letterGrounding.js) is not
  // sufficient on its own — the model could still fail to faithfully
  // reproduce a given fact, and a human editing the letter afterward could
  // reintroduce a placeholder or a stale date — so this re-checks the
  // ACTUAL current letter text against the structured facts every time,
  // independent of how the text got that way. Scoped narrowly to
  // letterType==="invite" AND isAppealHearingInvitation (the CaseViewScreen
  // logistics-form flow explicitly sets this) — an ordinary disciplinary/
  // grievance/witness invitation, which never had this structured
  // logistics step, is completely unaffected.
  if (letterType === "invite" && isAppealHearingInvitation) {
    const text = letterText || "";

    if (!hearingDate) {
      issues.push("Add the hearing date before saving this invitation.");
    } else if (isPastLocalDate(hearingDate)) {
      issues.push("The hearing date cannot be in the past.");
    } else {
      const d = new Date(hearingDate + "T00:00:00");
      const correctYear = String(d.getFullYear());
      const correctMonthLong = d.toLocaleDateString("en-GB", { month: "long" });
      const correctMonthShort = d.toLocaleDateString("en-GB", { month: "short" });
      const correctDay = d.getDate();
      const correctSlash = `${String(correctDay).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${correctYear}`;
      const correctDateRe = new RegExp(`\\b0?${correctDay}(?:st|nd|rd|th)?\\s+(?:${correctMonthLong}|${correctMonthShort})\\.?,?\\s+${correctYear}\\b`, "i");
      const statesCorrectHearingDate = correctDateRe.test(text) || text.includes(correctSlash);
      if (hasHearingDatePlaceholder(text)) {
        issues.push("The invitation still contains an unresolved hearing-date placeholder.");
      } else if (!statesCorrectHearingDate) {
        issues.push(`Letter does not appear to state the agreed hearing date (${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}).`);
      }
    }

    if (!hearingTime) {
      issues.push("Add the hearing time before saving this invitation.");
    } else if (hasHearingTimePlaceholder(text)) {
      issues.push("The invitation still contains an unresolved hearing-time placeholder.");
    } else if (!letterStatesHearingTime(text, hearingTime)) {
      issues.push("Letter does not appear to state the agreed hearing time.");
    }

    if (!hearingLocationOrMethod) {
      issues.push("Add the hearing location or method before saving this invitation.");
    } else if (hasHearingVenuePlaceholder(text)) {
      issues.push("The invitation still contains an unresolved hearing location/method placeholder.");
    } else if (!normalizeForLooseContains(text).includes(normalizeForLooseContains(hearingLocationOrMethod))) {
      issues.push("Letter does not appear to state the agreed hearing location or method.");
    }

    // Procedural placeholder remediation (2026-09-19) — the generation-side
    // instruction now tells the model to omit a deadline it has no
    // authoritative value for, rather than placeholdering it. This is the
    // deterministic fail-safe behind that: the model could still emit one,
    // and a human editing the letter afterwards could reintroduce it, so the
    // actual text is re-checked regardless of how it got this way — the same
    // generation-vs-final-letter separation the hearing-logistics checks use.
    if (hasSubstantiveDeadlinePlaceholder(text)) {
      issues.push("The invitation still contains an unresolved response deadline — replace it or remove the deadline wording.");
    }
  }

  return { valid: issues.length === 0, issues };
}
