// ─────────────────────────────────────────────────────────────────────────
// WAVE D1 COMPLETION — when can an outcome be recorded?
//
// D1 separated the decision from its communication inside the modal, but the
// ROUTE still encoded the old order. The Outcome destination was offered on
// `!!cs.outcome || stage === "outcome" || caseClosed` — all three of which only
// become true AFTER a decision exists. With no outcome the destination was
// filtered out of the workspace nav, and both entry points to the outcome modal
// live on it, so the only way to reach "Record outcome" was:
//
//   draft the outcome LETTER -> letterType "outcome" lands on a meeting ->
//   inferDisciplinaryStage returns "outcome" -> the destination appears
//
// You had to write the communication before you could record the decision.
//
// ┌─ THE TWO IDEAS, SEPARATED ──────────────────────────────────────────────┐
// │ HAS OUTCOME        a decision has been recorded.                        │
// │ CAN RECORD OUTCOME the case is ready for one and none exists yet.       │
// │                                                                          │
// │ One boolean was being asked to mean both. The destination is available   │
// │ when EITHER holds (or the case is closed and its outcome needs           │
// │ inspecting) — but they are never conflated again.                        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ SIGNATURE IS NOT A PREREQUISITE, AND THIS DOES NOT INVENT ONE ─────────┐
// │ Traced before writing: no signature check gates the outcome anywhere —  │
// │ not OutcomeTab, not OutcomeModal, not computeDecisionQualityGaps, and   │
// │ not protect_case_outcome_2026-08-27.sql, whose trigger gates WHO may    │
// │ set an outcome and says nothing about a signature. nextStep merely      │
// │ SUGGESTS sending the record first.                                       │
// │                                                                          │
// │ eSignature.js also makes declined and expired TERMINAL, and records a   │
// │ decline as "a plain fact for HR to follow up on" — so the product       │
// │ already permits progression after refusal or expiry. Requiring a        │
// │ signature here would invent an HR policy the product does not hold, and │
// │ would strand every case whose employee declines.                         │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The real prerequisite is the one nextStep itself checks first: the hearing
// has actually been held and its record is complete.
// ─────────────────────────────────────────────────────────────────────────

import { getProcessType } from './processStages';
import { isMeetingComplete } from './meetingLifecycle';
import { isDisciplinaryMeeting, isGrievanceMeeting } from './meetingTypeMatch';

// Which stage id this process type calls its decision point. Not every type
// uses the word "outcome" — long-term sickness and probation say "decision".
export function outcomeStageId(caseType) {
  const ids = getProcessType(caseType).stages.map(s => s.id);
  if (ids.includes("outcome")) return "outcome";
  if (ids.includes("decision")) return "decision";
  return null;
}

// Has the case reached the stage immediately before its own decision point?
// This is the existing OutcomeTab rule, lifted out so there is one definition
// rather than one per consumer.
export function hasReachedOutcomeStage(caseObj, stage) {
  const ids = getProcessType(caseObj?.caseType).stages.map(s => s.id);
  const target = outcomeStageId(caseObj?.caseType);
  if (!target) return false;
  const current = ids.indexOf(stage);
  const outcomeIndex = ids.indexOf(target);
  return current !== -1 && current >= outcomeIndex - 1;
}

// The hearing a decision follows. Only a genuinely complete meeting counts —
// a hearing still in progress means the case has entered the stage but the
// decision point has not arrived, which is what stops the destination
// appearing the moment someone starts a hearing.
export function hearingForOutcome(caseObj) {
  const meetings = Array.isArray(caseObj?.meetings) ? caseObj.meetings : [];
  const relevant = meetings.filter(m => m && (isDisciplinaryMeeting(m.type) || isGrievanceMeeting(m.type)));
  return relevant[relevant.length - 1] || null;
}

// Ready for a decision, and none recorded yet.
export function canRecordOutcome(caseObj, stage) {
  if (!caseObj) return false;
  if (caseObj.outcome) return false;                       // already decided
  if (!hasReachedOutcomeStage(caseObj, stage)) return false;
  const hearing = hearingForOutcome(caseObj);
  return !!hearing && isMeetingComplete(hearing);
}

// Whether the Outcome destination should exist at all. Three legitimate
// reasons, stated explicitly rather than inferred from one overloaded flag:
//   A. the case is ready for the decision;
//   B. an outcome already exists;
//   C. the case is closed and its outcome needs inspecting.
export function outcomeDestinationAvailable({ caseObj = null, stage = null, caseClosed = false } = {}) {
  if (!caseObj) return false;
  return !!caseObj.outcome
    || stage === outcomeStageId(caseObj.caseType)
    || !!caseClosed
    || canRecordOutcome(caseObj, stage);
}
