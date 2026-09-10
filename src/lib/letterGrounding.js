import { EMPLOYEE_DIRECTED_LETTER_TYPES } from './letterValidation';

// Defect #20 remediation — every real call site that starts a fresh
// letter draft does setCaseInfo(...) then calls handleLetter(...)
// synchronously in the same handler. handleLetter (App.jsx) is a plain
// closure over caseInfo state; the setCaseInfo call only schedules that
// update, it isn't visible to handleLetter's own closure until App.jsx
// re-renders — so handleLetter read whatever caseInfo held from the LAST
// completed render, not the value the caller just computed. This showed
// up in production as an empty employee name at the exact moment
// handleLetter built its AI prompt context and ran its own immediate
// validation call, even though the caller had just set the correct one.
// overrides lets a caller supply the value it just computed directly,
// removing the dependency on React's update timing entirely — caseInfo
// itself is still also updated by those same callers (other UI reads it
// reactively; LetterScreen's own validation reads it after settling), this
// is purely an additional, immediate, non-stale source for this one call.
export function resolveLetterGrounding({ caseInfo, overrides = {} } = {}) {
  return {
    employee: overrides.employeeName ?? caseInfo?.employee,
    manager: overrides.manager ?? caseInfo?.manager,
    date: overrides.date ?? caseInfo?.date,
  };
}

// Defect #11/#19/#20 remediation — an employee-directed formal letter's
// recipient is a deterministic fact Compass already knows once
// employeeName is resolved, not something the model should be left to
// infer from free-text case narrative (where another real person — e.g.
// the reporting manager — is often named more prominently than the
// employee actually being written to; this is the exact original #11
// repro, and #19's own production reproduction still showed the model
// drifting even with the fact correctly supplied). Only produced when the
// fact is actually known and the letter type is genuinely employee-
// directed (see EMPLOYEE_DIRECTED_LETTER_TYPES — e.g. never for a witness
// invitation, which is legitimately addressed to someone else).
// validateFormalLetter (letterValidation.js) remains the actual safety
// net regardless of whether the model follows this instruction — this is
// a generation-quality improvement, not a replacement for it.
export function buildRecipientInstruction(employeeName, letterType) {
  if (!employeeName || !EMPLOYEE_DIRECTED_LETTER_TYPES.includes(letterType)) return "";
  return `INTENDED RECIPIENT: ${employeeName}. Address this letter to this exact person, by this exact name, in both the recipient block and the salutation ("Dear ${employeeName},"). Do not address it to any other person named in this case's context (e.g. a manager, witness, or reporting colleague) even if they are mentioned prominently elsewhere. Do not leave the recipient's name as a placeholder (e.g. [Employee Name]) — this fact is already known and must be used exactly as given.`;
}
