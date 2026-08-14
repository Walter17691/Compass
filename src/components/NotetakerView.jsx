import { useState } from 'react';

// Manager Enablement (Phase 4, MP2, §19) — a genuinely restricted view,
// same branch-point InvestigatorChecklistView already uses (rendered
// instead of CaseViewScreen's full tabbed workspace when the current
// non-HR user holds case_access role "notetaker" on this specific case).
// Deliberately shows only what §19 names: the meeting itself, its
// participants, the case's already-flagged open questions (reused from
// the same unanswered_question case_signals every other panel already
// reads — not a new "case owner pre-approves questions" mechanism), a
// notes area, and a lightweight way to raise an action — never
// cs.evidence, cs.outcome, wellbeing data, or any other case for this
// employee. Focuses on the most recent meeting on the case, since
// case_access is case-scoped, not meeting-scoped, and a notetaker is
// realistically brought in for whichever meeting is currently happening.
export function NotetakerView({ cs, cases, saveCases, createCaseTask, openQuestions, currentUser, fmtDate, setScreen, screens }) {
  const meeting = (cs.meetings||[])[cs.meetings.length-1] || null;
  const [notes, setNotes] = useState(meeting?.notetakerNotes || "");
  const [actionText, setActionText] = useState("");
  const submitted = meeting?.notetakerNotesStatus === "submitted";
  const reviewed = meeting?.notetakerNotesStatus === "reviewed";

  const saveMeetingField = (fields) => {
    if(!meeting) return;
    saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:x.meetings.map(m=>m.id===meeting.id?{...m,...fields}:m)}:x));
  };

  const submitNotes = () => saveMeetingField({ notetakerNotes: notes, notetakerNotesStatus: "submitted", notetakerNotesSubmittedBy: currentUser?.name||"", notetakerNotesSubmittedAt: new Date().toISOString() });

  const addAction = () => {
    if(!actionText.trim()) return;
    createCaseTask(cs.id, { name: actionText.trim(), owner: currentUser?.name||"" });
    setActionText("");
  };

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{maxWidth:640,margin:"0 auto",padding:"40px 20px"}}>
        <button onClick={()=>setScreen(screens.CASES)} style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0,marginBottom:16}}>← Cases</button>
        <div style={{fontSize:11,color:"#9B9098"}}>{cs.employeeName}</div>
        <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:24,color:"#7C5CFC",margin:"2px 0 6px",fontWeight:600}}>Notetaker</h2>
        <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>You've been asked to take notes for this meeting. Your notes go to the case owner for review once you submit them.</p>

        {!meeting ? (
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",fontSize:13,color:"#9B9098"}}>No meeting has been set up on this case yet.</div>
        ) : (
          <>
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Meeting details</div>
              <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{meeting.type||"Meeting"}</div>
              <div style={{fontSize:13,color:"#6B6375",marginTop:2}}>{fmtDate(meeting.date)}</div>
            </div>

            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Participants</div>
              {(meeting.participants||[]).length===0 ? (
                <div style={{fontSize:13,color:"#9B9098"}}>No participants recorded.</div>
              ) : (meeting.participants||[]).map((p,i)=>(
                <div key={i} style={{fontSize:13,color:"#1A1535",padding:"5px 0",borderBottom:i<meeting.participants.length-1?"1px solid #F5F1EA":"none"}}>{p.name||p}{p.role?" · "+p.role:""}</div>
              ))}
            </div>

            {openQuestions.length>0 && (
              <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginBottom:14}}>
                <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Questions to ask</div>
                {openQuestions.map(q=>(
                  <div key={q.id} style={{fontSize:13,color:"#1A1535",padding:"6px 0",borderBottom:"1px solid #F5F1EA"}}>{q.title}</div>
                ))}
              </div>
            )}

            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Notes</div>
              {reviewed ? (
                <>
                  <div style={{fontSize:12,color:"#1A7A4A",fontWeight:600,marginBottom:8}}>Reviewed by the case owner</div>
                  <div style={{fontSize:13,color:"#1A1535",whiteSpace:"pre-wrap",lineHeight:1.6}}>{meeting.notetakerNotes}</div>
                </>
              ) : submitted ? (
                <>
                  <div style={{fontSize:12,color:"#B87520",fontWeight:600,marginBottom:8}}>Submitted — awaiting review</div>
                  <div style={{fontSize:13,color:"#1A1535",whiteSpace:"pre-wrap",lineHeight:1.6}}>{meeting.notetakerNotes}</div>
                </>
              ) : (
                <>
                  <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Type your notes here..." rows={8}
                    style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",color:"#1A1535",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif",resize:"vertical",boxSizing:"border-box",marginBottom:10}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>saveMeetingField({notetakerNotes:notes})} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Save draft</button>
                    <button onClick={submitNotes} disabled={!notes.trim()} style={{fontSize:12,background:notes.trim()?"#7C5CFC":"#B8A9F8",border:"none",borderRadius:6,padding:"7px 14px",color:"#fff",fontWeight:600,cursor:notes.trim()?"pointer":"not-allowed",fontFamily:"DM Sans,system-ui,sans-serif"}}>Submit for review</button>
                  </div>
                </>
              )}
            </div>

            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
              <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Actions</div>
              <div style={{display:"flex",gap:8}}>
                <input value={actionText} onChange={e=>setActionText(e.target.value)} placeholder="e.g. Chase the missing document"
                  style={{flex:1,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",color:"#1A1535",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
                <button onClick={addAction} disabled={!actionText.trim()} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 14px",color:"#6B6375",cursor:actionText.trim()?"pointer":"not-allowed",fontFamily:"DM Sans,system-ui,sans-serif",flexShrink:0}}>+ Add</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
