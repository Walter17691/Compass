import { useState } from 'react';
import { SCREENS } from '../constants';
import { getCurrentRisk } from '../lib/caseStage';
import { LockIcon } from '../components/Icons';

const RISK_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
};

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function CasesScreen({ cases, setIntake, setScreen, getCaseStage, setActiveCaseId, setActiveCaseStage, getNextStep, getProceedingTitle, getCaseStatus, saveCases, confirmDialog, showToast }) {
  const [selected, setSelected] = useState(new Set());
  const toggleSelected = id => setSelected(s=>{const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n;});
  const bulkClose = async () => {
    const ok = await confirmDialog({title:`Close ${selected.size} case${selected.size!==1?"s":""}?`, message:"These will be marked closed. You can still view them, and reopen individually if needed.", confirmLabel:"Close", danger:true});
    if(!ok) return;
    saveCases(cases.map(c=>selected.has(c.id)?{...c,stage:"closed",closedReason:"bulk_closed"}:c));
    showToast(`${selected.size} case${selected.size!==1?"s":""} closed`);
    setSelected(new Set());
  };
  const bulkExport = () => {
    const chosen = cases.filter(c=>selected.has(c.id));
    downloadJson(chosen, `compass_cases_export_${new Date().toISOString().split("T")[0]}.json`);
    showToast(`Exported ${chosen.length} case${chosen.length!==1?"s":""}`);
  };
  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",margin:0,fontWeight:400}}>Cases</h2>
          <p style={{fontSize:13,color:"#9B9098",margin:"2px 0 0"}}>{cases.filter(cs=>getCaseStage(cs)!=="closed").length} active · {cases.filter(cs=>getCaseStage(cs)==="closed").length} closed</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setIntake({employee:"",manager:"",issue:"",type:"",dateReceived:new Date().toISOString().split("T")[0],description:"",referredBy:"",urgent:false});setScreen(SCREENS.INTAKE);}}
            style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 20px",fontSize:13,color:"#1A1535",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New case</button>
          <button onClick={()=>setScreen(SCREENS.HOME+"_meeting")}
            style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,color:"#FFFFFF",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New meeting</button>
        </div>
      </div>
      <div style={{maxWidth:860,margin:"0 auto",padding:"28px 24px"}}>
        {selected.size>0&&(
          <div style={{position:"sticky",top:0,zIndex:10,display:"flex",alignItems:"center",gap:12,background:"#1A1535",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
            <span style={{fontSize:13,color:"#fff",fontWeight:500}}>{selected.size} selected</span>
            <button onClick={bulkExport} style={{fontSize:12,background:"none",border:"1px solid #FFFFFF44",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Export</button>
            <button onClick={bulkClose} style={{fontSize:12,background:"none",border:"1px solid #FFFFFF44",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Close</button>
            <button onClick={()=>setSelected(new Set())} style={{fontSize:12,background:"none",border:"none",color:"#C4BAB0",cursor:"pointer",marginLeft:"auto",fontFamily:"DM Sans,system-ui,sans-serif"}}>Clear</button>
          </div>
        )}
        {cases.length===0&&(
          <div style={{textAlign:"center",padding:"80px 20px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0"}}>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",marginBottom:8}}>No cases yet</div>
            <div style={{fontSize:14,color:"#9B9098",marginBottom:24}}>Create a case to start managing HR proceedings</div>
            <button onClick={()=>setScreen(SCREENS.INTAKE)} style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"12px 28px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Create first case →</button>
          </div>
        )}
        {(()=>{
          const employees = [...new Set(cases.map(cs=>cs.employeeName))];
          return employees.map(emp=>{
            const empCases = cases.filter(cs=>cs.employeeName===emp);
            const activeCount = empCases.filter(cs=>getCaseStage(cs)!=="closed").length;
            return(
              <div key={emp} style={{marginBottom:28}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:14,fontWeight:600,color:"#7C5CFC"}}>{(emp||"?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{emp}</div>
                    <div style={{fontSize:12,color:"#9B9098"}}>{empCases.length} proceeding{empCases.length!==1?"s":""}{activeCount>0?" · "+activeCount+" active":""}</div>
                  </div>
                </div>
                {empCases.map(cs=>{
                  const closed = getCaseStage(cs)==="closed";
                  const next = getNextStep(cs);
                  const risk = !closed ? getCurrentRisk(cs) : null;
                  const riskStyle = risk ? RISK_STYLE[risk] : null;
                  return(
                    <div key={cs.id} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                      style={{background:closed?"#FDFAF5":"#FFFFFF",border:"1px solid",borderColor:closed?"#EDE5D8":next?"#D4C9F5":"#E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:6,marginLeft:48,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,transition:"all 0.15s"}}
                      onMouseEnter={e=>{if(!closed){e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.background="#FDFAFF";}}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=closed?"#EDE5D8":next?"#D4C9F5":"#E8E0D0";e.currentTarget.style.background=closed?"#FDFAF5":"#FFFFFF";}}>
                      <input type="checkbox" checked={selected.has(cs.id)} onClick={e=>e.stopPropagation()} onChange={()=>toggleSelected(cs.id)} style={{cursor:"pointer",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:closed?400:600,color:closed?"#9B9098":"#1A1535",marginBottom:3}}>{getProceedingTitle(cs)}</div>
                        <div style={{fontSize:11,color:"#9B9098",display:"flex",gap:8}}>
                          <span>{(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</span>
                          {cs.urgent&&<span style={{color:"#C84B2F",fontWeight:600}}>· URGENT</span>}
                          {cs.confidential&&<span style={{color:"#B87520",fontWeight:600,display:"inline-flex",alignItems:"center",gap:3}}>· <LockIcon size={10} />Confidential</span>}
                        </div>
                        {next&&!closed&&<div style={{fontSize:11,color:"#7C5CFC",fontWeight:500,marginTop:4}}>Next: {next.label}</div>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {riskStyle&&<span style={{fontSize:10,fontWeight:700,color:riskStyle.color,background:riskStyle.bg,borderRadius:4,padding:"2px 7px"}}>{risk} RISK</span>}
                        <span style={{fontSize:11,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:20,padding:"3px 10px"}}>{getCaseStatus(cs).label}</span>
                        <span style={{color:"#C4BAB0",fontSize:16}}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
