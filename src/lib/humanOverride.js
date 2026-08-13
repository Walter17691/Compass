// Process Intelligence (Phase 3, P1) — Human Override primitive. A
// significant override (skipping a guardrail, departing from policy,
// proceeding past a quality-check gap) deserves a different audit trail
// than a routine "leave this screen" cancel: this asks for one optional
// short reason and, if given, records it — so a future reviewer sees WHY
// the gap was left unresolved, not just an unexplained one. Never blocks:
// leaving the reason blank still proceeds, matching every "advisory only"
// gate already built in this codebase (M9's Meeting Quality Check,
// procedural guardrails).
//
// Takes promptDialogFn/auditFn as parameters rather than importing them —
// both are App.jsx closures over component state (confirmState/auditLog),
// not standalone importable functions — so this stays a plain, pure,
// unit-testable composition rather than a hook, the same shape as every
// other src/lib/*.js helper in this codebase.
export async function requestOverride(promptDialogFn, auditFn, label, { caseId=null, actionLabel="Proceeded despite unresolved warning" } = {}) {
  const values = await promptDialogFn({
    title: "Proceed anyway?",
    message: `You're proceeding without resolving: ${label}`,
    fields: [{ key:"reason", label:"Reason (optional)", placeholder:"Why are you proceeding despite this?" }],
    confirmLabel: "Proceed",
  });
  if(!values) return false;
  const reason = (values.reason||"").trim();
  if(reason) auditFn(actionLabel, `${label} — ${reason}`, caseId);
  return true;
}

// Process Intelligence (P7) — a guardrail or recommendation backed by a
// specific, quoted policy clause (P4/P5/P6) is a different kind of
// override to plain requestOverride above: proceeding past it is a real,
// documented departure from company policy, not just an unresolved
// warning. Records a stable, consistently-templated audit entry —
// "Policy expectation: ... — Actual: ... — Reason: ..." — always under
// the same action label ("Policy deviation recorded"), so a future
// reviewer sees exactly what the policy expected, what happened
// instead, and why, not an unexplained gap or a wall of free prose.
// "Actual" is required (there's a real departure to describe); "Reason"
// stays optional, same as every other override in this codebase.
export async function requestPolicyDeviation(promptDialogFn, auditFn, { policyName, clauseHeading, clauseText, caseId=null }) {
  const values = await promptDialogFn({
    title: "Record a policy deviation",
    message: `Your ${policyName} policy${clauseHeading?" ("+clauseHeading+")":""} says: "${clauseText}". What will actually happen, and why?`,
    fields: [
      { key:"actual", label:"What will actually happen", required:true, placeholder:"e.g. Hearing held with 3 working days' notice" },
      { key:"reason", label:"Reason (optional)", placeholder:"Why is this happening instead?" },
    ],
    confirmLabel: "Record and proceed",
  });
  if(!values) return false;
  const actual = (values.actual||"").trim();
  const reason = (values.reason||"").trim();
  const detail = `Policy expectation: "${clauseText}" — Actual: ${actual}` + (reason ? ` — Reason: ${reason}` : "");
  auditFn("Policy deviation recorded", detail, caseId);
  return true;
}
