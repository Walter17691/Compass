import { HR_NOTE_SOURCES } from './caseTasks';

// Manager Enablement (Phase 4, MP21, §25) — Manager Learning Loop.
// Deterministic collection of the actual text behind MP20's aggregate
// counts — the plan's own "MP20's own aggregated data" phrasing, read as
// "the collected signals across many cases", not full per-case content
// (meeting transcripts, evidence, letters). This is the one input the
// single AI call in App.jsx's generateManagerCapabilityInsight is allowed
// to see.
const MEETING_QUALITY_OVERRIDE_ACTION = "Ended meeting despite quality check gaps";
const POLICY_DEVIATION_ACTION = "Policy deviation recorded";
const MAX_SIGNALS = 60;

// caseTasks: HR intervention notes (MP19's own guidance/question/witness
// case_tasks — sendHrGuidance always prefixes the type into the task
// name, so the raw name already reads well on its own).
// hrReviewRequests: MP11's own "returned" investigation submissions —
// comments is HR's own stated reason for sending it back, when given.
// auditLog: the durable record of M9's live-only quality check (an
// override was logged with a reason) and P7's policy deviations.
export function collectInterventionSignals(caseTasks, hrReviewRequests, auditLog) {
  const signals = [];

  (caseTasks || [])
    .filter(t => HR_NOTE_SOURCES.includes(t.source))
    .forEach(t => signals.push({ type: "hr_intervention", text: t.name, ts: t.createdAt || null }));

  (hrReviewRequests || [])
    .filter(r => r.step === "inv_report" && r.status === "returned" && (r.comments || "").trim())
    .forEach(r => signals.push({ type: "returned_for_rework", text: r.comments.trim(), ts: r.reviewed_at || null }));

  (auditLog || [])
    .filter(e => e.action === MEETING_QUALITY_OVERRIDE_ACTION && (e.detail || "").trim())
    .forEach(e => signals.push({ type: "meeting_quality_gap", text: e.detail.trim(), ts: e.ts || null }));

  (auditLog || [])
    .filter(e => e.action === POLICY_DEVIATION_ACTION && (e.detail || "").trim())
    .forEach(e => signals.push({ type: "policy_deviation", text: e.detail.trim(), ts: e.ts || null }));

  return signals
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
    .slice(0, MAX_SIGNALS);
}

const SIGNAL_TYPE_LABEL = {
  hr_intervention: "HR intervention",
  returned_for_rework: "Returned for rework",
  meeting_quality_gap: "Meeting quality gap",
  policy_deviation: "Policy deviation",
};

// Plain-text prompt body — one line per signal, typed so the model can
// weigh a "returned for rework" reason differently from an ad-hoc
// guidance note, without any case/employee identifiers attached (the
// signal text itself is HR's own free-text reasoning, not a case record).
export function formatSignalsForPrompt(signals) {
  return (signals || []).map(s => "- [" + (SIGNAL_TYPE_LABEL[s.type] || s.type) + "] " + s.text).join("\n");
}

const MAX_CATEGORIES = 5;

// Validates/shapes the AI's raw JSON response — same discipline as
// concernTriage.js's sanitizeTriageSummary and investigationPlan.js's
// sanitizeInvestigationPlanItems: never trust the model's output shape
// directly.
export function sanitizeManagerCapabilityInsight(parsed) {
  const p = parsed || {};
  const categories = Array.isArray(p.categories) ? p.categories : [];
  return {
    categories: categories
      .map(c => ({
        label: typeof c?.label === "string" ? c.label.trim() : "",
        description: typeof c?.description === "string" ? c.description.trim() : "",
        frequency: typeof c?.frequency === "string" ? c.frequency.trim() : "",
      }))
      .filter(c => c.label)
      .slice(0, MAX_CATEGORIES),
    suggestedResponse: typeof p.suggestedResponse === "string" ? p.suggestedResponse.trim() : "",
  };
}
