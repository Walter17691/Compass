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
  // Phase 6.5 hardening (closes independent audit finding 5.6) — was
  // `if(reason) auditFn(...)`, so the fastest, most common path through
  // this dialog (confirm with the reason left blank) left no audit
  // record at all that an override happened — indistinguishable from
  // the guardrail never having fired. This module's own stated purpose
  // is "a future reviewer sees WHY the gap was left unresolved" — that
  // requires recording that a gap WAS left unresolved unconditionally;
  // the reason can stay optional, the event can't. Matches
  // requestPolicyDeviation's own unconditional auditFn call just below.
  auditFn(actionLabel, reason ? `${label} — ${reason}` : `${label} — no reason given`, caseId);
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

// Phase 6.5 hardening (closes Prompt 16 audit finding H9, HIGH) — "Mark
// signed" (a meeting record or witness statement's signStatus) used to be
// a single, unconfirmed click that set signStatus:"signed" directly, with
// no attestation of how a genuine signature was actually obtained and no
// audit trail distinguishing it from a real e-signature captured through
// Compass's own signing_requests flow. This matters beyond appearances:
// caseStage.js's own inferDisciplinaryStage/inferGrievanceStage read
// signStatus==="signed" directly to decide whether a case is "closed",
// so an unconfirmed click could make Compass believe an outcome had
// genuinely been signed for when it hadn't — suppressing appeal-window
// tracking on a case that was never actually acknowledged. Required (not
// optional, unlike requestOverride's reason) — this action's whole
// purpose is asserting a fact Compass can't independently verify, so an
// unexplained assertion is exactly the gap being closed.
export async function requestManualSignatureConfirmation(promptDialogFn, auditFn, { itemLabel, caseId=null } = {}) {
  const values = await promptDialogFn({
    title: "Confirm signature obtained outside Compass",
    message: `Marking "${itemLabel}" as signed records that a genuine signature was obtained outside Compass's own e-signature flow — e.g. a signed paper copy. Describe how and when it was actually signed.`,
    fields: [{ key:"detail", label:"How and when was this signed?", required:true, placeholder:"e.g. Signed paper copy handed to HR on 12 March 2026" }],
    confirmLabel: "Confirm signed",
  });
  if(!values) return false;
  const detail = (values.detail||"").trim();
  auditFn("Marked signed outside Compass", `${itemLabel} — ${detail}`, caseId);
  return true;
}
