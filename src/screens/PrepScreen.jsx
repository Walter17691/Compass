import { useState } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { DateInput } from '../components/DateInput';

const CATEGORY_LABEL = { agenda:"Agenda", evidence:"Evidence", clarification:"Clarification", unanswered:"Unanswered", general:"General" };

// Meeting Intelligence Phase 2 (M1) — one editable question row: essential
// toggle, inline-editable text, category badge, optional "Why ask this?"
// reasoning (AI-sourced questions only), reorder/remove, and — only when
// this prep is linked to an existing case — allegation/evidence link
// selects. Kept as its own component since PrepScreen's render is already
// long and every row needs several pieces of local toggle state (the
// reasoning expand/collapse).
function PrepQuestionRow({ q, index, total, linkedCaseAllegations, linkedCaseEvidence, onUpdateText, onRemove, onMove, onToggleEssential, onLinkAllegation, onLinkEvidence }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <button onClick={onToggleEssential} aria-label={q.essential?"Essential — click to unmark":"Mark as essential"} title={q.essential?"Essential — click to unmark":"Mark as essential"}
          style={{background:"none",border:"none",cursor:"pointer",padding:2,fontSize:15,color:q.essential?"#B87520":"#C4BAB0",flexShrink:0,lineHeight:1}}>
          {q.essential?"★":"☆"}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <input aria-label={`Question ${index+1} text`} value={q.text} onChange={e=>onUpdateText(e.target.value)} placeholder="Question text..."
            style={{width:"100%",fontSize:13,color:"#1A1535",border:"none",background:"none",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:600,color:"#6B6880",background:"#F0EAD8",borderRadius:4,padding:"1px 6px",textTransform:"uppercase",letterSpacing:0.3}}>{CATEGORY_LABEL[q.category]||"General"}</span>
            {q.reasoning&&(
              <button onClick={()=>setShowWhy(v=>!v)} style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0,textDecoration:"underline"}}>
                {showWhy?"Hide why":"Why ask this?"}
              </button>
            )}
            {linkedCaseAllegations.length>0&&(
              <select aria-label={`Link question ${index+1} to allegation`} value={q.linkedAllegationId||""} onChange={e=>onLinkAllegation(e.target.value)}
                style={{fontSize:11,border:"1px solid #E8E0D0",borderRadius:5,padding:"2px 4px",color:"#6B6375",background:"#fff",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                <option value="">Link to allegation…</option>
                {linkedCaseAllegations.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            )}
            {linkedCaseEvidence.length>0&&(
              <select aria-label={`Link question ${index+1} to evidence`} value={q.linkedEvidenceId??""} onChange={e=>onLinkEvidence(e.target.value)}
                style={{fontSize:11,border:"1px solid #E8E0D0",borderRadius:5,padding:"2px 4px",color:"#6B6375",background:"#fff",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                <option value="">Link to evidence…</option>
                {linkedCaseEvidence.map(ev=><option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            )}
          </div>
          {showWhy&&q.reasoning&&(
            <div style={{fontSize:11,color:"#6B6375",marginTop:6,lineHeight:1.5,fontStyle:"italic"}}>{q.reasoning}</div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
          <button onClick={()=>onMove(-1)} disabled={index===0} aria-label="Move up" style={{background:"none",border:"none",cursor:index===0?"default":"pointer",color:index===0?"#E8E0D0":"#9B9098",fontSize:12,padding:0,lineHeight:1}}>▲</button>
          <button onClick={()=>onMove(1)} disabled={index===total-1} aria-label="Move down" style={{background:"none",border:"none",cursor:index===total-1?"default":"pointer",color:index===total-1?"#E8E0D0":"#9B9098",fontSize:12,padding:0,lineHeight:1}}>▼</button>
        </div>
        <button onClick={onRemove} aria-label="Remove question" style={{background:"none",border:"none",color:"#C4BAB0",fontSize:14,cursor:"pointer",padding:"0 2px",lineHeight:1,flexShrink:0}}>✕</button>
      </div>
    </div>
  );
}

export function PrepScreen({ isMobile, meetingType, setMeetingType, caseInfo, setCaseInfo, handlePrepare, aiProcessing, setScreen, bgDoc, setBgDoc, prepNotes,
  prepQuestions=[], linkedCaseAllegations=[], linkedCaseEvidence=[],
  onAddPrepQuestion, onUpdatePrepQuestionText, onRemovePrepQuestion, onMovePrepQuestion, onTogglePrepQuestionEssential, onLinkPrepQuestionToAllegation, onLinkPrepQuestionToEvidence,
}) {
  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:isMobile?"24px 16px":"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#7C5CFC",marginBottom:12,fontWeight:600}}>Prepare first</div>
      <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:30,color:"#1A1535",margin:"0 0 8px",fontWeight:400}}>Tell Compass about this meeting</h1>
      <p style={{fontSize:14,color:"#6B6880",margin:"0 0 32px",lineHeight:1.7}}>Compass will generate targeted questions and a prep pack.</p>

      <div style={{textAlign:"left",marginBottom:16}}>
        <label htmlFor="prep-meeting-type" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting type <span style={{color:"#C84B2F"}}>*</span></label>
        <select id="prep-meeting-type" value={meetingType?.id||""} onChange={e=>{const t=MEETING_TYPES.find(x=>x.id===e.target.value);setMeetingType(t);}}
          style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:14,outline:"none",color:meetingType?"#1C1820":"#9B9098",boxSizing:"border-box"}}>
          <option value="" disabled>Select meeting type...</option>
          <option disabled style={{color:"#6B6880"}}>── ER Meetings ──</option>
          {MEETING_TYPES.filter(t=>t.mode==="er"&&t.group==="formal").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          <option disabled style={{color:"#6B6880"}}>── Appeals ──</option>
          {MEETING_TYPES.filter(t=>t.group==="appeal").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          <option disabled style={{color:"#6B6880"}}>── Redundancy ──</option>
          {MEETING_TYPES.filter(t=>t.group==="redundancy").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          <option disabled style={{color:"#6B6880"}}>── Development ──</option>
          {MEETING_TYPES.filter(t=>t.group==="dev").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div style={{textAlign:"left",marginBottom:16}}>
        <label htmlFor="prep-employee-name" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee name <span style={{color:"#C84B2F"}}>*</span></label>
        <input id="prep-employee-name" autoFocus placeholder="e.g. Sarah Johnson" value={caseInfo.employee}
          onChange={e=>setCaseInfo(p=>({...p,employee:e.target.value}))}
          style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:15,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />
      </div>

      <div style={{textAlign:"left",marginBottom:16}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting date</label>
        <DateInput value={caseInfo.date} onChange={e=>setCaseInfo(p=>({...p,date:e.target.value}))} />
      </div>

      <div style={{textAlign:"left",marginBottom:16}}>
        <label htmlFor="prep-manager-name" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Your name</label>
        <input id="prep-manager-name" placeholder="Chair / HR manager name" value={caseInfo.manager}
          onChange={e=>setCaseInfo(p=>({...p,manager:e.target.value}))}
          style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:15,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />
      </div>

      <div style={{textAlign:"left",marginBottom:32}}>
        <label htmlFor="prep-background" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Background <span style={{color:"#6B6880",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>(recommended)</span></label>
        <textarea id="prep-background" value={caseInfo.context} onChange={e=>setCaseInfo(p=>({...p,context:e.target.value}))}
          placeholder="Previous warnings, allegations, relevant history, reasonable adjustments..."
          rows={4} style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#1A1535",boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}></textarea>
      </div>

      <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16}}>
        <Btn onClick={handlePrepare} disabled={aiProcessing||!caseInfo.employee.trim()||!meetingType}
          style={{padding:"14px 28px",fontSize:15,background:"#7C5CFC",borderColor:"#E8622A"}}>
          {aiProcessing?"Building...":"Generate prep pack"}
        </Btn>
        <Btn variant="ghost" onClick={()=>{setMeetingType(null);setScreen(SCREENS.HOME);}} style={{padding:"14px 20px",fontSize:14}}>Cancel</Btn>
      </div>

      <div style={{textAlign:"left",marginBottom:24}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Supporting document <span style={{color:"#6B6880",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>(optional — PDF, Word or text)</span></label>
        {bgDoc?(
          <div style={{display:"flex",alignItems:"center",gap:10,background:"#FFFFFF",border:"1px solid #7C5CFC33",borderRadius:8,padding:"12px 16px"}}>
            <span style={{fontSize:20}}>&#128196;</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14,color:"#1A1535",fontWeight:500}}>{bgDoc.name}</div>
              <div style={{fontSize:11,color:"#6B6880"}}>{bgDoc.text.length} characters extracted</div>
            </div>
            <button onClick={()=>setBgDoc(null)} style={{background:"none",border:"none",color:"#6B6880",fontSize:18,cursor:"pointer"}}>&#10005;</button>
          </div>
        ):(
          <label style={{display:"block",background:"#FFFFFF",border:"1px dashed #E8E0D0",borderRadius:8,padding:"20px",textAlign:"center",cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
            <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={async e=>{
              const file = e.target.files[0];
              if(!file) return;
              const name = file.name;
              if(name.endsWith(".txt")) {
                const text = await file.text();
                setBgDoc({name, text: text.slice(0,8000)});
              } else if(name.endsWith(".pdf")) {
                const arr = await file.arrayBuffer();
                const bytes = new Uint8Array(arr);
                const str = new TextDecoder("utf-8").decode(bytes);
                const text = str.split("").filter(ch=>ch.charCodeAt(0)>31).join("").replace(/  +/g," ").trim().slice(0,8000);
                setBgDoc({name, text});
              } else {
                const text = await file.text();
                setBgDoc({name, text: text.slice(0,8000)});
              }
            }}/>
            <div style={{fontSize:13,color:"#6B6375",marginBottom:4}}>Click to upload</div>
            <div style={{fontSize:11,color:"#5A5570"}}>PDF, Word or text file</div>
          </label>
        )}
      </div>

      <button onClick={()=>setScreen(SCREENS.RECORD)}
        style={{background:"none",border:"none",color:"#6B6880",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
        Skip prep and start meeting now
      </button>

      {prepNotes&&(
        <div style={{marginTop:28,textAlign:"left",background:"#FFFFFF",border:"1px solid #7C5CFC33",borderRadius:12,padding:20}}>
          <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Prep pack ready</div>
          <MDRenderer text={prepNotes}/>

          <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #EDE5D8"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Key questions</div>
            {prepQuestions.length===0&&(
              <div style={{fontSize:12,color:"#9B9098",marginBottom:8}}>No questions yet — add one below.</div>
            )}
            {prepQuestions.map((q,i)=>(
              <PrepQuestionRow key={q.id} q={q} index={i} total={prepQuestions.length}
                linkedCaseAllegations={linkedCaseAllegations} linkedCaseEvidence={linkedCaseEvidence}
                onUpdateText={t=>onUpdatePrepQuestionText(q.id,t)}
                onRemove={()=>onRemovePrepQuestion(q.id)}
                onMove={dir=>onMovePrepQuestion(q.id,dir)}
                onToggleEssential={()=>onTogglePrepQuestionEssential(q.id)}
                onLinkAllegation={id=>onLinkPrepQuestionToAllegation(q.id,id)}
                onLinkEvidence={idx=>onLinkPrepQuestionToEvidence(q.id,idx)}
              />
            ))}
            <button onClick={onAddPrepQuestion} style={{fontSize:12,background:"none",border:"1px dashed #E8E0D0",borderRadius:8,padding:"7px 14px",color:"#7C5CFC",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",width:"100%"}}>
              + Add question
            </button>
          </div>

          <Btn onClick={()=>setScreen(SCREENS.RECORD)} style={{marginTop:16,width:"100%"}}>Start meeting</Btn>
        </div>
      )}
    </div>
  );
}
