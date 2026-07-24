export function getCaseStage(cs) {
  const meetings = cs.meetings||[];
  const types = meetings.map(m=>(m.type||"").toLowerCase());
  const hasOutcome = meetings.some(m=>m.letterOutput);
  const hasSigned = meetings.some(m=>m.signStatus==="signed");
  const hasInvReport = cs.investigationReport;
  if(cs.stage==="closed") return "closed";
  if(hasSigned&&hasOutcome) return "closed";
  if(cs.stage) return cs.stage;
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
