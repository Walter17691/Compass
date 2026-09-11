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

// NEW-1 remediation — an outcome letter's appeal deadline used to be
// left entirely to the model's own judgement ("the right of appeal
// within 5 working days", with no anchor point given), so it reliably
// anchored that relative clause to the only date visibly present in its
// own draft: the letter's own document date. That's wrong whenever the
// letter is drafted/redrafted on a later date than the hearing/decision
// itself (routine — review, editing, sign-off delay), because Compass's
// own tracked deadline (#16) is deliberately anchored to
// cs.outcomeIssuedAt instead, specifically so redrafting a letter can
// never silently move the real deadline. Supplying the already-computed,
// authoritative date as a deterministic fact — the same pattern
// buildRecipientInstruction above already established for the
// recipient — closes that gap at generation time; validateFormalLetter
// (letterValidation.js) remains the actual safety net regardless of
// whether the model follows this instruction.
export function buildAppealDeadlineInstruction(appealDeadlineIso, letterType) {
  if (!appealDeadlineIso || letterType !== "outcome") return "";
  const formatted = new Date(appealDeadlineIso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `AUTHORITATIVE APPEAL DEADLINE: ${formatted}. This is the exact, final date already computed under Compass's own ACAS 5-working-day appeal rule from the recorded decision date — it is a known case fact, not something for you to calculate. Do not derive a different date from this letter's own document date, from today's date, or from when this letter happens to be drafted, saved, or regenerated. State this exact date as the appeal deadline (e.g. "you must submit your appeal by ${formatted}"). If you also use relative wording (e.g. "within 5 working days"), it must describe this same date and must not anchor it to the date of this letter — never write that the appeal window runs from the date of this letter, this letter's date, or the date the employee receives this letter, since that could produce a different date than the one given here.`;
}
