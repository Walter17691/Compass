import { useState } from 'react';
import { CONCERN_TYPES } from '../constants';
import { referralStatusMeta } from '../lib/concernReferrals';
import { Btn, Card, Badge } from '../components/Primitives';

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
function ConcernForm({ concernForm, setConcernForm, onSubmit, submitLabel="Submit concern" }) {
  const canSubmit = concernForm.employeeName.trim() && concernForm.description.trim();
  return (
    <Card>
      <div style={{marginBottom:14}}>
        <label style={labelStyle}>Employee's name</label>
        <input style={inputStyle} value={concernForm.employeeName} placeholder="Who is this about?"
          onChange={e=>setConcernForm(f=>({...f,employeeName:e.target.value}))} />
      </div>
      <div style={{marginBottom:14}}>
        <label style={labelStyle}>What kind of concern is this?</label>
        <select style={inputStyle} value={concernForm.concernType} onChange={e=>setConcernForm(f=>({...f,concernType:e.target.value}))}>
          {CONCERN_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div style={{marginBottom:16}}>
        <label style={labelStyle}>Tell us what's happened</label>
        <textarea style={{...inputStyle,resize:"vertical"}} rows={4} value={concernForm.description}
          placeholder="What happened? When? Who else was involved or witnessed it?"
          onChange={e=>setConcernForm(f=>({...f,description:e.target.value}))} />
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={concernForm.discussedWithEmployee} onChange={e=>setConcernForm(f=>({...f,discussedWithEmployee:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#1A1535"}}>Have you already discussed this with the employee?</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={concernForm.involvesSafetyOrWelfare} onChange={e=>setConcernForm(f=>({...f,involvesSafetyOrWelfare:e.target.checked}))} style={{width:16,height:16,accentColor:"#C84B2F",cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#1A1535"}}>Does this involve a safety or welfare risk?</span>
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

function ReferralCard({ referral, onTriage, onOpenCase }) {
  const meta = referralStatusMeta(referral.status);
  const isOpen = referral.status==="new";
  return (
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{referral.employeeName}</div>
          <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>
            {CONCERN_TYPES.find(t=>t.id===referral.concernType)?.label||referral.concernType} · Raised by {referral.submittedByName||"a team member"}
          </div>
        </div>
        <Badge color={meta.color}>{meta.label}</Badge>
      </div>
      <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6,marginBottom:10}}>{referral.description}</div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:isOpen?12:0}}>
        {referral.discussedWithEmployee&&<span style={{fontSize:11,color:"#6B6880"}}>✓ Discussed with employee</span>}
        {referral.involvesSafetyOrWelfare&&<span style={{fontSize:11,color:"#C84B2F"}}>⚠ Safety/welfare risk flagged</span>}
        {referral.mayNeedFormalProcess&&<span style={{fontSize:11,color:"#B87520"}}>May need a formal process</span>}
      </div>
      {referral.status==="case_opened"&&referral.linkedCaseId&&(
        <button onClick={()=>onOpenCase(referral.linkedCaseId)} style={{fontSize:12,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>Open the case →</button>
      )}
      {isOpen&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn variant="secondary" onClick={()=>onTriage(referral.id,"open_case")} style={{padding:"6px 12px",fontSize:12}}>Open formal case</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"deal_informally")} style={{padding:"6px 12px",fontSize:12}}>Deal with informally</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"request_more_info")} style={{padding:"6px 12px",fontSize:12}}>Request more info</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"return_to_manager")} style={{padding:"6px 12px",fontSize:12}}>Return to manager</Btn>
          <Btn variant="ghost" onClick={()=>onTriage(referral.id,"close")} style={{padding:"6px 12px",fontSize:12}}>Close</Btn>
        </div>
      )}
    </Card>
  );
}

export function ConcernsScreen({ isHR, concernReferrals, concernForm, setConcernForm, submitConcernReferral, concernSubmitted, setConcernSubmitted, triageReferral, setActiveCaseId, setActiveCaseStage, setScreen, screens }) {
  const [showForm, setShowForm] = useState(false);
  const openCase = (caseId) => {
    setActiveCaseId(caseId);
    setActiveCaseStage("investigation");
    setScreen(screens.CASE_VIEW);
  };

  if (!isHR) {
    return (
      <div style={{maxWidth:560,margin:"0 auto",padding:"40px 20px"}}>
        <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Raise a people concern</h2>
        <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>Tell HR about a conduct, performance, or welfare issue — they'll review it and decide the next step.</p>
        {concernSubmitted ? (
          <Card style={{textAlign:"center",padding:"32px 20px"}}>
            <div style={{fontSize:15,color:"#1A1535",marginBottom:6,fontWeight:600}}>Submitted</div>
            <div style={{fontSize:13,color:"#6B6375",marginBottom:16}}>HR will review this and get back to you if they need anything further.</div>
            <Btn variant="secondary" onClick={()=>setConcernSubmitted(false)}>Raise another concern</Btn>
          </Card>
        ) : (
          <ConcernForm concernForm={concernForm} setConcernForm={setConcernForm} onSubmit={submitConcernReferral} />
        )}
      </div>
    );
  }

  const open = concernReferrals.filter(r=>r.status==="new");
  const resolved = concernReferrals.filter(r=>r.status!=="new");

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"40px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
        <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>People concerns</h2>
        <Btn variant="secondary" onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"+ Raise a concern"}</Btn>
      </div>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 20px"}}>{open.length} awaiting triage</p>

      {showForm&&(
        <div style={{marginBottom:24}}>
          <ConcernForm concernForm={concernForm} setConcernForm={setConcernForm}
            onSubmit={()=>{submitConcernReferral();setShowForm(false);}} />
        </div>
      )}

      {open.length===0&&resolved.length===0&&(
        <Card style={{textAlign:"center",padding:"32px 20px",color:"#9B9098",fontSize:13}}>No concerns raised yet.</Card>
      )}

      {open.map(r=><ReferralCard key={r.id} referral={r} onTriage={triageReferral} onOpenCase={openCase} />)}

      {resolved.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",margin:"20px 0 10px"}}>Previously triaged</div>
          {resolved.map(r=><ReferralCard key={r.id} referral={r} onTriage={triageReferral} onOpenCase={openCase} />)}
        </>
      )}
    </div>
  );
}
