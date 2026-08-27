import { useState } from 'react';
import { SCREENS } from '../constants';
import { DateInput } from '../components/DateInput';
import { Btn, Card, Badge } from '../components/Primitives';
import { compileSubjectData } from '../lib/dsarCompile';
import { useLoadMore } from '../hooks/useLoadMore';
import { daysBetween } from '../lib/dateMath';
import { authedFetch } from '../lib/authedFetch';
import { WarningIcon } from '../components/Icons';

const STATUS_LABEL = { received:"Received", in_progress:"In progress", ready_to_send:"Ready to send", completed:"Completed" };

function daysUntil(dueDate) {
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return daysBetween(today, due);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function RequestDetail({ req, cases, employeeRecords, starterInstances, leaverInstances, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks, hrReviewRequests, auditLog, dsarRequests, orgMembers, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseAccess, redundancyCases, orgId, audit, updateDsarRequest, extendDsarRequest, promptDialog }) {
  const [compiled, setCompiled] = useState(null);
  const [compiling, setCompiling] = useState(false);

  // Phase 6.5 hardening (data-lifecycle review) — signing_requests,
  // employee_portal_accounts, employee_portal_invites, profiles and
  // case_views all have zero (or own-row-only) client-facing RLS by
  // design (see api/portal/_dsar-lookup.js's own header comment), so a
  // DSAR compile needs one real network round-trip first — this used to
  // be a purely synchronous, already-in-memory operation. Best-effort:
  // if the lookup itself fails, the rest of the export still compiles
  // rather than blocking the whole DSAR on one extra endpoint.
  const compile = async () => {
    setCompiling(true);
    let signingRequests = [];
    let portalAccounts = [];
    let portalInvites = [];
    let profiles = [];
    let caseViews = [];
    try {
      const r = await authedFetch(`/api/portal/dsar-lookup?orgId=${encodeURIComponent(orgId)}&employeeName=${encodeURIComponent(req.employeeName)}`);
      if (r.ok) { const d = await r.json(); signingRequests = d.signingRequests || []; portalAccounts = d.portalAccounts || []; portalInvites = d.portalInvites || []; profiles = d.profiles || []; caseViews = d.caseViews || []; }
    } catch (e) { console.error('dsar-lookup failed:', e.message); }
    setCompiled(compileSubjectData(req.employeeName, { cases, employeeRecords, starterInstances, leaverInstances, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks, hrReviewRequests, auditLog, signingRequests, portalAccounts, dsarRequests, orgMembers, profiles, caseViews, portalInvites, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseAccess, redundancyCases }));
    setCompiling(false);
    // Phase 6.5 hardening (data-lifecycle review) — "DSAR generated" is
    // one of the privacy actions this whole review was asked to make
    // auditable. Just the fact and the subject's name — never any of the
    // compiled record content itself.
    audit?.("DSAR data compiled", req.employeeName);
  };

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
        <select aria-label={`Status for ${req.employeeName}'s DSAR request`} value={req.status} onChange={e=>updateDsarRequest(req.id, {status:e.target.value})} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",background:"#fff",color:"#1A1535"}}>
          {Object.entries(STATUS_LABEL).filter(([v])=>v!=="completed"||req.reviewedFlaggedSections).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <Btn variant="secondary" onClick={compile} disabled={compiling}>{compiling?"Compiling…":compiled?"Recompile data":"Compile data"}</Btn>
        {compiled&&<Btn variant="secondary" onClick={()=>{downloadJson(compiled, `DSAR_${req.employeeName.replace(/\s+/g,"_")}_${req.receivedDate}.json`);audit?.("DSAR response downloaded", req.employeeName);}}>Download response package</Btn>}
        {!req.extended&&req.status!=="completed"&&<Btn variant="ghost" onClick={handleExtend}>Extend deadline</Btn>}
      </div>

      {compiled&&(
        <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 14px"}}>
          {compiled.possibleNameCollision&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"#FEF0EB",border:"1px solid #F0C4B0",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
              <WarningIcon size={14} color="#C84B2F" style={{flexShrink:0,marginTop:1}}/>
              <div style={{fontSize:12,color:"#C84B2F"}}>
                <strong>Possible name collision.</strong> More than one employee record or case email matches "{req.employeeName}" — this org may have two different people with this name. Verify every record below genuinely belongs to the same individual before sending this response; do not rely on the name match alone.
              </div>
            </div>
          )}
          <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
            {compiled.cases.length} case{compiled.cases.length!==1?"s":""} · {compiled.onboarding.length} onboarding record{compiled.onboarding.length!==1?"s":""} · {compiled.offboarding.length} offboarding record{compiled.offboarding.length!==1?"s":""} · {compiled.caseTasks.length} task{compiled.caseTasks.length!==1?"s":""} · {compiled.signingRequests.length} signing request{compiled.signingRequests.length!==1?"s":""} · {compiled.portalAccounts.length} portal account{compiled.portalAccounts.length!==1?"s":""} · {compiled.dsarRequests.length} prior DSAR request{compiled.dsarRequests.length!==1?"s":""} · {compiled.employeeRecord?"employee record found":"no employee record on file"}
          </div>
          {compiled.orgMembership.length>0&&(
            <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
              Also a Compass user on this team ({compiled.orgMembership.map(m=>m.role).join(", ")}) · {compiled.caseViews.length} case view{compiled.caseViews.length!==1?"s":""} · {compiled.portalInvites.length} portal invite{compiled.portalInvites.length!==1?"s":""} on record for them
            </div>
          )}
          {(compiled.actedAsStaff.cases.length+compiled.actedAsStaff.employeeRecords.length+compiled.actedAsStaff.wellbeingNotes.length+compiled.actedAsStaff.hrReviewRequests.length)>0&&(
            <div style={{fontSize:12,color:"#1A1535",marginBottom:8}}>
              Also named as manager/investigator/officer/reviewer on other employees' records: {compiled.actedAsStaff.cases.length} case{compiled.actedAsStaff.cases.length!==1?"s":""}, {compiled.actedAsStaff.employeeRecords.length} employee record{compiled.actedAsStaff.employeeRecords.length!==1?"s":""}, {compiled.actedAsStaff.wellbeingNotes.length} wellbeing note{compiled.actedAsStaff.wellbeingNotes.length!==1?"s":""}, {compiled.actedAsStaff.hrReviewRequests.length} HR review request{compiled.actedAsStaff.hrReviewRequests.length!==1?"s":""} — included in the download below.
            </div>
          )}
          {compiled.subjectMentionsInOrgNarratives.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#C84B2F",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Flagged — named in organisational insight content</div>
              {compiled.subjectMentionsInOrgNarratives.map((f,i)=>(
                <div key={i} style={{fontSize:12,color:"#6B6375",padding:"6px 0",borderBottom:"1px solid #EDE5D8"}}>
                  {f.field}{f.date?` (${f.date})`:""}: <span style={{fontStyle:"italic"}}>"...{f.snippet}..."</span>
                </div>
              ))}
              <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>Compass's organisational insights aren't meant to name individuals — this needs manual review before sending.</div>
            </div>
          )}
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

export function DsarScreen({ dsarRequests, createDsarRequest, updateDsarRequest, extendDsarRequest, promptDialog, cases, employeeRecords, starterInstances, leaverInstances, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks, hrReviewRequests, auditLog, orgMembers, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseAccess, redundancyCases, orgId, audit, setScreen }) {
  const [form, setForm] = useState({ employeeName:"", requestedBy:"", receivedDate:new Date().toISOString().split("T")[0] });
  const [showForm, setShowForm] = useState(false);

  const sorted = [...dsarRequests].sort((a,b)=>{
    if((a.status==="completed")!==(b.status==="completed")) return a.status==="completed"?1:-1;
    return new Date(a.dueDate)-new Date(b.dueDate);
  });
  const { visible: visibleRequests, hasMore, loadMore, total } = useLoadMore(sorted, 15);

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
              <label htmlFor="dsar-form-employee-name" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Employee name</label>
              <input id="dsar-form-employee-name" list="dsar-employee-names" value={form.employeeName} onChange={e=>setForm(p=>({...p,employeeName:e.target.value}))} placeholder="e.g. Ada Lovelace" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
              <datalist id="dsar-employee-names">{employeeRecords.map(r=><option key={r.name} value={r.name}/>)}</datalist>
            </div>
            <div style={{marginBottom:12}}>
              <label htmlFor="dsar-form-requested-by" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Requested by (optional, if different from employee)</label>
              <input id="dsar-form-requested-by" value={form.requestedBy} onChange={e=>setForm(p=>({...p,requestedBy:e.target.value}))} placeholder="e.g. their solicitor" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",boxSizing:"border-box",color:"#1A1535"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <label htmlFor="dsar-form-received-date" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Date received</label>
              <DateInput id="dsar-form-received-date" value={form.receivedDate} onChange={e=>setForm(p=>({...p,receivedDate:e.target.value}))}/>
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
        ):visibleRequests.map(req=>(
          <RequestDetail key={req.id} req={req} cases={cases} employeeRecords={employeeRecords} starterInstances={starterInstances} leaverInstances={leaverInstances} wellbeingNotes={wellbeingNotes} concernReferrals={concernReferrals} allegations={allegations} caseSignals={caseSignals} caseTasks={caseTasks} hrReviewRequests={hrReviewRequests} auditLog={auditLog} dsarRequests={dsarRequests} orgMembers={orgMembers} orgEvents={orgEvents} improvementInitiatives={improvementInitiatives} managerCapabilityInsights={managerCapabilityInsights} organisationThemes={organisationThemes} caseAccess={caseAccess} redundancyCases={redundancyCases} orgId={orgId} audit={audit} updateDsarRequest={updateDsarRequest} extendDsarRequest={extendDsarRequest} promptDialog={promptDialog}/>
        ))}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,cursor:"pointer",fontSize:13,color:"#7C5CFC",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
            Load more ({visibleRequests.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
