import { EMPLOYEE_DIRECTED_LETTER_TYPES } from './letterValidation';
import { appealOutcomeMeta, allegationStatusMeta } from './allegations';

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

// Final pre-deployment review (2026-09-16) — "upheld" is genuinely
// ambiguous read in isolation ("the appeal is upheld" vs. "the original
// decision is upheld" are opposite outcomes). APPEAL_OUTCOMES'
// effectOnOriginalDecision (allegations.js) is the single source of truth
// for what each stored value means for the original decision; this makes
// that explicit and unmissable in the grounding text rather than letting
// the model derive it from the bare word "upheld" sitting next to
// "original decision" — the exact conflation risk a naive reading invites.
export function buildAppealOutcomeInstruction(allegation, decidedByName) {
  if (!allegation?.appealOutcome) return "";
  const nl = String.fromCharCode(10);
  const meta = appealOutcomeMeta(allegation.appealOutcome);
  const label = meta?.label || allegation.appealOutcome;
  let text = `- "${allegation.title}"` + nl
    + "  Original finding: " + (allegationStatusMeta(allegation.status)?.label || allegation.status) + nl
    + "  AUTHORITATIVE APPEAL OUTCOME (state exactly this result — never invent or infer a different one): " + label + nl;
  if (meta?.effectOnOriginalDecision) {
    text += "  Effect on the original decision (state this explicitly, exactly as given — the word \"upheld\" above describes whether the APPEAL succeeded, not the original decision, and reading it the other way round would invert the result): " + meta.effectOnOriginalDecision + nl;
  }
  text += "  Appeal decision reasoning, as recorded by the appeal officer (state this — do not invent your own reasons): " + (allegation.appealReasoning || "not recorded") + nl;
  if (decidedByName) text += "  Appeal decided by: " + decidedByName + nl;
  if (allegation.appealDecidedAt) text += "  Appeal decided on: " + new Date(allegation.appealDecidedAt).toLocaleDateString("en-GB");
  return text;
}

// Appeal Invitation UAT P1 remediation (2026-09-19) — root cause of the
// discovered defect: nothing previously told the model the hearing
// date/time/location were separate, deterministic facts distinct from
// caseInfo's generic "Meeting date" (which, for an invitation to a
// hearing that hasn't happened yet, was always the wrong concept — it
// held whatever stale date caseInfo last carried from an unrelated
// interaction). These three facts now come ONLY from the logistics form
// collected before generation (CaseViewScreen.jsx's appeal-invite flow) —
// never from caseInfo.date, a previous meeting, the outcome date, or the
// employee's own location — and are stated here as fixed facts the model
// must use exactly, mirroring buildAppealDeadlineInstruction's own
// "state this, don't calculate/invent" pattern. Callers must NOT also
// include the generic "Meeting date"/employee "Location" lines when this
// instruction is present, to avoid two competing/ambiguous date or
// location facts reaching the model at once.
export function buildAppealHearingLogisticsInstruction(hearingLogistics) {
  if (!hearingLogistics?.date || !hearingLogistics?.time || !hearingLogistics?.locationOrMethod) return "";
  const formatted = new Date(hearingLogistics.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `AUTHORITATIVE HEARING ARRANGEMENTS (already agreed by HR — state these exact facts, never calculate, infer, or substitute a different date/time/location, and never use a bracketed placeholder for any of the three): Date: ${formatted}. Time: ${hearingLogistics.time}. Location/method: ${hearingLogistics.locationOrMethod}. This location/method is the HEARING venue or video-call method — do not confuse it with the employee's own normal work location, which may appear elsewhere in this information and describes a different thing entirely.`;
}

// Appeal Invitation UAT P1 remediation (2026-09-19) — closes the
// discovered gap where cases.appeal_text (the employee's own persisted
// appeal grounds) was never read by the invitation prompt at all for any
// case, populated or not. Deterministic either way: states the exact
// recorded grounds when present (never substituting the original
// allegation, case description, or an AI-detected signal instead), or
// explicitly tells the model grounds are unrecorded so a legacy case
// with no appeal_text yet reads as a known unknown, not an invitation to
// infer or fabricate one.
export function buildAppealGroundsInstruction(appealText) {
  const trimmed = (appealText || "").trim();
  if (trimmed) {
    return `GROUNDS OF APPEAL RAISED BY THE EMPLOYEE (state exactly as given — never substitute the original allegation, case description, or your own inference for this): ${trimmed}`;
  }
  return "GROUNDS OF APPEAL: not recorded in the structured case data. Do not invent, infer, or reconstruct specific grounds from the original allegation, case description, or any other context — state generally that the appeal will be heard, without fabricating detail about what is being appealed.";
}
