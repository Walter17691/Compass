// Integrations & Workflow Automation (Phase 5, IP29, §24) — extends the
// real, existing APPROVAL_ACTIONS precedent (lib/approvals.js) into the
// spec's own explicit "never automate" list. Enforced at IP28's
// Automate-level execution boundary (lib/automationLevels.js's
// getAutomationLevel, the one function every caller — the suggestions
// panel, any future execution surface — already goes through), not as a
// second, optional check callers might forget. Prepare is unaffected: a
// hard-listed action can still be drafted for HR to approve — "AI
// proposes, HR approves" is exactly what Prepare already is. Only
// Automate (nothing a human clicks) is off the table for these.
export const NEVER_AUTOMATE_ACTIONS = [
  { id: "suspension", label: "Suspension" },
  { id: "disciplinary_sanction", label: "Disciplinary sanction" },
  { id: "dismissal", label: "Dismissal" },
  { id: "grievance_rejection", label: "Rejecting a grievance" },
  { id: "appeal_rejection", label: "Rejecting an appeal" },
  { id: "discrimination_determination", label: "A discrimination determination" },
  { id: "redundancy_selection", label: "Redundancy selection" },
  { id: "contractual_term_change", label: "A contractual term change" },
  { id: "high_impact_correspondence", label: "High-impact outcome correspondence sent without approval" },
];

export function isNeverAutomate(actionType) {
  return NEVER_AUTOMATE_ACTIONS.some(a => a.id === actionType);
}

// Every automatable rule (lib/automationLevels.js's AUTOMATABLE_RULE_IDS)
// must declare what kind of action it performs — a bare rule id carries
// no information to check against the list above. An automatable rule
// with no entry here fails closed (see canAutomateRule), so adding a
// rule to AUTOMATABLE_RULE_IDS without registering its action type here
// can never accidentally reach Automate.
export const RULE_ACTION_TYPE = {
  unsigned_meeting_record_stale: "administrative_reminder",
};

// Generic and independently testable against any (level, actionType)
// pair, not just the real registered ones — the actual safety net,
// downgrading Automate to Prepare (never all the way to Suggest — a
// hard-listed action can still be drafted, just never auto-executed)
// whenever the action type is on the never-automate list.
export function capLevelForSafety(level, actionType) {
  if (level === "automate" && isNeverAutomate(actionType)) return "prepare";
  return level;
}

// Fails closed: an automatable rule with no registered action type can
// never automate, rather than defaulting to "safe until proven
// dangerous".
export function canAutomateRule(ruleId) {
  const actionType = RULE_ACTION_TYPE[ruleId];
  if (!actionType) return false;
  return !isNeverAutomate(actionType);
}
