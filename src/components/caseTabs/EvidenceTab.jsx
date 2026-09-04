import { EvidenceDropzone } from '../EvidenceDropzone';
import { readEvidenceFiles, fmtBytes } from '../../lib/evidenceUpload';
import { canAnalyseEvidence } from '../../lib/documentIngestion';
import { parseCommitmentDueDate } from '../../lib/taskDueDateParsing';
import { requestManualSignatureConfirmation } from '../../lib/humanOverride';

const FINDING_LABEL = {
  witness: f => `Potential witness: ${f.name}`,
  allegation_link: (f, allegations) => `Relates to "${allegations.find(a=>a.id===f.allegationId)?.title || "an allegation"}" (${f.stance})`,
  inconsistency: f => `Potential inconsistency: ${f.description}`,
  action: f => `Suggested action: ${f.description}`,
};

// No longer gated to the investigation stage — evidence (and witness
// statements specifically) can come in at any point in a case, not just
// while it's formally "in investigation".
export function EvidenceTab({ cs, cases, saveCases, currentUser, showToast, setReviewOutput, setScreen, screens, fmtDate, setMeetingSetup, setCaseInfo, orgMembers, allegations=[], documentFindings={}, documentAnalysisLoading={}, onAnalyseEvidence, onAcceptFinding, onDismissFinding, promptDialog, audit }) {
  const addEvidenceFiles = async files => {
    const newItems = await readEvidenceFiles(files, { addedBy: currentUser?.name||"HR Manager", onReject: msg => showToast?.(msg, "error") });
    if(newItems.length) saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:[...(x.evidence||[]), ...newItems]}:x));
  };

  const markEvidenceSigned = async ev => {
    const ok = await requestManualSignatureConfirmation(promptDialog, audit, { itemLabel: `Witness statement — ${ev.name}`, caseId: cs.id });
    if(!ok) return;
    saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).map(e=>e.id===ev.id?{...e,signStatus:"signed"}:e)}:x));
  };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}><div style={{fontSize:14,fontWeight:700,color:"#7C5CFC"}}>Evidence & witness statements</div></div>
      <div style={{padding:"16px"}}>
        {(cs.evidence||[]).length===0&&<div style={{fontSize:13,color:"#9B9098",marginBottom:12}}>No evidence added yet</div>}
        {(cs.evidence||[]).map(ev=>{
          // Phase 6.5 hardening (P0, Cluster 8) — keyed by the evidence
          // item's own stable id, not its array position, so deleting a
          // different evidence item can never silently reassign these
          // findings to the wrong document (see src/lib/evidenceUpload.js).
          const findingsKey = `${cs.id}::${ev.id}`;
          const findings = (documentFindings[findingsKey]||[]).filter(f=>f.status==="open");
          const analysed = findingsKey in documentFindings;
          const loading = !!documentAnalysisLoading[findingsKey];
          return (
          <div key={ev.id} style={{padding:"10px 0",borderBottom:"1px solid #F5F1EA"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:"#1A1535",fontWeight:500}}>{ev.name}</div>
              <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:"#9B9098"}}>{ev.type}{ev.size?" · "+fmtBytes(ev.size):""} · {fmtDate(ev.date)}</span>
                {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"1px 6px",fontWeight:600}}>Signed</span>:<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"1px 6px"}}>Pending signature</span>)}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {ev.dataUrl&&<a href={ev.dataUrl} download={ev.name} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",borderRadius:4,padding:"3px 8px",textDecoration:"none",fontWeight:500}}>Download</a>}
              {ev.record&&<button onClick={()=>{setReviewOutput(ev.record);setScreen(screens.REVIEW);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View notes</button>}
              {canAnalyseEvidence(ev)&&!analysed&&(
                <button onClick={()=>onAnalyseEvidence?.(ev.id)} disabled={loading} style={{fontSize:11,color:"#5B3FD4",background:"none",border:"1px solid #DDD9F5",borderRadius:4,padding:"3px 8px",cursor:loading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{loading?"Analysing…":"Analyse document"}</button>
              )}
              {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"3px 8px",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Signed</span>:<button onClick={()=>markEvidenceSigned(ev)} style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>)}
              <button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).filter(e=>e.id!==ev.id)}:x))} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
            </div>
            </div>
            {/* Phase 7 — Intelligent Document Ingestion. Only ever shown
                once an analysis has actually run, and only findings still
                "open" (not yet accepted/dismissed) render — accepted ones
                have already been written to their real destination (a
                task, an evidence link, a signal), dismissed ones are just
                gone, so nothing here duplicates what the rest of the case
                workspace already shows. */}
            {findings.length>0&&(
              <div style={{marginTop:8,background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#5B3FD4",marginBottom:6}}>Document analysed</div>
                {findings.map(f=>(
                  <div key={f.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"6px 0",borderTop:"1px solid #EDE5FA"}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontSize:12,color:"#1A1535"}}>{FINDING_LABEL[f.type]?.(f, allegations)}</div>
                      {f.reasoning&&<div style={{fontSize:11,color:"#6B6375",marginTop:1}}>{f.reasoning}</div>}
                      {/* Integrations & Workflow Automation (Phase 5, IP24, §20) —
                          a preview of the due date accepting this finding will set
                          on the resulting task, parsed from the finding's own text
                          (see taskDueDateParsing.js), so it's never a silent
                          surprise once accepted. */}
                      {f.type==="action"&&parseCommitmentDueDate(f.description)&&<div style={{fontSize:11,color:"#5B3FD4",marginTop:2}}>Due {parseCommitmentDueDate(f.description)}</div>}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>onAcceptFinding?.(ev.id,f)} style={{fontSize:11,color:"#fff",background:"#7C5CFC",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Accept</button>
                      <button onClick={()=>onDismissFinding?.(ev.id,f)} style={{fontSize:11,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
        <div style={{marginTop:12}}><EvidenceDropzone onFilesSelected={addEvidenceFiles}/></div>
        <div style={{marginTop:12,padding:"12px",background:"#F5F3FF",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:12,fontWeight:500,color:"#1A1535"}}>Witness interview</div><div style={{fontSize:11,color:"#9B9098"}}>Record and save directly to this investigation</div></div>
          <button onClick={()=>{setMeetingSetup(p=>({...p,employee:"",employeeJobTitle:"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:"investigation",linkedCaseId:cs.id,linkedCaseName:cs.employeeName}));setCaseInfo(p=>({...p,_linkedCaseId:cs.id,_linkedCaseName:cs.employeeName}));setScreen(screens.HOME+"_meeting");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>+ Witness interview</button>
        </div>
      </div>
    </div>
  );
}
