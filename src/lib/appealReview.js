// Phase 19 of the reasoning-layer build-out (Advanced Appeal Workspace,
// scale/commercialisation wave). Pure helpers only — the AI extraction of
// grounds of appeal from the appeal meeting transcript lives in App.jsx
// (it needs a real Claude call), same split as every other AI-copilot
// feature this build-out added.

import { parseFlexDate } from './dateMath.js';

// Evidence added after the original finding was recorded (Phase 16's
// decidedAt) is exactly what an appeal review needs surfaced — it wasn't
// weighed in the finding being appealed. Mirrors guardrails.js's own
// "evidence after report" check, one stage later in the case's life.
export function newEvidenceSinceFinding(evidence, allegation) {
  const decidedDate = parseFlexDate(allegation?.decidedAt);
  if (!decidedDate) return [];
  return (evidence || [])
    .map((e, index) => ({ ...e, index }))
    .filter(e => { const d = parseFlexDate(e.date); return d && d > decidedDate; });
}

// An appeal meeting is any saved meeting whose type mentions "appeal"
// with a real record to extract grounds from — matches the same
// case-insensitive substring convention meeting-type checks already use
// throughout this codebase (e.g. deadlines.js/caseStage.js).
export function appealMeetingsForCase(cs) {
  return (cs?.meetings || []).filter(m => (m.type || "").toLowerCase().includes("appeal") && m.record);
}

// Process Intelligence (P13) — restructures the appeal review from one
// combined blob per allegation to one card per distinct ground of
// appeal (an allegation can have several — e.g. "the sanction was
// disproportionate" and "new evidence wasn't considered" both aimed at
// the same finding). case_signals has no per-field JSONB column to hold
// these four separately without a migration, so they're encoded as
// labelled sections within the signal's own `reasoning` text — same
// "structured content inside a text field" pattern P7's policy
// deviation record already uses — and parsed back out here for display.
const GROUND_FIELDS = [
  ["ground", "Ground: "],
  ["employeeArgument", "Employee's argument: "],
  ["compassReview", "Compass review: "],
  ["potentialIssue", "Potential issue: "],
];

export function formatAppealGroundReasoning({ ground, employeeArgument, compassReview, potentialIssue }) {
  const values = { ground, employeeArgument, compassReview, potentialIssue };
  return GROUND_FIELDS.filter(([key]) => values[key]).map(([key, label]) => label + values[key]).join("\n\n");
}

export function parseAppealGroundReasoning(reasoning) {
  const text = reasoning || "";
  const positions = GROUND_FIELDS
    .map(([key, label]) => ({ key, label, index: text.indexOf(label) }))
    .filter(p => p.index !== -1)
    .sort((a, b) => a.index - b.index);
  const result = { ground: "", employeeArgument: "", compassReview: "", potentialIssue: "" };
  positions.forEach((p, i) => {
    const from = p.index + p.label.length;
    const to = i + 1 < positions.length ? positions[i + 1].index : text.length;
    result[p.key] = text.slice(from, to).trim();
  });
  return result;
}
