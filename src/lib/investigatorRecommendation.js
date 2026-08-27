import { openSignalsForCase } from './caseSignals.js';
import { INVESTIGATION_CHECKLIST_STEPS } from './investigationChecklist.js';

// Manager Enablement (Phase 4, MP9, §8) — the one piece
// InvestigatorChecklistView was missing: a single "what should I do
// next" line, deterministic (same pure-function style as
// decisionQuality.js's computeDecisionQualityGaps — no AI call, no
// free-form text), combining three sources in priority order:
//
//   1. An unresolved procedural guardrail (process_risk signal) — a real
//      compliance risk already flagged elsewhere in the app; nothing
//      else matters more until it's addressed.
//   2. The next open item on MP8's case-specific investigation plan — a
//      concrete, grounded action, more useful than a generic step.
//   3. The next incomplete step on the fixed 7-step checklist — the
//      fallback every investigator has always had.
//
// Returns null once every source is exhausted (nothing left to
// recommend), rather than a hollow "well done" placeholder — the caller
// decides how to present that state.
export function computeInvestigatorRecommendation(cs, checklistTasks, planTasks, caseSignals) {
  const guardrails = openSignalsForCase(caseSignals, cs.id, "process_risk");
  if (guardrails.length) {
    return { text: `Resolve a flagged procedural guardrail: "${guardrails[0].title}"`, kind: "guardrail" };
  }

  const openPlanItem = (planTasks || []).find(t => t.status !== "done");
  if (openPlanItem) {
    return { text: openPlanItem.name, kind: "plan" };
  }

  const nextStep = INVESTIGATION_CHECKLIST_STEPS.find(step => {
    const task = (checklistTasks || []).find(t => t.name === step.label);
    return !task || task.status !== "done";
  });
  if (nextStep) {
    return { text: nextStep.label, kind: "checklist" };
  }

  return null;
}
