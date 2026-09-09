import { isAppealMeeting, isDisciplinaryMeeting, isInvestigationMeeting, isGrievanceMeeting } from './meetingTypeMatch.js';

// Stage-inference heuristics, one per case-type "shape". Disciplinary
// (investigation -> inv_report -> disciplinary -> outcome -> appeal ->
// closed) is the default and covers misconduct/capability/attendance/etc
// — anything without its own table below. Grievance (ACAS S6) has no
// separate investigation-vs-hearing split the way disciplinary does, so
// it collapses to intake -> hearing -> outcome -> appeal -> closed.
// DevelopScreen's own probation/appraisal/PDP flow (a genuinely separate,
// already-working system) stays exactly as it is — this is specifically
// for the regular case flow's own "probation"/"flexible working"/
// "long-term sickness" case types (already selectable in the quick-create
// dropdown, or new here), which had no dedicated stage tracking at all
// before Process Intelligence (P2) — see processStages.js for the full
// per-type stage registry these heuristics return ids from.
// Human UAT remediation, Batch 1, Issue 1 — this used to also check
// "hasSigned&&hasOutcome" to infer "closed", conflating a MEETING's own
// signStatus (whether the employee has signed/acknowledged that specific
// meeting's notes — a document-level fact) with the CASE's own lifecycle
// stage. signStatus says nothing about which meeting was signed or what
// its content was — an investigation meeting's notes being signed for
// acknowledgement is a completely routine, mid-process event, not a
// signal the case is done. Real case closure is always an explicit,
// separate action (the "Close case" button/next-step, which writes
// cs.stage="closed" directly — see CaseViewScreen.jsx) and is already
// caught by getCaseStage()'s own "an explicitly-tracked stage always
// wins" check above this function; this heuristic only ever runs for
// cases with no tracked stage at all, so it has no legitimate reason to
// guess "closed" from a document-signing fact it can't actually verify
// means what it's assuming.
// Human UAT remediation, Batch 2 hardening — letterOutput alone never
// recorded which letter category produced it (outcome vs invite vs appeal
// vs suspension), so "some meeting has a letterOutput" could not actually
// distinguish a genuine outcome from a disciplinary/appeal hearing
// invitation — drafting and saving an invitation set this exact same
// field, and every consumer that inferred "an outcome/appeal-outcome
// exists" from letterOutput's mere presence (this file, nextStep.js,
// App.jsx's getCaseStatus, deadlines.js, processTimeline.js) was equally
// fooled by it. App.jsx's saveMeetingToCaseImpl now also stamps
// letterType (the same identity already sent to /api/send-letter when a
// letter is actually sent) alongside letterOutput; this checks that
// identity when it's known, and only falls back to the old any-
// letterOutput heuristic for meetings saved before this fix existed,
// whose real letter type was never recorded and can't be recovered.
export function hasLetterType(meetings, type) {
  return (meetings||[]).some(m => m.letterOutput && (m.letterType ? m.letterType === type : true));
}

// Defect #17 remediation — cs.outcome (the actual, HR-write-protected
// decision — see protect_case_hr_only_columns in
// warning_duration_outcome_metadata_2026-09-09.sql) is now checked ahead
// of the legacy hasLetterType heuristic, matching the convention every
// other case-type's own inference function already used (inferProbationStage/
// inferFlexibleWorkingStage/inferLongTermSicknessStage below all check
// cs.outcome directly and always have). Before this, a disciplinary
// decision recorded via OutcomeTab/OutcomeModal (which sets cs.outcome
// immediately, independent of whether its letter was ever drafted or
// saved) left the case stuck inferring "disciplinary" until someone
// separately saved an outcome letter onto a meeting — which orphaned the
// only UI route to that letter, since nextStep.js's "disciplinary" stage
// branch checks hearing-signature before it ever checks for an outcome at
// all (see disciplinaryNextStep's own comment). hasLetterType stays as a
// fallback purely for legacy cases that predate cs.outcome existing at
// all but do have a saved outcome letter (e.g. a case created before this
// column existed) — an unsaved, ephemeral draft can never satisfy it
// (hasLetterType requires m.letterOutput, only ever set by
// saveMeetingToCase), so this can't be tricked into fabricating a
// decision that was never actually made.
function inferDisciplinaryStage(cs) {
  const meetings = cs.meetings||[];
  const hasOutcome = !!cs.outcome || hasLetterType(meetings, "outcome");
  const hasInvReport = cs.investigationReport;
  if(meetings.some(m=>isAppealMeeting(m.type))) return "appeal";
  if(hasOutcome) return "outcome";
  if(meetings.some(m=>isDisciplinaryMeeting(m.type))) return "disciplinary";
  if(hasInvReport) return "inv_report";
  if(meetings.some(m=>isInvestigationMeeting(m.type))) return "investigation";
  if(meetings.length>0) return "investigation";
  return "intake";
}

// Human UAT remediation, Batch 1, Issue 1 — same fix as
// inferDisciplinaryStage above: a meeting's own signStatus is document-
// level state (has this specific meeting's notes been acknowledged?),
// not a case-closure signal. Removed for the same reason.
function inferGrievanceStage(cs) {
  const meetings = cs.meetings||[];
  // Defect #17 remediation — same cs.outcome-first fix as
  // inferDisciplinaryStage above, for the same reason.
  const hasOutcome = !!cs.outcome || hasLetterType(meetings, "outcome");
  if(meetings.some(m=>isAppealMeeting(m.type))) return "appeal";
  if(hasOutcome) return "outcome";
  if(meetings.some(m=>isGrievanceMeeting(m.type))) return "hearing";
  return "intake";
}

// Phase 6.5 hardening (closes Prompt 16 audit finding H12, HIGH) — this
// heuristic only ever checked meeting.type for the substrings
// "capability" and "occupational health", but neither string appears
// anywhere in MEETING_TYPES (constants.js) — there is no "Capability" or
// "Occupational Health" meeting type a user can actually select. Those
// two branches were dead code: a real long-term-sickness case could log
// any number of real meetings (Formal Meeting, Return to Work, etc.) and
// never advance past "contact_welfare", regardless of how far the case
// had actually progressed. The real, dated OH fields this comment used
// to call "P16's job" (fit_note_end_date/oh_referral_date/
// oh_report_received_date) already exist and are already editable on
// OverviewTab.jsx — this was simply never wired up to read them. The
// meeting-type checks stay as a defensive fallback (harmless if a real
// meeting type ever does contain these words) but the dated fields are
// now the primary, actually-reachable signal.
function inferLongTermSicknessStage(cs) {
  const meetings = cs.meetings||[];
  const types = meetings.map(m=>(m.type||"").toLowerCase());
  if(cs.outcome) return "decision";
  if(types.some(t=>t.includes("capability"))) return "capability_consideration";
  if(cs.ohReportReceivedDate) return "adjustments_considered";
  if(cs.ohReferralDate || types.some(t=>t.includes("occupational health"))) return "occupational_health";
  if(cs.fitNoteEndDate || meetings.length>0) return "contact_welfare";
  return "absence_identified";
}

function inferProbationStage(cs) {
  const meetings = cs.meetings||[];
  if(cs.outcome) return "outcome";
  if(meetings.length>1) return "concerns_raised";
  if(meetings.length>0) return "check_in";
  return "probation_started";
}

function inferFlexibleWorkingStage(cs) {
  const meetings = cs.meetings||[];
  if(cs.outcome) return "decision";
  if(meetings.some(m=>isAppealMeeting(m.type))) return "appeal";
  if(meetings.length>0) return "decision_meeting";
  return "request_received";
}

export function isGrievanceCase(cs) {
  return (cs?.caseType||"").toLowerCase()==="grievance";
}

// Case-type strings normalized the same way processStages.js's registry
// does — see that file for why the vocabulary is this specific list
// (two case-creation entry points, never sharing one vocabulary).
function normalizedCaseType(cs) {
  return (cs?.caseType||"").trim().toLowerCase();
}

export function getCaseStage(cs) {
  if(cs.stage==="closed") return "closed";
  // An explicitly-tracked stage always wins over the heuristic below. The
  // guided flow sets cs.stage at every real transition (disciplinary,
  // outcome, appeal, closed) — checking the heuristic first used to
  // silently reclassify a case as "closed" the moment a hearing meeting
  // happened to be signed and any meeting carried a letterOutput, even
  // while its 5-working-day ACAS appeal window was still legally live —
  // which also suppressed the appeal-window deadline in deadlines.js
  // (skips closed cases) and returned null from getNextStep, showing no
  // guidance at all during a window HR actually needs to be watching.
  // Moved here, the heuristic only ever fires for cases with no tracked
  // stage at all — meeting-only data added outside the guided flow.
  // Human UAT remediation, Batch 1, Issue 1 — the heuristic's own
  // "hasSigned&&hasOutcome" branch has since been removed entirely (see
  // inferDisciplinaryStage/inferGrievanceStage below): a meeting's
  // signStatus is document-level state that says nothing about case
  // closure, so it's no longer used to infer "closed" at all. Real
  // closure is always this explicit cs.stage="closed" write.
  //
  // UAT Golden Path remediation (Defect #8) — "open" is not a real,
  // type-specific stage id anywhere in processStages.js's own registry
  // (DISCIPLINARY_STAGES/GRIEVANCE_STAGES/etc. — every one of them starts
  // at its own type's initial id, e.g. "intake"/"probation_started"/
  // "absence_identified", never "open"). It's a lifecycle placeholder
  // meaning roughly "not closed yet", written as a NOT-NULL-safe default
  // by saveCaseToDB (App.jsx) and mapCaseRow (caseMapping.js) for any
  // case with no real stage recorded, and by the CSV bulk-import
  // normalizer. Treating it as an authoritative explicit stage (as any
  // other truthy value correctly is, just above) silently froze every
  // consumer built on this function — getNextStep's switches, and
  // OutcomeTab's isOutcomeReachable — at "open" forever the moment a case
  // was saved even once, since "open" matches no case in any of their
  // per-type switches/id lists, regardless of how much real progress
  // (e.g. a completed Disciplinary hearing) the case's meetings actually
  // show. Falling through here for "open" restores the same heuristic a
  // stage-less case already correctly uses below — it does not change
  // how any genuine, type-specific stage id is handled.
  if(cs.stage && cs.stage!=="open") return cs.stage;
  const type = normalizedCaseType(cs);
  if(type==="probation") return inferProbationStage(cs);
  if(type==="flexible working"||type==="flexible_working") return inferFlexibleWorkingStage(cs);
  if(type==="long-term sickness"||type==="long term sickness"||type==="long_term_sickness") return inferLongTermSicknessStage(cs);
  return isGrievanceCase(cs) ? inferGrievanceStage(cs) : inferDisciplinaryStage(cs);
}

// Process Intelligence (P17, §18) — the "Potential Bottlenecks" panel
// needs to know how long a case has sat in its current stage, and
// nothing tracked that before now (P2's own note: cs.stage is set at
// several explicit transition points, but none of them stamped a
// timestamp). Rather than touching every one of those call sites
// individually, this is called once, centrally, from saveCases — the
// single place every case write already passes through — comparing
// computed stage (not just the raw cs.stage field, so heuristically-
// inferred transitions get tracked too, not only explicit ones) before
// and after. Stored inside the existing timelineOverrides JSONB column
// (no migration needed) rather than a new one.
export function withStageTransitionStamp(cs, prevCs) {
  const stage = getCaseStage(cs);
  const prevStage = prevCs ? getCaseStage(prevCs) : null;
  if(stage === prevStage) return cs;
  const stageEnteredAt = { ...(cs.timelineOverrides?.stageEnteredAt || {}), [stage]: new Date().toISOString() };
  return { ...cs, timelineOverrides: { ...(cs.timelineOverrides || {}), stageEnteredAt } };
}

// "Currently" risk, not "ever was" — the most recent meeting that carries a
// rating, not just any meeting that ever did. A case rated HIGH early on
// that later resolved down to LOW should read as LOW here; the org-wide
// report intentionally uses a separate "ever was HIGH" signal instead
// (src/screens/ErReportScreen.jsx), since a case that once carried real
// risk is still worth a historical flag there.
export function getCurrentRisk(cs) {
  const rated = (cs.meetings||[])
    .filter(m=>m.riskScore?.rating && m.riskScore.rating!=="UNKNOWN")
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  return rated[0]?.riskScore?.rating || null;
}
