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
  return "Grounds of appeal: NOT RECORDED in Compass. No formal grounds have been captured for this appeal. Do not infer, invent or reconstruct what the grounds might be from the original allegation or anything else. Instead, prepare the chair to give the employee a fair opportunity to explain their grounds at the hearing — including establishing which part of the original decision is being challenged and why.";
}

// Reuses the deployed independence classification. UNKNOWN and CONFLICT must
// never be described to the chair as verified independence.
export function buildPrepIndependenceLine(status, appealOfficerName) {
  if (status === "clear") {
    return "Appeal officer independence: Compass holds structured evidence that this officer did not take the original decision.";
  }
  if (status === "unknown" || status === "conflict") {
    return `Appeal officer independence: NOT VERIFIED by Compass. You may state that ${appealOfficerName || "an appeal officer"} has been appointed to hear the appeal, but do NOT state or imply that they are independent, impartial by virtue of non-involvement, or that they were not involved in the original decision. Say nothing about their prior involvement either way.`;
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
    if (hasAdditionalContext) {
      rules.push("The ADDITIONAL CONTEXT below was typed by the user for this preparation. Treat it as supplementary. It adds to the recorded case facts and must not silently override them: if it materially conflicts with the authoritative context above, do not pick a side — flag the discrepancy as something the chair should clarify.");
    }
  }

  if (isAppeal) {
    rules.push("THIS IS AN APPEAL HEARING — a review of a decision that has already been taken. It is NOT a fresh disciplinary hearing and must not re-run the original allegation from scratch as though no decision existed. Focus the preparation on: which part of the original decision is challenged; the grounds of appeal and the reasons behind them; evidence relied on; any genuinely new evidence; any procedural concerns; anything needing clarification; and what outcome or remedy the employee is seeking. Questions that revisit the underlying allegation or re-examine existing evidence are legitimate where they are needed to test a stated ground of appeal — reconsidering evidence is part of a fair review — but frame them as reviewing the original decision, not as determining the allegation afresh.");
    rules.push("Do not recommend, predict or predetermine the outcome of the appeal. Do not suggest whether it should be upheld, partially upheld or dismissed. That decision belongs solely to the appeal officer after hearing from the employee.");
  }

  return rules.join(" ");
}
