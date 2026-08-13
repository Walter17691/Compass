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
