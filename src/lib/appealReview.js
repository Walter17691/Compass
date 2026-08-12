// Phase 19 of the reasoning-layer build-out (Advanced Appeal Workspace,
// scale/commercialisation wave). Pure helpers only — the AI extraction of
// grounds of appeal from the appeal meeting transcript lives in App.jsx
// (it needs a real Claude call), same split as every other AI-copilot
// feature this build-out added.

function parseFlexDate(str) {
  if (!str) return null;
  if (typeof str === "string" && str.includes("/")) {
    const p = str.split("/");
    const d = new Date(p[2], p[1] - 1, p[0]);
    return isNaN(d) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// Evidence added after the original finding was recorded (Phase 16's
// decidedAt) is exactly what an appeal review needs surfaced — it wasn't
// weighed in the finding being appealed. Mirrors guardrails.js's own
// "evidence after report" check, one stage later in the case's life.
export function newEvidenceSinceFinding(evidence, allegation) {
  const decidedDate = parseFlexDate(allegation?.decidedAt);
  if (!decidedDate) return [];
  return (evidence || [])
    .map((e, index) => ({ ...e, index }))
    .filter(e => { const d = parseFlexDate(e.date); return d && d > decidedDate; });
}

// An appeal meeting is any saved meeting whose type mentions "appeal"
// with a real record to extract grounds from — matches the same
// case-insensitive substring convention meeting-type checks already use
// throughout this codebase (e.g. deadlines.js/caseStage.js).
export function appealMeetingsForCase(cs) {
  return (cs?.meetings || []).filter(m => (m.type || "").toLowerCase().includes("appeal") && m.record);
}
