import { SCREENS } from '../constants';
import { Card, Badge } from '../components/Primitives';
import { computeDelegatedWork } from '../lib/hrDelegatedWork';

// Manager Enablement (Phase 4, MP18, §14) — HR Delegated Work dashboard.
// The HR-facing counterpart to ManagerPortalScreen: what's been
// delegated out to investigators, and whether HR should take a look,
// rather than a manager's own view of their own work. Every field reads
// data MP1/MP7/MP8/MP10 already produce (computeDelegatedWork,
// hrDelegatedWork.js) — this is purely a dashboard over it.
export function HrDelegatedWorkScreen({ cases, caseAccess, orgMembers, caseTasks, allegations, fmtDate, setScreen, setActiveCaseId, setActiveCaseStage, openHrInterventionModal }) {
  const openCase = (caseId) => { setActiveCaseId(caseId); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); };
  const rows = computeDelegatedWork(cases, caseAccess, orgMembers, caseTasks, allegations);

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Delegated Work</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>Investigations delegated to managers, and where HR attention might help.</p>

      {rows.length===0 ? (
        <Card style={{textAlign:"center",padding:"32px 20px",color:"#9B9098",fontSize:13}}>No investigations currently delegated.</Card>
      ) : rows.map(row=>(
        <Card key={row.caseId} style={{marginBottom:12,cursor:"pointer"}} onClick={()=>openCase(row.caseId)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:10}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{row.employeeName}</div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>Investigator: {row.investigatorName}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              {row.paused&&<Badge color="#B87520">Paused</Badge>}
              {row.attentionFlagged&&<Badge color="#C84B2F">HR attention suggested</Badge>}
              {openHrInterventionModal&&(
                <button onClick={e=>{e.stopPropagation();openHrInterventionModal(row.caseId);}} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Intervene</button>
              )}
            </div>
          </div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",fontSize:12,color:"#6B6375",marginBottom:row.attentionFlagged?10:0}}>
            <span>Progress: {row.checklistDone} of {row.checklistTotal} steps</span>
            <span>Meetings completed: {row.meetingsCompleted}</span>
            <span style={{color:row.tasksOverdue>0?"#C84B2F":"#6B6375"}}>Tasks overdue: {row.tasksOverdue}</span>
            <span>Target completion: {row.targetCompletionDate?fmtDate(row.targetCompletionDate):"Not set"}</span>
          </div>
          {row.attentionFlagged&&(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {row.attentionReasons.map((reason,i)=>(
                <div key={i} style={{fontSize:12,color:"#8A5A1E",background:"#FDF3E8",border:"1px solid #E8C088",borderRadius:8,padding:"6px 10px"}}>{reason}</div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
