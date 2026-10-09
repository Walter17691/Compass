import { splitMeetingRecord } from './meetingRecordSections.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE 0 — what a DSAR response package may contain.
//
// A subject access response is an INTENTIONAL DISCLOSURE PROJECTION. It is not a
// serialisation of Compass's internal application object, and the difference is
// not cosmetic: before this module, `casesForExport` was `{ ...case }` with
// evidence dataUrls removed, so every field the case object happened to carry was
// written into the JSON file that HR downloads and sends to the employee.
//
// ┌─ THE SCALE OF WHAT THAT DISCLOSED ─────────────────────────────────────┐
// │ Measured against production (structure and counts only, never content): │
// │   378 of 890 historical meeting records contain a "## HR Advisor Notes"  │
// │       section — Compass's internal advisory commentary, written for the  │
// │       HR user and explicitly never for the employee.                     │
// │   887 carry `prediction`, a generated string about the person.           │
// │    52 carry `riskScore` = { rating, summary, historyContext }.           │
// │   321 carry `unresolvedSuggestions`, Compass's own follow-up prompts.     │
// │     1 carries `reviewDraft`, including `recordOriginal` and `risk`.       │
// └────────────────────────────────────────────────────────────────────────┘
//
// ── WHY AN ALLOW-LIST AND NOT A DENY-LIST ─────────────────────────────────
//
// A deny-list is wrong by default. It discloses every field nobody has thought
// about yet, which means the next internal field added to a case or a meeting
// appears in the next DSAR download by accident. This module names what MAY be
// disclosed; anything it does not recognise is withheld and REPORTED, so a new
// field shows up in the reviewer's "not recognised" list rather than in the
// employee's package.
//
// ── WHAT THIS MODULE DOES NOT DECIDE ──────────────────────────────────────
//
// It does not decide what the law requires. It separates what is plainly the
// employee's own record from what is plainly Compass's internal analysis, and
// routes the genuinely arguable middle to a human. Where a judgement is
// unavailable from the data, the item is FLAGGED rather than guessed in either
// direction — silently withholding is as wrong as silently disclosing, because
// both remove the decision from the person answerable for it.
// ─────────────────────────────────────────────────────────────────────────

const isPlainText = v => typeof v === "string" && v.trim() !== "";

// ── CASE FIELDS ────────────────────────────────────────────────────────────
//
// Classified by inspecting real usage, not field names.

// A. The employee's own record.
const CASE_DISCLOSE = Object.freeze([
  "id", "employeeId", "employeeName", "email",
  "caseType", "description", "dateReceived", "stage",
  "outcome", "outcomeIssuedAt", "warningDurationMonths", "warningExpiresAt",
  // The employee's OWN words, submitted by them.
  "appealText",
  // Their own occupational-health and absence process dates. Special category
  // data, and unambiguously theirs.
  "ohProcess", "fitNoteEndDate", "ohReferralDate", "ohReportReceivedDate",
  "suspensionReviewDate", "probationReviewDate",
  // Redundancy figures are computed ABOUT the employee from their own pay and
  // age. Derived personal data is still personal data.
  "estimatedWeeklyPay", "estimatedAgeAtDismissal",
  "createdAt", "updatedAt",
]);

// Role holders the employee already knows by name — who chaired their hearing,
// who investigated, who their manager was. Disclosed as NAMES only; the matching
// internal ids and work email addresses are omitted below.
const CASE_DISCLOSE_ROLE_NAMES = Object.freeze([
  "manager", "investigatingManager", "disciplinaryOfficer", "disciplinaryDecidedBy",
]);

// C. Compass's or HR's internal working material.
const CASE_WITHHELD_INTERNAL = Object.freeze([
  // Case-level workflow prompts, not a record of anything that happened.
  "nextSteps",
  // Internal triage.
  "priority", "urgency", "investigationPaused",
  // An internal handling flag.
  "confidential",
]);

// E. Genuinely arguable — reported to the reviewer, disclosed by nobody
// automatically.
//
//   outcomeNotes      meetingPrepGrounding calls this "Reasoning recorded by HR
//                     for that decision". The OUTCOME is disclosed; HR's private
//                     reasoning about it is a judgement call.
//   investigationReport  Often shared with the employee before a hearing, and
//                     often full of third-party statements. Compass does not
//                     record whether it was shared, so it must not assume.
const CASE_REVIEW_REQUIRED = Object.freeze(["outcomeNotes", "investigationReport"]);

// D. Technical or third-party-contact fields with no disclosure value.
const CASE_OMIT_TECHNICAL = Object.freeze([
  "timelineOverrides", "locationId", "ownerId", "assignedTo", "createdBy",
  "handoffDate", "disciplinaryOfficerId", "disciplinaryOfficerEmail",
  // Handled by their own transformer / existing mechanisms.
  "meetings", "evidence",
]);

// ── MEETING FIELDS (historical jsonb) ──────────────────────────────────────

const MEETING_DISCLOSE = Object.freeze([
  "id", "type", "date", "status",
  "hearingDate", "hearingTime", "hearingLocationOrMethod",
  "startedAt", "endedAt",
  // What the employee was actually sent for signature. Verified against
  // production: 0 of 739 contain an advisor heading, so this is already the
  // employee-facing text.
  "signDocument", "signStatus",
  "summary",
]);

// Exported so the CANONICAL table-meeting classifier in dsarCompile.js provably
// shares this vocabulary. Two DSAR standards for two storage formats would be a
// worse defect than the one Wave 0 fixes: the same content would be disclosable
// or not depending on which table it happened to live in.
export const MEETING_WITHHELD_INTERNAL = Object.freeze([
  // A generated string about the person.
  "prediction",
  // { rating, summary, historyContext } — a generated assessment of them.
  "riskScore", "risk",
  // Unfinished internal drafting, including recordOriginal and risk.
  "reviewDraft",
  // Compass's own prompts to the HR user.
  "unresolvedSuggestions", "nextSteps",
  // Advisory commentary (table meetings carry this as its own column).
  "advisorNotes", "advisor_notes",
  // Internal provenance and identity debt.
  "letterTracking", "signId", "letterApprovedBy", "letterApprovedAt",
  "savedBy", "savedAt", "employeeSnapshot", "chairUserId",
  "createdBy", "createdAt", "caseId", "letterType",
  // Scheduling plumbing. `schedule.date` is read for the date below.
  "calendar", "invitation", "schedule",
]);

// ── LETTERS: drafted vs issued ─────────────────────────────────────────────
//
// The product's own vocabulary settles the default: caseTimeline.js labels a
// letterOutput entry "Letter drafted", and nextStep.js notes that letterTracking
// is "populated only once a [letter is sent]". So a letter is a DRAFT unless
// something records that it left the building.
//
// Production: 6 meetings carry letter text; 1 has an issuance marker; 5 do not;
// letterTracking is populated nowhere. So this distinction is real but thin — and
// where it is absent the letter is FLAGGED, never silently treated as issued (it
// would disclose a document the employee may never have received, as though they
// had) and never silently dropped (it may be their outcome letter).
export function letterDisclosureStatus(meeting) {
  if (!isPlainText(meeting?.letterOutput)) return "none";
  const tracking = meeting?.letterTracking;
  const tracked = !!tracking && typeof tracking === "object" && Object.keys(tracking).length > 0;
  if (isPlainText(meeting?.letterApprovedAt) || isPlainText(meeting?.signStatus) || tracked) return "issued";
  return "draft_unconfirmed";
}

// One historical meeting → what may be disclosed, what was withheld, and why.
export function disclosableMeeting(meeting) {
  if (!meeting || typeof meeting !== "object") return null;

  const out = {};
  MEETING_DISCLOSE.forEach(k => { if (meeting[k] !== undefined) out[k] = meeting[k]; });
  if (!out.date && meeting?.schedule?.date) out.date = meeting.schedule.date;

  // The record, split. 378 production records carry an internal section, all of
  // them as `## HR Advisor Notes`; the matcher handles every heading level and
  // both spellings, so a variant cannot become a breach.
  const withheld = [];
  const { employeeFacing, internal } = splitMeetingRecord(meeting.record || "");
  if (isPlainText(employeeFacing)) out.record = employeeFacing;
  if (isPlainText(internal)) withheld.push("record.hrAdvisorNotes");

  // The transcript is the employee's own words and the words said to them. The
  // compiler already treats it as subject content — it scans it for third-party
  // mentions rather than excluding it — so that treatment is preserved.
  out.transcript = Array.isArray(meeting.transcript) ? meeting.transcript : [];

  // Attendees at the employee's own meeting, by name. They already know who was
  // in the room. Only names travel: no ids, no contact details.
  if (Array.isArray(meeting.participants)) {
    out.participants = meeting.participants
      .map(p => (typeof p === "string" ? p : p?.name))
      .filter(isPlainText);
  }

  // The manager who held it — already known to the employee.
  if (isPlainText(meeting.manager)) out.manager = meeting.manager;

  const letter = letterDisclosureStatus(meeting);
  const reviewRequired = [];
  if (letter === "issued") {
    out.letterOutput = meeting.letterOutput;
  } else if (letter === "draft_unconfirmed") {
    reviewRequired.push({
      field: "letterOutput",
      reason: "A letter was drafted on this meeting but nothing records it being approved, signed or sent. Decide whether it was issued to this employee before disclosing it.",
    });
  }

  MEETING_WITHHELD_INTERNAL.forEach(k => {
    const v = meeting[k];
    const empty = v === undefined || v === null || v === ""
      || (Array.isArray(v) && v.length === 0)
      || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
    if (!empty) withheld.push(k);
  });

  // FAIL CLOSED. Anything this module has never been told about is withheld and
  // named, so a newly-added internal field surfaces in the reviewer's list
  // instead of in the employee's package.
  const known = new Set([
    ...MEETING_DISCLOSE, ...MEETING_WITHHELD_INTERNAL,
    "record", "transcript", "participants", "manager", "letterOutput",
  ]);
  const unrecognised = Object.keys(meeting).filter(k => !known.has(k));

  return { ...out, withheldAsInternalAnalysis: withheld, reviewRequired, unrecognisedFieldsWithheld: unrecognised };
}

// One case → what may be disclosed, plus a per-case account of what was not.
export function disclosableCase(caseObj) {
  if (!caseObj || typeof caseObj !== "object") return null;

  const out = {};
  CASE_DISCLOSE.forEach(k => { if (caseObj[k] !== undefined) out[k] = caseObj[k]; });
  CASE_DISCLOSE_ROLE_NAMES.forEach(k => { if (isPlainText(caseObj[k])) out[k] = caseObj[k]; });

  // ── EVIDENCE: metadata, never the file bytes — and no longer the TEXT ────
  //
  // SECURITY FIX. This previously stripped only `dataUrl`, so `record`
  // survived. `record` on an evidence item is not a filename: it is the full
  // text of a witness statement (src/App.jsx writes `record: reviewOutput`
  // under a `Witness: <name>` item) or of a pasted email including its headers
  // (src/lib/emailIngestion.js). That is the single most likely place another
  // person's own account of events is held, and it was auto-disclosed verbatim,
  // never scanned for third-party mentions, and absent from
  // evidenceRequiringReview — which carries only name/type/date/size.
  //
  // It is NOT dropped. The subject's own case evidence is their data, and a
  // witness statement about them may be the most important thing in the pack.
  // It is REVIEW-FLAGGED, so a human releases, redacts or withholds it — which
  // is exactly the treatment investigationReport already gets one field above.
  // Built by ALLOW-LIST rather than by omission. Destructuring the two unwanted
  // keys away works but leaves an unused binding, and more importantly it fails
  // OPEN: a future evidence field arrives disclosed by default. Naming what may
  // leave is the same discipline CASE_DISCLOSE applies above.
  out.evidence = (Array.isArray(caseObj.evidence) ? caseObj.evidence : [])
    .map(ev => ({
      id: ev.id,
      name: ev.name,
      type: ev.type,
      date: ev.date,
      size: ev.size,
      addedBy: ev.addedBy,
      source: ev.source,
      signStatus: ev.signStatus,
      allegationIds: ev.allegationIds,
      stance: ev.stance,
      recordRequiresReview: isPlainText(ev.record),
    }));

  const meetings = (Array.isArray(caseObj.meetings) ? caseObj.meetings : [])
    .map(disclosableMeeting)
    .filter(Boolean);
  out.meetings = meetings;

  const withheld = [];
  CASE_WITHHELD_INTERNAL.forEach(k => {
    const v = caseObj[k];
    const empty = v === undefined || v === null || v === ""
      || (Array.isArray(v) && v.length === 0);
    if (!empty) withheld.push(k);
  });

  const reviewRequired = [];
  (Array.isArray(caseObj.evidence) ? caseObj.evidence : []).forEach(ev => {
    if (ev && isPlainText(ev.record)) {
      reviewRequired.push({
        field: 'evidence.record',
        evidenceId: ev.id ?? null,
        evidenceName: isPlainText(ev.name) ? ev.name : null,
        reason: 'The full text of an evidence item held on this case — typically a witness statement or a pasted email. '
          + 'It is about the requester, and it is likely to contain another person\'s own account. Decide whether to release, redact or withhold it.',
      });
    }
  });
  CASE_REVIEW_REQUIRED.forEach(k => {
    if (isPlainText(caseObj[k])) {
      reviewRequired.push({
        field: k,
        reason: k === "outcomeNotes"
          ? "HR's own reasoning for the decision. The outcome itself is included; decide whether this reasoning should be disclosed."
          : "An investigation report held on the case. It may already have been shared with this employee, and it may contain other people's statements. Review before disclosing.",
      });
    }
  });

  const known = new Set([
    ...CASE_DISCLOSE, ...CASE_DISCLOSE_ROLE_NAMES, ...CASE_WITHHELD_INTERNAL,
    ...CASE_REVIEW_REQUIRED, ...CASE_OMIT_TECHNICAL,
  ]);
  const unrecognised = Object.keys(caseObj).filter(k => !known.has(k));

  return {
    ...out,
    withheldAsInternalAnalysis: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: unrecognised,
  };
}

// The reviewer's account of the whole set: what was held back, what needs a
// decision, and what Compass did not recognise. Aggregated so the DSAR screen can
// say it in one sentence rather than making someone read 45 keys.
export function summariseCaseDisclosure(disclosedCases = []) {
  const internal = new Set();
  const unrecognised = new Set();
  const review = [];
  let meetingsWithWithheldContent = 0;

  disclosedCases.forEach(c => {
    (c.withheldAsInternalAnalysis || []).forEach(f => internal.add(f));
    (c.unrecognisedFieldsWithheld || []).forEach(f => unrecognised.add(f));
    (c.reviewRequired || []).forEach(r => review.push({ caseId: c.id, ...r }));
    (c.meetings || []).forEach(m => {
      if ((m.withheldAsInternalAnalysis || []).length > 0) meetingsWithWithheldContent += 1;
      (m.withheldAsInternalAnalysis || []).forEach(f => internal.add(f));
      (m.unrecognisedFieldsWithheld || []).forEach(f => unrecognised.add(f));
      (m.reviewRequired || []).forEach(r => review.push({ caseId: c.id, meetingId: m.id, ...r }));
    });
  });

  return {
    internalFieldsWithheld: [...internal].sort(),
    unrecognisedFieldsWithheld: [...unrecognised].sort(),
    meetingsWithWithheldContent,
    reviewRequired: review,
  };
}
