// ─────────────────────────────────────────────────────────────────────────
// THE INVESTIGATION REPORT IS A DOCUMENT WITH ITS OWN IDENTITY.
//
// ┌─ IR-0.1: THE DEFECT THIS CLOSES ────────────────────────────────────────┐
// │ "View report" set the report text into letterOutput and navigated to the  │
// │ Letter screen — and set NO document type:                                │
// │                                                                         │
// │   App.jsx:465      const [activeLetter] = useState("outcome")             │
// │   MeetingsTab:415  setLetterOutput(cs.investigationReport); setScreen(LETTER) │
// │   App.jsx:9767     letterType: letterOutput ? activeLetter : null         │
// │                                                                         │
// │ So "Save to case" persisted the INVESTIGATION REPORT as a meeting record  │
// │ carrying letterType:"outcome". caseStage.js then reads                   │
// │   hasOutcome = !!cs.outcome || hasLetterType(meetings,"outcome")          │
// │ and the case silently acquires the OUTCOME stage — a disciplinary outcome │
// │ nobody decided, derived from an internal investigation document.          │
// │                                                                         │
// │ The same mis-typing made the screen title the report "Outcome letter",    │
// │ run employee-directed letter validation on it, show "This draft needs     │
// │ review before it can be used", block download with "Record the outcome    │
// │ first", and offer a Regenerate button that replaces the report with an    │
// │ outcome-letter draft.                                                    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Verified against production before the fix: 2,953 in-scope cases, 873 meetings
// carrying letterOutput, and only 3 meetings with a letterType key at all — ALL
// THREE NULL. Zero non-null letterType values, zero meetings carrying an
// investigation-report section header, zero cases at stage 'outcome'. The defect
// was reachable but had never been triggered. This module prevents it; it repairs
// nothing, because there is nothing to repair.
//
// WHY NOT A NEW DOCUMENT SUBSYSTEM. The vocabulary already exists —
// "investigation-report" is a letter-prompt type in App.jsx, and
// letterValidation.js already excludes it from EMPLOYEE_DIRECTED_LETTER_TYPES
// with the comment "an investigation report is an internal document, not a
// letter to anyone". IR-0 names the type it already had, and no more.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The document type for the investigation report on the Letter screen.
 *
 * The same string letterValidation.js already knows about, so naming it here
 * creates no second vocabulary.
 */
export const INVESTIGATION_REPORT_DOC = 'investigation-report';

export function isInvestigationReportDoc(docType) {
  return docType === INVESTIGATION_REPORT_DOC;
}

/**
 * What the Letter screen may do with this document.
 *
 * ┌─ WHY "SAVE TO CASE" IS REFUSED RATHER THAN RE-TYPED ────────────────────┐
 * │ The report is ALREADY persisted, as cases.investigation_report. Saving it │
 * │ again would write a SECOND copy as a meeting record — an unidentified     │
 * │ duplicate of an existing case document, with no way for any reader to     │
 * │ tell which is authoritative. Correcting the letterType would stop the     │
 * │ outcome-stage corruption but would keep inventing persistence semantics   │
 * │ for an operation that has no meaning. So the action is refused, which is  │
 * │ what the brief asks for where saving is not a meaningful operation.       │
 * │                                                                         │
 * │ REGENERATE is refused for a different reason. On the Letter screen it      │
 * │ calls handleLetter, whose investigation-report prompt receives a thin      │
 * │ ~100-char-per-meeting summary — not the full record, evidence stances,    │
 * │ investigator assessments or structured conclusions that                   │
 * │ concludeInvestigation assembles. It would silently produce a WEAKER        │
 * │ report over a stronger one. Regeneration belongs to the investigation      │
 * │ flow, which IR-0.2 now gates behind an explicit replace decision.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function investigationReportDocActions(docType) {
  if (!isInvestigationReportDoc(docType)) {
    return Object.freeze({ maySaveToCase: true, mayRegenerate: true, reason: null });
  }
  return Object.freeze({
    maySaveToCase: false,
    mayRegenerate: false,
    reason: 'The investigation report is already held on the case. Draft a replacement from the Investigation section, where Compass has the full investigation record.',
  });
}

/** The refusal a write path returns if it is ever asked to persist this document. */
export const INVESTIGATION_REPORT_SAVE_REFUSAL = Object.freeze({
  ok: false,
  reason: 'investigation_report_not_a_letter',
  message: 'The investigation report is already saved on this case. It is not a letter and is not saved again as one.',
});

/**
 * The refusal, or null if this document may be saved normally.
 *
 * A FUNCTION rather than an inline predicate at the call site, because mutation
 * testing showed why: disabling the App-side guard to
 * `if(false && isInvestigationReportDoc(activeLetter))` left every source-text
 * assertion passing. The decision has to live somewhere a test can EXECUTE it,
 * and the call site has to be a shape a short-circuit cannot wear.
 */
export function refuseInvestigationReportSave(docType) {
  return isInvestigationReportDoc(docType) ? INVESTIGATION_REPORT_SAVE_REFUSAL : null;
}

// ─────────────────────────────────────────────────────────────────────────
// IR-SURF-01 — AN INTERNAL CASE DOCUMENT IS NOT CORRESPONDENCE.
//
// ┌─ WHAT IR-0 EXPOSED, AND PARTLY CAUSED ──────────────────────────────────┐
// │ The report is presented through LetterScreen. Before IR-0 it arrived      │
// │ there as activeLetter="outcome", so                                      │
// │   outcomeNotYetDecided = activeLetter==="outcome" && !outcomeRecorded     │
// │ was TRUE on a case with no recorded outcome, and canIssue                 │
// │   = letterIsApproved && !outcomeNotYetDecided && !letterGroundingFailed   │
// │ was false — which incidentally disabled Download, Gmail, Outlook, Send    │
// │ from Compass, Send for acknowledgement, Print and Copy.                  │
// │                                                                         │
// │ Giving the report its correct identity removed that clause. The report is  │
// │ also correctly excluded from EMPLOYEE_DIRECTED_LETTER_TYPES, so grounding  │
// │ passes too. The only remaining gate became one "Approve for sending"      │
// │ click — on an INTERNAL, PRE-DECISION document that contains Compass's own  │
// │ PART 2 advisory interpretation, explicitly labelled "not a finding".      │
// │                                                                         │
// │ The old block was protecting for the wrong reason. This replaces it with  │
// │ the right one: a domain distinction between an internal case document and  │
// │ employee correspondence.                                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ONE classification, consumed everywhere. No string comparisons scattered
// through LetterScreen, and no parallel truth: this extends the identity IR-0
// already established rather than introducing a second one.
// ─────────────────────────────────────────────────────────────────────────

/** Document types that are internal case artefacts, never sent to an employee. */
const INTERNAL_CASE_DOCUMENTS = Object.freeze([INVESTIGATION_REPORT_DOC]);

export function isInternalCaseDocument(docType) {
  return INTERNAL_CASE_DOCUMENTS.includes(docType);
}

/**
 * What may be done with this document.
 *
 * The correspondence capabilities and the EXPORT capabilities are deliberately
 * separated. Export (download / print / copy) is an internal act — an
 * investigator needs a PDF of their own report — and must NOT require
 * "Approve for sending", which is an issuance gate for something leaving the
 * organisation. Coupling them is what made the old canIssue gate do two
 * unrelated jobs.
 *
 * Nothing here changes for a genuine letter: every flag is true and export still
 * requires approval, exactly as before.
 */
export function documentCapabilities(docType) {
  if (!isInternalCaseDocument(docType)) {
    return Object.freeze({
      internal: false,
      label: null,
      mayApproveForSending: true,
      maySendToEmployee: true,
      mayESign: true,
      maySaveAsLetter: true,
      maySwitchDocumentType: true,
      mayExport: true,
      exportRequiresApproval: true,
      mayAskWhy: true,
      mayEditInline: true,
    });
  }
  return Object.freeze({
    internal: true,
    label: 'Investigation report',
    mayApproveForSending: false,
    maySendToEmployee: false,
    mayESign: false,
    maySaveAsLetter: false,
    maySwitchDocumentType: false,
    // Legitimate internal actions, and they do not need issuance approval.
    mayExport: true,
    exportRequiresApproval: false,
    // ── IR-SURF-01a — RESIDUAL LETTER CHROME ────────────────────────────────
    //
    // "Ask why" is LETTER-SPECIFIC and ungrounded here. Its panel is built from
    // `letterSources`, which is populated only by handleLetter (set at
    // App.jsx:11078, cleared at :10859). openInvestigationReport does not touch
    // it, so on this document it shows the PREVIOUS letter's provenance — or
    // nothing — under the heading "This letter's draft", which also talks about
    // "regenerating". Attributing one document's sources to another inside the
    // same case is worse than showing nothing.
    mayAskWhy: false,
    //
    // "Edit letter" is not merely mislabelled — there is nowhere for the edit to
    // GO. The textarea writes to letterOutput (session state), and there is
    // exactly ONE writer of cases.investigation_report in the whole app
    // (concludeInvestigation). With Save-to-case now refused for this document,
    // an edit is silently discarded on navigation. Relabelling it "Edit report"
    // would make a lossy control look legitimate, which the brief explicitly
    // warns against. Editing the report arrives in IR-2, alongside adoption and
    // versions — i.e. once the edit has somewhere to be kept.
    mayEditInline: false,
  });
}

/** The correspondence actions this boundary knows how to refuse. */
export const CORRESPONDENCE_ACTION = Object.freeze({
  APPROVE_FOR_SENDING: 'approve_for_sending',
  GMAIL: 'gmail',
  OUTLOOK: 'outlook',
  SEND_FROM_COMPASS: 'send_from_compass',
  SEND_FOR_ACKNOWLEDGEMENT: 'send_for_acknowledgement',
  E_SIGN: 'e_sign',
  SAVE_AS_LETTER: 'save_as_letter',
});

const REFUSAL_MESSAGE = Object.freeze({
  [CORRESPONDENCE_ACTION.APPROVE_FOR_SENDING]: 'The investigation report is an internal case document. It is not approved for sending, because it is not sent to the employee.',
  [CORRESPONDENCE_ACTION.GMAIL]: 'The investigation report is an internal case document and is not emailed to the employee. Download it if you need a copy.',
  [CORRESPONDENCE_ACTION.OUTLOOK]: 'The investigation report is an internal case document and is not emailed to the employee. Download it if you need a copy.',
  [CORRESPONDENCE_ACTION.SEND_FROM_COMPASS]: 'The investigation report is an internal case document and is not sent to the employee from Compass.',
  [CORRESPONDENCE_ACTION.SEND_FOR_ACKNOWLEDGEMENT]: 'The investigation report is an internal case document. There is nothing for the employee to acknowledge.',
  [CORRESPONDENCE_ACTION.E_SIGN]: 'The investigation report does not carry an employee signature.',
  [CORRESPONDENCE_ACTION.SAVE_AS_LETTER]: 'The investigation report is already saved on this case. It is not a letter and is not saved again as one.',
});

/**
 * Refuse a correspondence action on an internal document, or null to proceed.
 *
 * A FUNCTION at the action boundary, not a hidden button. IR-0's mutation
 * testing established why: a guard asserted only as source text cannot be
 * distinguished from a disabled one, and a hidden control is one UI regression
 * away from being live again. Every refusal below is reachable and executable in
 * a test.
 */
export function refuseCorrespondence(docType, action) {
  if (!isInternalCaseDocument(docType)) return null;
  return Object.freeze({
    ok: false,
    reason: `internal_document_${action}`,
    message: REFUSAL_MESSAGE[action]
      || 'The investigation report is an internal case document and is not sent to the employee.',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// IR-0.2 — REPLACING AN EXISTING REPORT IS A DECISION, NOT A SIDE EFFECT.
//
// When HR returns an investigation, App.jsx:5889 sets stage back to
// "investigation" and LEAVES investigationReport populated. The next step then
// re-offers "Generate investigation report", and concludeInvestigation
// overwrote the returned report in place — no history, no confirmation, and an
// audit entry saying only "Investigation report generated".
//
// IR-0 does not add versioning. So the honest minimum is to make the
// destruction explicit and to say plainly that it is destruction.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The exact wording for the replace decision.
 *
 * Deliberately NOT called "Regenerate": that word hides what happens. And it
 * states the absence of version history rather than implying a recoverable
 * previous draft, because there is none.
 */
export function describeReplaceExistingReport({ reportDate = null, fmtDate = null } = {}) {
  const dated = reportDate && typeof fmtDate === 'function' ? ` (drafted ${fmtDate(reportDate)})` : '';
  return Object.freeze({
    title: 'An investigation report already exists.',
    message: `Drafting another report will REPLACE the current draft${dated}. Compass cannot yet keep previous versions, so the existing text will not be recoverable. If you need to keep it, copy it out before continuing.`,
    confirmLabel: 'Replace current draft',
    cancelLabel: 'Cancel',
  });
}

/** Does this case already hold a report that a new draft would destroy? */
export function hasExistingReport(cs) {
  return typeof cs?.investigationReport === 'string' && cs.investigationReport.trim() !== '';
}

// ─────────────────────────────────────────────────────────────────────────
// IR-0.3 — A GENERATION THAT DID NOT FINISH IS NOT A REPORT.
//
// concludeInvestigation called streamClaude without its onComplete callback, so
// `truncated` (stopReason === "max_tokens") was discarded; then it called
// saveCases WITHOUT a changedId — which takes the fire-and-forget bulk branch —
// and wrote the audit entry and success toast on the next two lines, before any
// persistence result existed.
//
// So Compass could persist a report cut off mid-sentence, announce it as
// generated, advance the case to stage "inv_report", and satisfy
// processTimeline's "did this stage actually happen" check — on output that
// never finished.
// ─────────────────────────────────────────────────────────────────────────

export const REPORT_GENERATION = Object.freeze({
  OK: 'ok',
  /** The model produced nothing usable. */
  EMPTY: 'empty',
  /** Cut off at max_tokens. Never persisted. */
  TRUNCATED: 'truncated',
  /** Generated, but the write did not land. */
  NOT_PERSISTED: 'not_persisted',
  /** A report already exists and no explicit replace decision was given. */
  NEEDS_REPLACE_DECISION: 'needs_replace_decision',
});

/**
 * May this generation be persisted and announced as an investigation report?
 *
 * TRUNCATED IS REFUSED OUTRIGHT, and that is a deliberate choice over keeping a
 * partial draft. IR-0 adds no schema, so there is no column that could say "this
 * text is incomplete" — a truncated report stored in `investigation_report`
 * would be indistinguishable from a finished one to all eleven of its readers,
 * including the disciplinary hearing pack. A partial document that looks
 * complete is the exact integrity defect this slice exists to close, so the
 * honest no-schema behaviour is to refuse the write and offer a retry.
 */
export function assessReportGeneration({ text, truncated = false } = {}) {
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) return Object.freeze({ ok: false, reason: REPORT_GENERATION.EMPTY });
  if (truncated) return Object.freeze({ ok: false, reason: REPORT_GENERATION.TRUNCATED });
  return Object.freeze({ ok: true, reason: REPORT_GENERATION.OK });
}

/** What to tell the manager, per refusal. One place, so the UI cannot drift. */
export function describeReportGeneration(reason) {
  switch (reason) {
    case REPORT_GENERATION.TRUNCATED:
      return 'The report was cut off before it finished, so it has not been saved. Nothing on the case has changed — please try again.';
    case REPORT_GENERATION.EMPTY:
      return 'Failed to generate investigation report';
    case REPORT_GENERATION.NOT_PERSISTED:
      return "The report was drafted but could not be saved, so nothing on the case has changed. Please try again.";
    case REPORT_GENERATION.NEEDS_REPLACE_DECISION:
      return 'An investigation report already exists on this case.';
    default:
      return null;
  }
}
