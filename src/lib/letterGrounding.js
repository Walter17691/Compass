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

// Procedural placeholder remediation (2026-09-19) — the appeal-hearing
// invitation's own additions to the shared letterInstructions["invite"]
// string, extracted here (rather than inlined in App.jsx) so the rules can
// be asserted directly, alongside the other prompt-instruction builders
// above. Returns "" for every letter that is not a structured appeal-hearing
// invitation, so disciplinary/grievance invitations keep the shared
// instruction exactly as it was.
//
// Two rules, both narrow:
//  1. Logistics — the three human-entered facts are authoritative and must be
//     stated verbatim, never placeholdered (see
//     buildAppealHearingLogisticsInstruction).
//  2. Deadlines — Compass holds NO authoritative employer deadline for an
//     appeal hearing: no organisation/policy/case/letter setting exists, and
//     deadlines.js covers only the outcome-letter, appeal-window and
//     grievance-acknowledgement ACAS timings, none of which apply. The shared
//     instruction's "use a placeholder such as [X working days]" rule is the
//     wrong answer to a genuinely unknown employer deadline — it either ships
//     unresolved to the employee or invites HR to invent a policy in the
//     editor. Omitting the number states nothing false while keeping the
//     instruction operationally useful. This deliberately does NOT substitute
//     a default figure, and does not introduce a statutory one.
export function buildAppealInvitationInstructionOverride(hearingLogistics) {
  if (!hearingLogistics) return "";
  return " The hearing date, time, and location/method are already agreed and given as AUTHORITATIVE HEARING ARRANGEMENTS in the information below — state those exact facts for this letter's date/time/location, do not use a bracketed placeholder for any of the three, and do not invent or calculate a different value."
    + " IMPORTANT — DEADLINES: Compass holds no authoritative employer deadline for this hearing, so this letter must not state any specific number of days anywhere, and must NOT use a bracketed deadline placeholder such as [X working days], [X days], [insert number of days] or [deadline]. The general instruction above about using a placeholder for deadlines does NOT apply to this letter. Omit the numeric deadline entirely and use neutral wording that is still operationally useful — for example 'please do so sufficiently in advance of the hearing for it to be considered', 'please confirm your attendance as soon as possible', or 'if you intend to be accompanied, please let us know the name and role of your companion as soon as possible'. For the same reason, do not state any fixed period within which a rearranged or postponed hearing must fall, and do not attribute such a period to the ACAS Code — if the date or time is unsuitable, simply invite the employee to contact you as soon as possible.";
}

// Appeal independence P1 (Human UAT, 2026-09-20) — a live production
// invitation asserted "...considered by a manager who was not involved in
// the original disciplinary process" and named the chair as someone "who was
// not involved in the original investigation or disciplinary hearing", on a
// legacy case the appointment flow had explicitly classified as UNKNOWN. No
// prompt asked for those sentences and nothing verified them: the model
// inferred them from "Follow ACAS Code of Practice" plus a bare chair name.
//
// An authorised exceptional appointment does not make a false statement
// true, so CONFLICT gets the same employee-facing treatment as UNKNOWN: say
// who is chairing, say nothing about prior involvement. The override reason,
// the HR confirmation text and the internal classification itself are all
// deliberately absent from the returned instruction — none of them belong in
// a letter to the employee.
//
// Scoped narrowly: this constrains claims about THE OFFICER'S PRIOR
// INVOLVEMENT only. Ordinary process wording ("the appeal will be considered
// fairly and impartially") is legitimate and is explicitly left alone.
export function buildAppealIndependenceInstruction(status, officerName) {
  const chair = (officerName || "").trim();
  const chairPhrase = chair ? `"The appeal hearing will be chaired by ${chair}."` : '"The appeal hearing will be chaired by the appointed appeal officer."';

  if (status === "clear") {
    return "APPEAL OFFICER INDEPENDENCE: Compass holds structured evidence that the appointed appeal officer did not decide the original outcome. You may state, factually and briefly, that the appeal will be heard by someone who was not involved in the original decision. Do not overstate this beyond what is asked for here.";
  }

  if (status === "unknown" || status === "conflict") {
    return "APPEAL OFFICER INDEPENDENCE — NOT VERIFIED: Compass has NOT established that the appeal officer was uninvolved in the original process, so this letter must not say or imply otherwise."
      + " Do NOT state that the officer was not involved, had no involvement, took no part, was not previously involved, or is independent of the original disciplinary process, and do NOT say that their independence or impartiality has been checked, verified or confirmed."
      + ` State only who is chairing, in neutral terms such as ${chairPhrase}`
      + " You may still describe the appeal process itself as being conducted fairly and impartially — that is a statement about how the hearing will be run, not a claim about this person's history, and it remains appropriate.";
  }

  return "";
}
