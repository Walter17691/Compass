// Process Intelligence (P15, §13) — Case Risk Panel. Deliberately the
// last of the "process intelligence" phases to touch case-level
// analysis: almost every category here is a read over what P6 (guardrail
// signals), P7 (policy deviation audit entries), P8 (role conflicts),
// and P13 (appeal grounds) already computed and stored, not new
// deterministic logic of its own. Pure and unit-testable, same style as
// guardrails.js/caseReadiness.js.
//
// Explicitly not a legal conclusion or a compliance score — same
// disclaimer discipline runRiskScore (App.jsx) and CaseReadinessBadge
// already apply to their own outputs: a named list of things worth a
// second look, with a source for each, never a verdict.
import { openSignalsForCase } from './caseSignals.js';
import { newEvidenceSinceFinding, parseAppealGroundReasoning } from './appealReview.js';
import { getProcessType } from './processStages.js';
import { getCaseStage } from './caseStage.js';

// Guardrail check titles are deliberately stable/fixed text
// (guardrails.js's own header comment) — matching against them here is
// the same "read what P6/P8 already computed" reuse, not a new
// coupling risk (a title change there is already a breaking change for
// syncGuardrailSignals' own dedup, so it won't drift silently).
const CONFLICT_OF_INTEREST_TITLES = [
  "Same person chaired the investigation and the disciplinary hearing",
  "The Appeal Manager made the original decision",
];

// Exported for OverviewTab.jsx's own health/wellbeing field visibility
// (fit note, OH referral) — same "health context typically relevant"
// judgement call as this file's own missing_medical_info check below, so
// the two share one definition instead of drifting apart.
export const HEALTH_RELEVANT_PROCESS_TYPES = ["attendance", "long_term_sickness", "capability"];

function riskItem(category, label, detail, sourceRefs) {
  return { category, label, detail, sourceRefs: sourceRefs || [] };
}

export function computeCaseRisk(cs, { allegations = [], caseSignals = [], cases = [], auditLog = [], wellbeingNotes = [], dueSoon = [] } = {}) {
  const items = [];
  const caseAllegations = allegations.filter(a => a.caseId === cs.id);

  // Procedural risk — every open guardrail signal not already broken out
  // into its own named category below.
  openSignalsForCase(caseSignals, cs.id, "process_risk")
    .filter(s => !CONFLICT_OF_INTEREST_TITLES.includes(s.title) && !s.title.startsWith("Appeal ground:"))
    .forEach(s => items.push(riskItem("procedural", s.title, s.reasoning, s.sourceRefs)));

  // Conflict of interest — the same open guardrail signals, filtered to
  // ones about who's involved rather than what was done.
  openSignalsForCase(caseSignals, cs.id, "process_risk")
    .filter(s => CONFLICT_OF_INTEREST_TITLES.includes(s.title))
    .forEach(s => items.push(riskItem("conflict_of_interest", s.title, s.reasoning, s.sourceRefs)));

  // Evidence gap — any allegation with nothing linked yet, not just
  // decided ones (a risk panel is meant to catch this earlier than the
  // Decision Quality Check, which only looks once a finding exists).
  caseAllegations.forEach(a => {
    if (!(cs.evidence || []).some(ev => ev.allegationId === a.id)) {
      items.push(riskItem("evidence_gap", `No evidence linked: "${a.title}"`, null, [{ kind: "allegation", id: a.id, label: a.title }]));
    }
  });

  // New evidence since a finding was decided — reuses P13's own check,
  // here as a case-wide risk rather than only surfaced during an appeal.
  caseAllegations.forEach(a => {
    const added = newEvidenceSinceFinding(cs.evidence || [], a);
    if (added.length) {
      items.push(riskItem("new_evidence", `New evidence added since the finding on "${a.title}"`, added.map(e => e.name).join(", "), [{ kind: "allegation", id: a.id, label: a.title }]));
    }
  });

  // Appeal vulnerability — P13's own per-ground potentialIssue field,
  // when one was actually flagged (an empty potentialIssue means the AI
  // found nothing specific, not that there's no ground at all).
  openSignalsForCase(caseSignals, cs.id, "process_risk")
    .filter(s => s.title.startsWith("Appeal ground:"))
    .forEach(s => {
      const { potentialIssue } = parseAppealGroundReasoning(s.reasoning);
      if (potentialIssue) items.push(riskItem("appeal_vulnerability", s.title, potentialIssue, s.sourceRefs));
    });

  // Policy deviation — P7's own audit trail entries for this case.
  auditLog
    .filter(e => e.caseId === cs.id && e.action === "Policy deviation recorded")
    .forEach(e => items.push(riskItem("policy_deviation", "Policy deviation recorded", e.detail, [])));

  // Delay — this case's own overdue items from the org-wide computeDueSoon
  // output, not recomputed here.
  dueSoon
    .filter(d => d.caseId === cs.id && d.overdue)
    .forEach(d => items.push(riskItem("delay", d.label, `${d.daysOverdue} day${d.daysOverdue === 1 ? "" : "s"} overdue`, [])));

  // Outstanding grievance — the same employee has another, still-open
  // grievance-type case elsewhere. A real natural-justice/retaliation-
  // perception concern if this case's own process continues regardless.
  //
  // Phase 6.5 hardening (P2) — uses getCaseStage(c), not raw c.stage: a
  // case can be resolved (signed outcome letter, meeting-derived closure)
  // without ever having its stage field explicitly set, the same reason
  // every other module in this codebase resolves stage through this
  // function rather than reading the field directly. Reading c.stage
  // here meant an already-closed grievance could permanently, un-
  // dismissably flag this risk against an unrelated current case.
  const grievanceElsewhere = cases.find(c => c.id !== cs.id && c.employeeName === cs.employeeName && getProcessType(c.caseType).id === "grievance" && getCaseStage(c) !== "closed");
  if (grievanceElsewhere) {
    items.push(riskItem("outstanding_grievance", "This employee has another open grievance", null, [{ kind: "case", id: grievanceElsewhere.id, label: grievanceElsewhere.employeeName }]));
  }

  // Missing medical info / reasonable adjustments — wellbeing_notes is
  // the only place either is genuinely tracked (WellbeingScreen's own
  // "adjustment" note type, and its "confidential, not linked to any ER
  // case file" notes generally). Only checked for case types where
  // health context is typically relevant — flagging this on, say, a
  // straightforward conduct case would be noise, not signal.
  if (HEALTH_RELEVANT_PROCESS_TYPES.includes(getProcessType(cs.caseType).id)) {
    const employeeNotes = wellbeingNotes.filter(n => n.employeeName === cs.employeeName);
    if (!employeeNotes.length) {
      items.push(riskItem("missing_medical_info", "No wellbeing or medical context recorded for this employee", null, []));
    }
    const openAdjustmentNote = employeeNotes.find(n => n.type === "adjustment" && n.followUpDate && !n.followUpDone);
    if (openAdjustmentNote) {
      items.push(riskItem("reasonable_adjustment", "A reasonable adjustment discussion has an outstanding follow-up", openAdjustmentNote.content, []));
    }
  }

  return items;
}

export const RISK_CATEGORIES = [
  { id: "procedural", label: "Procedural risk" },
  { id: "evidence_gap", label: "Evidence gap" },
  { id: "delay", label: "Delay" },
  { id: "outstanding_grievance", label: "Outstanding grievance" },
  { id: "conflict_of_interest", label: "Conflict of interest" },
  { id: "missing_medical_info", label: "Missing medical info" },
  { id: "reasonable_adjustment", label: "Reasonable adjustment" },
  { id: "new_evidence", label: "New evidence" },
  { id: "policy_deviation", label: "Policy deviation" },
  { id: "appeal_vulnerability", label: "Appeal vulnerability" },
];

export function categoryLabel(category) {
  return RISK_CATEGORIES.find(c => c.id === category)?.label || category;
}
