import { Btn, Card } from '../components/Primitives';
import { SCREENS } from '../constants';
import { findCasesForEmployee } from '../lib/hrisDeepLink';

const STAGE_LABEL = { intake:"Intake", investigation:"Investigation", inv_report:"Investigation report", disciplinary:"Disciplinary", hearing:"Grievance hearing", outcome:"Outcome", appeal:"Appeal", closed:"Closed" };

// Integrations & Workflow Automation (Phase 5, IP21, §15) — the receiving
// end of an "Open in Compass" deep link from an employee's HRIS profile.
// No live HRIS platform exists to link FROM (IP19 is a stub adapter only),
// so this screen is reachable today only via a hand-built ?employee= URL —
// still real, testable routing/UI work, just without a live sender.
export function OpenInCompassScreen({ employeeName, cases, getCaseStage, getEmployeeRecord, setActiveCaseId, setCaseViewInitialTab, setScreen, setConcernForm, emptyConcernForm, setConcernFormAutoOpen, setCasePromptName, setShowCasePrompt, fmtDate }) {
  const matches = findCasesForEmployee(cases, employeeName);
  const record = getEmployeeRecord ? getEmployeeRecord(employeeName) : null;

  const openCase = (caseId, initialTab) => {
    setActiveCaseId(caseId);
    if (initialTab) setCaseViewInitialTab(initialTab);
    setScreen(SCREENS.CASE_VIEW);
  };

  const viewActiveActions = () => {
    if (matches.length === 1) { openCase(matches[0].id, "tasks"); return; }
    // Zero or multiple matches: no single case to land on a tasks tab
    // within, so fall back to the same case list shown below.
    document.getElementById("open-employee-case-list")?.scrollIntoView?.({ behavior: "smooth" });
  };

  const raiseConcern = () => {
    setConcernForm({ ...emptyConcernForm, employeeName: employeeName || "" });
    setConcernFormAutoOpen(true);
    setScreen(SCREENS.CONCERNS);
  };

  const createCase = () => {
    setCasePromptName(employeeName || "");
    setShowCasePrompt(true);
  };

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif",padding:"32px 24px",display:"flex",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:640}}>
        <p style={{fontSize:12,color:"#9B9098",margin:"0 0 4px",textTransform:"uppercase",letterSpacing:0.5}}>Open in Compass</p>
        <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#1A1535",margin:"0 0 4px",fontWeight:400}}>{employeeName || "Unknown employee"}</h2>
        {record && <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>{[record.jobTitle, record.department, record.location].filter(Boolean).join(" · ")}</p>}
        {!record && <p style={{fontSize:13,color:"#9B9098",margin:"0 0 24px"}}>No employee record found in Compass for this name.</p>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
          <Btn onClick={()=>document.getElementById("open-employee-case-list")?.scrollIntoView?.({behavior:"smooth"})}>View existing cases{matches.length>0?` (${matches.length})`:""}</Btn>
          <Btn variant="secondary" onClick={raiseConcern}>Raise a concern</Btn>
          <Btn variant="secondary" onClick={createCase}>Create a case</Btn>
          <Btn variant="secondary" onClick={viewActiveActions}>View active actions</Btn>
        </div>

        <Card id="open-employee-case-list">
          <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 12px",fontWeight:400}}>Existing cases</h3>
          {matches.length===0 && <p style={{fontSize:13,color:"#9B9098",margin:0}}>No existing cases for this employee.</p>}
          {matches.map(cs => (
            <button key={cs.id} onClick={()=>openCase(cs.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",background:"none",border:"none",borderTop:"1px solid #EDE5D8",padding:"12px 0",cursor:"pointer"}}>
              <span>
                <span style={{display:"block",fontSize:13,fontWeight:600,color:"#1A1535"}}>{cs.caseType || "Case"}</span>
                <span style={{display:"block",fontSize:12,color:"#9B9098"}}>{fmtDate ? fmtDate(cs.createdAt) : cs.createdAt}</span>
              </span>
              <span style={{fontSize:12,color:"#6B6375"}}>{STAGE_LABEL[getCaseStage(cs)] || getCaseStage(cs)}</span>
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}
