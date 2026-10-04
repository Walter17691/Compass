import { isFindingStatus } from './allegations.js';
import { openSignalsForCase } from './caseSignals.js';

// Process Intelligence (P11) — Decision Quality Check, the case-wide
// counterpart to Meeting Intelligence's computeMeetingQualityGaps
// (App.jsx): same shape (a flat array of plain-English gap strings,
// advisory only, never a block), but scored across a case's whole
// decision — all allegations, its guardrail signals, and its outcome —
// rather than a single meeting's transcript. Pure and unit-testable,
// same style as guardrails.js/caseReadiness.js.
const MIN_REASONING_LENGTH = 20; // matches guardrails.js's own threshold for "reasoning present but too thin to be meaningful"

// ─────────────────────────────────────────────────────────────────────────
// D4.3c — SEMANTIC DEDUPLICATION, BY STABLE RULE IDENTITY.
//
// Production UAT asked the adviser to override the same substantive risk twice,
// because two detectors found it:
//   Finding recorded with little or no reasoning: "Unauthorised absence"
//   Unresolved procedural guardrail: "A finding was recorded with little or no
//                                     reasoning"
// Both are the same rule — guardrails.js's checkDecisionReasoningMissing uses
// the identical predicate (a finding whose reasoning is under
// MIN_REASONING_LENGTH) as the direct check below.
//
// Deduplicated on the guardrail's OWN stable id, which reaches the client as
// signal.ruleId (case_signals.rule_id — verified carrying
// "decision_reasoning_missing" on the UAT case). NEVER by comparing titles:
// wording is written by people and by AI, it changes, and two genuinely
// different risks can read similarly. An id either matches or it does not.
//
// What this does NOT do: it does not delete, resolve, modify or hide the
// underlying signal — the guardrail record stays exactly as it is and still
// appears everywhere else it appears (GuardrailsPanel, Compass Analysis, audit).
// Only the duplicate LINE in this one override list is suppressed, and only when
// the direct check has already said the same thing in plainer words.
const GUARDRAIL_COVERED_BY_DIRECT_CHECK = Object.freeze({
  // guardrails.js -> checkDecisionReasoningMissing
  decision_reasoning_missing: "thin_reasoning",
});

export function computeDecisionQualityGaps(cs, allegations, caseSignals) {
  const caseAllegations = (allegations || []).filter(a => a.caseId === cs.id);
  const gaps = [];
  // Which direct checks actually fired, so a guardrail saying the same thing can
  // be recognised by identity rather than by wording.
  const statedDirectly = new Set();

  caseAllegations.forEach(a => {
    if (!isFindingStatus(a.status)) {
      gaps.push(`Allegation not yet decided: "${a.title}"`);
      return; // the checks below only make sense once a finding has actually been reached
    }
    if ((a.decisionReasoning || "").trim().length < MIN_REASONING_LENGTH) {
      gaps.push(`Finding recorded with little or no reasoning: "${a.title}"`);
      statedDirectly.add("thin_reasoning");
    }
    // The schema has no separate "mitigation" field — in practice it's
    // part of what the employee said in response, so both are covered by
    // the same employeeResponse check rather than one masquerading as two.
    if (!(a.employeeResponse || "").trim()) {
      gaps.push(`No employee response or mitigation recorded before a finding: "${a.title}"`);
    }
    if (!(cs.evidence || []).some(ev => ev.allegationId === a.id)) {
      gaps.push(`No evidence linked to a decided allegation: "${a.title}"`);
    }
  });

  // "Policy identified" reads off whatever's already been surfaced onto
  // this case's own signals (P4-P6's policy citations) rather than
  // re-running a fresh clause search here — computeDecisionQualityGaps
  // only takes caseSignals, not a policies list, so this is the
  // case-wide record of what's already been identified as relevant.
  const hasPolicyReference = (caseSignals || []).some(s => s.caseId === cs.id && (s.sourceRefs || []).some(r => r.kind === "policy"));
  if (caseAllegations.some(a => isFindingStatus(a.status)) && !hasPolicyReference) {
    gaps.push("No company policy has been identified as relevant to this case's decision.");
  }

  openSignalsForCase(caseSignals, cs.id, "process_risk").forEach(s => {
    // Same risk, already stated above in the adviser's own terms. Identity only —
    // a guardrail with no ruleId, or one whose rule is not in the map, always
    // shows. Detection is unchanged; this is presentation.
    const covers = s && s.ruleId ? GUARDRAIL_COVERED_BY_DIRECT_CHECK[s.ruleId] : null;
    if (covers && statedDirectly.has(covers)) return;
    gaps.push(`Unresolved procedural guardrail: "${s.title}"`);
  });

  if (cs.outcome && !(cs.outcomeNotes || "").trim()) {
    gaps.push("Outcome recorded without a documented rationale.");
  }

  return gaps;
}
