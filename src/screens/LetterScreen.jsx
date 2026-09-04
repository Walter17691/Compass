import { useState } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { CheckIcon } from '../components/Icons';
import { PageHeader } from '../components/design/PageHeader';
import { COLOR, TYPE, FONT } from '../styles/tokens';

// UAT Product Hierarchy pass, Part 3 — this screen was the brief's own
// flagship bad example: a bare tab row with no page identity, no case/
// employee context, and a lone "← Back" buried in the bottom action row.
// Reuses the same PageHeader primitive Cases/People/Insights/Settings
// already share, and the same purple-pill local-nav style CaseViewScreen's
// own tab bar already uses — no second design system introduced.
const LETTER_TYPES = [
  { id:"outcome", l:"Outcome letter" },
  { id:"invite", l:"Invitation" },
  { id:"appeal", l:"Appeal outcome" },
  { id:"suspension", l:"Suspension" },
  { id:"meeting-confirmation", l:"Meeting confirmation" },
];

// This screen is also reached directly (no tab of their own) for a few
// other correspondence types — Documents tab's "Draft: …" shortcuts and
// the Case Copilot's "No case to answer" letter. Named here so the page
// title/generation text is honest about what's actually being drafted
// instead of falling back to a bare "Letter".
const OTHER_LETTER_LABELS = {
  "witness-invitation": "Witness invitation",
  "evidence-request": "Evidence request",
  "oh-consent-request": "OH consent request",
  "no-case-answer": "Response letter",
};

export function LetterScreen({ handleLetter, activeLetter, aiProcessing, letterOutput, letterSources=[], onAskWhy, letterHistory=[], restoreLetterVersion, editingLetter, setEditingLetter, setLetterOutput, signature, setShowSigPad, setSignature, onRemoveSignature, caseInfo, triggerWithSig, pdfGenerating, saveMeetingToCase, setScreen, letterIsApproved, letterApproval, approveLetter, onSendFromCompass, onSendForAcknowledgement, outcomeRecorded=true }) {
  const [showHistory, setShowHistory] = useState(false);
  // Phase 6.5 hardening (closes Prompt 16 audit finding H10, HIGH) — an
  // "Outcome letter" can be reached before any real outcome decision
  // exists (CaseViewScreen's Copilot "Draft outcome letter" action, or
  // just clicking this screen's own Outcome letter tab) — drafting is
  // fine, AI preparing a draft for review is the point, but issuing it
  // (download/print/copy/send) as if a decision had actually been made
  // is not. outcomeRecorded is only ever false for activeLetter==="
  // outcome" with nothing yet in cases.outcome — every other letter type
  // is unaffected. The real boundary is server-side
  // (api/_auth.js's verifyOutcomeApproved, checked again on send
  // regardless of what this button state shows) — this is the honest UX
  // half of the same fix, so the block reads as an explained product
  // rule rather than a surprise error after the fact.
  const outcomeNotYetDecided = activeLetter==="outcome" && !outcomeRecorded;
  const canIssue = letterIsApproved && !outcomeNotYetDecided;
  const activeLetterLabel = LETTER_TYPES.find(lt=>lt.id===activeLetter)?.l || OTHER_LETTER_LABELS[activeLetter] || "Letter";
  return (
    <div>
      <div style={{borderBottom:`1px solid ${COLOR.border}`,background:COLOR.paper}}>
        <div style={{maxWidth:1440,margin:"0 auto",padding:"20px 20px 0"}}>
          <PageHeader
            eyebrow="Generate letter"
            title={activeLetterLabel}
            subtitle={caseInfo.employee?`${caseInfo.employee}${caseInfo.manager?` · Owner: ${caseInfo.manager}`:""}`:undefined}
            actions={<Btn variant="ghost" onClick={()=>setScreen(SCREENS.REVIEW)}>← Back to case</Btn>}
          />
          <div style={{display:"flex",gap:2,paddingBottom:8}}>
            {LETTER_TYPES.map(lt=>(
              <button key={lt.id} onClick={()=>handleLetter(lt.id)}
                style={{padding:"6px 9px",borderRadius:6,border:"none",background:activeLetter===lt.id?COLOR.purpleTint:"none",color:activeLetter===lt.id?COLOR.purpleDeep:COLOR.inkSoft,fontWeight:activeLetter===lt.id?600:400,fontSize:13,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
                {lt.l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:900,margin:"28px auto",padding:"0 20px"}}>
        {aiProcessing&&!letterOutput&&(
          <div style={{textAlign:"center",padding:50}}>
            <span className="pu" style={{color:COLOR.purple,fontSize:24}}>●</span>
            <div style={{...TYPE.pageTitle,fontSize:18,color:COLOR.ink,marginTop:14}}>Drafting your {activeLetterLabel.toLowerCase()}...</div>
            <div style={{fontSize:13,color:COLOR.inkFaint,marginTop:8,maxWidth:420,marginLeft:"auto",marginRight:"auto",lineHeight:1.6}}>
              {caseInfo.employee?`For ${caseInfo.employee}. `:""}Compass is still working on this — feel free to switch tabs or navigate elsewhere; your draft will be here, and we'll let you know when it's ready.
            </div>
          </div>
        )}
        {letterOutput&&(
          <>
            {/* Edit toggle */}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
              <button onClick={()=>onAskWhy?.({title:"This letter's draft", reasoning:"Drafted by AI from the case information below, as it stood at the moment this draft was generated. Regenerating the letter refreshes both the draft and this source list.", sourceRefs:letterSources})}
                style={{fontSize:11,background:"none",border:`1px solid ${COLOR.purple}33`,borderRadius:6,padding:"4px 12px",color:COLOR.purpleDeep,cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>Ask why</button>
              <button onClick={()=>setEditingLetter(e=>!e)}
                style={{background:editingLetter?COLOR.purple:"none",border:"1px solid",borderColor:editingLetter?COLOR.purple:"#E8E0D0",borderRadius:5,padding:"4px 12px",fontSize:11,color:editingLetter?"#fff":"#888",cursor:"pointer"}}>
                {editingLetter?"Done editing":"Edit letter"}
              </button>
            </div>
            {editingLetter&&(
              <textarea aria-label="Letter text" value={letterOutput} onChange={e=>setLetterOutput(e.target.value)}
                style={{width:"100%",minHeight:400,background:"#FDFAF5",border:`1px solid ${COLOR.purple}33`,borderRadius:8,padding:"16px",fontSize:13,lineHeight:1.8,outline:"none",color:"#1A1535",resize:"vertical",boxSizing:"border-box",fontFamily:FONT.sans,marginBottom:12}}/>
            )}
            {/* Sig bar */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#6B6375"}}>E-signature:</span>
                {signature
                  ?<span style={{fontSize:11,color:COLOR.purple,fontWeight:600,display:"inline-flex",alignItems:"center",gap:5}}><CheckIcon size={11} />{signature.type==="typed"?`"${signature.data}"`:"Drawn"}</span>
                  :<span style={{fontSize:11,color:"#6B6880"}}>Not added — will prompt on send</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowSigPad(true)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:COLOR.purple,cursor:"pointer"}}>{signature?"Change":"Add"}</button>
                {signature&&<button onClick={onRemoveSignature||(()=>setSignature(null))} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button>}
              </div>
            </div>

            <div className="print-area" style={{background:"#FDFAF5",borderRadius:12,padding:"36px 44px",marginBottom:16,textAlign:"left"}}>
              <MDRenderer text={letterOutput} light/>
              {signature&&(
                <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid #E0DDD8"}}>
                  <div style={{fontSize:10,color:"#999",marginBottom:6}}>Signed:</div>
                  {signature.type==="typed"
                    ?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:30,color:"#FFFFFF"}}>{signature.data}</div>
                    :<img src={signature.data} alt={`Signature of ${caseInfo.manager||"HR Manager"}`} style={{maxHeight:55,maxWidth:180}}/>}
                  <div style={{fontSize:11,color:"#6B6375",marginTop:5}}>{caseInfo.manager||"HR Manager"} | {new Date().toLocaleDateString("en-GB")}</div>
                </div>
              )}
            </div>

            {/* Outcome-not-yet-decided gate — a preparatory AI draft is
                fine (that's the whole point of the Copilot's "Draft
                outcome letter" action, offered before any decision has
                been made), but this screen is the one place every real
                send/download/print/copy path converges on regardless of
                how it was reached, so it's the right place to make clear
                this letter can't be issued as if a decision had already
                been made. Record the outcome via the case's Outcome tab
                first. */}
            {outcomeNotYetDecided&&(
              <div style={{background:"#FEF0EB",border:"1px solid #F0C4B0",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:12,color:"#C84B2F"}}>
                This case has no recorded outcome yet — this is a preparatory draft only. Record the outcome on the case's Outcome tab before this letter can be downloaded, printed, copied or sent.
              </div>
            )}

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
              {/* Human UAT remediation, Batch 1, Issue 5 — this used to stay
                  a live, clickable "Re-confirm approval" button forever
                  once approved, even with nothing to re-confirm (the text
                  hadn't changed). Clicking it silently re-ran the exact
                  same approval again — indistinguishable, from the
                  outside, from the first click having failed. Once
                  genuinely approved it's now a plain disabled confirmation,
                  not a second gate; it only ever becomes an active
                  "Approve for sending" button again once editing/
                  regenerating the letter has genuinely invalidated the
                  approval (letterIsApproved goes false — see
                  lib/letterApproval.js's snapshot check above). The
                  underlying gate itself — approval required before
                  send/download — is unchanged. */}
              <Btn variant={letterIsApproved?"ghost":"primary"} onClick={approveLetter} disabled={letterIsApproved} style={{fontSize:12,padding:"6px 14px",flexShrink:0}}>
                {letterIsApproved?"Already approved":"Approve for sending"}
              </Btn>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn onClick={()=>triggerWithSig("download")} disabled={pdfGenerating||!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>{pdfGenerating?"Generating...":"Download PDF"}</Btn>
              <Btn variant="secondary" onClick={()=>triggerWithSig("gmail")} disabled={pdfGenerating||!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>Send via Gmail</Btn>
              <Btn variant="secondary" onClick={()=>triggerWithSig("outlook")} disabled={pdfGenerating||!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>Send via Outlook</Btn>
              {onSendFromCompass&&(
                // Integrations & Workflow Automation (Phase 5, IP13, §7) —
                // unlike "Send via Gmail/Outlook" above (download a PDF,
                // open a webmail compose window, HR still attaches and
                // sends it themselves), this actually sends via Compass's
                // own infrastructure (api/send-letter.js) and then runs
                // the rest of the coordinated workflow — save a sent copy,
                // add a timeline event, complete a matching task, log an
                // audit event — as one action.
                <Btn variant="secondary" onClick={onSendFromCompass} disabled={pdfGenerating||!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>Send from Compass</Btn>
              )}
              {onSendForAcknowledgement&&(
                // Integrations & Workflow Automation (Phase 5, IP27, §21) —
                // unlike "Send from Compass" above (a plain email, no
                // receipt), this tracks whether the employee has actually
                // opened and acknowledged the letter via the same
                // signing_requests lifecycle meeting records already use.
                <Btn variant="secondary" onClick={onSendForAcknowledgement} disabled={pdfGenerating||!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>Send for acknowledgement</Btn>
              )}
              <Btn variant="ghost" onClick={()=>window.print()} disabled={!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>Print</Btn>
              <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(letterOutput)} disabled={!canIssue} title={canIssue?undefined:outcomeNotYetDecided?"Record the outcome first":"Approve the letter first"}>Copy text</Btn>
              <Btn variant="dark" onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case</Btn>
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
