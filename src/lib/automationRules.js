// Integrations & Workflow Automation (Phase 5, IP5, §22) — a configurable
// WHEN/THEN rule evaluator over existing case data, generalizing the
// single hard-coded "next action" nextStep.js already computes (one
// stage-driven suggestion per case) into a list of independent,
// individually-triggered suggestions. Suggest-level only: every rule
// here just proposes, nothing executes anything — matching the spec's
// Suggest -> Prepare -> Automate ladder (later IP28 adds Prepare/Automate
// execution against real actions elsewhere in this phase; this file
// deliberately stays read-only).
//
// Each rule reads data other lib/ modules already compute or App.jsx
// already loads (caseSignals, caseTasks) rather than deriving a second
// approximation of the same thing — e.g. the unanswered-question and
// process-risk rules read the exact same open-signal rows
// UnansweredQuestionsPanel/GuardrailsPanel already render, just re-framed
// as "you might want to act on this" rather than "here is a finding".

import { openSignalsForCase } from './caseSignals.js';
import { tasksForCase } from './caseTasks.js';
import { isTerminalStatus } from './eSignature.js';
import { parseFlexDate } from './dateMath.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Elapsed-time (not calendar-day) diff, kept as its own function rather
// than dateMath.js's daysBetween — recentlyReminded below needs a true
// rolling 24h cooldown, not a "which calendar day" comparison, so it
// still floor-divides raw milliseconds. Only the parsing itself is
// shared with dateMath.js now, since case_tasks.due_date and meeting
// dates can be UK-format "DD/MM/YYYY" text, which the old bare
// `new Date(iso)` here would have silently mis-parsed as MM/DD/YYYY.
function daysSince(iso, now) {
  const then = parseFlexDate(iso);
  if (!then) return null;
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

// Integrations & Workflow Automation (Phase 5, IP28, §22-23) — a meeting
// whose reminder was already resent (App.jsx's resendSignatureReminder,
// stamping reminderSentAt) shouldn't immediately re-trigger the same
// rule again — that's what would let an Automate-level reminder spam an
// employee on every case view. 24h, same cooldown shape as this rule's
// own 5-day staleness threshold, just much shorter since a reminder is
// a lighter-touch action than the original send.
function recentlyReminded(m, now) {
  if (!m.reminderSentAt) return false;
  return daysSince(m.reminderSentAt, now) < 1;
}

// Each rule: {id, category, when(ctx) -> boolean, then(ctx) -> {label, reason, meetingType?}}.
// `then` is a function, not a static object, so its label/reason can cite
// the actual count/date that triggered it — the same way nextStep.js's
// own reason strings do — rather than a generic "something needs
// attention" that tells HR nothing they didn't already know.
export const AUTOMATION_RULES = [
  {
    id: "unsigned_meeting_record_stale",
    category: "signature",
    when: ({ cs, now }) => (cs.meetings || []).some(m => m.record && m.signId && !isTerminalStatus(m.signStatus) && daysSince(m.date, now) >= 5 && !recentlyReminded(m, now)),
    then: ({ cs, now }) => {
      const stale = (cs.meetings || []).filter(m => m.record && m.signId && !isTerminalStatus(m.signStatus) && daysSince(m.date, now) >= 5 && !recentlyReminded(m, now));
      const oldest = stale.reduce((a, b) => daysSince(a.date, now) > daysSince(b.date, now) ? a : b);
      return {
        label: stale.length === 1 ? "Chase signature on meeting record" : `Chase signature on ${stale.length} meeting records`,
        reason: `${oldest.type || "A meeting"} record from ${daysSince(oldest.date, now)} days ago is still unsigned.`,
        meetingType: oldest.type,
        // Integrations & Workflow Automation (Phase 5, IP28, §22-23) —
        // the real meeting objects behind this suggestion, only ever
        // read by execution wiring for automatable rules (see
        // lib/automationLevels.js's AUTOMATABLE_RULE_IDS) — the other
        // three rules in this file have no equivalent field, by design,
        // since they have no automatable action to execute against.
        meetings: stale,
      };
    },
  },
  {
    id: "overdue_task",
    category: "task",
    when: ({ caseTasks, cs, now }) => tasksForCase(caseTasks, cs.id).some(t => t.status !== "done" && parseFlexDate(t.dueDate)?.getTime() < now.getTime()),
    then: ({ caseTasks, cs, now }) => {
      const overdue = tasksForCase(caseTasks, cs.id).filter(t => t.status !== "done" && parseFlexDate(t.dueDate)?.getTime() < now.getTime());
      return {
        label: overdue.length === 1 ? "Review overdue task" : `Review ${overdue.length} overdue tasks`,
        reason: overdue.length === 1 ? `"${overdue[0].name}" was due ${overdue[0].dueDate}.` : `${overdue.length} case tasks are past their due date.`,
      };
    },
  },
  {
    id: "unanswered_question_stale",
    category: "review",
    when: ({ cs, caseSignals, now }) => openSignalsForCase(caseSignals, cs.id, "unanswered_question").some(s => daysSince(s.createdAt, now) >= 3),
    then: ({ cs, caseSignals, now }) => {
      const open = openSignalsForCase(caseSignals, cs.id, "unanswered_question");
      const maxAge = Math.max(...open.map(s => daysSince(s.createdAt, now)));
      return {
        label: open.length === 1 ? "Answer outstanding question" : `Answer ${open.length} outstanding questions`,
        reason: `${open.length === 1 ? "An unanswered question has" : `${open.length} unanswered questions have`} been open for ${maxAge}+ days.`,
      };
    },
  },
  {
    id: "process_risk_open",
    category: "risk",
    when: ({ cs, caseSignals }) => openSignalsForCase(caseSignals, cs.id, "process_risk").length > 0,
    then: ({ cs, caseSignals }) => {
      const open = openSignalsForCase(caseSignals, cs.id, "process_risk");
      return {
        label: open.length === 1 ? "Review procedural guardrail flag" : `Review ${open.length} procedural guardrail flags`,
        reason: open[0]?.title || "A procedural risk has been flagged on this case.",
      };
    },
  },
];

// Pure — never mutates cs/caseTasks/caseSignals, never calls out to
// anything. `now` is injectable (defaults to the real clock) purely so
// tests don't depend on wall-clock time.
export function evaluateAutomationRules(cs, { caseTasks = [], caseSignals = [], now = new Date() } = {}) {
  const ctx = { cs, caseTasks, caseSignals, now };
  return AUTOMATION_RULES
    .filter(rule => {
      try { return rule.when(ctx); } catch { return false; }
    })
    .map(rule => ({ ruleId: rule.id, category: rule.category, ...rule.then(ctx) }));
}
