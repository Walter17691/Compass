import { SCREENS } from '../constants';
import { Card, Badge } from '../components/Primitives';
import { computeDelegatedWork } from '../lib/hrDelegatedWork';
import { PageHeader } from '../components/design/PageHeader';
import { DataRow, RowChevron } from '../components/design/DataRow';
import { COLOR, FONT, RADIUS, TYPE } from '../styles/tokens';

// Manager Enablement (Phase 4, MP18, §14) — HR Delegated Work dashboard.
// The HR-facing counterpart to ManagerPortalScreen: what's been
// delegated out to investigators, and whether HR should take a look,
// rather than a manager's own view of their own work. Every field reads
// data MP1/MP7/MP8/MP10 already produce (computeDelegatedWork,
// hrDelegatedWork.js) — this is purely a dashboard over it.
//
// Design System Convergence pass, Phase 3 — was one bordered Card per
// investigation (a list meant to be scanned and compared across many
// rows, exactly what Phase 3 calls out for row treatment). Now one
// shared bordered list; the attention-reasons detail — the one thing
// worth its own visual weight — still only expands for rows Compass has
// actually flagged, same condition as before (row.attentionFlagged),
// not added to every row. Every field, click target, and the Intervene
// handler are unchanged.
export function HrDelegatedWorkScreen({ cases, caseAccess, orgMembers, caseTasks, allegations, fmtDate, setScreen, setActiveCaseId, setActiveCaseStage, openHrInterventionModal }) {
  const openCase = (caseId) => { setActiveCaseId(caseId); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); };
  const rows = computeDelegatedWork(cases, caseAccess, orgMembers, caseTasks, allegations);

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"40px 20px"}}>
      <PageHeader title="Delegated Work" subtitle="Investigations delegated to managers, and where HR attention might help."/>

      {rows.length===0 ? (
        <Card style={{textAlign:"center",padding:"32px 20px",color:"#9B9098",fontSize:13}}>No investigations currently delegated.</Card>
      ) : (
        <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,overflow:"hidden"}}>
          {rows.map(row=>(
            <DataRow key={row.caseId} attention={row.attentionFlagged}>
              <button type="button" onClick={()=>openCase(row.caseId)}
                style={{flex:1,minWidth:0,padding:"13px 16px",cursor:"pointer",display:"flex",flexDirection:"column",gap:6,background:"none",border:"none",textAlign:"left",font:"inherit",color:"inherit"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,minWidth:0}}>
                    <span style={{fontSize:13,fontWeight:600,color:COLOR.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.employeeName}</span>
                    <span style={{...TYPE.metadata,color:COLOR.inkFaint,flexShrink:0}}>Investigator: {row.investigatorName}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    {row.paused&&<Badge color={COLOR.amber}>Paused</Badge>}
                    {row.attentionFlagged&&<Badge color={COLOR.red}>HR attention suggested</Badge>}
                  </div>
                </div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:COLOR.inkSoft}}>
                  <span>Progress: {row.checklistDone} of {row.checklistTotal} steps</span>
                  <span>Meetings: {row.meetingsCompleted}</span>
                  <span style={{color:row.tasksOverdue>0?COLOR.red:COLOR.inkSoft}}>Overdue: {row.tasksOverdue}</span>
                  <span>Target: {row.targetCompletionDate?fmtDate(row.targetCompletionDate):"Not set"}</span>
                </div>
                {row.attentionFlagged&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:2}}>
                    {row.attentionReasons.map((reason,i)=>(
                      <div key={i} style={{fontSize:12,color:"#8A5A1E",background:"#FDF3E8",border:"1px solid #E8C088",borderRadius:8,padding:"6px 10px"}}>{reason}</div>
                    ))}
                  </div>
                )}
              </button>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,paddingRight:14}}>
                {openHrInterventionModal&&(
                  <button onClick={()=>openHrInterventionModal(row.caseId)} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:5,padding:"4px 10px",color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans}}>Intervene</button>
                )}
                <RowChevron/>
              </div>
            </DataRow>
          ))}
        </div>
      )}
    </div>
  );
}
