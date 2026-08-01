import { useState } from 'react';
import { SCREENS } from '../constants';
import { DateInput } from '../components/DateInput';
import { Btn, Card, Badge } from '../components/Primitives';
import { compileSubjectData } from '../lib/dsarCompile';

const STATUS_LABEL = { received:"Received", in_progress:"In progress", ready_to_send:"Ready to send", completed:"Completed" };

function daysUntil(dueDate) {
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((due-today)/(1000*60*60*24));
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function RequestDetail({ req, cases, employeeRecords, starterInstances, leaverInstances, updateDsarRequest, extendDsarRequest, promptDialog }) {
  const [compiled, setCompiled] = useState(null);

  const compile = () => setCompiled(compileSubjectData(req.employeeName, { cases, employeeRecords, starterInstances, leaverInstances }));

  const days = daysUntil(req.dueDate);
  const overdue = days < 0;

  const handleExtend = async () => {
    const values = await promptDialog({
      title:"Extend DSAR deadline",
      message:"UK GDPR allows extending the response deadline by up to 2 further months for complex or numerous requests — but the individual must be told within the original 1-month window, with reasons. This sets the new due date 2 months later and records why.",
      fields:[{key:"reason", label:"Reason (e.g. complex/numerous requests)", placeholder:"e.g. request spans multiple systems and 3 years of records", required:true}],
      confirmLabel:"Extend by 2 months",
    });
    if(!values) return;
    extendDsarRequest(req, values.reason);
  };

  return (
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{req.employeeName}</div>
          <div style={{fontSize:12,color:"#9B9098"}}>{req.requestedBy?`Requested by ${req.requestedBy} · `:""}Received {req.receivedDate}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <span style={{fontSize:11,fontWeight:600,color:overdue?"#C84B2F":"#7C5CFC",background:overdue?"#FEF0EB":"#EDE8FF",borderRadius:20,padding:"3px 10px"}}>{STATUS_LABEL[req.status]}</span>
          <div style={{fontSize:11,color:overdue?"#C84B2F":"#9B9098",marginTop:4}}>Due {req.dueDate}{overdue?` · ${Math.abs(days)}d overdue`:` · ${days}d left`}</div>
          {req.extended&&<div style={{fontSize:11,color:"#7C5CFC",marginTop:4}}>Extended — {req.extensionReason||"complex request"}</div>}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <select value={req.status} onChange={e=>updateDsarRequest(req.id, {status:e.target.value})} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
          {Object.entries(STATUS_LABEL).filter(([v])=>v!=="completed"||req.reviewedFlaggedSections).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <Btn variant="secondary" onClick={compile}>{compiled?"Recompile data":"Compile data"}</Btn>
        {compiled&&<Btn variant="secondary" onClick={()=>downloadJson(compiled, `DSAR_${req.employeeName.replace(/\s+/g,"_")}_${req.receivedDate}.json`)}>Download response package</Btn>}
        {!req.extended&&req.status!=="completed"&&<Btn variant="ghost" onClick={handleExtend}>Extend deadline</Btn>}
      </div>

      {compiled&&(
        <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
            {compiled.cases.length} case{compiled.cases.length!==1?"s":""} · {compiled.onboarding.length} onboarding record{compiled.onboarding.length!==1?"s":""} · {compiled.offboarding.length} offboarding record{compiled.offboarding.length!==1?"s":""} · {compiled.employeeRecord?"employee record found":"no employee record on file"}
          </div>
          {compiled.flaggedThirdPartyMentions.length>0?(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#C84B2F",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Flagged — mentions another named individual</div>
              {compiled.flaggedThirdPartyMentions.map((f,i)=>(
                <div key={i} style={{fontSize:12,color:"#6B6375",padding:"6px 0",borderBottom:"1px solid #EDE5D8"}}>
                  <strong style={{color:"#1A1535"}}>{f.mentionedName}</strong> in {f.meetingType} ({f.date}), {f.field}: <span style={{fontStyle:"italic"}}>"...{f.snippet}..."</span>
                </div>
              ))}
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>These mentions of other people need manual review/redaction before sending — this tool flags them, it does not redact automatically.</div>
            </div>
          ):(
            <div style={{fontSize:12,color:"#1A7A4A",marginBottom:10}}>No other named individuals detected in the compiled records.</div>
          )}
          {compiled.evidenceRequiringReview.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#B87520",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Evidence files — not included automatically</div>
              {compiled.evidenceRequiringReview.map((ev,i)=>(
                <div key={i} style={{fontSize:12,color:"#6B6375",padding:"6px 0",borderBottom:"1px solid #EDE5D8"}}>
                  <strong style={{color:"#1A1535"}}>{ev.name}</strong> ({ev.type}, {ev.date})
                </div>
              ))}
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>Compass can't scan file content (photos, PDFs, CCTV, witness statements) for other people's data the way it scans text. Open each file, check it only concerns {req.employeeName} (or redact/exclude what doesn't), then attach it to the response manually.</div>
            </div>
          )}
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#1A1535",cursor:"pointer"}}>
            <input type="checkbox" checked={!!req.reviewedFlaggedSections} onChange={e=>updateDsarRequest(req.id, {reviewedFlaggedSections:e.target.checked})} style={{cursor:"pointer"}}/>
            I have reviewed the flagged sections{compiled.evidenceRequiringReview.length>0?" and evidence files":""} (required before marking as completed)
          </label>
        </div>
      )}
    </Card>
  );
}

export function DsarScreen({ dsarRequests, createDsarRequest, updateDsarRequest, extendDsarRequest, promptDialog, cases, employeeRecords, starterInstances, leaverInstances, setScreen }) {
  const [form, setForm] = useState({ employeeName:"", requestedBy:"", receivedDate:new Date().toISOString().split("T")[0] });
  const [showForm, setShowForm] = useState(false);

  const sorted = [...dsarRequests].sort((a,b)=>{
    if((a.status==="completed")!==(b.status==="completed")) return a.status==="completed"?1:-1;
    return new Date(a.dueDate)-new Date(b.dueDate);
  });

  const submit = () => {
    if(!form.employeeName.trim()||!form.receivedDate) return;
    createDsarRequest(form);
    setForm({ employeeName:"", requestedBy:"", receivedDate:new Date().toISOString().split("T")[0] });
    setShowForm(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",margin:0,fontWeight:400}}>DSAR requests</h2>
          <p style={{fontSize:13,color:"#9B9098",margin:"2px 0 0"}}>{dsarRequests.filter(r=>r.status!=="completed").length} open · statutory response deadline: 1 calendar month from receipt</p>
        </div>
        <Btn onClick={()=>setShowForm(s=>!s)}>{showForm?"Cancel":"+ Log new request"}</Btn>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"28px 24px"}}>
        {showForm&&(
          <Card style={{marginBottom:20}}>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Employee name</label>
              <input list="dsar-employee-names" value={form.employeeName} onChange={e=>setForm(p=>({...p,employeeName:e.target.value}))} placeholder="e.g. Ada Lovelace" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
              <datalist id="dsar-employee-names">{employeeRecords.map(r=><option key={r.name} value={r.name}/>)}</datalist>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Requested by (optional, if different from employee)</label>
              <input value={form.requestedBy} onChange={e=>setForm(p=>({...p,requestedBy:e.target.value}))} placeholder="e.g. their solicitor" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Date received</label>
              <DateInput value={form.receivedDate} onChange={e=>setForm(p=>({...p,receivedDate:e.target.value}))}/>
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>Due date will be calculated automatically as one calendar month from this date.</div>
            </div>
            <Btn onClick={submit} disabled={!form.employeeName.trim()||!form.receivedDate}>Log request</Btn>
          </Card>
        )}

        {sorted.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0"}}>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1A1535",marginBottom:8}}>No DSAR requests logged</div>
            <div style={{fontSize:13,color:"#9B9098"}}>Log a request when someone asks what personal data you hold on them.</div>
          </div>
        ):sorted.map(req=>(
          <RequestDetail key={req.id} req={req} cases={cases} employeeRecords={employeeRecords} starterInstances={starterInstances} leaverInstances={leaverInstances} updateDsarRequest={updateDsarRequest} extendDsarRequest={extendDsarRequest} promptDialog={promptDialog}/>
        ))}
      </div>
    </div>
  );
}
