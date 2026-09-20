import { isAppealMeeting } from './meetingTypeMatch.js';
import { isGenuineMeetingRecord } from './caseStage.js';
import { appealInvitationLogistics } from './appealInvitation.js';

// Meeting prep grounding (Appeal Prep Pack P1, 2026-09-20).
//
// The prep pack previously received six values: meeting type label, employee
// name, date, an editable chair name, the free-text Background box, and the
// participant list. Nothing else. For a meeting launched from a case, that
// meant the chair's preparation for a real appeal hearing was generated with
// zero knowledge of the allegation, the original decision, the warning terms,
// the appointed officer or the open questions — all of which Compass already
// held in structured form. With no anti-fabrication rules in the prompt
// either, the likely output was a confident, invented prep pack.
//
// Deliberately bounded, not a case dump:
//  - STRUCTURED FIELDS ARE PREFERRED over free text wherever the same fact
//    exists structurally (outcome, warning duration/expiry, dates, officer).
//  - Historical meeting content is NOT injected. Only metadata (type, date,
//    whether a record exists) is included; the prep pack's job is to tell the
//    chair what to explore, not to re-read every transcript to them, and
//    whole transcripts would both blow the context and invite the model to
//    quote unverified detail back as established fact.
//  - Every line is a fact Compass genuinely holds. Nothing is inferred.
//
// Consumes only already-authorised client state (the same `cases`,
// `allegations`, `caseSignals`, `caseAccess`/`orgMembers` the screen already
// renders), so it cannot widen access beyond existing RLS / Level 1-2-3.

const MAX_LISTED_MEETINGS = 6;
const MAX_LISTED_SIGNALS = 8;
const MAX_ALLEGATION_CHARS = 300;
const MAX_DESCRIPTION_CHARS = 600;

function trim(value, max) {
  const text = (value || "").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T00:00:00" : value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// The facts themselves, assembled deterministically. Returns "" when there is
// no case at all (ad-hoc meetings), so the caller falls back to its existing
// user-supplied-background behaviour unchanged.
export function buildMeetingPrepGrounding({
  caseObj, meetingType, appealOfficerName, appealIndependenceStatus,
  allegations = [], openQuestions = [], openInconsistencies = [],
} = {}) {
  if (!caseObj) return "";

  const isAppeal = isAppealMeeting(meetingType?.label || meetingType?.id || "");
  const lines = [];

  lines.push("AUTHORITATIVE COMPASS CASE CONTEXT — these are recorded facts held by Compass for this case. Treat them as correct. Do not contradict them, and do not invent anything not stated here.");
  if (caseObj.caseType) lines.push(`Case type: ${caseObj.caseType}.`);
  if (caseObj.stage) lines.push(`Current workflow stage: ${caseObj.stage}.`);
  if (caseObj.employeeName) lines.push(`Employee: ${caseObj.employeeName}.`);
  const description = trim(caseObj.description, MAX_DESCRIPTION_CHARS);
  if (description) lines.push(`Original issue as recorded when the case was opened: ${description}`);

  const caseAllegations = (allegations || []).filter(Boolean);
  if (caseAllegations.length) {
    lines.push("Allegations on record (these are ALLEGATIONS, and where a finding is shown that is the recorded finding — never treat an allegation as a proven fact in its own right):");
    caseAllegations.forEach(a => {
      const finding = a.status || a.outcome || "no finding recorded";
      lines.push(`- ${trim(a.title || a.description || "Untitled allegation", MAX_ALLEGATION_CHARS)} (${finding})`);
    });
  }

  // Structured decision facts, preferred over any free-text restatement.
  if (caseObj.outcome) lines.push(`Original decision/outcome already issued: ${caseObj.outcome}.`);
  if (caseObj.outcomeIssuedAt) lines.push(`Outcome issued on: ${formatDate(caseObj.outcomeIssuedAt)}.`);
  if (caseObj.warningDurationMonths) lines.push(`Warning duration on record: ${caseObj.warningDurationMonths} months.`);
  if (caseObj.warningExpiresAt) lines.push(`Warning expires on: ${formatDate(caseObj.warningExpiresAt)}.`);
  if (caseObj.outcomeNotes) lines.push(`Reasoning recorded by HR for that decision: ${trim(caseObj.outcomeNotes, MAX_DESCRIPTION_CHARS)}`);

  // Metadata only — never transcript content.
  const priorMeetings = (caseObj.meetings || []).filter(isGenuineMeetingRecord).slice(-MAX_LISTED_MEETINGS);
  if (priorMeetings.length) {
    lines.push("Meetings already held on this case (metadata only — the full records exist in Compass and are not reproduced here, so do not quote or assume their contents):");
    priorMeetings.forEach(m => {
      lines.push(`- ${m.type || "Meeting"} on ${formatDate(m.date)}${m.record ? " (record on file)" : ""}`);
    });
  }

  if (isAppeal) {
    if (appealOfficerName) lines.push(`Appointed appeal officer who will chair this hearing: ${appealOfficerName}. This is the authoritative appointment held by Compass — do not name anyone else as chair.`);
    const logistics = appealInvitationLogistics(caseObj);
    if (logistics?.date) {
      lines.push(`Hearing arrangements already communicated to the employee in the appeal invitation: ${formatDate(logistics.date)}${logistics.time ? ` at ${logistics.time}` : ""}${logistics.locationOrMethod ? `, ${logistics.locationOrMethod}` : ""}.`);
    }
    lines.push(buildPrepAppealGroundsLine(caseObj.appealText));
    const independence = buildPrepIndependenceLine(appealIndependenceStatus, appealOfficerName);
    if (independence) lines.push(independence);
  }

  // Signals are questions, never findings. Callers pass already-filtered OPEN
  // signals only, so resolved / not-relevant ones never reach the model.
  const questions = (openQuestions || []).slice(0, MAX_LISTED_SIGNALS);
  if (questions.length) {
    lines.push("UNRESOLVED QUESTIONS Compass has already flagged on this case. These are OPEN QUESTIONS, not findings and not established facts — each one is something still to be explored. Never restate any of them as though it had been answered or proven:");
    questions.forEach(q => lines.push(`- ${q.title}${q.reasoning ? ` — ${trim(q.reasoning, 240)}` : ""}`));
  }
  const inconsistencies = (openInconsistencies || []).slice(0, MAX_LISTED_SIGNALS);
  if (inconsistencies.length) {
    lines.push("POTENTIAL INCONSISTENCIES Compass has flagged. These are unresolved observations to explore, NOT proven contradictions and NOT evidence of dishonesty:");
    inconsistencies.forEach(s => lines.push(`- ${s.title}${s.reasoning ? ` — ${trim(s.reasoning, 240)}` : ""}`));
  }

  return lines.filter(Boolean).join("\n");
}

// Mirrors the letter pipeline's buildAppealGroundsInstruction in substance,
// worded for preparation rather than correspondence. A missing ground is a
// known unknown and a legitimate reason to hold the hearing — never an error,
// and never something to fill in.
export function buildPrepAppealGroundsLine(appealText) {
  const trimmed = (appealText || "").trim();
  if (trimmed) {
    return `Grounds of appeal as recorded by the employee (use these exactly — do not substitute the original allegation or your own interpretation): ${trim(trimmed, MAX_DESCRIPTION_CHARS)}`;
  }
  // Advisory accuracy P1 (2026-09-20) — the generated pack escalated this into
  // "the hearing cannot be properly conducted until this is clear". Nothing
  // here said that, and Compass has no basis for it: grounds that were not
  // captured in advance are established at the outset of the hearing, which is
  // precisely what the hearing is for. The final sentence closes that gap.
  return "Grounds of appeal: NOT RECORDED in Compass. No formal grounds have been captured for this appeal. Do not infer, invent or reconstruct what the grounds might be from the original allegation or anything else. Instead, prepare the chair to give the employee a fair opportunity to explain their grounds at the hearing — including establishing which part of the original decision is being challenged and why."
    + " Be clear that this does NOT prevent the appeal hearing from going ahead: the chair should simply establish and record the grounds at the outset, before moving into the substantive appeal issues. Do not say or imply that the hearing cannot proceed, cannot properly be conducted, is defective, or that the employee has failed to follow procedure, merely because the grounds were not recorded beforehand.";
}

// Reuses the deployed independence classification. UNKNOWN and CONFLICT must
// never be described to the chair as verified independence.
export function buildPrepIndependenceLine(status, appealOfficerName) {
  const officer = appealOfficerName || "the appointed appeal officer";

  if (status === "clear") {
    // A permissive fact, not a warning. Deliberately scoped to what the
    // classifier actually establishes — no original-decision conflict was
    // identified in the structured record — rather than a broad guarantee of
    // impartiality, which Compass has no basis to give.
    return `Appeal officer independence: the structured case record does not identify ${officer} as having taken the original decision. You may note that the appeal is being heard by someone the record does not connect to that decision. Do not overstate this into a general guarantee of impartiality, and do not raise it as a concern — nothing here needs confirming.`;
  }

  if (status === "conflict") {
    // The opposite of an absence: the record AFFIRMATIVELY identifies this
    // person as the original decision-maker. Previously this returned the
    // same text as "unknown", which told the model to say nothing — so a
    // conflict Compass can actually prove was suppressed in the chair's own
    // preparation. HR's exceptional-override architecture at appointment time
    // is untouched; this only makes the recorded position visible.
    return `Appeal officer independence — RECORDED CONFLICT: the authoritative Compass record identifies ${officer}, who is appointed to hear this appeal, as having made or taken part in the original decision now under appeal. This is an affirmative finding in the structured record, not an inference drawn from missing information. Surface it plainly as a matter to be addressed before the appeal hearing proceeds. Do NOT describe this officer as independent or uninvolved. Do not draw any further legal conclusion beyond the conflict the record establishes.`;
  }

  if (status === "unknown") {
    // A verification gap, and nothing more. Must not read as either
    // reassurance or an allegation, and must sit comfortably alongside the
    // ABSENCE IS NOT A DEFECT invariant — this is the "note it as something
    // to confirm" case that invariant explicitly allows for.
    return `Appeal officer independence — NOT VERIFIED: Compass cannot establish from the structured case record whether ${officer} was involved in the original decision now under appeal. This is a gap in the record, NOT a finding that they were involved, and equally NOT confirmation that they were not. Do not describe them as independent, impartial by virtue of non-involvement, uninvolved, or conflicted — none of those is established. State neutrally that this has not been verified and should be confirmed before the hearing proceeds. Do not treat it as evidence of unfairness, procedural defect, breach or non-compliance: it is something to check, not a failing.`;
  }

  return "";
}

// The behavioural rules. Split from the facts so the same anti-fabrication
// contract applies to every meeting type, with the review framing added only
// for appeals.
export function buildMeetingPrepInstructions({ meetingType, hasCaseContext, hasAdditionalContext } = {}) {
  const isAppeal = isAppealMeeting(meetingType?.label || meetingType?.id || "");
  const rules = [];

  if (hasCaseContext) {
    rules.push("GROUNDING RULES: Use the AUTHORITATIVE COMPASS CASE CONTEXT above as the factual basis for this preparation. Do not invent allegations, appeal grounds, warnings, sanctions, evidence, prior decisions, procedural events, dates or reasonable adjustments that are not stated there. Where something needed to prepare properly is genuinely missing, say so explicitly as a point to clarify — never fill the gap with an assumption.");
    rules.push("Keep these distinct throughout: an allegation is not a finding; an unresolved question is not an established fact; and a recorded decision is not the same as your own view of the case.");
    // Advisory accuracy P1 (Human UAT, 2026-09-20) — the prep pack asserted
    // that "the absence of a notetaker is a procedural risk" and that a blank
    // notetaker field was "a procedural gap in the original process". Both
    // were derived purely from an empty field: Compass has no rule anywhere
    // requiring a separate notetaker, and the underlying signal was only ever
    // the neutral question "Who is the notetaker … and was one present?".
    // The existing rules stopped the model inventing FACTS but said nothing
    // about inventing CONCLUSIONS from a true absence, which is the axis that
    // failed.
    rules.push("ABSENCE IS NOT A DEFECT: missing or unrecorded information is not evidence that something did not happen, or that the process was defective. If a field, role, event, document, participant or piece of metadata is absent, blank, unknown or not recorded, describe only that fact — that it is not recorded — and, where it genuinely matters, note it as something to confirm. Do NOT infer a procedural defect, legal breach, unfairness, non-compliance, procedural risk or any other adverse conclusion from the absence alone. Describe such a concern only where the supplied case context explicitly supports it.");
    rules.push("Hold the difference clearly: \"unknown\" and \"not recorded\" describe the state of the RECORD, and are not themselves problems with the process. A procedural defect, a breach, unfairness or a risk is a CONCLUSION, and needs affirmative support in the supplied case context before you state it. Never convert the first into the second, and never do so simply to have something to put under a heading.");
    rules.push("Questions, open issues and flagged signals supplied above are contextual case material — things recorded as worth exploring. Treat them as questions to pursue or matters to verify. Any normative or legal wording inside them is not automatically Compass's own conclusion: do not restate it as settled law, established non-compliance or a proven procedural failing unless the authoritative context independently supports that.");
    if (hasAdditionalContext) {
      rules.push("The ADDITIONAL CONTEXT below was typed by the user for this preparation. Treat it as supplementary. It adds to the recorded case facts and must not silently override them: if it materially conflicts with the authoritative context above, do not pick a side — flag the discrepancy as something the chair should clarify.");
    }
  }

  if (isAppeal) {
    rules.push("THIS IS AN APPEAL HEARING — a review of a decision that has already been taken. It is NOT a fresh disciplinary hearing and must not re-run the original allegation from scratch as though no decision existed. Focus the preparation on: which part of the original decision is challenged; the grounds of appeal and the reasons behind them; evidence relied on; any genuinely new evidence; any procedural concerns; anything needing clarification; and what outcome or remedy the employee is seeking. Questions that revisit the underlying allegation or re-examine existing evidence are legitimate where they are needed to test a stated ground of appeal — reconsidering evidence is part of a fair review — but frame them as reviewing the original decision, not as determining the allegation afresh.");
    rules.push("Do not recommend, predict or predetermine the outcome of the appeal. Do not suggest whether it should be upheld, partially upheld or dismissed. That decision belongs solely to the appeal officer after hearing from the employee.");
    // Advisory accuracy follow-up (Human UAT, 2026-09-20) — the pack told the
    // chair that "best practice is to aim to communicate the outcome … within
    // five to ten working days". Nothing supplied that: no prep rule, no case
    // field, no company policy (this org has none uploaded), and no constant
    // anywhere in the codebase. It was invented. Same class as the invitation
    // letter's invented deadlines, and fixed the same way — omit the number
    // rather than guess one. This concerns ONLY when the appeal OUTCOME is
    // communicated; the employee's own 5-working-day window to LODGE an
    // appeal is a separate, authoritative figure computed elsewhere.
    // Advisory accuracy follow-up (Human UAT, 2026-09-20) — Closing Points
    // told the chair to confirm "that no further submissions will be accepted
    // after this point unless genuinely new evidence comes to light". Compass
    // holds no authoritative policy or case context establishing any such
    // evidential cut-off, and an appeal chair may legitimately need further
    // clarification, enquiry or investigation before deciding. Same class as
    // the invented timescale below: a procedural restriction asserted without
    // any grounding for it.
    rules.push("CLOSING THE HEARING: do not tell the chair to say that no further submissions will be accepted, that evidence or submissions are closed once the hearing ends, that only genuinely new evidence can be considered afterwards, or anything else amounting to a blanket cut-off on evidence or representations — unless such a restriction is explicitly set out in the authoritative case context or company policy above. Compass does not otherwise hold any such rule, and an appeal chair may properly need further clarification, enquiry, investigation or information before reaching a decision. Instead you may say that the hearing itself is concluding, that the chair will consider everything heard, that anything reasonably required to decide the appeal can still be obtained or considered, that the employee will be told if any further step materially affects the decision or the timetable, and that the final outcome will be confirmed in writing. Do not promise the employee any specific procedural entitlement or right beyond this.");
    rules.push("TIMESCALES: do not state or invent any specific number of hours, days, working days or weeks for communicating the appeal outcome, or for any other appeal deadline, unless that exact timeframe is given to you in the authoritative case context or company policy above. Do not present a figure of your own as best practice, as typical, or as what is usually expected. Where no authoritative timeframe has been supplied, say instead that the appeal outcome should be confirmed in writing as soon as possible and without unreasonable delay, and that if further enquiry or investigation is required the chair should explain this and give the employee a realistic updated timeframe.");
  }

  if (hasCaseContext) {
    // The narrative prompt mandates ## Risk Flags and ## Legal Checklist on
    // every generation, which is a standing invitation to manufacture a
    // concern to fill the heading — exactly how a blank notetaker field
    // became a procedural risk. The sections stay; the obligation to find
    // something for them does not.
    rules.push("For Risk Flags and Legal Checklist, include only matters actually supported by the supplied case context. These headings do not have to be filled: if nothing in the record supports a risk or a legal concern, say briefly that none is identified from the information recorded, or keep the section minimal. Never manufacture a procedural or legal risk out of blank, missing or unrecorded detail in order to populate a section.");
  }

  return rules.join(" ");
}
