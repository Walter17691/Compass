import { useState, useEffect } from 'react';
import { PageHeader } from '../components/design/PageHeader';
import { CONCERN_TYPES } from '../constants';
import { referralStatusMeta, REFERRAL_STATUSES } from '../lib/concernReferrals';
import { computeConcernIntakeGaps } from '../lib/concernIntakeGaps';
import { readEvidenceFiles } from '../lib/evidenceUpload';
import { Btn, Card, Badge } from '../components/Primitives';
import { EvidenceDropzone } from '../components/EvidenceDropzone';

const inputStyle = { width:"100%", fontSize:14, border:"1px solid #E8E0D0", borderRadius:8, padding:"10px 14px", color:"#1A1535", outline:"none", fontFamily:"DM Sans,system-ui,sans-serif", boxSizing:"border-box" };
const labelStyle = { display:"block", fontSize:13, fontWeight:500, color:"#1A1535", marginBottom:6 };

// Phase 14 of the reasoning-layer build-out (first of the scale/
// commercialisation wave). The one screen in the app any org member can
// reach regardless of role — the line_manager role (defined since
// role_expansion_2026-08-09.sql) has never actually gated anything until
// now. Non-HR users only ever see the intake form and their own
// submission confirmation; HR additionally sees the full triage queue
// (RLS backs this, not just the isHR prop — see
// concern_referrals_2026-08-12.sql).
function ConcernForm({ concernForm, setConcernForm, onSubmit, submitLabel="Submit concern", currentUser, showToast }) {
  const canSubmit = concernForm.employeeName.trim() && concernForm.description.trim();
  // Manager Enablement (Phase 4, MP4, §4) — live, advisory, never
  // blocking: a manager filling in a simple form shouldn't be gated by
  // this, just gently reminded of the one or two things HR will
  // otherwise have to come back and ask for anyway.
  const gaps = computeConcernIntakeGaps(concernForm);

  return (
    <Card>
      <div style={{marginBottom:14}}>
        <label htmlFor="concern-employee-name" style={labelStyle}>Employee's name</label>
        <input id="concern-employee-name" style={inputStyle} value={concernForm.employeeName} placeholder="Who is this about?"
          onChange={e=>setConcernForm(f=>({...f,employeeName:e.target.value}))} />
      </div>
      <div style={{marginBottom:14}}>
        <label htmlFor="concern-type" style={labelStyle}>What kind of concern is this?</label>
        <select id="concern-type" style={inputStyle} value={concernForm.concernType} onChange={e=>setConcernForm(f=>({...f,concernType:e.target.value}))}>
          {CONCERN_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div style={{marginBottom:16}}>
        <label htmlFor="concern-description" style={labelStyle}>Tell us what's happened</label>
        <textarea id="concern-description" style={{...inputStyle,resize:"vertical"}} rows={4} value={concernForm.description}
          placeholder="What happened? When? Who else was involved or witnessed it?"
          onChange={e=>setConcernForm(f=>({...f,description:e.target.value}))} />
      </div>

      {gaps.length>0 && (
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
          {gaps.map((gap,i)=>(
            <div key={i} style={{fontSize:12,color:"#8A5A1E",background:"#FDF3E8",border:"1px solid #E8C088",borderRadius:8,padding:"8px 12px"}}>{gap}</div>
          ))}
        </div>
      )}

      <div style={{marginBottom:16}}>
        <label htmlFor="concern-witnesses" style={labelStyle}>Were there any witnesses? <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
        <input id="concern-witnesses" style={inputStyle} value={concernForm.witnesses} placeholder="Names of anyone who saw or heard this"
          onChange={e=>setConcernForm(f=>({...f,witnesses:e.target.value}))} />
      </div>

      <div style={{marginBottom:16}}>
        <label htmlFor="concern-evidence-description" style={labelStyle}>Do you have emails, messages, CCTV or other evidence? <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
        <input id="concern-evidence-description" style={{...inputStyle,marginBottom:8}} value={concernForm.evidenceDescription} placeholder="Briefly describe it"
          onChange={e=>setConcernForm(f=>({...f,evidenceDescription:e.target.value}))} />
        {concernForm.evidenceFiles.length>0 && (
          <div style={{marginBottom:8}}>
            {concernForm.evidenceFiles.map((ev,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F1EA"}}>
                <span style={{fontSize:12,color:"#1A1535"}}>{ev.name}</span>
                <button onClick={()=>setConcernForm(f=>({...f,evidenceFiles:f.evidenceFiles.filter((_,j)=>j!==i)}))} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <EvidenceDropzone onFilesSelected={async files=>{
          const items = await readEvidenceFiles(files, { addedBy: currentUser?.name||"Team member", onReject: msg=>showToast?.(msg,"error") });
          if(items.length) setConcernForm(f=>({...f,evidenceFiles:[...f.evidenceFiles,...items]}));
        }}/>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={concernForm.discussedWithEmployee} onChange={e=>setConcernForm(f=>({...f,discussedWithEmployee:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#1A1535"}}>Have you already discussed this with the employee?</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={concernForm.involvesSafetyOrWelfare} onChange={e=>setConcernForm(f=>({...f,involvesSafetyOrWelfare:e.target.checked}))} style={{width:16,height:16,accentColor:"#C84B2F",cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#1A1535"}}>Is anyone currently at risk?</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={concernForm.immediateSafetyConcern} onChange={e=>setConcernForm(f=>({...f,immediateSafetyConcern:e.target.checked}))} style={{width:16,height:16,accentColor:"#C84B2F",cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#1A1535"}}>Is there an immediate operational or safety concern?</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={concernForm.mayNeedFormalProcess} onChange={e=>setConcernForm(f=>({...f,mayNeedFormalProcess:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#1A1535"}}>Do you think this might need a formal process?</span>
        </label>
      </div>
      <Btn onClick={onSubmit} disabled={!canSubmit} style={{width:"100%"}}>{submitLabel}</Btn>
    </Card>
  );
}

const URGENCY_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
  LOW: { color:"#1A7A4A", bg:"#E8F5EE" },
};

// Manager Enablement (Phase 4, MP5, §3) — Compass's own structured
// triage summary, read straight off the referral's ai_* fields
// (generateConcernTriageSummary, App.jsx) rather than making HR re-read
// the manager's raw description from scratch. Purely informational —
// nothing here is clickable or decides anything; HR's own 5-action
// disposition below is untouched.
function TriageSummary({ referral, loading }) {
  if (loading) {
    return <div style={{fontSize:12,color:"#9B9098",fontStyle:"italic",marginBottom:10}}>Compass is analysing this concern…</div>;
  }
  if (!referral.aiSummary) return null;
  return (
    <div style={{background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:12,marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#5B3FD4",textTransform:"uppercase",letterSpacing:0.4}}>Compass summary</div>
        {referral.aiCategory&&<span style={{fontSize:10,color:"#5B3FD4",background:"#EDE8FF",borderRadius:4,padding:"2px 7px",fontWeight:600}}>{referral.aiCategory}</span>}
        {referral.aiUrgency&&URGENCY_STYLE[referral.aiUrgency]&&<span style={{fontSize:10,fontWeight:700,color:URGENCY_STYLE[referral.aiUrgency].color,background:URGENCY_STYLE[referral.aiUrgency].bg,borderRadius:4,padding:"2px 7px"}}>{referral.aiUrgency} URGENCY</span>}
      </div>
      <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6,marginBottom:referral.aiWitnessesCount!=null||referral.aiEvidenceMentioned?.length||referral.aiImmediateAction||referral.aiConsiderations?8:0}}>{referral.aiSummary}</div>
      {referral.aiWitnessesCount!=null&&<div style={{fontSize:12,color:"#6B6375",marginBottom:2}}>Potential witnesses: {referral.aiWitnessesCount}</div>}
      {referral.aiEvidenceMentioned?.length>0&&<div style={{fontSize:12,color:"#6B6375",marginBottom:2}}>Evidence mentioned: {referral.aiEvidenceMentioned.join(", ")}</div>}
      {referral.aiImmediateAction&&<div style={{fontSize:12,color:"#6B6375",marginBottom:2}}>Immediate action taken: {referral.aiImmediateAction}</div>}
      {referral.aiConsiderations&&<div style={{fontSize:12,color:"#B87520",marginTop:6}}>⚠ {referral.aiConsiderations}</div>}
    </div>
  );
}

function ReferralCard({ referral, onTriage, onOpenCase, onStartInformal, triageLoading }) {
  const meta = referralStatusMeta(referral.status);
  const isOpen = referral.status==="new";
  return (
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{referral.employeeName}</div>
          <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>
            {CONCERN_TYPES.find(t=>t.id===referral.concernType)?.label||referral.concernType} · Raised by {referral.submittedByName||"a team member"}{referral.createdAt?" · "+new Date(referral.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}
          </div>
        </div>
        <Badge color={meta.color}>{meta.label}</Badge>
      </div>
      <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6,marginBottom:10}}>{referral.description}</div>
      <TriageSummary referral={referral} loading={triageLoading} />
      {referral.witnesses&&<div style={{fontSize:12,color:"#6B6375",marginBottom:6}}>Witnesses: {referral.witnesses}</div>}
      {(referral.evidenceDescription||referral.evidenceFiles?.length>0)&&(
        <div style={{fontSize:12,color:"#6B6375",marginBottom:6}}>
          Evidence: {referral.evidenceDescription||"—"}{referral.evidenceFiles?.length>0?" · "+referral.evidenceFiles.length+" file"+(referral.evidenceFiles.length!==1?"s":""):""}
        </div>
      )}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:isOpen?12:0}}>
        {referral.discussedWithEmployee&&<span style={{fontSize:11,color:"#6B6880"}}>✓ Discussed with employee</span>}
        {referral.involvesSafetyOrWelfare&&<span style={{fontSize:11,color:"#C84B2F"}}>⚠ Anyone at risk flagged</span>}
        {referral.immediateSafetyConcern&&<span style={{fontSize:11,color:"#C84B2F"}}>⚠ Immediate safety concern</span>}
        {referral.mayNeedFormalProcess&&<span style={{fontSize:11,color:"#B87520"}}>May need a formal process</span>}
      </div>
      {(referral.status==="case_opened"||referral.status==="handled_informally")&&referral.linkedCaseId&&(
        <button onClick={()=>onOpenCase(referral.linkedCaseId)} style={{fontSize:12,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>{referral.status==="case_opened"?"Open the case →":"View the conversation record →"}</button>
      )}
      {isOpen&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn variant="secondary" onClick={()=>onTriage(referral.id,"open_case")} style={{padding:"6px 12px",fontSize:12}}>Open formal case</Btn>
          <Btn variant="ghost" onClick={()=>onStartInformal(referral)} style={{padding:"6px 12px",fontSize:12}}>Deal with informally</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"request_more_info")} style={{padding:"6px 12px",fontSize:12}}>Request more info</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"return_to_manager")} style={{padding:"6px 12px",fontSize:12}}>Return to manager</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"close")} style={{padding:"6px 12px",fontSize:12}}>Close</Btn>
        </div>
      )}
    </Card>
  );
}

// Integrations & Workflow Automation (Phase 5, IP10, §2-3) — autoOpenForm
// lets App.jsx's "Create New Concern" action (from a read email,
// SaveEmailScreen) land HR straight on a pre-filled form rather than the
// triage queue they'd otherwise see first — the same initialSection/
// clearInitialSection deep-link shape SettingsScreen already uses.
// Non-HR always sees the form regardless (see the isHR branch below), so
// this only matters for the HR branch's own showForm toggle.
export function ConcernsScreen({ isHR, concernReferrals, concernForm, setConcernForm, submitConcernReferral, concernSubmitted, setConcernSubmitted, triageReferral, startInformalConversation, concernTriageLoading={}, currentUser, showToast, setActiveCaseId, setActiveCaseStage, setScreen, screens, autoOpenForm, clearAutoOpenForm }) {
  const [showForm, setShowForm] = useState(!!autoOpenForm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => clearAutoOpenForm?.(), []);
  const openCase = (caseId) => {
    setActiveCaseId(caseId);
    setActiveCaseStage("investigation");
    setScreen(screens.CASE_VIEW);
  };

  if (!isHR) {
    return (
      <div style={{maxWidth:560,margin:"0 auto",padding:"40px 20px"}}>
        {/* Design System Convergence pass, Phase 2 — was a purple serif
            h2; this is an intake form, not an editorial moment, so it
            gets the same plain PageHeader treatment as every other
            operational screen. */}
        <PageHeader title="Raise a people concern" subtitle="Tell HR about a conduct, performance, or welfare issue — they'll review it and decide the next step."/>
        {concernSubmitted ? (
          <Card style={{textAlign:"center",padding:"32px 20px"}}>
            <div style={{fontSize:15,color:"#1A1535",marginBottom:6,fontWeight:600}}>Submitted</div>
            <div style={{fontSize:13,color:"#6B6375",marginBottom:16}}>HR will review this and get back to you if they need anything further.</div>
            <Btn variant="secondary" onClick={()=>setConcernSubmitted(false)}>Raise another concern</Btn>
          </Card>
        ) : (
          <ConcernForm concernForm={concernForm} setConcernForm={setConcernForm} onSubmit={submitConcernReferral} currentUser={currentUser} showToast={showToast} />
        )}
      </div>
    );
  }

  const open = concernReferrals.filter(r=>r.status==="new");
  // Manager Enablement (Phase 4, MP5, §5) — the HR triage inbox groups by
  // each of this app's own real statuses (a richer set than the spec's
  // own simplified New/Awaiting Information/Under Review/Converted to
  // Case/Closed list), rather than collapsing everything past "new" into
  // one flat "previously triaged" bucket.
  const otherStatusGroups = REFERRAL_STATUSES.filter(s=>s.id!=="new").map(s=>({
    ...s, referrals: concernReferrals.filter(r=>r.status===s.id),
  })).filter(g=>g.referrals.length>0);

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"40px 20px"}}>
      <PageHeader title="People concerns" subtitle={`${open.length} awaiting triage`}
        actions={<Btn variant="secondary" onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"+ Raise a concern"}</Btn>}/>

      {showForm&&(
        <div style={{marginBottom:24}}>
          <ConcernForm concernForm={concernForm} setConcernForm={setConcernForm}
            onSubmit={()=>{submitConcernReferral();setShowForm(false);}} currentUser={currentUser} showToast={showToast} />
        </div>
      )}

      {open.length===0&&otherStatusGroups.length===0&&(
        <Card style={{textAlign:"center",padding:"32px 20px",color:"#9B9098",fontSize:13}}>No concerns raised yet.</Card>
      )}

      {open.map(r=><ReferralCard key={r.id} referral={r} onTriage={triageReferral} onOpenCase={openCase} onStartInformal={startInformalConversation} triageLoading={!!concernTriageLoading[r.id]} />)}

      {otherStatusGroups.map(group=>(
        <div key={group.id}>
          <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",margin:"20px 0 10px"}}>{group.label} ({group.referrals.length})</div>
          {group.referrals.map(r=><ReferralCard key={r.id} referral={r} onTriage={triageReferral} onOpenCase={openCase} onStartInformal={startInformalConversation} triageLoading={!!concernTriageLoading[r.id]} />)}
        </div>
      ))}
    </div>
  );
}
