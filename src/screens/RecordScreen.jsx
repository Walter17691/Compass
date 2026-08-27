import { CompassLogo } from '../components/CompassLogo';
import { MDRenderer } from '../components/MDRenderer';
import { MeetingQualityCheckModal } from '../components/MeetingQualityCheckModal';
import { SCREENS } from '../constants';
import { questionStatusMeta, QUESTION_STATUSES } from '../lib/prepQuestions';
import { computeCoachingTips } from '../lib/managerCoaching';

export function RecordScreen({ meetingType, caseInfo, isListening, meetingStartTime, currentAdjournment, setAdjournments, setCurrentAdjournment, setTranscript, inputText, aiProcessing, transcript, addUtterance, inputRef, setMeetingStartTime, setInputText, updateLiveContext, stopSpeech, startSpeech, isScreenCapturing, stopScreenCapture, startScreenCapture, importFileRef, handleImportFile, liveContextLoading, liveContext, liveChatHistory, liveChatProcessing, liveChatInput, setLiveChatInput, sendLiveChat, setScreen, confirmDialog, clearMeetingDraft, promptDialog, updateMeetingIntelligence, meetingIntelligence, dismissedNudgeKey, setDismissedNudgeKey, prepQuestions=[], onSetPrepQuestionStatus, meetingEvidenceSuggestions=[], onAcceptMeetingEvidenceSuggestion, onDismissMeetingEvidenceSuggestion, meetingActionSuggestions=[], onAcceptMeetingActionSuggestion, onDismissMeetingActionSuggestion, dismissedFollowUpKey, setDismissedFollowUpKey, attemptEndMeeting, showQualityCheck, qualityCheckGaps=[], proceedPastQualityCheck, createQualityCheckFollowUp, onReturnToMeeting, dismissedCoachingTipKeys=[], onDismissCoachingTip }) {
  const nudgeKey = meetingIntelligence?.possibleInconsistency ? meetingIntelligence.possibleInconsistency.later : null;
  const showNudge = nudgeKey && nudgeKey !== dismissedNudgeKey;
  const followUpKey = meetingIntelligence?.suggestedFollowUp ? meetingIntelligence.suggestedFollowUp.text : null;
  const showFollowUp = followUpKey && followUpKey !== dismissedFollowUpKey;
  // Manager Enablement (Phase 4, MP14, §10/§11) — computed fresh every
  // render from the live transcript, not tied to updateMeetingIntelligence's
  // own throttled AI cadence: the wellbeing/outcome-language triggers are
  // plain keyword checks and shouldn't wait on a network round trip just
  // because the inconsistency trigger (the one AI-derived signal here)
  // does.
  const coachingTips = computeCoachingTips(transcript.map(u=>u.text).join(" ")+" "+inputText, meetingIntelligence)
    .filter(t=>!dismissedCoachingTipKeys.includes(t.key));
  const cancelMeeting = async () => {
    const hasContent = transcript.length>0 || inputText.trim();
    if(hasContent) {
      const ok = await confirmDialog({title:"Leave without saving?", message:"This meeting's notes will be lost.", confirmLabel:"Leave", danger:true});
      if(!ok) return;
    }
    clearMeetingDraft?.();
    setScreen(SCREENS.HOME);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#FDFAF5",display:"flex",flexDirection:"column",zIndex:2000,fontFamily:"DM Sans,system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={cancelMeeting} aria-label="Leave without saving" style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0,display:"flex",alignItems:"center"}} title="Leave without saving">←</button>
          <CompassLogo size={32}/>
          <div style={{width:1,height:20,background:"#EDE5D8"}}/>
          <div>
            <span style={{fontSize:12,color:"#7C5CFC",fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase"}}>{meetingType?.label||"Meeting"}</span>
            <span style={{fontSize:12,color:"#9B9098",margin:"0 6px"}}>·</span>
            <span style={{fontSize:12,color:"#1A1535",fontWeight:500}}>{caseInfo.employee||"Unknown"}</span>
            <span style={{fontSize:12,color:"#9B9098",margin:"0 6px"}}>·</span>
            <span style={{fontSize:12,color:"#9B9098"}}>{caseInfo.date}</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isListening&&(
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#C84B2F",background:"#FEF0EB",padding:"4px 10px",borderRadius:20}}>
              <span className="pu" style={{width:6,height:6,borderRadius:"50%",background:"#C84B2F",display:"inline-block"}}></span>
              Live
            </div>
          )}
          {meetingStartTime&&<span style={{fontSize:12,color:"#9B9098",fontFamily:"monospace"}}>{meetingStartTime}</span>}
          {/* Adjourn / Reconvene button */}
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
            }} style={{background:"#1A7A4A",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>
              Reconvene
            </button>
          ):(
            <button onClick={()=>{
              const startTime = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
              const newAdj = {id:Date.now(),start:startTime,end:null,reason:""};
              setAdjournments(a=>[...a,newAdj]);
              setCurrentAdjournment(newAdj);
              setTranscript(p=>[...p,{id:Date.now(),speaker:"System",text:"[Meeting adjourned at "+startTime+"]",ts:startTime,pending:false}]);
            }} style={{background:"#FFFFFF",border:"1px solid #E8622A",borderRadius:8,padding:"8px 16px",fontSize:12,color:"#E8622A",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>
              Adjourn
            </button>
          )}
          <button
            onClick={()=>{if(inputText.trim())addUtterance(inputText);attemptEndMeeting();}}
            disabled={aiProcessing||(transcript.length===0&&!inputText.trim())}
            style={{background:aiProcessing?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,color:aiProcessing?"#9B9098":"#FFFFFF",fontWeight:600,cursor:aiProcessing?"not-allowed":"pointer",transition:"all 0.15s",boxShadow:aiProcessing?"none":"0 2px 8px rgba(124,92,252,0.25)"}}>
            {aiProcessing?"Processing...":"End meeting →"}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Notepad */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <textarea
            aria-label="Notepad"
            ref={inputRef}
            value={inputText}
            style={{flex:1,background:"transparent",border:"none",padding:"40px 48px",fontSize:16,lineHeight:1.9,outline:"none",color:"#1A1535",resize:"none",fontFamily:"DM Sans,system-ui,sans-serif",letterSpacing:"0.1px"}}
            onChange={e=>{
              const val = e.target.value;
              if(!meetingStartTime && val.trim()) setMeetingStartTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}));
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
            placeholder={"Type or speak your meeting notes here..." + String.fromCharCode(10) + String.fromCharCode(10) + "Just capture what is being said — Compass will organise everything when you end the meeting."}
          />

          {/* Bottom toolbar */}
          <div style={{padding:"12px 48px",borderTop:"1px solid #EDE5D8",display:"flex",alignItems:"center",gap:8,background:"#FFFFFF",flexShrink:0}}>
            <button onClick={isListening?stopSpeech:startSpeech}
              style={{display:"flex",alignItems:"center",gap:6,background:isListening?"#FEF0EB":"#F5F1EA",border:"1px solid",borderColor:isListening?"#C84B2F44":"#E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:isListening?"#C84B2F":"#6B6375",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:isListening?"#C84B2F":"#9B9098",display:"inline-block"}}></span>
              {isListening?"Stop mic":"Microphone"}
            </button>
            <button onClick={isScreenCapturing?stopScreenCapture:startScreenCapture}
              style={{display:"flex",alignItems:"center",gap:6,background:isScreenCapturing?"#E8F5EE":"#F5F1EA",border:"1px solid",borderColor:isScreenCapturing?"#1A7A4A44":"#E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:isScreenCapturing?"#1A7A4A":"#6B6375",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:isScreenCapturing?"#1A7A4A":"#9B9098",display:"inline-block"}}></span>
              {isScreenCapturing?"Stop":"Screen audio"}
            </button>
            {/* Phase 6.5 hardening (closes Prompt 11 audit finding 6.2,
                MEDIUM) — a <label> wrapping a display:none file input
                triggers it for a mouse click, but a <label> is never
                itself part of the keyboard tab order and a display:none
                input isn't either, so this control was completely
                unreachable by keyboard — semantic HTML first, matching
                the real <button> the Microphone/Screen audio controls
                either side of it already use, rather than adding an
                ARIA role to fake one. */}
            <button type="button" onClick={()=>importFileRef?.current?.click()}
              style={{display:"flex",alignItems:"center",gap:6,background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:"#6B6375",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
              Import transcript
            </button>
            <input ref={importFileRef} type="file" accept=".vtt,.txt,.srt" onChange={handleImportFile} style={{display:"none"}}/>
            <div style={{marginLeft:"auto",fontSize:11,color:"#9B9098"}}>
              {transcript.length>0&&`${transcript.length} note${transcript.length!==1?"s":""} captured`}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{width:300,borderLeft:"1px solid #EDE5D8",background:"#FFFFFF",display:"flex",flexDirection:"column",flexShrink:0}}>

          {/* Live context */}
          <div style={{padding:"16px 18px",borderBottom:"1px solid #EDE5D8",flexShrink:0}}>
            <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>Live context</div>
            {liveContextLoading&&!liveContext&&(
              <div style={{fontSize:12,color:"#9B9098",fontStyle:"italic"}}>Analysing conversation...</div>
            )}
            {liveContext?(
              <div style={{fontSize:12,color:"#3D3560",lineHeight:1.7}}><MDRenderer text={liveContext}/></div>
            ):(
              !liveContextLoading&&<div style={{fontSize:12,color:"#C4BAB0"}}>Will update as you take notes</div>
            )}
          </div>

          {/* Manager Enablement (Phase 4, MP14, §10/§11) — coaching tips.
              Deliberately outside the "Meeting intelligence" panel's own
              gate below (meetingIntelligence||prepQuestions.length>0):
              the wellbeing/outcome-language triggers are keyword-only and
              available from the very first line typed, not tied to
              whether an AI intelligence pass has run yet. */}
          {coachingTips.length>0&&(
            <div style={{padding:"14px 18px",borderBottom:"1px solid #EDE5D8",flexShrink:0}}>
              {coachingTips.map(tip=>(
                <div key={tip.key} style={{background:"#F5F3FF",border:"1px solid #D4C9F5",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#5B3FD4",marginBottom:4}}>Helpful reminder</div>
                  <div style={{fontSize:11,color:"#3D3560",marginBottom:8,lineHeight:1.5}}>{tip.text}</div>
                  <button onClick={()=>onDismissCoachingTip(tip.key)} style={{fontSize:11,background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
                </div>
              ))}
            </div>
          )}

          {/* Meeting intelligence — live panels + the quiet inconsistency
              nudge. Never auto-inserted into the transcript; the HR user
              chooses whether to ask the suggested question. The question
              checklist (M2) shows as soon as prep questions exist, even
              before the first live AI pass has run — everything else here
              still waits for meetingIntelligence, same as before. */}
          {(meetingIntelligence||prepQuestions.length>0)&&(
            <div style={{padding:"14px 18px",borderBottom:"1px solid #EDE5D8",flexShrink:0,maxHeight:280,overflowY:"auto"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Meeting intelligence</div>
              {showNudge&&(
                <div style={{background:"#FEF5E7",border:"1px solid #E8C88A",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#B87520",marginBottom:4}}>Possible clarification required</div>
                  <div style={{fontSize:11,color:"#6B6375",marginBottom:2}}>Earlier: "{meetingIntelligence.possibleInconsistency.earlier}"</div>
                  <div style={{fontSize:11,color:"#6B6375",marginBottom:8}}>Later: "{meetingIntelligence.possibleInconsistency.later}"</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{
                      const q = meetingIntelligence.possibleInconsistency.suggestedQuestion;
                      setInputText(t=>t?t+" "+q:q);
                      inputRef.current?.focus();
                    }} style={{fontSize:11,background:"#B87520",border:"none",borderRadius:5,padding:"4px 10px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Insert question</button>
                    <button onClick={()=>setDismissedNudgeKey(nudgeKey)} style={{fontSize:11,background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
                  </div>
                </div>
              )}
              {showFollowUp&&(
                <div style={{background:"#F5F3FF",border:"1px solid #D4C9F5",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#5B3FD4",marginBottom:4}}>Suggested follow-up</div>
                  <div style={{fontSize:11,color:"#3D3560",marginBottom:2}}>"{meetingIntelligence.suggestedFollowUp.text}"</div>
                  {meetingIntelligence.suggestedFollowUp.reasoning&&(
                    <div style={{fontSize:10,color:"#6B6375",marginBottom:8,fontStyle:"italic"}}>{meetingIntelligence.suggestedFollowUp.reasoning}</div>
                  )}
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{
                      const q = meetingIntelligence.suggestedFollowUp.text;
                      setInputText(t=>t?t+" "+q:q);
                      inputRef.current?.focus();
                      setDismissedFollowUpKey(followUpKey);
                    }} style={{fontSize:11,background:"#7C5CFC",border:"none",borderRadius:5,padding:"4px 10px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Insert question</button>
                    <button onClick={()=>setDismissedFollowUpKey(followUpKey)} style={{fontSize:11,background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
                  </div>
                </div>
              )}
              {prepQuestions.length>0&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#1A7A4A",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Questions</div>
                  {prepQuestions.map(q=>{
                    const meta = questionStatusMeta(q.status);
                    return (
                      <div key={q.id} style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:5}}>
                        <select value={q.status||"not_asked"} onChange={e=>onSetPrepQuestionStatus(q.id, e.target.value)}
                          aria-label={"Status for: "+q.text}
                          style={{fontSize:10,border:"1px solid #E8E0D0",borderRadius:4,padding:"1px 2px",color:meta.color,background:"#FFFFFF",flexShrink:0,marginTop:1}}>
                          {QUESTION_STATUSES.map(s=><option key={s.id} value={s.id}>{s.symbol} {s.label}</option>)}
                        </select>
                        <span style={{fontSize:11,color:"#3D3560",lineHeight:1.5}}>{q.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {meetingEvidenceSuggestions.some(s=>s.status==="pending")&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Evidence mentioned</div>
                  {meetingEvidenceSuggestions.filter(s=>s.status==="pending").map(s=>(
                    <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginBottom:6}}>
                      <span style={{fontSize:11,color:"#3D3560",lineHeight:1.5,flex:1}}>{s.kind==="witness"?"Potential witness: ":""}{s.description}</span>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button onClick={()=>onAcceptMeetingEvidenceSuggestion(s)} style={{fontSize:10,color:"#fff",background:"#7C5CFC",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Accept</button>
                        <button onClick={()=>onDismissMeetingEvidenceSuggestion(s.id)} style={{fontSize:10,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {meetingActionSuggestions.some(s=>s.status==="pending")&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#1C5AA0",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Actions identified</div>
                  {meetingActionSuggestions.filter(s=>s.status==="pending").map(s=>(
                    <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginBottom:6}}>
                      <span style={{fontSize:11,color:"#3D3560",lineHeight:1.5,flex:1}}>{s.description}{s.suggestedOwner?" — "+s.suggestedOwner:""}{s.suggestedDueDate?" (by "+s.suggestedDueDate+")":""}</span>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button onClick={()=>onAcceptMeetingActionSuggestion(s)} style={{fontSize:10,color:"#fff",background:"#1C5AA0",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Accept</button>
                        <button onClick={()=>onDismissMeetingActionSuggestion(s.id)} style={{fontSize:10,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Dismiss</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {meetingIntelligence&&[
                ...(prepQuestions.length>0?[]:[
                  {key:"questionsAsked", label:"Questions asked", color:"#1A7A4A"},
                  {key:"questionsRemaining", label:"Questions remaining", color:"#B87520"},
                ]),
                {key:"newIssues", label:"New issues raised", color:"#C84B2F"},
              ].map(({key,label,color})=>{
                const items = meetingIntelligence[key];
                if(!items?.length) return null;
                return (
                  <div key={key} style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{label}</div>
                    {items.map((item,i)=>(
                      <div key={i} style={{fontSize:11,color:"#3D3560",lineHeight:1.5,paddingLeft:8,position:"relative"}}>
                        <span style={{position:"absolute",left:0}}>·</span>{item}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ask Compass */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Ask Compass</div>
              {liveChatHistory.length===0&&(
                <div style={{fontSize:12,color:"#C4BAB0",lineHeight:1.6}}>Ask anything about the meeting or get HR advice in real time</div>
              )}
              {liveChatHistory.map((m,i)=>(
                <div key={i} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:m.role==="user"?"#1A1535":"#7C5CFC",marginBottom:3}}>{m.role==="user"?"You":"Compass"}</div>
                  <div style={{fontSize:12,color:"#3D3560",lineHeight:1.6,background:m.role==="assistant"?"#F5F3FF":"none",padding:m.role==="assistant"?"8px 10px":"0",borderRadius:6,borderLeft:m.role==="assistant"?"2px solid #7C5CFC":"none"}}><MDRenderer text={m.role==="assistant"?(()=>{
                  const txt=m.content.replace(/^#{1,6} /gm,"").replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1");
                  return txt.split("\n").map((line,j)=>{
                    if(!line.trim()) return <div key={j} style={{height:4}}/>;
                    if(/^\d+\./.test(line.trim())) return <div key={j} style={{marginBottom:3,paddingLeft:6}}>{line.trim()}</div>;
                    if(line.trim().startsWith("- ")||line.trim().startsWith("• ")) return <div key={j} style={{marginBottom:2,display:"flex",gap:4}}><span style={{color:"#7C5CFC",flexShrink:0}}>·</span><span>{line.trim().slice(2)}</span></div>;
                    if(line.trim()==="---") return <hr key={j} style={{border:"none",borderTop:"1px solid #E8E0D0",margin:"6px 0"}}/>;
                    return <div key={j} style={{marginBottom:3}}>{line.trim()}</div>;
                  });
                })():m.content}/></div>
                </div>
              ))}
              {liveChatProcessing&&<div style={{fontSize:11,color:"#9B9098",fontStyle:"italic"}}>Thinking...</div>}
            </div>
            <div style={{padding:"12px 14px",borderTop:"1px solid #EDE5D8",flexShrink:0}}>
              <div style={{display:"flex",gap:8,background:"#F5F1EA",borderRadius:8,padding:"8px 12px",alignItems:"center"}}>
                <input value={liveChatInput} onChange={e=>setLiveChatInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&sendLiveChat()}
                  placeholder="Ask about this meeting..."
                  aria-label="Ask about this meeting"
                  style={{flex:1,background:"none",border:"none",outline:"none",fontSize:12,color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
                <button onClick={sendLiveChat} disabled={liveChatProcessing||!liveChatInput.trim()} aria-label="Send"
                  style={{background:"#7C5CFC",border:"none",borderRadius:6,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:liveChatProcessing||!liveChatInput.trim()?0.4:1,flexShrink:0}}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 10V2M6 2L3 5M6 2L9 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showQualityCheck&&(
        <MeetingQualityCheckModal
          gaps={qualityCheckGaps}
          onReturnToMeeting={onReturnToMeeting}
          onCreateFollowUp={createQualityCheckFollowUp}
          onProceed={proceedPastQualityCheck}
        />
      )}
    </div>
  );
}
