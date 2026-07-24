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
