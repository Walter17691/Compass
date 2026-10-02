import { useState } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { DateInput } from '../components/DateInput';
import { LockIcon } from '../components/Icons';
import { EmployeeSelect } from '../components/EmployeeSelect';
import { COLOR, TYPE, FONT, RADIUS } from '../styles/tokens';
import { splitPrepPack, prepPackSummary } from '../lib/prepPackSections';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C2 — preparing for a conversation, not filling in a form for the AI.
//
// WHAT THIS SCREEN WAS.
//
// It opened "Tell Compass about this meeting", and the dominant filled button
// was "Generate prep pack". The actual lifecycle action — Start — was a small
// underlined text link reading "Skip prep and start meeting now", or a button
// that only existed once a prep pack had been generated. So the advisory action
// outranked the real one, and a manager who simply wanted to begin was offered
// "skip" as though preparing were compulsory.
//
// It also re-asked meeting type, date and chair, all of which the setup screen
// had just collected, and it carried the pre-token palette throughout.
//
// WHAT CHANGED, AND WHAT DID NOT.
//
// Order and emphasis: what the meeting IS, why it is happening, what to cover,
// then Compass's help behind a disclosure, then one primary action. Every
// capability survives — questions keep inline editing, essential-marking,
// reordering, removal, allegation and evidence links and "Why ask this?"; the
// supporting-document upload keeps its keyboard-focusable input; the appeal
// locks are untouched.
//
// ┌─ WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────┐
// │ No readiness score, no percentage, no red/amber/green. Preparation is   │
// │ metadata, not a lifecycle state, and nothing here grades the manager.   │
// │ Compass's questions are suggestions and are labelled as suggestions —   │
// │ there is no "required questions" list and none of them gate Start.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// LIFECYCLE: unchanged. startMeeting still passes caseInfo.meetingId, so Start
// transitions the EXISTING scheduled meeting rather than creating a second one.
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_LABEL = { agenda:"Agenda", evidence:"Evidence", clarification:"Clarification", unanswered:"Unanswered", general:"General" };

function Section({ title, hint, children, style }) {
  return (
    <section style={{textAlign:"left",marginBottom:28,...style}}>
      {title&&<h2 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:"0 0 4px"}}>{title}</h2>}
      {hint&&<p style={{...TYPE.metadata,color:COLOR.inkQuiet,margin:"0 0 12px",lineHeight:1.5,maxWidth:520}}>{hint}</p>}
      {children}
    </section>
  );
}

// Compass's help is available, not displayed at you. Collapsed by default so the
// screen can be read in seconds; everything inside is unchanged when opened.
function Reveal({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:14,marginBottom:20}}>
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        style={{display:"flex",width:"100%",alignItems:"baseline",justifyContent:"space-between",gap:12,
                background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left",fontFamily:FONT.sans}}>
        <span style={{...TYPE.rowContext,color:COLOR.ink,fontWeight:600}}>{title}</span>
        <span style={{...TYPE.metadata,color:COLOR.inkQuiet,whiteSpace:"nowrap"}}>
          {summary}{" "}
          <span aria-hidden="true" style={{display:"inline-block",transition:"transform 120ms ease",transform:open?"rotate(90deg)":"none"}}>›</span>
        </span>
      </button>
      {open&&<div style={{marginTop:14}}>{children}</div>}
    </div>
  );
}

// One section of the generated pack. Collapsed by default: a manager looking for
// the Opening Script should not have to read the Legal Checklist to find it.
function PackSection({ title, whenUseful, body }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{borderBottom:`1px solid ${COLOR.borderFaint}`}}>
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        style={{display:"flex",width:"100%",alignItems:"baseline",justifyContent:"space-between",gap:10,
                background:"none",border:"none",padding:"10px 0",cursor:"pointer",textAlign:"left",fontFamily:FONT.sans}}>
        <span style={{...TYPE.rowContext,color:COLOR.ink}}>{title}</span>
        <span style={{...TYPE.metadata,color:COLOR.inkQuiet,whiteSpace:"nowrap"}}>
          {whenUseful==="during"?"for the meeting":"to read now"}{" "}
          <span aria-hidden="true" style={{display:"inline-block",transform:open?"rotate(90deg)":"none"}}>›</span>
        </span>
      </button>
      {open&&<div style={{paddingBottom:14}}><MDRenderer text={body}/></div>}
    </div>
  );
}

const fieldStyle = {
  width:"100%",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,
  padding:"12px 14px",fontSize:14,outline:"none",color:COLOR.ink,boxSizing:"border-box",fontFamily:FONT.sans,
};
const lockedStyle = {
  ...fieldStyle,background:COLOR.rail,display:"flex",alignItems:"center",gap:8,
};
const labelStyle = {
  display:"block",...TYPE.metadata,color:COLOR.inkFaint,marginBottom:6,
};

// One editable question row. Unchanged in capability from the previous version:
// essential toggle, inline text, category, optional AI reasoning, allegation and
// evidence links, reorder, remove. Restyled onto the frozen Wave B palette.
function PrepQuestionRow({ q, index, total, linkedCaseAllegations, linkedCaseEvidence, onUpdateText, onRemove, onMove, onToggleEssential, onLinkAllegation, onLinkEvidence }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"10px 12px",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <button onClick={onToggleEssential} aria-label={q.essential?"Essential — click to unmark":"Mark as essential"} title={q.essential?"Essential — click to unmark":"Mark as essential"}
          style={{background:"none",border:"none",cursor:"pointer",padding:2,fontSize:15,color:q.essential?COLOR.amber:COLOR.inkQuiet,flexShrink:0,lineHeight:1}}>
          {q.essential?"★":"☆"}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <input aria-label={`Question ${index+1} text`} value={q.text} onChange={e=>onUpdateText(e.target.value)} placeholder="Question text..."
            style={{width:"100%",fontSize:13,color:COLOR.ink,border:"none",background:"none",outline:"none",fontFamily:FONT.sans,padding:0}}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:600,color:COLOR.inkFaint,background:COLOR.rail,borderRadius:4,padding:"1px 6px",textTransform:"uppercase",letterSpacing:0.3}}>{CATEGORY_LABEL[q.category]||"General"}</span>
            {q.reasoning&&(
              <button onClick={()=>setShowWhy(v=>!v)} aria-expanded={showWhy}
                style={{fontSize:11,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0,textDecoration:"underline"}}>
                {showWhy?"Hide why":"Why ask this?"}
              </button>
            )}
            {linkedCaseAllegations.length>0&&(
              <select aria-label={`Link question ${index+1} to allegation`} value={q.linkedAllegationId||""} onChange={e=>onLinkAllegation(e.target.value)}
                style={{fontSize:11,border:`1px solid ${COLOR.border}`,borderRadius:5,padding:"2px 4px",color:COLOR.inkSoft,background:COLOR.surface,fontFamily:FONT.sans}}>
                <option value="">Link to allegation…</option>
                {linkedCaseAllegations.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            )}
            {linkedCaseEvidence.length>0&&(
              <select aria-label={`Link question ${index+1} to evidence`} value={q.linkedEvidenceId??""} onChange={e=>onLinkEvidence(e.target.value)}
                style={{fontSize:11,border:`1px solid ${COLOR.border}`,borderRadius:5,padding:"2px 4px",color:COLOR.inkSoft,background:COLOR.surface,fontFamily:FONT.sans}}>
                <option value="">Link to evidence…</option>
                {linkedCaseEvidence.map(ev=><option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            )}
          </div>
          {showWhy&&q.reasoning&&(
            <div style={{fontSize:11,color:COLOR.inkSoft,marginTop:6,lineHeight:1.5,fontStyle:"italic"}}>{q.reasoning}</div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
          <button onClick={()=>onMove(-1)} disabled={index===0} aria-label="Move up" style={{background:"none",border:"none",cursor:index===0?"default":"pointer",color:index===0?COLOR.border:COLOR.inkQuiet,fontSize:12,padding:0,lineHeight:1}}>▲</button>
          <button onClick={()=>onMove(1)} disabled={index===total-1} aria-label="Move down" style={{background:"none",border:"none",cursor:index===total-1?"default":"pointer",color:index===total-1?COLOR.border:COLOR.inkQuiet,fontSize:12,padding:0,lineHeight:1}}>▼</button>
        </div>
        <button onClick={onRemove} aria-label="Remove question" style={{background:"none",border:"none",color:COLOR.inkQuiet,fontSize:14,cursor:"pointer",padding:"0 2px",lineHeight:1,flexShrink:0}}>✕</button>
      </div>
    </div>
  );
}

export function PrepScreen({ beginMeeting, isMobile, meetingType, setMeetingType, caseInfo, setCaseInfo, employeeRecords = [], handlePrepare, aiProcessing, aiError, setScreen, bgDoc, setBgDoc, prepNotes,
  prepQuestions=[], linkedCaseAllegations=[], linkedCaseEvidence=[],
  onAddPrepQuestion, onUpdatePrepQuestionText, onRemovePrepQuestion, onMovePrepQuestion, onTogglePrepQuestionEssential, onLinkPrepQuestionToAllegation, onLinkPrepQuestionToEvidence,
}) {
  const [starting, setStarting] = useState(false);
  // Release 1 Phase 2.3 continuity — pass the meeting Prep was opened FOR, so
  // Start transitions that exact scheduled meeting instead of creating a second
  // one. UNCHANGED by Wave C2: this is the stable-identity guarantee.
  const startMeeting = async () => { setStarting(true); try { await beginMeeting({ meetingId: caseInfo.meetingId || null }); } finally { setStarting(false); } };
  const [docInputFocused, setDocInputFocused] = useState(false);
  // Appeal Prep Pack P1 (2026-09-20) — chair and meeting type are already
  // authoritative when prep arrives from the appeal workflow, so they are shown
  // read-only rather than as free text. Untouched by C2.
  const isStructuredAppealPrep = !!caseInfo.preparedCaseId && !!caseInfo.appealChairLocked;
  const groundedInCase = !!caseInfo.preparedCaseId;
  const hearingSummary = [
    caseInfo.date ? new Date(caseInfo.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) : null,
    caseInfo.time || null,
    caseInfo.locationOrMethod || null,
  ].filter(Boolean).join(" · ");

  const canStart = !starting;
  const canGenerate = !aiProcessing && !!caseInfo.employee?.trim() && !!meetingType;
  const essentialCount = prepQuestions.filter(q=>q.essential).length;

  return (
    <div style={{maxWidth:620,margin:"0 auto",padding:isMobile?"24px 16px":"48px 20px",fontFamily:FONT.sans}}>
      {/* The screen is about the conversation, not about briefing the software. */}
      <h1 style={{...TYPE.identity,fontSize:26,color:COLOR.ink,margin:"0 0 6px"}}>
        Prepare for this meeting
      </h1>
      <p style={{...TYPE.rowContext,color:COLOR.inkSoft,margin:"0 0 32px",lineHeight:1.6,maxWidth:520}}>
        {groundedInCase
          ? "The case history, decision and open questions are already drawn from the case record."
          : "A few details, then anything you want to cover."}
      </p>

      {/* ── 1. WHAT THIS MEETING IS ─────────────────────────────────────── */}
      <Section title="Meeting">
        <div style={{marginBottom:14}}>
          <label htmlFor="prep-meeting-type" style={labelStyle}>Meeting type <span style={{color:COLOR.red||"#C0392B"}}>*</span></label>
          {isStructuredAppealPrep ? (
            <div id="prep-meeting-type" style={lockedStyle}>
              <LockIcon size={13} color={COLOR.inkFaint} />{meetingType?.label||"Disciplinary Appeal"}
            </div>
          ) : (
            <select id="prep-meeting-type" value={meetingType?.id||""} onChange={e=>{const t=MEETING_TYPES.find(x=>x.id===e.target.value);setMeetingType(t);}}
              style={{...fieldStyle,color:meetingType?COLOR.ink:COLOR.inkQuiet}}>
              <option value="" disabled>Select meeting type...</option>
              <option disabled>── ER Meetings ──</option>
              {MEETING_TYPES.filter(t=>t.mode==="er"&&t.group==="formal").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled>── Appeals ──</option>
              {MEETING_TYPES.filter(t=>t.group==="appeal").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled>── Redundancy ──</option>
              {MEETING_TYPES.filter(t=>t.group==="redundancy").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled>── Development ──</option>
              {MEETING_TYPES.filter(t=>t.group==="dev").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
        </div>

        {/* E2 — this screen has its own Start, so it is a creation route and must
            establish canonical identity. When the employee is already known, show
            WHO and do not ask again; when they are not, ask canonically.
            UNCHANGED by C2. */}
        <div style={{marginBottom:14}}>
          {caseInfo.employeeId ? (
            <>
              <div style={labelStyle}>Employee</div>
              <div style={lockedStyle}>{caseInfo.employee || "Selected employee"}</div>
            </>
          ) : (
            <EmployeeSelect
              inputId="prep-employee-name"
              label="Who is this meeting with?"
              employeeRecords={employeeRecords}
              value={null}
              onChange={(employeeId, employee)=>setCaseInfo(p=>({
                ...p, employeeId: employeeId || null, employee: employee?.name || "",
              }))}
            />
          )}
        </div>

        {isStructuredAppealPrep&&hearingSummary ? (
          <div style={{marginBottom:14}}>
            <div style={labelStyle}>Hearing</div>
            <div style={lockedStyle}>{hearingSummary}</div>
          </div>
        ) : (
          <div style={{marginBottom:14}}>
            <label htmlFor="prep-meeting-date" style={labelStyle}>Meeting date</label>
            <DateInput id="prep-meeting-date" value={caseInfo.date} onChange={e=>setCaseInfo(p=>({...p,date:e.target.value}))} />
          </div>
        )}

        <div>
          <label htmlFor="prep-manager-name" style={labelStyle}>{isStructuredAppealPrep?"Appeal officer / Chair":"Your name"}</label>
          {isStructuredAppealPrep ? (
            <div id="prep-manager-name" style={lockedStyle}>
              <LockIcon size={13} color={COLOR.inkFaint} />{caseInfo.manager||"Appointed appeal officer"}
            </div>
          ) : (
            <input id="prep-manager-name" placeholder="Chair / HR manager name" value={caseInfo.manager}
              onChange={e=>setCaseInfo(p=>({...p,manager:e.target.value}))} style={fieldStyle} />
          )}
        </div>
      </Section>

      {/* ── 2. WHY IT IS HAPPENING ──────────────────────────────────────── */}
      <Section
        title={groundedInCase?"Anything else to add":"Why this meeting is happening"}
        hint={groundedInCase
          ? "Optional. Compass already has the case record — add only what is not recorded there."
          : "Optional. Previous warnings, allegations, relevant history, reasonable adjustments."}>
        <textarea id="prep-background" value={caseInfo.context} onChange={e=>setCaseInfo(p=>({...p,context:e.target.value}))}
          rows={4} style={{...fieldStyle,resize:"vertical",lineHeight:1.6}}></textarea>
      </Section>

      {/* ── 3. WHAT TO COVER ────────────────────────────────────────────── */}
      <Section
        title="What to cover"
        hint="Your talking points. Mark the ones you must not leave without (★). Nothing here is required, and none of it blocks the meeting.">
        {prepQuestions.length===0&&(
          <p style={{...TYPE.metadata,color:COLOR.inkQuiet,margin:"0 0 10px"}}>
            Nothing yet — add a question, or ask Compass to suggest some below.
          </p>
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
        <button onClick={onAddPrepQuestion}
          style={{fontSize:12,background:"none",border:`1px dashed ${COLOR.border}`,borderRadius:RADIUS.card,padding:"8px 14px",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans,width:"100%"}}>
          + Add question
        </button>
      </Section>

      {/* ── 4. ONE PRIMARY ACTION, ABOVE THE SUPPORT ─────────────────────────
          Human UAT: "The manager must scroll through several screens of AI
          output before reaching the Start meeting button." Correct — the pack
          sat above it. Start now comes FIRST, so no amount of generated content
          can bury the lifecycle action. Preparation is optional metadata and
          nothing below gates it. */}
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:20,marginBottom:28}}>
        <Btn onClick={startMeeting} disabled={!canStart} style={{fontSize:15,padding:"12px 24px"}}>
          {starting?"Starting…":"Start meeting"}
        </Btn>
        <Btn variant="ghost" onClick={()=>{setMeetingType(null);setScreen(SCREENS.HOME);}} style={{fontSize:13}}>Back</Btn>
        {essentialCount>0&&(
          <span style={{...TYPE.metadata,color:COLOR.inkQuiet}}>
            {essentialCount} marked essential
          </span>
        )}
      </div>

      {/* ── 5. COMPASS SUPPORT — available, not displayed at you ─────────── */}
      <Reveal
        title="Compass preparation support"
        summary={prepNotes ? `Prep pack ready · ${prepPackSummary(prepNotes)}` : "Suggestions and background"}
        defaultOpen={false}>
        <p style={{...TYPE.metadata,color:COLOR.inkQuiet,margin:"0 0 12px",lineHeight:1.5}}>
          Compass can read the case and suggest questions to consider. They are suggestions —
          you decide what to ask.
        </p>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:16}}>
          <Btn onClick={handlePrepare} disabled={!canGenerate} variant="secondary" style={{fontSize:13}}>
            {aiProcessing?"Building…":(prepNotes?"Regenerate suggestions":"Suggest questions")}
          </Btn>
        </div>

        <div style={{marginBottom:16}}>
          <div style={labelStyle}>Supporting document <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional — PDF, Word or text)</span></div>
          {bgDoc?(
            <div style={{display:"flex",alignItems:"center",gap:10,background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"12px 14px"}}>
              <div style={{flex:1}}>
                <div style={{...TYPE.rowContext,color:COLOR.ink,fontWeight:500}}>{bgDoc.name}</div>
                <div style={{...TYPE.metadata,color:COLOR.inkQuiet}}>{bgDoc.text.length} characters extracted</div>
              </div>
              <button onClick={()=>setBgDoc(null)} aria-label="Remove supporting document"
                style={{background:"none",border:"none",color:COLOR.inkQuiet,fontSize:16,cursor:"pointer"}}>&#10005;</button>
            </div>
          ):(
            <label style={{display:"block",background:COLOR.surface,border:"1px dashed",borderColor:docInputFocused?COLOR.purple:COLOR.border,borderRadius:RADIUS.card,padding:"18px",textAlign:"center",cursor:"pointer"}}>
              {/* Phase 6.5 accessibility — visually hidden but still focusable;
                  display:none would remove it from the tab order entirely. */}
              <input type="file" accept=".pdf,.doc,.docx,.txt" aria-label="Upload a supporting document"
                onFocus={()=>setDocInputFocused(true)} onBlur={()=>setDocInputFocused(false)}
                style={{position:"absolute",width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}
                onChange={async e=>{
                  const file = e.target.files[0];
                  if(!file) return;
                  const name = file.name;
                  if(name.endsWith(".pdf")) {
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
              <div style={{...TYPE.rowContext,color:COLOR.inkSoft}}>Click to upload</div>
              <div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginTop:2}}>PDF, Word or text file</div>
            </label>
          )}
        </div>

        {prepNotes&&(
          <div>
            <div style={labelStyle}>Prep pack</div>
            {/* One blob of nine sections became nine things a manager can choose
                between. Nothing is summarised away, reordered or dropped — the
                model's own order is preserved and unrecognised headings are kept. */}
            {splitPrepPack(prepNotes).map((sec,i)=>(
              <PackSection key={sec.title+i} title={sec.title} whenUseful={sec.whenUseful} body={sec.body}/>
            ))}
          </div>
        )}
      </Reveal>

      {/* A failed generation must be visible wherever the manager is looking, not
          only inside the disclosure it was triggered from — found by the existing
          test when this first lived inside the Reveal. */}
      {aiError&&!aiProcessing&&(
        <p role="alert" style={{...TYPE.metadata,color:"#C0392B",margin:"0 0 16px"}}>{aiError}</p>
      )}


    </div>
  );
}
