// Organisational ER Intelligence (Phase 6, OP11, §8) — appeal
// intelligence, aggregated for the first time from real, already-loaded
// data: allegations.js's own appealOutcome field (upheld/partially_
// upheld/not_upheld/further_investigation_required — set by
// setAppealOutcome, App.jsx's real appeal-decision flow) and the
// "Appeal ground:" case_signals appealReview.js's own generateAppealReview
// already writes per case. No new RPC/table — same fully-client-side
// aggregation OP9/OP10 already used, over the org-scoped arrays App.jsx
// already loads.
import { isFindingStatus, APPEAL_OUTCOMES } from './allegations.js';
import { appealMeetingsForCase } from './appealReview.js';

const MIN_SAMPLE_SIZE = 3;
const SUCCESSFUL_OUTCOMES = ["upheld", "partially_upheld"];

// "Original process stage" is derived from the real appeal meeting's own
// TYPE (e.g. "Disciplinary Appeal", "Grievance Appeal") rather than
// invented — these labels are literally named after the stage being
// appealed, so stripping the " Appeal" suffix is a grounded, not
// fabricated, way to answer "which kind of process most often gets
// successfully appealed." A case with no appeal meeting record yet
// (appeal outcome recorded before this app tracked meetings, or set
// directly) contributes nothing to this specific breakdown — it isn't
// guessed at.
function originalStageLabel(cs) {
  const meetings = appealMeetingsForCase(cs);
  if (!meetings.length) return null;
  const type = meetings[0].type || "";
  return type.replace(/\s*appeal\s*$/i, "").trim() || null;
}

export function computeAppealIntelligence(allegations, cases, caseSignals) {
  const casesById = {};
  (cases || []).forEach(cs => { casesById[cs.id] = cs; });

  const findings = (allegations || []).filter(a => isFindingStatus(a.status));
  const appealed = findings.filter(a => APPEAL_OUTCOMES.some(o => o.id === a.appealOutcome));

  const outcomeCounts = {};
  APPEAL_OUTCOMES.forEach(o => { outcomeCounts[o.id] = 0; });
  appealed.forEach(a => { outcomeCounts[a.appealOutcome]++; });

  const stageCounts = {};
  appealed
    .filter(a => SUCCESSFUL_OUTCOMES.includes(a.appealOutcome))
    .forEach(a => {
      const cs = casesById[a.caseId];
      const label = cs ? originalStageLabel(cs) : null;
      if (label) stageCounts[label] = (stageCounts[label] || 0) + 1;
    });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 8.3, MEDIUM) —
  // regenerating a case's appeal review (App.jsx's generateAppealReview)
  // marks the case's PRIOR "Appeal ground:" signals resolved (superseded)
  // rather than deleting them, then creates fresh open ones. With no
  // status filter here, every regeneration of the SAME case left its old
  // grounds still counted alongside the new ones — a single case
  // reviewed three times could manufacture what looks like a
  // three-case-wide recurring pattern in the org-wide breakdown.
  const groundCounts = {};
  (caseSignals || [])
    .filter(s => s.type === "process_risk" && s.status === "open" && (s.title || "").startsWith("Appeal ground:"))
    .forEach(s => {
      const ground = s.title.replace(/^Appeal ground:\s*/, "").trim();
      if (ground) groundCounts[ground] = (groundCounts[ground] || 0) + 1;
    });

  const successfulAppealCount = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const groundSignalCount = Object.values(groundCounts).reduce((a, b) => a + b, 0);

  return {
    totalFindings: findings.length,
    appealedCount: appealed.length,
    appealRate: findings.length >= MIN_SAMPLE_SIZE ? Math.round((appealed.length / findings.length) * 100) : null,
    // Phase 6.5 hardening (P1, product-principles review) — outcomeCounts/
    // stageCounts/commonGrounds themselves stay raw (a UI showing "0 of 0"
    // for every outcome/ground when nothing is recorded yet is a real,
    // useful empty state, not a false pattern), but each breakdown's own
    // total sample size is now surfaced so the panel can gate its DISPLAY
    // as a distribution behind the same MIN_SAMPLE_SIZE floor
    // appealRate already had — a single appealed finding showing "100%
    // upheld" or one ground shown as "1 case" presents a lone data point
    // as if it were a real pattern.
    outcomeCounts,
    outcomeSampleSize: appealed.length,
    stageCounts,
    stageSampleSize: successfulAppealCount,
    commonGrounds: Object.entries(groundCounts)
      .map(([ground, count]) => ({ ground, count }))
      .sort((a, b) => b.count - a.count),
    groundSampleSize: groundSignalCount,
  };
}

export { MIN_SAMPLE_SIZE as APPEAL_MIN_SAMPLE_SIZE };
