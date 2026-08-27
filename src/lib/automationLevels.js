// Integrations & Workflow Automation (Phase 5, IP28, §22-23) — Prepare
// (Compass drafts, HR approves) and Automate (Compass performs an
// approved low-risk administrative action automatically) execution
// modes, built directly on IP5's read-only Suggest-level rule engine
// (lib/automationRules.js) rather than a second, parallel rule system.

import { capLevelForSafety, RULE_ACTION_TYPE } from './automationSafety.js';

export const AUTOMATION_LEVELS = ["suggest", "prepare", "automate"];
export const DEFAULT_AUTOMATION_LEVEL = "suggest";

export const AUTOMATION_LEVEL_LABEL = {
  suggest: "Suggest",
  prepare: "Prepare",
  automate: "Automate",
};

export const AUTOMATION_LEVEL_DESCRIPTION = {
  suggest: "Compass flags it for HR to review — nothing is drafted or sent.",
  prepare: "Compass drafts the action; HR reviews and approves it with one click.",
  automate: "Compass performs the action automatically once, then leaves it for HR to follow up.",
};

// The one rule (of automationRules.js's four) with a real, safe,
// purely-administrative action behind it — resending a signature
// reminder for a meeting record that's already been sent and is just
// sitting unsigned. The other three (overdue_task, unanswered_question_
// stale, process_risk_open) are "look at this" prompts with no
// automatable artifact — Suggest is their only level, by design, not
// an oversight. An org's automation_levels config can never elevate a
// rule not in this list — see getAutomationLevel below.
export const AUTOMATABLE_RULE_IDS = ["unsigned_meeting_record_stale"];

export function isAutomatable(ruleId) {
  return AUTOMATABLE_RULE_IDS.includes(ruleId);
}

// automationLevels: the org's own {ruleId: level} config (organisations.
// automation_levels). Any ruleId not in AUTOMATABLE_RULE_IDS always
// reads "suggest" regardless of what's stored against it. The actual
// safety boundary is capLevelForSafety below (Phase 5, IP29, §24) — an
// org picking "Automate" for a rule whose real action type is on the
// spec's never-automate list (lib/automationSafety.js) is silently
// capped to "Prepare", never trusted at face value.
export function getAutomationLevel(automationLevels, ruleId) {
  if (!isAutomatable(ruleId)) return DEFAULT_AUTOMATION_LEVEL;
  const level = automationLevels?.[ruleId];
  const resolved = AUTOMATION_LEVELS.includes(level) ? level : DEFAULT_AUTOMATION_LEVEL;
  return capLevelForSafety(resolved, RULE_ACTION_TYPE[ruleId]);
}

export function automationLevelLabel(level) {
  return AUTOMATION_LEVEL_LABEL[level] || level;
}
