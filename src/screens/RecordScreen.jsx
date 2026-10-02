import { useState, useEffect, useRef } from 'react';
import { CompassLogo } from '../components/CompassLogo';
import { COLOR, TYPE, FONT, RADIUS } from '../styles/tokens';
import { MDRenderer } from '../components/MDRenderer';
import { AskCompassErrorBoundary } from '../components/AskCompassErrorBoundary';
import { SCREENS } from '../constants';
import { QUESTION_STATUSES } from '../lib/prepQuestions';
import { computeCoachingTips } from '../lib/managerCoaching';
import { fmtMeetingTime } from '../lib/meetingTiming';
import {
  SUPPORT_CATEGORY, SUPPORT_LABEL, supportCounts, defaultSupportCategory,
  elapsedSince, captureState,
} from '../lib/liveMeetingSupport';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C3 — the conversation is the screen.
//
// WHAT THIS WAS.
//
// A notepad with a 300px rail holding NINE always-visible support surfaces:
// a rolling AI summary, coaching reminders, a clarification nudge, a suggested
// follow-up, prep questions, evidence suggestions, action suggestions, AI issue
// lists, and a chat that took every remaining pixel. All at once, all live,
// while someone was trying to talk to an employee.
//
// And the single most important thing it did not do: IT NEVER SHOWED THE
// CONVERSATION. `transcript` was read only for its length. A manager typed a
// line, pressed Enter, the textarea cleared, and the sole evidence anything had
// been captured was a counter reading "3 notes captured". You could not see
// what Compass had recorded while recording it.
//
// WHAT IT IS NOW.
//
//   LEFT   what was said — visible, scrolling — then the composer beneath it
//   RIGHT  ONE support surface: Questions · Guidance · Context, one at a time
//
// The header answers, without being asked: who am I meeting, what meeting is
// this, is Compass capturing, how long have we been going, how do I finish.
//
// ┌─ WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────┐
// │ No meeting score, no completion percentage, no quality rating, no       │
// │ mandatory question counter, no progress bar, no checklist to clear. The │
// │ counts beside each category are indicators, not targets — nothing is    │
// │ "due" and nothing blocks ending the meeting.                            │
// │                                                                          │
// │ Compass never acts on its own: no automatic witness, evidence,          │
// │ allegation, escalation or sanction. Every Accept is the existing human  │
// │ handler, unchanged.                                                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// LIFECYCLE: untouched. attemptEndMeeting is the only transition and it is
// called exactly as before, after the same final flush of the composer.
// ─────────────────────────────────────────────────────────────────────────

const NARROW = 1024;

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(`(max-width:${NARROW}px)`).matches
      : false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setNarrow(window.innerWidth <= NARROW);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
}

// One prep question, in the meeting. Unchanged in capability.
function LiveQuestionRow({ q, onSetStatus }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div style={{padding:"8px 0",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        {q.essential&&<span title="Marked essential" aria-label="Marked essential" style={{color:COLOR.amber,flexShrink:0,lineHeight:1.4}}>★</span>}
        <span style={{...TYPE.metadata,color:COLOR.ink,flex:1,lineHeight:1.5,fontSize:12}}>{q.text}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
        {/* The original control, kept: one compact select carrying an accessible
            label that names the question. A row of five buttons per question
            lost that label and took several times the height — in a rail, beside
            a live conversation, that matters. */}
        <select value={q.status||"not_asked"} onChange={e=>onSetStatus(q.id, e.target.value)}
          aria-label={"Status for: "+q.text}
          style={{fontSize:10,border:`1px solid ${COLOR.border}`,borderRadius:4,padding:"2px 4px",
                  color:COLOR.inkSoft,background:COLOR.surface,fontFamily:FONT.sans}}>
          {QUESTION_STATUSES.map(s=><option key={s.id} value={s.id}>{s.symbol} {s.label}</option>)}
        </select>
        {q.reasoning&&(
          <button onClick={()=>setShowWhy(v=>!v)} aria-expanded={showWhy}
            style={{fontSize:10,background:"none",border:"none",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans,padding:0,textDecoration:"underline"}}>
            {showWhy?"Hide why":"Why ask this?"}
          </button>
        )}
      </div>
      {showWhy&&q.reasoning&&(
        <div style={{fontSize:11,color:COLOR.inkSoft,marginTop:6,lineHeight:1.5,fontStyle:"italic"}}>{q.reasoning}</div>
      )}
    </div>
  );
}

// A suggestion the manager may use or dismiss. Never applied automatically.
function Suggestion({ title, tone = "advice", children, onUse, useLabel = "Insert question", onDismiss }) {
  const toneStyle = tone === "attention"
    ? { color: COLOR.amber, bg: COLOR.amberTint }
    : { color: COLOR.purple, bg: COLOR.purpleTint };
  return (
    <div style={{border:`1px solid ${COLOR.border}`,borderLeft:`3px solid ${toneStyle.color}`,borderRadius:RADIUS.card,padding:"10px 12px",marginBottom:10,background:COLOR.surface}}>
      <div style={{...TYPE.metadata,fontWeight:700,color:toneStyle.color,marginBottom:4}}>{title}</div>
      <div style={{fontSize:11,color:COLOR.inkSoft,lineHeight:1.5,marginBottom:8}}>{children}</div>
      <div style={{display:"flex",gap:8}}>
        {onUse&&(
          <button onClick={onUse} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>{useLabel}</button>
        )}
        {onDismiss&&(
          <button onClick={onDismiss} style={{fontSize:11,background:"none",border:"none",color:COLOR.inkQuiet,cursor:"pointer",fontFamily:FONT.sans}}>Dismiss</button>
        )}
      </div>
    </div>
  );
}

export function RecordScreen({ recovering=false, meetingType, caseInfo, isListening, meetingStartTime, currentAdjournment, setAdjournments, setCurrentAdjournment, setTranscript, inputText, aiProcessing, transcript, addUtterance, inputRef, setInputText, updateLiveContext, stopSpeech, startSpeech, isScreenCapturing, stopScreenCapture, startScreenCapture, importFileRef, handleImportFile, liveContextLoading, liveContext, liveChatHistory, liveChatProcessing, liveChatInput, setLiveChatInput, sendLiveChat, setScreen, confirmDialog, clearMeetingDraft, promptDialog, updateMeetingIntelligence, meetingIntelligence, dismissedNudgeKey, setDismissedNudgeKey, prepQuestions=[], onSetPrepQuestionStatus, meetingEvidenceSuggestions=[], onAcceptMeetingEvidenceSuggestion, onDismissMeetingEvidenceSuggestion, meetingActionSuggestions=[], onAcceptMeetingActionSuggestion, onDismissMeetingActionSuggestion, dismissedFollowUpKey, setDismissedFollowUpKey, attemptEndMeeting, dismissedCoachingTipKeys=[], onDismissCoachingTip, fmtDate }) {
  const narrow = useIsNarrow();
  const [supportOpen, setSupportOpen] = useState(!narrow);
  const [category, setCategory] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const conversationRef = useRef(null);

  // The clock the header shows. One interval, cleared on unmount.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Keep the newest captured line in view, the way a conversation reads.
  useEffect(() => {
    const el = conversationRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  const nudgeKey = meetingIntelligence?.possibleInconsistency
    ? `${meetingIntelligence.possibleInconsistency.earlier}|${meetingIntelligence.possibleInconsistency.later}` : null;
  const showNudge = !!meetingIntelligence?.possibleInconsistency && dismissedNudgeKey !== nudgeKey;
  const followUpKey = meetingIntelligence?.suggestedFollowUp?.text || null;
  const showFollowUp = !!meetingIntelligence?.suggestedFollowUp && dismissedFollowUpKey !== followUpKey;
  const coachingTips = computeCoachingTips(transcript.map(u=>u.text).join(" ")+" "+inputText, meetingIntelligence)
    .filter(t=>!dismissedCoachingTipKeys.includes(t.key));

  const counts = supportCounts({
    prepQuestions, coachingTips, showNudge, showFollowUp,
    evidenceSuggestions: meetingEvidenceSuggestions,
    actionSuggestions: meetingActionSuggestions,
    meetingIntelligence,
  });
  const activeCategory = category || defaultSupportCategory(counts);
  const elapsed = elapsedSince(meetingStartTime, now);
  const capture = captureState({ isListening, transcriptLength: transcript.length, hasDraftText: !!inputText.trim() });

  const insertQuestion = (text, after) => {
    setInputText(t => t ? t + " " + text : text);
    inputRef.current?.focus();
    after?.();
  };

  const cancelMeeting = async () => {
    const hasContent = transcript.length>0 || inputText.trim();
    if(hasContent) {
      const ok = await confirmDialog({title:"Leave without saving?", message:"This meeting's notes will be lost.", confirmLabel:"Leave", danger:true});
      if(!ok) return;
    }
    clearMeetingDraft?.();
    setScreen(SCREENS.HOME);
  };

  // P1 remediation (2026-09-24) — a cold load at ?screen=record resolves the
  // authoritative meeting before anything is shown. Unchanged by C3.
  if(recovering) {
    return (
      <div style={{position:"fixed",inset:0,background:COLOR.paper,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,zIndex:2000,fontFamily:FONT.sans}}>
        <CompassLogo size={40}/>
        <div style={{...TYPE.rowContext,color:COLOR.inkSoft}}>Restoring your meeting…</div>
        <div style={{...TYPE.metadata,color:COLOR.inkQuiet}}>Nothing has been lost — Compass is loading the saved meeting.</div>
      </div>
    );
  }

  const tabStyle = isActive => ({
    ...TYPE.metadata,
    background:"none",
    border:"none",
    borderBottom:`2px solid ${isActive?COLOR.purple:"transparent"}`,
    color:isActive?COLOR.ink:COLOR.inkQuiet,
    fontWeight:isActive?700:500,
    padding:"8px 2px",
    marginRight:16,
    cursor:"pointer",
    fontFamily:FONT.sans,
    whiteSpace:"nowrap",
  });

  const supportBody = (
    <>
      {activeCategory===SUPPORT_CATEGORY.QUESTIONS&&(
        <div>
          {prepQuestions.length===0 ? (
            <p style={{...TYPE.metadata,color:COLOR.inkQuiet,lineHeight:1.6,margin:0}}>
              No prepared questions. Anything you noted in preparation would appear here.
            </p>
          ) : (
            <>
              <p style={{...TYPE.metadata,color:COLOR.inkQuiet,margin:"0 0 8px",lineHeight:1.5}}>
                Yours to use or ignore — none of these is required.
              </p>
              {prepQuestions.map(q=>(
                <LiveQuestionRow key={q.id} q={q} onSetStatus={onSetPrepQuestionStatus}/>
              ))}
            </>
          )}
        </div>
      )}

      {activeCategory===SUPPORT_CATEGORY.GUIDANCE&&(
        <div>
          {counts[SUPPORT_CATEGORY.GUIDANCE]===0&&(
            <p style={{...TYPE.metadata,color:COLOR.inkQuiet,lineHeight:1.6,margin:0}}>
              Nothing to raise. Compass will note anything useful here as you go.
            </p>
          )}
          {coachingTips.map(tip=>(
            <Suggestion key={tip.key} title="Helpful reminder" onDismiss={()=>onDismissCoachingTip(tip.key)}>
              {tip.text}
            </Suggestion>
          ))}
          {showNudge&&(
            <Suggestion title="Possible clarification" tone="attention"
              onUse={()=>insertQuestion(meetingIntelligence.possibleInconsistency.suggestedQuestion)}
              onDismiss={()=>setDismissedNudgeKey(nudgeKey)}>
              <div>Earlier: “{meetingIntelligence.possibleInconsistency.earlier}”</div>
              <div>Later: “{meetingIntelligence.possibleInconsistency.later}”</div>
            </Suggestion>
          )}
          {showFollowUp&&(
            <Suggestion title="Suggested follow-up"
              onUse={()=>insertQuestion(meetingIntelligence.suggestedFollowUp.text, ()=>setDismissedFollowUpKey(followUpKey))}
              onDismiss={()=>setDismissedFollowUpKey(followUpKey)}>
              <div>“{meetingIntelligence.suggestedFollowUp.text}”</div>
              {meetingIntelligence.suggestedFollowUp.reasoning&&(
                <div style={{fontStyle:"italic",marginTop:4,color:COLOR.inkQuiet}}>{meetingIntelligence.suggestedFollowUp.reasoning}</div>
              )}
            </Suggestion>
          )}
          {meetingEvidenceSuggestions.filter(s=>s.status==="pending").map(s=>(
            <Suggestion key={s.id} title={s.kind==="witness"?"Possible witness mentioned":"Evidence mentioned"}
              onUse={()=>onAcceptMeetingEvidenceSuggestion(s)} useLabel="Add to case"
              onDismiss={()=>onDismissMeetingEvidenceSuggestion(s.id)}>
              {s.description}
            </Suggestion>
          ))}
          {meetingActionSuggestions.filter(s=>s.status==="pending").map(s=>(
            <Suggestion key={s.id} title="Action identified"
              onUse={()=>onAcceptMeetingActionSuggestion(s)} useLabel="Add action"
              onDismiss={()=>onDismissMeetingActionSuggestion(s.id)}>
              {s.description}{s.suggestedOwner?" — "+s.suggestedOwner:""}{s.suggestedDueDate?" (by "+s.suggestedDueDate+")":""}
            </Suggestion>
          ))}
          {meetingIntelligence?.newIssues?.length>0&&(
            <div style={{marginTop:4}}>
              <div style={{...TYPE.metadata,fontWeight:700,color:COLOR.inkFaint,marginBottom:4}}>New issues raised</div>
              {meetingIntelligence.newIssues.map((item,i)=>(
                <div key={i} style={{fontSize:11,color:COLOR.inkSoft,lineHeight:1.6,paddingLeft:10,position:"relative"}}>
                  <span style={{position:"absolute",left:0}}>·</span>{item}
                </div>
              ))}
              <p style={{...TYPE.metadata,color:COLOR.inkQuiet,marginTop:6,lineHeight:1.5}}>
                Noted for the record. Nothing has been created from these.
              </p>
            </div>
          )}
        </div>
      )}

      {activeCategory===SUPPORT_CATEGORY.CONTEXT&&(
        <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
          <div style={{marginBottom:14}}>
            <div style={{...TYPE.metadata,fontWeight:700,color:COLOR.inkFaint,marginBottom:6}}>Compass&apos;s read so far</div>
            {liveContextLoading&&!liveContext&&(
              <div style={{...TYPE.metadata,color:COLOR.inkQuiet,fontStyle:"italic"}}>Reading the conversation…</div>
            )}
            {liveContext ? (
              <div style={{fontSize:12,color:COLOR.inkSoft,lineHeight:1.7}}><MDRenderer text={liveContext}/></div>
            ) : (
              !liveContextLoading&&<div style={{...TYPE.metadata,color:COLOR.inkQuiet}}>Updates as you capture notes.</div>
            )}
          </div>
          <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:12,flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
            <div style={{...TYPE.metadata,fontWeight:700,color:COLOR.inkFaint,marginBottom:8}}>Ask Compass</div>
            <div style={{flex:1,overflowY:"auto",minHeight:60}}>
              {liveChatHistory.length===0&&(
                <div style={{...TYPE.metadata,color:COLOR.inkQuiet,lineHeight:1.6}}>Ask anything about this meeting.</div>
              )}
              <AskCompassErrorBoundary>
                {liveChatHistory.map((m,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{...TYPE.metadata,fontWeight:600,color:m.role==="user"?COLOR.ink:COLOR.purple,marginBottom:3}}>{m.role==="user"?"You":"Compass"}</div>
                    <div style={{fontSize:12,color:COLOR.inkSoft,lineHeight:1.6}}><MDRenderer text={m.content}/></div>
                  </div>
                ))}
              </AskCompassErrorBoundary>
              {liveChatProcessing&&<div style={{...TYPE.metadata,color:COLOR.inkQuiet,fontStyle:"italic"}}>Thinking...</div>}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"6px 10px",marginTop:10}}>
              <input value={liveChatInput} onChange={e=>setLiveChatInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&sendLiveChat()}
                placeholder="Ask about this meeting…" aria-label="Ask about this meeting"
                style={{flex:1,background:"none",border:"none",outline:"none",fontSize:12,color:COLOR.ink,fontFamily:FONT.sans}}/>
              <button onClick={sendLiveChat} disabled={liveChatProcessing||!liveChatInput.trim()} aria-label="Send"
                style={{background:COLOR.purple,border:"none",borderRadius:6,width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:liveChatProcessing||!liveChatInput.trim()?0.4:1,flexShrink:0}}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M6 10V2M6 2L3 5M6 2L9 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const supportNav = (
    <div role="tablist" aria-label="Compass support" style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${COLOR.borderFaint}`,padding:"0 16px",flexShrink:0}}>
      {Object.values(SUPPORT_CATEGORY).map(cat=>(
        <button key={cat} role="tab" aria-selected={activeCategory===cat}
          onClick={()=>setCategory(cat)} style={tabStyle(activeCategory===cat)}>
          {SUPPORT_LABEL[cat]}{counts[cat]>0?` (${counts[cat]})`:""}
        </button>
      ))}
      <button onClick={()=>setSupportOpen(false)} aria-label="Hide Compass support"
        style={{marginLeft:"auto",background:"none",border:"none",color:COLOR.inkQuiet,cursor:"pointer",fontSize:16,fontFamily:FONT.sans}}>×</button>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:COLOR.paper,display:"flex",flexDirection:"column",zIndex:2000,fontFamily:FONT.sans}}>

      {/* ── HEADER — who, what, capturing?, how long, how to finish ──────── */}
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 20px",background:COLOR.surface,borderBottom:`1px solid ${COLOR.border}`,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
          <button onClick={cancelMeeting} aria-label="Leave without saving" title="Leave without saving"
            style={{background:"none",border:"none",color:COLOR.inkSoft,fontSize:14,cursor:"pointer",fontFamily:FONT.sans,padding:0}}>←</button>
          <CompassLogo size={28}/>
          <div style={{minWidth:0}}>
            <div style={{...TYPE.rowContext,color:COLOR.ink,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {caseInfo.employee||"Unknown"}
            </div>
            <div style={{...TYPE.metadata,color:COLOR.inkQuiet,whiteSpace:"nowrap"}}>
              <span>{meetingType?.label||"Meeting"}</span>
              <span aria-hidden="true"> · </span>
              {/* Its own element: the date must stay findable on its own, and
                  fmtDate remains the single formatter. */}
              <span>{fmtDate?fmtDate(caseInfo.date):caseInfo.date}</span>
            </div>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {/* Capture state in WORDS, never colour alone. */}
          <span role="status" aria-live="polite"
            style={{display:"inline-flex",alignItems:"center",gap:6,...TYPE.metadata,
                    color:isListening?COLOR.amber:COLOR.inkQuiet}}>
            <span aria-hidden="true" style={{width:7,height:7,borderRadius:"50%",display:"inline-block",
                   background:isListening?COLOR.amber:COLOR.inkQuiet}}/>
            {capture.label}
          </span>
          {meetingStartTime&&(
            <span style={{...TYPE.metadata,color:COLOR.inkQuiet}}>
              Started {fmtMeetingTime(meetingStartTime)}{elapsed?` · ${elapsed} elapsed`:""}
            </span>
          )}
          {currentAdjournment?(
            <button onClick={async ()=>{
              const values = await promptDialog({
                title:"Reconvene meeting",
                fields:[{key:"reason", label:"Reason for adjournment (optional)", defaultValue:currentAdjournment.reason||""}],
                confirmLabel:"Reconvene",
              });
              if(!values) return;
              const endTime = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
              setAdjournments(a=>a.map(x=>x.id===currentAdjournment.id?{...x,end:endTime,reason:values.reason||x.reason}:x));
              setCurrentAdjournment(null);
              setTranscript(p=>[...p,{id:Date.now(),speaker:"System",text:"[Meeting reconvened at "+endTime+"]",ts:endTime,pending:false}]);
            }} style={{background:"none",border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"7px 14px",...TYPE.metadata,color:COLOR.ink,cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>
              Reconvene
            </button>
          ):(
            <button onClick={()=>{
              const startTime = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
              const newAdj = {id:Date.now(),start:startTime,end:null,reason:""};
              setAdjournments(a=>[...a,newAdj]);
              setCurrentAdjournment(newAdj);
              setTranscript(p=>[...p,{id:Date.now(),speaker:"System",text:"[Meeting adjourned at "+startTime+"]",ts:startTime,pending:false}]);
            }} style={{background:"none",border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"7px 14px",...TYPE.metadata,color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans}}>
              Adjourn
            </button>
          )}
          {!supportOpen&&(
            <button onClick={()=>setSupportOpen(true)} aria-label="Show Compass support"
              style={{background:"none",border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"7px 14px",...TYPE.metadata,color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans}}>
              Compass{(counts.questions+counts.guidance)>0?` (${counts.questions+counts.guidance})`:""}
            </button>
          )}
          <button
            onClick={()=>{if(inputText.trim())addUtterance(inputText);attemptEndMeeting();}}
            disabled={aiProcessing||(transcript.length===0&&!inputText.trim())}
            style={{background:aiProcessing?COLOR.border:COLOR.purple,border:"none",borderRadius:RADIUS.card,padding:"8px 18px",
                    fontSize:13,color:aiProcessing?COLOR.inkQuiet:COLOR.paper,fontWeight:700,fontFamily:FONT.sans,
                    cursor:aiProcessing?"not-allowed":"pointer"}}>
            {aiProcessing?"Processing…":"End meeting →"}
          </button>
        </div>
      </header>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",flexDirection:narrow?"column":"row",overflow:"hidden",minHeight:0}}>

        {/* THE CONVERSATION — what was actually said. This did not exist. */}
        <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          <div ref={conversationRef} aria-label="Captured conversation"
            style={{flex:1,overflowY:"auto",padding:narrow?"18px 18px 8px":"28px 36px 12px"}}>
            {transcript.length===0 ? (
              <p style={{...TYPE.rowContext,color:COLOR.inkQuiet,maxWidth:520,lineHeight:1.7}}>
                Nothing captured yet. Type below and press Enter, or turn on the microphone —
                what you capture appears here as you go.
              </p>
            ) : (
              <ol style={{listStyle:"none",margin:0,padding:0,maxWidth:720}}>
                {transcript.map(u=>(
                  <li key={u.id} style={{display:"flex",gap:12,padding:"6px 0",opacity:u.pending?0.55:1}}>
                    <span style={{...TYPE.metadata,color:COLOR.inkQuiet,flexShrink:0,width:58,fontVariantNumeric:"tabular-nums"}}>{u.ts}</span>
                    <span style={{fontSize:14,color:COLOR.ink,lineHeight:1.65,minWidth:0}}>
                      {u.speaker&&u.speaker!=="You"&&(
                        <span style={{...TYPE.metadata,color:COLOR.inkFaint,marginRight:6}}>{u.speaker}</span>
                      )}
                      {u.text}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* COMPOSER */}
          <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,padding:narrow?"10px 18px":"12px 36px",flexShrink:0,background:COLOR.surface}}>
            <textarea
              aria-label="Capture a note"
              ref={inputRef}
              value={inputText}
              rows={2}
              style={{width:"100%",background:"none",border:"none",outline:"none",fontSize:15,lineHeight:1.7,
                      color:COLOR.ink,resize:"none",fontFamily:FONT.sans,boxSizing:"border-box"}}
              onChange={e=>{
                const val = e.target.value;
                if(val.endsWith(String.fromCharCode(10))) {
                  const ls=val.split(String.fromCharCode(10)).filter(l=>l.trim());
                  ls.forEach(line=>addUtterance(line.trim()));
                  setInputText("");
                  updateLiveContext(val);
                  updateMeetingIntelligence(val);
                } else {
                  setInputText(val);
                }
              }}
              placeholder="Capture what is being said — press Enter to save a line."
            />
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:6}}>
              <button onClick={isListening?stopSpeech:startSpeech}
                aria-pressed={isListening}
                style={{display:"flex",alignItems:"center",gap:6,background:"none",border:`1px solid ${isListening?COLOR.amber:COLOR.border}`,borderRadius:RADIUS.card,padding:"7px 14px",cursor:"pointer",...TYPE.metadata,color:isListening?COLOR.amber:COLOR.inkSoft,fontFamily:FONT.sans,minHeight:36}}>
                <span aria-hidden="true" style={{width:7,height:7,borderRadius:"50%",background:isListening?COLOR.amber:COLOR.inkQuiet,display:"inline-block"}}/>
                {isListening?"Stop microphone":"Microphone"}
              </button>
              <button onClick={isScreenCapturing?stopScreenCapture:startScreenCapture}
                aria-pressed={isScreenCapturing}
                style={{display:"flex",alignItems:"center",gap:6,background:"none",border:`1px solid ${isScreenCapturing?COLOR.purple:COLOR.border}`,borderRadius:RADIUS.card,padding:"7px 14px",cursor:"pointer",...TYPE.metadata,color:isScreenCapturing?COLOR.purple:COLOR.inkSoft,fontFamily:FONT.sans,minHeight:36}}>
                <span aria-hidden="true" style={{width:7,height:7,borderRadius:"50%",background:isScreenCapturing?COLOR.purple:COLOR.inkQuiet,display:"inline-block"}}/>
                {isScreenCapturing?"Stop screen audio":"Screen audio"}
              </button>
              {/* Phase 6.5 — a real <button>, because a <label> wrapping a hidden
                  input is not in the keyboard tab order. Unchanged by C3. */}
              <button type="button" onClick={()=>importFileRef?.current?.click()}
                style={{background:"none",border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card,padding:"7px 14px",cursor:"pointer",...TYPE.metadata,color:COLOR.inkSoft,fontFamily:FONT.sans,minHeight:36}}>
                Import transcript
              </button>
              <input ref={importFileRef} type="file" accept=".vtt,.txt,.srt" onChange={handleImportFile} style={{display:"none"}}/>
              <span style={{marginLeft:"auto",...TYPE.metadata,color:COLOR.inkQuiet}}>{capture.detail}</span>
            </div>
          </div>
        </main>

        {/* ── ONE SUPPORT SURFACE ──────────────────────────────────────────
            Wide: a restrained rail. Narrow: a sheet across the bottom, never a
            300px column squeezed beside the conversation. One category at a
            time, counts as quiet indicators rather than targets. */}
        {supportOpen&&(
          <aside aria-label="Compass support"
            style={narrow
              ? {borderTop:`1px solid ${COLOR.border}`,background:COLOR.surface,display:"flex",flexDirection:"column",maxHeight:"45vh",flexShrink:0}
              : {width:320,borderLeft:`1px solid ${COLOR.border}`,background:COLOR.surface,display:"flex",flexDirection:"column",flexShrink:0}}>
            {supportNav}
            <div role="tabpanel" aria-label={SUPPORT_LABEL[activeCategory]}
              style={{flex:1,overflowY:"auto",padding:"14px 16px",minHeight:0}}>
              {supportBody}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
