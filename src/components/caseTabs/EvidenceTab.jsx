import { EvidenceDropzone } from '../EvidenceDropzone';
import { readEvidenceFiles, fmtBytes } from '../../lib/evidenceUpload';

// No longer gated to the investigation stage — evidence (and witness
// statements specifically) can come in at any point in a case, not just
// while it's formally "in investigation".
export function EvidenceTab({ cs, cases, saveCases, currentUser, showToast, setReviewOutput, setScreen, screens, fmtDate, setMeetingSetup, setCaseInfo, orgMembers }) {
  const addEvidenceFiles = async files => {
    const newItems = await readEvidenceFiles(files, { addedBy: currentUser?.name||"HR Manager", onReject: msg => showToast?.(msg, "error") });
    if(newItems.length) saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:[...(x.evidence||[]), ...newItems]}:x));
  };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}><div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Evidence & witness statements</div></div>
      <div style={{padding:"16px"}}>
        {(cs.evidence||[]).length===0&&<div style={{fontSize:13,color:"#9B9098",marginBottom:12}}>No evidence added yet</div>}
        {(cs.evidence||[]).map((ev,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F5F1EA"}}>
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
              {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"3px 8px",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Signed</span>:<button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).map((e,j)=>j===i?{...e,signStatus:"signed"}:e)}:x))} style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>)}
              <button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).filter((_,j)=>j!==i)}:x))} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
            </div>
          </div>
        ))}
        <div style={{marginTop:12}}><EvidenceDropzone onFilesSelected={addEvidenceFiles}/></div>
        <div style={{marginTop:12,padding:"12px",background:"#F5F3FF",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:12,fontWeight:500,color:"#1A1535"}}>Witness interview</div><div style={{fontSize:11,color:"#9B9098"}}>Record and save directly to this investigation</div></div>
          <button onClick={()=>{setMeetingSetup(p=>({...p,employee:"",employeeJobTitle:"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:"investigation",linkedCaseId:cs.id,linkedCaseName:cs.employeeName}));setCaseInfo(p=>({...p,_linkedCaseId:cs.id,_linkedCaseName:cs.employeeName}));setScreen(screens.HOME+"_meeting");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>+ Witness interview</button>
        </div>
      </div>
    </div>
  );
}
