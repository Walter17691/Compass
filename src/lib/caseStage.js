export function getCaseStage(cs) {
  const meetings = cs.meetings||[];
  const types = meetings.map(m=>(m.type||"").toLowerCase());
  const hasOutcome = meetings.some(m=>m.letterOutput);
  const hasSigned = meetings.some(m=>m.signStatus==="signed");
  const hasInvReport = cs.investigationReport;
  if(cs.stage==="closed") return "closed";
  // An explicitly-tracked stage always wins over the heuristic below. The
  // guided flow sets cs.stage at every real transition (disciplinary,
  // outcome, appeal, closed), including the moment an outcome letter is
  // drafted — so a case correctly sitting at "outcome" almost immediately
  // satisfies hasSigned&&hasOutcome too (the hearing gets signed, then the
  // outcome letter is saved as a separate meeting entry). Checking the
  // heuristic first used to silently reclassify that case as "closed"
  // while its 5-working-day ACAS appeal window was still legally live —
  // which also suppressed the appeal-window deadline in deadlines.js
  // (skips closed cases) and returned null from getNextStep, showing no
  // guidance at all during a window HR actually needs to be watching.
  // Moved here, the heuristic only ever fires for cases with no tracked
  // stage at all — meeting-only data added outside the guided flow.
  if(cs.stage) return cs.stage;
  if(hasSigned&&hasOutcome) return "closed";
  if(types.some(t=>t.includes("appeal"))) return "appeal";
  if(hasOutcome) return "outcome";
  if(types.some(t=>t.includes("disciplinary"))) return "disciplinary";
  if(hasInvReport) return "inv_report";
  if(types.some(t=>t.includes("investigation"))) return "investigation";
  if(meetings.length>0) return "investigation";
  return "intake";
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
