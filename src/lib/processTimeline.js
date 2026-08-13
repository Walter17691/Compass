// Process Intelligence (Phase 3, P3) — a stage-aware lens over the same
// case data caseTimeline.js already renders chronologically. Pure and
// unit-testable, same discipline as caseStage.js/guardrails.js. Not a new
// source of truth: completed/current/upcoming are derived purely from
// getCaseStage (P1/existing) and getProcessType's stage list (P2);
// missing-step detection reuses fields (meetings, investigationReport,
// outcome) already read elsewhere in this codebase.
import { getCaseStage } from './caseStage';
import { getProcessType, DISCIPLINARY_STAGES, GRIEVANCE_STAGES } from './processStages';

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
const STAGE_EVIDENCE = {
  disciplinary: {
    investigation: cs => (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("investigation")),
    inv_report: cs => !!cs.investigationReport,
    disciplinary: cs => (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("disciplinary")),
    outcome: cs => !!cs.outcome || (cs.meetings||[]).some(m=>m.letterOutput),
    appeal: cs => (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("appeal")),
  },
  grievance: {
    hearing: cs => (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("grievance") && !(m.type||"").toLowerCase().includes("appeal")),
    outcome: cs => !!cs.outcome || (cs.meetings||[]).some(m=>m.letterOutput),
    appeal: cs => (cs.meetings||[]).some(m=>(m.type||"").toLowerCase().includes("appeal")),
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
