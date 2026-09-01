// Process Intelligence (Phase 3, P3) — a stage-aware lens over the same
// case data caseTimeline.js already renders chronologically. Pure and
// unit-testable, same discipline as caseStage.js/guardrails.js. Not a new
// source of truth: completed/current/upcoming are derived purely from
// getCaseStage (P1/existing) and getProcessType's stage list (P2);
// missing-step detection reuses fields (meetings, investigationReport,
// outcome) already read elsewhere in this codebase.
import { getCaseStage, hasLetterType } from './caseStage.js';
import { getProcessType, DISCIPLINARY_STAGES, GRIEVANCE_STAGES } from './processStages.js';
import { isInvestigationMeeting, isDisciplinaryMeeting, isAppealMeeting, isGrievanceMeeting } from './meetingTypeMatch.js';

// Per-stage "did this actually happen" evidence checks — only defined for
// the two process shapes whose stage-inference heuristic in caseStage.js
// prioritizes some signals over others (e.g. a case can reach "outcome"
// via hasOutcome without ever having had a typed investigation meeting),
// so a genuine mismatch between "we've moved past this stage" and "this
// stage's own evidence exists" is possible. Probation/flexible working/
// long-term sickness's own stage inference derives the current stage
// FROM meeting count/presence directly (see caseStage.js), so passing a
// stage there is definitionally always "evidenced" — a missing-step
// check would be tautological, so none is defined here; that gap closes
// once P16 adds real per-stage dated fields (fit notes, OH referral
// dates etc.) those heuristics can key off independently.
// Phase 6.5 hardening (Prompt 14, Section 8 — Family 4 wider sweep) — the
// disciplinary/hearing checks below used to match on a bare "disciplinary"/
// "grievance" substring, which "Appeal - Disciplinary"/"Appeal - Grievance"
// also satisfies. For a missing-step check specifically, that's a false
// negative risk: a case whose only "disciplinary"-shaped meeting is
// actually its own appeal would have read as "the disciplinary hearing
// happened" when it never did. isDisciplinaryMeeting/isGrievanceMeeting
// exclude appeal meetings; the appeal check itself is unaffected since
// isAppealMeeting matches the same set isAppealMeeting always has.
const STAGE_EVIDENCE = {
  disciplinary: {
    investigation: cs => (cs.meetings||[]).some(m=>isInvestigationMeeting(m.type)),
    inv_report: cs => !!cs.investigationReport,
    disciplinary: cs => (cs.meetings||[]).some(m=>isDisciplinaryMeeting(m.type)),
    // Human UAT remediation, Batch 2 hardening — a disciplinary/appeal
    // hearing invitation's letterOutput used to satisfy this "did the
    // outcome step actually happen" evidence check just as well as a real
    // outcome letter.
    outcome: cs => !!cs.outcome || hasLetterType(cs.meetings, "outcome"),
    appeal: cs => (cs.meetings||[]).some(m=>isAppealMeeting(m.type)),
  },
  grievance: {
    hearing: cs => (cs.meetings||[]).some(m=>isGrievanceMeeting(m.type)),
    // Human UAT remediation, Batch 2 hardening — a disciplinary/appeal
    // hearing invitation's letterOutput used to satisfy this "did the
    // outcome step actually happen" evidence check just as well as a real
    // outcome letter.
    outcome: cs => !!cs.outcome || hasLetterType(cs.meetings, "outcome"),
    appeal: cs => (cs.meetings||[]).some(m=>isAppealMeeting(m.type)),
  },
};

function evidenceChecksFor(stages) {
  if(stages === DISCIPLINARY_STAGES) return STAGE_EVIDENCE.disciplinary;
  if(stages === GRIEVANCE_STAGES) return STAGE_EVIDENCE.grievance;
  return {};
}

// { processType, stages, currentStageId, completed, current, upcoming, missingSteps }
// completed/current/upcoming are stage-definition objects ({id,label}),
// not full timeline entries — TimelinePanel renders them as a simple
// progress row, distinct from the chronological event list below it.
export function computeStageProgress(cs) {
  const processType = getProcessType(cs.caseType);
  const stages = processType.stages;
  const currentStageId = getCaseStage(cs);
  const currentIndex = stages.findIndex(s => s.id === currentStageId);

  // An explicitly-tracked cs.stage can in principle hold a value this
  // process type's own stage list doesn't recognise (e.g. stale data
  // from before a case's caseType was corrected) — rather than guess,
  // report "we don't know where this sits" instead of a wrong position.
  if(currentIndex === -1) {
    return { processType, stages, currentStageId, completed: [], current: null, upcoming: [], missingSteps: [] };
  }

  const completed = stages.slice(0, currentIndex);
  const current = stages[currentIndex];
  const upcoming = stages.slice(currentIndex + 1);
  const evidenceChecks = evidenceChecksFor(stages);
  const missingSteps = completed
    .filter(s => evidenceChecks[s.id] && !evidenceChecks[s.id](cs))
    .map(s => s.label);

  return { processType, stages, currentStageId, completed, current, upcoming, missingSteps };
}
