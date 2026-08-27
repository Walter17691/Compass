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

export function computeDecisionQualityGaps(cs, allegations, caseSignals) {
  const caseAllegations = (allegations || []).filter(a => a.caseId === cs.id);
  const gaps = [];

  caseAllegations.forEach(a => {
    if (!isFindingStatus(a.status)) {
      gaps.push(`Allegation not yet decided: "${a.title}"`);
      return; // the checks below only make sense once a finding has actually been reached
    }
    if ((a.decisionReasoning || "").trim().length < MIN_REASONING_LENGTH) {
      gaps.push(`Finding recorded with little or no reasoning: "${a.title}"`);
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
    gaps.push(`Unresolved procedural guardrail: "${s.title}"`);
  });

  if (cs.outcome && !(cs.outcomeNotes || "").trim()) {
    gaps.push("Outcome recorded without a documented rationale.");
  }

  return gaps;
}
