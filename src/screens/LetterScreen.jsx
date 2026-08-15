import { useState } from 'react';
import { SCREENS } from '../constants';
import { lsSet } from '../lib/storage';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { CheckIcon } from '../components/Icons';

export function LetterScreen({ handleLetter, activeLetter, aiProcessing, letterOutput, letterSources=[], onAskWhy, letterHistory=[], restoreLetterVersion, editingLetter, setEditingLetter, setLetterOutput, signature, setShowSigPad, setSignature, caseInfo, triggerWithSig, pdfGenerating, saveMeetingToCase, setScreen, letterIsApproved, letterApproval, approveLetter, onSendFromCompass }) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div>
      <div style={{borderBottom:"1px solid #E8E0D0"}}>
        <div style={{maxWidth:1440,margin:"0 auto",padding:"0 20px",display:"flex",gap:2}}>
          {[{id:"outcome",l:"Outcome letter"},{id:"invite",l:"Invitation"},{id:"appeal",l:"Appeal outcome"},{id:"suspension",l:"Suspension"},{id:"meeting-confirmation",l:"Meeting confirmation"}].map(lt=>(
            <button key={lt.id} onClick={()=>handleLetter(lt.id)}
              style={{background:"none",border:"none",borderBottom:"2px solid",borderBottomColor:activeLetter===lt.id?"#7C5CFC":"transparent",padding:"12px 16px",fontSize:13,color:activeLetter===lt.id?"#FFFFFF":"#9B9098",fontWeight:activeLetter===lt.id?600:400}}>
              {lt.l}
            </button>
          ))}
        </div>
      </div>
      <div style={{maxWidth:900,margin:"28px auto",padding:"0 20px"}}>
        {aiProcessing&&!letterOutput&&<div style={{textAlign:"center",padding:50}}><span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span><div style={{color:"#6B6375",marginTop:10}}>Drafting...</div></div>}
        {letterOutput&&(
          <>
            {/* Edit toggle */}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
              <button onClick={()=>onAskWhy?.({title:"This letter's draft", reasoning:"Drafted by AI from the case information below, as it stood at the moment this draft was generated. Regenerating the letter refreshes both the draft and this source list.", sourceRefs:letterSources})}
                style={{fontSize:11,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"4px 12px",color:"#5B3FD4",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Ask why</button>
              <button onClick={()=>setEditingLetter(e=>!e)}
                style={{background:editingLetter?"#7C5CFC":"none",border:"1px solid",borderColor:editingLetter?"#7C5CFC":"#E8E0D0",borderRadius:5,padding:"4px 12px",fontSize:11,color:editingLetter?"#fff":"#888",cursor:"pointer"}}>
                {editingLetter?"Done editing":"Edit letter"}
              </button>
            </div>
            {editingLetter&&(
              <textarea value={letterOutput} onChange={e=>setLetterOutput(e.target.value)}
                style={{width:"100%",minHeight:400,background:"#FDFAF5",border:"1px solid #7C5CFC33",borderRadius:8,padding:"16px",fontSize:13,lineHeight:1.8,outline:"none",color:"#1A1535",resize:"vertical",boxSizing:"border-box",fontFamily:"DM Serif Display,Georgia,serif",marginBottom:12}}/>
            )}
            {/* Sig bar */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#6B6375"}}>E-signature:</span>
                {signature
                  ?<span style={{fontSize:11,color:"#7C5CFC",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5}}><CheckIcon size={11} />{signature.type==="typed"?`"${signature.data}"`:"Drawn"}</span>
                  :<span style={{fontSize:11,color:"#6B6880"}}>Not added — will prompt on send</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowSigPad(true)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>{signature?"Change":"Add"}</button>
                {signature&&<button onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button>}
              </div>
            </div>

            <div className="print-area" style={{background:"#FDFAF5",borderRadius:12,padding:"36px 44px",marginBottom:16,textAlign:"left"}}>
              <MDRenderer text={letterOutput} light/>
              {signature&&(
                <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid #E0DDD8"}}>
                  <div style={{fontSize:10,color:"#999",marginBottom:6}}>Signed:</div>
                  {signature.type==="typed"
                    ?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:30,color:"#FFFFFF"}}>{signature.data}</div>
                    :<img src={signature.data} alt="Sig" style={{maxHeight:55,maxWidth:180}}/>}
                  <div style={{fontSize:11,color:"#6B6375",marginTop:5}}>{caseInfo.manager||"HR Manager"} | {new Date().toLocaleDateString("en-GB")}</div>
                </div>
              )}
            </div>

            {/* AI-approval gate — this letter was drafted by AI and carries
                real legal/financial weight once it reaches the employee, so
                sending it requires an explicit human sign-off tied to this
                exact text, not just having looked at the screen. Editing or
                regenerating the letter silently invalidates approval (see
                src/lib/letterApproval.js). */}
            <div style={{
              background: letterIsApproved ? "#EDF7F0" : "#FDF3E8",
              border: "1px solid",
              borderColor: letterIsApproved ? "#7CC49A" : "#E8C088",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}>
              {letterIsApproved ? (
                <div style={{fontSize:12,color:"#2E6B47",display:"flex",alignItems:"center",gap:6}}>
                  <CheckIcon size={12} />Approved for sending by <strong>{letterApproval.by}</strong> on {new Date(letterApproval.at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                </div>
              ) : (
                <div style={{fontSize:12,color:"#8A5A1E"}}>
                  This letter was drafted by AI. Review it above, then approve it before it can be downloaded, printed or sent.
                </div>
              )}
              <Btn variant={letterIsApproved?"ghost":"primary"} onClick={approveLetter} style={{fontSize:12,padding:"6px 14px",flexShrink:0}}>
                {letterIsApproved?"Re-confirm approval":"Approve for sending"}
              </Btn>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn onClick={()=>triggerWithSig("download")} disabled={pdfGenerating||!letterIsApproved} title={letterIsApproved?undefined:"Approve the letter first"}>{pdfGenerating?"Generating...":"Download PDF"}</Btn>
              <Btn variant="secondary" onClick={()=>triggerWithSig("gmail")} disabled={pdfGenerating||!letterIsApproved} title={letterIsApproved?undefined:"Approve the letter first"}>Send via Gmail</Btn>
              <Btn variant="secondary" onClick={()=>triggerWithSig("outlook")} disabled={pdfGenerating||!letterIsApproved} title={letterIsApproved?undefined:"Approve the letter first"}>Send via Outlook</Btn>
              {onSendFromCompass&&(
                // Integrations & Workflow Automation (Phase 5, IP13, §7) —
                // unlike "Send via Gmail/Outlook" above (download a PDF,
                // open a webmail compose window, HR still attaches and
                // sends it themselves), this actually sends via Compass's
                // own infrastructure (api/send-letter.js) and then runs
                // the rest of the coordinated workflow — save a sent copy,
                // add a timeline event, complete a matching task, log an
                // audit event — as one action.
                <Btn variant="secondary" onClick={onSendFromCompass} disabled={pdfGenerating||!letterIsApproved} title={letterIsApproved?undefined:"Approve the letter first"}>Send from Compass</Btn>
              )}
              <Btn variant="ghost" onClick={()=>window.print()} disabled={!letterIsApproved} title={letterIsApproved?undefined:"Approve the letter first"}>Print</Btn>
              <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(letterOutput)} disabled={!letterIsApproved} title={letterIsApproved?undefined:"Approve the letter first"}>Copy text</Btn>
              <Btn variant="blue" onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case</Btn>
              <Btn variant="ghost" onClick={()=>setScreen(SCREENS.REVIEW)}>← Back</Btn>
            </div>

            {letterHistory.length>0&&(
              <div style={{marginTop:20}}>
                <button onClick={()=>setShowHistory(v=>!v)} style={{background:"none",border:"none",color:"#9B9098",fontSize:12,cursor:"pointer",padding:0}}>
                  {showHistory?"▾":"▸"} Previous versions ({letterHistory.length})
                </button>
                {showHistory&&(
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                    {letterHistory.map((v,i)=>(
                      <div key={i} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                        <div style={{fontSize:11,color:"#6B6375",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {new Date(v.ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} — {v.text.slice(0,80)}...
                        </div>
                        <Btn variant="ghost" onClick={()=>restoreLetterVersion(v)} style={{flexShrink:0,padding:"4px 12px",fontSize:11}}>Restore</Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
