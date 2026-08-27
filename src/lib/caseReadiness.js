// Pure, deterministic case-quality-and-completeness check — no AI call, so
// it's instant and always current rather than gated behind a button and
// latency, unlike Next Best Action / Unanswered Questions. Deliberately
// reads the same underlying data those two already produce (allegation
// records, evidence-to-allegation links, open unanswered_question
// signals) rather than re-deriving an approximation of its own — that's
// what makes the five ER Intelligence MVP features feel connected rather
// than five isolated panels.
//
// A case quality/completeness indicator only — never described or
// score-gated as a legal compliance check (see the spec's own explicit
// constraint). Only meaningful once a case has recorded allegations;
// cases that don't use allegations at all keep their existing, unchanged
// workflow with no readiness panel shown (see CaseViewScreen).

import { evidenceForAllegation } from './allegations.js';
import { openSignalsForCase } from './caseSignals.js';
import { tasksForCase } from './caseTasks.js';

export const READINESS_STATUSES = [
  { id: "not_ready", label: "Not ready", color: "#C84B2F", bg: "#FEF0EB", min: 0 },
  { id: "needs_review", label: "Needs review", color: "#B87520", bg: "#FEF5E7", min: 40 },
  { id: "mostly_ready", label: "Mostly ready", color: "#1A7A4A", bg: "#E8F5EE", min: 70 },
  { id: "ready", label: "Ready to progress", color: "#1A7A4A", bg: "#E8F5EE", min: 100 },
];

export function readinessStatusForScore(score) {
  return [...READINESS_STATUSES].reverse().find(s => score >= s.min) || READINESS_STATUSES[0];
}

export function computeCaseReadiness(cs, allegations, caseSignals, caseTasks) {
  const caseAllegations = (allegations || []).filter(a => a.caseId === cs.id);
  const evidence = cs.evidence || [];
  const openQuestions = openSignalsForCase(caseSignals, cs.id, "unanswered_question");
  const openTasks = tasksForCase(caseTasks, cs.id).filter(t => t.status !== "done");

  const checks = [
    {
      id: "allegations_recorded",
      label: "Allegations clearly recorded",
      met: caseAllegations.length > 0 && caseAllegations.every(a => a.title?.trim() && a.description?.trim()),
      detail: caseAllegations.length === 0 ? "No allegations recorded yet." : "One or more allegations is missing a description.",
    },
    {
      id: "employee_responded",
      label: "Employee given the opportunity to respond",
      met: caseAllegations.some(a => a.employeeResponse?.trim()),
      detail: "No employee response has been recorded against any allegation.",
    },
    {
      id: "evidence_linked",
      label: "Evidence linked to each allegation",
      met: caseAllegations.length > 0 && caseAllegations.every(a => evidenceForAllegation(evidence, a.id).length > 0),
      detail: "At least one allegation has no evidence linked to it.",
    },
    {
      id: "no_open_questions",
      label: "No unanswered questions outstanding",
      met: openQuestions.length === 0,
      detail: openQuestions.length === 1 ? "1 unanswered question is still open." : `${openQuestions.length} unanswered questions are still open.`,
    },
    {
      id: "no_open_tasks",
      label: "No open case tasks remaining",
      met: openTasks.length === 0,
      detail: openTasks.length === 1 ? "1 case task is still open." : `${openTasks.length} case tasks are still open.`,
    },
  ];

  const metCount = checks.filter(c => c.met).length;
  const score = Math.round((metCount / checks.length) * 100);

  return {
    applicable: caseAllegations.length > 0,
    score,
    status: readinessStatusForScore(score),
    checks,
    gaps: checks.filter(c => !c.met),
  };
}
