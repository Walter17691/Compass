import { useState } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { WhySourcesModal } from '../components/WhySourcesModal';
import { AskCompassErrorBoundary } from '../components/AskCompassErrorBoundary';
import { COLOR, TYPE, FONT, RADIUS, BUTTON, GRADIENT } from '../styles/tokens';
import {
  REVIEW_SUPPORT, REVIEW_SUPPORT_LABEL,
  reviewSupportCounts, defaultReviewSupport, proposedUpdates,
} from '../lib/reviewSupport';
import { neutraliseSummaryHeadings, processConsiderations, adviceSections } from '../lib/reviewAdvice';

// Phase E0.6 — `cases` is deliberately NOT a prop any more. It existed solely to
// let the non-HR "Request HR review" button find a case by employee-name
// equality, which could attach a request to the wrong same-named person or, when
// it missed, write a case_id-null row that no client can ever read. Removing the
// prop makes that class of mistake structurally unavailable here: this screen
// cannot search every case in the organisation because it is not given them.
//
// ── WAVE C4 — reviewing a record, not operating a console ──
//
// This screen rendered TEN surfaces at once and put an AI prompt box ABOVE the
// record, so the first thing a reviewer met was an input, not the thing they
// came to read. The four advisory generations (triage summary, internal
// analysis, pre-outcome gaps, risk rating) each had their own card, two of them
// rendering the SAME advisory text from two different sources.
//
// Nothing is deleted. The record is the screen; the advisory material is grouped
// by job into one secondary surface (Summary / Advice / Ask) that shows one
// category at a time and can be hidden entirely. Proposed updates stay their own
// surface because approving one creates a real record — see reviewSupport.js.
//
// ── THE ONE BEHAVIOURAL FIX ──
//
// What was displayed was not what gets confirmed. The record body used to be
// sliced at `## HR Advisor` and then truncated at the first of eight hand-listed
// headings ("## Notes", "## Summary", "## Outcome", …). Generation has split the
// employee-facing half out since 2026-09-25 (meetingRecordSections.js), so the
// advisor slice was dead — but the heading truncation was not: a record that
// legitimately contained any of those headings was silently cut short ON SCREEN
// while the FULL text remained what is saved, confirmed and sent for signature.
// A reviewer could therefore sign a record containing text this screen never
// showed them.
//
// The record now renders exactly what `reviewOutput` holds, which is exactly
// what the save path confirms. The employee-facing/internal boundary is
// unchanged and still lives in exactly one place — this screen does not do its
// own filtering, because a screen quietly disagreeing with the saved artefact is
// worse than no filter at all.
export function ReviewScreen({ caseInfo, meetingType, isHR, requestHrReview, reviewOutput, reviewOutputOriginal, meetingSummary, confirmDialog, setShowShareModal, saveMeetingToCase, setScreen, showToast, askCompassInput, setAskCompassInput, askCompassHistory, setAskCompassHistory, askCompass, setAskCompassProcessing, askCompassProcessing, editProcessing, editRecord, editingRecord, setEditingRecord, aiProcessing, aiError, setReviewOutput, setShowSignModal, signatureEligible=false, standalone=false, onSaveAndSendForSignature, draftStatus=null, onEditReviewRecord, onRetryReviewDraft, advisorNotes="", reviewGaps=[], riskScore, reviewGenerationFailed, onRetryGeneration,
  meetingEvidenceSuggestions=[], onAcceptMeetingEvidenceSuggestion, onDismissMeetingEvidenceSuggestion,
  meetingActionSuggestions=[], onAcceptMeetingActionSuggestion, onDismissMeetingActionSuggestion,
}) {
  // M8 — post-meeting proposed-updates review. Pending items (raised live
  // but never actioned) get one last explicit decision here; accepted
  // items with nothing created yet (no case existed at the time — see
  // App.jsx's acceptMeetingEvidenceSuggestion) are shown as already
  // decided, informational only. Nothing here is a new detection pass —
  // purely a review of what M3/M4 already found.
  const updates = proposedUpdates({
    evidenceSuggestions: meetingEvidenceSuggestions,
    actionSuggestions: meetingActionSuggestions,
  });
  const approveAllPending = () => {
    updates.pendingEvidence.forEach(onAcceptMeetingEvidenceSuggestion);
    updates.pendingActions.forEach(onAcceptMeetingActionSuggestion);
  };
  // Phase 23 — Explainability retrofit. This panel predates the
  // case_signals/WhySourcesModal primitive (Phase 0) and rendered as
  // unsourced prose until now. Self-contained here rather than routed
  // through App.jsx's whySignal state (CaseViewScreen's own pattern) —
  // this screen renders before a meeting is even saved to the case, so
  // there's no persisted meeting id yet to resolve a ref against.
  const [showRiskWhy, setShowRiskWhy] = useState(false);

  const counts = reviewSupportCounts({ meetingSummary, advisorNotes, reviewGaps, riskScore, askCompassHistory });
  const [category, setCategory] = useState(() => defaultReviewSupport(counts));
  const [supportHidden, setSupportHidden] = useState(false);

  const submitAsk = () => {
    const q = askCompassInput;
    setAskCompassInput("");
    // Unchanged routing: an edit-shaped request rewrites the record, anything
    // else is answered. Keyword matching, as before — not a new classifier.
    if(q.toLowerCase().includes("edit")||q.toLowerCase().includes("change")||q.toLowerCase().includes("make")||q.toLowerCase().includes("add")||q.toLowerCase().includes("remove")){
      editRecord(q);
    } else {
      askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);
    }
  };

  const tab = key => {
    const selected = category === key;
    return (
      <button key={key} role="tab" aria-selected={selected} onClick={()=>setCategory(key)}
        style={{...TYPE.metadata,flex:1,padding:"7px 4px",border:"none",cursor:"pointer",
                borderRadius:RADIUS.chip,fontFamily:FONT.sans,
                background:selected?COLOR.paper:"transparent",
                color:selected?COLOR.ink:COLOR.inkFaint,
                fontWeight:selected?700:500,
                boxShadow:selected?"0 1px 2px rgba(15,18,36,0.08)":"none"}}>
        {REVIEW_SUPPORT_LABEL[key]}
      </button>
    );
  };

  // C4.1 — presentation only. The rating is still generated, persisted and read
  // by every other consumer; it simply stops being rendered here as a verdict.
  const considerations = processConsiderations({ riskScore, reviewGaps });
  const adviceParts = adviceSections(advisorNotes);

  const cardStyle = {background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.card};
  const eyebrow = {...TYPE.micro,color:COLOR.inkFaint};

  return (
    <div style={{minHeight:"100vh",background:COLOR.paper,color:COLOR.ink,fontFamily:FONT.sans}}>

      {/* Top action bar — not a second header, carries screen-specific
          actions (Save to case, Share, Request HR review) the sidebar has
          no equivalent for. */}
      <div style={{background:COLOR.surface,borderBottom:`1px solid ${COLOR.border}`,padding:"14px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
          <span style={{...TYPE.rowName,color:COLOR.ink}}>{caseInfo.employee}</span>
          <span style={{...TYPE.rowContext,color:COLOR.inkFaint}}>{meetingType?.label}</span>
          <span style={{...TYPE.metadata,color:COLOR.inkQuiet}}>{caseInfo.date}</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {!isHR&&(
            <Btn onClick={()=>{
              // Phase E0.6 — this resolved the case by EMPLOYEE NAME EQUALITY and
              // passed null when it missed. A case_id-null hr_review_requests row
              // is permanently invisible to every client, because that table's
              // SELECT policy is an EXISTS on cases — so a manager's request for
              // help silently vanished, and where two people share a name it
              // could instead attach to the wrong person's case.
              const caseId = caseInfo.caseId || caseInfo._linkedCaseId || null;
              if(!caseId) {
                showToast?.("Save this meeting to a case first — an HR review has to be attached to the case it concerns.", "error");
                return;
              }
              requestHrReview("record",caseId,null,reviewOutput);
            }} variant="ghost" style={{fontSize:13}}>Request HR review</Btn>
          )}
          <Btn onClick={()=>setShowShareModal(true)} variant="ghost" style={{fontSize:13}}>Share</Btn>
          {/* Release 1.0 UAT remediation (Defect #5) — gated on real content
              existing, not on the absence of an error. */}
          {/* Phase 4C.3 — a standalone meeting has no case to save to, and
              saveMeetingToCase is case-shaped throughout. */}
          {!standalone && (<>
          <Btn onClick={async ()=>{const result=await saveMeetingToCase();if(result?.ok){setScreen(SCREENS.CASES);showToast("Saved to case file");}}} variant="secondary" style={{fontSize:13}} disabled={!reviewOutput?.trim()}>Save to case</Btn>

          <Btn onClick={()=>saveMeetingToCase()} style={{fontSize:13,background:GRADIENT,borderColor:"transparent"}} disabled={!reviewOutput?.trim()}>
            {caseInfo._linkedCaseId?"Save witness statement to case →":"Save and go to case →"}
          </Btn>
          </>)}
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px",display:"grid",
                   gridTemplateColumns:supportHidden?"1fr":"1fr 340px",gap:24,alignItems:"start"}}>

        {/* ══ THE RECORD — the reason this screen exists, and the first thing on it ══ */}
        <div>
          <div className="print-area" style={{...cardStyle,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"12px 20px",borderBottom:`1px solid ${COLOR.borderFaint}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{...TYPE.sectionHeading,color:COLOR.ink}}>Meeting record</span>
              <div style={{display:"flex",gap:14,alignItems:"center"}}>
                {reviewOutputOriginal&&reviewOutput!==reviewOutputOriginal&&(
                  <button onClick={async()=>{
                    const ok = await confirmDialog({title:"Restore original AI draft", message:"This replaces your edits with the record as Compass first generated it. This can't be undone.", confirmLabel:"Restore", danger:true});
                    if(ok) setReviewOutput(reviewOutputOriginal);
                  }} style={{...TYPE.micro,color:COLOR.amber,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Restore original</button>
                )}
                <button onClick={()=>window.print()} style={{...TYPE.micro,color:COLOR.inkFaint,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Print</button>
                <button onClick={()=>setEditingRecord(r=>!r)}
                  style={{...TYPE.micro,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>
                  {editingRecord?"Done editing":"Edit record"}
                </button>
              </div>
            </div>
            <div style={{padding:"28px 32px"}}>
              {aiProcessing&&!reviewOutput&&(
                <div style={{textAlign:"center",padding:"48px 0",color:COLOR.inkQuiet,...TYPE.body}}>
                  <div className="pu" style={{width:8,height:8,borderRadius:"50%",background:COLOR.purple,display:"inline-block",marginBottom:12}}></div>
                  <div>Compass is generating your record...</div>
                </div>
              )}
              {/* Rendered verbatim. No slicing, no heading allow-list — what is
                  read here is what the save path confirms. */}
              {reviewOutput&&!editingRecord&&(
                <div style={{fontSize:14,lineHeight:1.9,color:COLOR.ink}}><MDRenderer text={reviewOutput}/></div>
              )}
              {/* Release 1.0 UAT remediation — editing no longer requires
                  pre-existing AI content, so a record can be written from
                  scratch after a failed generation. */}
              {editingRecord&&(
                <textarea aria-label="Meeting record" value={reviewOutput} onChange={e=>(onEditReviewRecord||setReviewOutput)(e.target.value)}
                  placeholder="Write the meeting record..."
                  style={{width:"100%",minHeight:400,background:"none",border:"none",outline:"none",fontSize:14,lineHeight:1.9,color:COLOR.ink,resize:"vertical",fontFamily:FONT.sans,boxSizing:"border-box"}}/>
              )}
              {/* Release 1.0 UAT remediation (Defect #5) — an explicit,
                  unmissable failure state. Retry re-runs the same generation
                  (handleReview is idempotent). The user's own meeting notes
                  are a separate, untouched piece of state. */}
              {reviewGenerationFailed&&!editingRecord&&(
                <div style={{textAlign:"center",padding:"32px 16px"}}>
                  <div style={{...TYPE.body,color:COLOR.red,fontWeight:700,marginBottom:6}}>Compass AI could not generate the meeting record</div>
                  <div style={{...TYPE.rowContext,color:COLOR.inkFaint,marginBottom:16}}>Your meeting notes have been kept. Retry, or write the record manually.</div>
                  <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                    <Btn onClick={onRetryGeneration} disabled={aiProcessing}>{aiProcessing?"Retrying...":"Retry"}</Btn>
                    <Btn variant="ghost" onClick={()=>setEditingRecord(true)}>Write manually</Btn>
                  </div>
                </div>
              )}
              {aiError&&!reviewGenerationFailed&&<div style={{color:COLOR.red,...TYPE.rowContext}}>{aiError}</div>}
              {/* Phase 3B slice 2 — draft persistence state. Deliberately
                  lightweight: no extra panel, no second save button. A conflict
                  is the only state offering an action, because a conflict is the
                  only one the user must resolve. */}
              {draftStatus&&(
                <div style={{...TYPE.metadata,marginTop:8,color:draftStatus==="conflict"||draftStatus==="error"||draftStatus==="superseded"?COLOR.amber:COLOR.inkQuiet}}>
                  {draftStatus==="saving"&&"Saving draft…"}
                  {draftStatus==="saved"&&"Draft saved"}
                  {draftStatus==="error"&&"Couldn't save this draft — your changes are still here, and Compass will try again."}
                  {draftStatus==="superseded"&&"This record was confirmed elsewhere. The confirmed version is now the one on the case file — reopen the case to see it."}
                  {draftStatus==="conflict"&&(<>
                    This case changed elsewhere. Your draft is still here. Review the latest case before trying again.
                    {onRetryReviewDraft&&<button onClick={()=>onRetryReviewDraft()} style={{...TYPE.metadata,marginLeft:8,background:"none",border:`1px solid ${COLOR.borderStrong}`,borderRadius:RADIUS.chip,padding:"3px 10px",color:COLOR.inkFaint,cursor:"pointer",fontFamily:FONT.sans}}>Try saving again</button>}
                  </>)}
                </div>
              )}
            </div>

            {/* Phase 3B slice 1 (NEW-36) — signature is gated on the PERSISTED
                meeting being authoritatively completed with a saved record, not
                on generated text existing in this tab. */}
            {/* Phase 4C.3 — a standalone record has no case to confirm against. */}
            {standalone&&reviewOutput&&!editingRecord&&(
              <div style={{padding:"16px 28px",borderTop:`1px solid ${COLOR.borderFaint}`,background:COLOR.rail}}>
                <span style={{...TYPE.metadata,color:COLOR.inkFaint}}>This record isn't part of a case, so it can't be confirmed or sent for signature yet. Your draft is saved automatically and will be here when you come back.</span>
              </div>
            )}
            {!standalone&&!signatureEligible&&reviewOutput&&!editingRecord&&(
              <div style={{padding:"16px 28px",borderTop:`1px solid ${COLOR.borderFaint}`,background:COLOR.rail,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <button onClick={()=>onSaveAndSendForSignature?.()} style={{...BUTTON.primary}}>
                  Save &amp; send for signature →
                </button>
                <span style={{...TYPE.metadata,color:COLOR.inkFaint}}>Confirms this record on the case file, then sends it to the employee for signature</span>
              </div>
            )}
            {!standalone&&signatureEligible&&reviewOutput&&!editingRecord&&(
              <div style={{padding:"16px 28px",borderTop:`1px solid ${COLOR.borderFaint}`,background:COLOR.rail,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <button onClick={()=>setShowSignModal(true)} style={{...BUTTON.primary}}>
                  Send for signature →
                </button>
                <span style={{...TYPE.metadata,color:COLOR.inkFaint}}>Send the meeting record to the employee for signature</span>
              </div>
            )}
          </div>

          {/* ══ PROPOSED UPDATES — deliberately NOT inside the support rail ══
              Everything in the rail is advisory: reading it changes nothing.
              Approving one of these CREATES evidence, a witness or a task on the
              real case, so a decision the user owes must not sit behind a tab
              they may never open. Appears only when something is actually here. */}
          {updates.total>0&&(
            <div style={{...cardStyle,padding:"18px 20px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{...TYPE.sectionHeading,color:COLOR.ink}}>
                  {updates.awaitingDecision>0?"Compass proposes these updates":"Updates to be added when you save"}
                </div>
                {updates.awaitingDecision>1&&(
                  <button onClick={approveAllPending} style={{...BUTTON.secondary,height:30,padding:"0 12px",fontSize:12}}>Approve all</button>
                )}
              </div>
              {updates.pendingEvidence.map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <span style={{...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.5,flex:1}}>{s.kind==="witness"?"Potential witness: ":"Evidence: "}{s.description}</span>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>onAcceptMeetingEvidenceSuggestion(s)} style={{...BUTTON.secondary,height:28,padding:"0 10px",fontSize:12}}>Approve</button>
                    <button onClick={()=>onDismissMeetingEvidenceSuggestion(s.id)} style={{...BUTTON.tertiary,color:COLOR.inkFaint,fontSize:12}}>Dismiss</button>
                  </div>
                </div>
              ))}
              {updates.pendingActions.map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <span style={{...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.5,flex:1}}>Task: {s.description}</span>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>onAcceptMeetingActionSuggestion(s)} style={{...BUTTON.secondary,height:28,padding:"0 10px",fontSize:12}}>Approve</button>
                    <button onClick={()=>onDismissMeetingActionSuggestion(s.id)} style={{...BUTTON.tertiary,color:COLOR.inkFaint,fontSize:12}}>Dismiss</button>
                  </div>
                </div>
              ))}
              {updates.decided.map(s=>(
                <div key={s.id} style={{...TYPE.rowContext,color:COLOR.green,lineHeight:1.5,marginBottom:6}}>
                  ✓ {s.description}{s.kind==="witness"?" (witness)":""} — will be added once saved
                </div>
              ))}
            </div>
          )}

          {supportHidden&&(
            <button onClick={()=>setSupportHidden(false)} style={{...BUTTON.secondary,height:34,fontSize:13}}>
              Show Compass support
            </button>
          )}
        </div>

        {/* ══ ONE SECONDARY SUPPORT SURFACE ══ */}
        {!supportHidden&&(
        <aside aria-label="Compass support" style={{display:"flex",flexDirection:"column",gap:12,position:"sticky",top:84}}>
          <div style={{...cardStyle,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
              <div role="tablist" aria-label="Compass support categories" style={{display:"flex",gap:4,flex:1,background:COLOR.rail,borderRadius:RADIUS.surface,padding:3}}>
                {[REVIEW_SUPPORT.SUMMARY,REVIEW_SUPPORT.ADVICE,REVIEW_SUPPORT.ASK].map(tab)}
              </div>
              <button aria-label="Hide Compass support" onClick={()=>setSupportHidden(true)}
                style={{...BUTTON.tertiary,color:COLOR.inkFaint,fontSize:18,lineHeight:1,padding:"0 4px"}}>×</button>
            </div>

            <div style={{padding:"16px 18px"}}>
              {/* ── Summary: the short triage read (M10). Distinct from the full
                     record above — what matters, not the formatted dialogue. ── */}
              {category===REVIEW_SUPPORT.SUMMARY&&(
                meetingSummary
                  ? <div style={{...TYPE.rowContext,lineHeight:1.8,color:COLOR.inkSoft}}><MDRenderer text={neutraliseSummaryHeadings(meetingSummary)}/></div>
                  : <div style={{...TYPE.metadata,color:COLOR.inkQuiet}}>No summary for this meeting.</div>
              )}

              {/* ── Advice: everything internal, in one place, clearly labelled. ── */}
              {category===REVIEW_SUPPORT.ADVICE&&(<>
                {/* Non-blocking intelligence, moved here from the removed
                    End-meeting quality check. The meeting has happened; these are
                    things worth resolving before an OUTCOME is decided. */}
                {reviewGaps.length>0&&!editingRecord&&(
                  <div style={{marginBottom:16}}>
                    <div style={{...eyebrow,color:COLOR.amber,marginBottom:6}}>Worth checking before an outcome is decided</div>
                    <ul style={{margin:0,paddingLeft:18,...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.7}}>
                      {reviewGaps.map((g,i)=><li key={i}>{g}</li>)}
                    </ul>
                  </div>
                )}

                {/* Internal Compass analysis — separated from the employee-facing
                    record on 2026-09-25. NOT part of the editable record, NOT
                    part of what is confirmed, NOT part of anything sent to the
                    employee. Kept visible because it is genuinely useful. */}
                {advisorNotes&&!editingRecord&&(
                  <div style={{marginBottom:16}}>
                    <div style={{...eyebrow,marginBottom:6}}>Internal Compass analysis · not part of the employee record</div>
                    {/* C4.1 — the same narrative, split on its own grammatical
                        form so it can be scanned. Not another panel, not another
                        AI pass, and the headings are never forced onto content
                        that does not support them (see reviewAdvice.js). */}
                    {adviceParts.map((part,i)=>(
                      <div key={i} style={{marginTop:i?10:0}}>
                        {part.title&&<div style={{...TYPE.metadata,color:COLOR.ink,fontWeight:700,marginBottom:4}}>{part.title}</div>}
                        {part.prose&&<div style={{...TYPE.rowContext,color:COLOR.inkSoft}}><MDRenderer text={part.prose} /></div>}
                        {part.items.length>0&&(
                          <ul style={{margin:0,paddingLeft:18,...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.7}}>
                            {part.items.map((it,j)=><li key={j}>{it}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* The EXISTING risk rating, demoted out of the permanent rail
                    into advice. Nothing new is computed and nothing is rated
                    here that was not rated before. */}
                {considerations.hasContent&&!editingRecord&&(
                  <div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:6}}>
                      <div style={eyebrow}>Process considerations</div>
                      {considerations.prose&&<button onClick={()=>setShowRiskWhy(true)} style={{...BUTTON.tertiary,fontSize:11}}>Ask why</button>}
                    </div>
                    {/* C4.1 — no rating word, no traffic-light colour, and no
                        legal-exposure framing. Where the record cannot support
                        an assessment, that is said plainly instead of being
                        resolved into a reassuring one. */}
                    {considerations.unassessable&&(
                      <div style={{...TYPE.rowContext,color:COLOR.inkFaint,marginBottom:6}}>{considerations.unassessable}</div>
                    )}
                    {considerations.prose&&<div style={{...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.6}}><MDRenderer text={considerations.prose}/></div>}
                    {considerations.historyContext&&(
                      <div style={{marginTop:10,padding:"10px 12px",background:COLOR.purpleTint,borderRadius:RADIUS.surface}}>
                        <div style={{...eyebrow,color:COLOR.purple,marginBottom:4}}>Informed by this organisation's history</div>
                        <div style={{...TYPE.rowContext,color:COLOR.inkSoft,lineHeight:1.6}}>{considerations.historyContext}</div>
                      </div>
                    )}
                  </div>
                )}

                {(!reviewGaps.length||editingRecord)&&(!advisorNotes||editingRecord)&&!considerations.hasContent&&(
                  <div style={{...TYPE.metadata,color:COLOR.inkQuiet}}>Nothing to flag on this record.</div>
                )}
              </>)}

              {/* ── Ask: the prompt box, which used to sit above the record. ── */}
              {category===REVIEW_SUPPORT.ASK&&(<>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  <input aria-label="Ask Compass or edit the record" value={askCompassInput} onChange={e=>setAskCompassInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"){const q=askCompassInput;setAskCompassInput("");askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}}
                    placeholder='Ask about this record, or ask for an edit'
                    style={{flex:1,minWidth:0,background:COLOR.surface,border:`1px solid ${COLOR.borderStrong}`,borderRadius:RADIUS.surface,padding:"8px 10px",...TYPE.rowContext,color:COLOR.ink,outline:"none",fontFamily:FONT.sans}}/>
                  <button onClick={submitAsk} disabled={(askCompassProcessing||editProcessing)||!askCompassInput.trim()}
                    style={{...BUTTON.primary,height:34,padding:"0 12px",fontSize:12,opacity:(askCompassProcessing||editProcessing)||!askCompassInput.trim()?0.4:1,whiteSpace:"nowrap"}}>
                    {askCompassProcessing||editProcessing?"Working...":"Ask →"}
                  </button>
                </div>
                <AskCompassErrorBoundary>
                  {askCompassHistory.slice(-2).map((m,i)=>(
                    <div key={i} style={{marginBottom:10}}>
                      <div style={{...eyebrow,color:m.role==="user"?COLOR.inkQuiet:COLOR.purple,marginBottom:4}}>{m.role==="user"?"Your question":"Compass"}</div>
                      <div style={{...TYPE.rowContext,color:m.role==="user"?COLOR.inkFaint:COLOR.ink,lineHeight:1.8}}><MDRenderer text={m.content}/></div>
                    </div>
                  ))}
                </AskCompassErrorBoundary>
                {askCompassProcessing&&<div style={{...TYPE.metadata,color:COLOR.inkQuiet,fontStyle:"italic"}}>Compass is thinking...</div>}
              </>)}
            </div>
          </div>

          {showRiskWhy&&considerations.prose&&(
            <WhySourcesModal
              title="Process considerations"
              reasoning={considerations.prose}
              sourceRefs={[
                {kind:"transcript", label:"This meeting's record", detail:(reviewOutput||"").slice(0,300)||"The live transcript captured so far."},
                ...(considerations.historyContext ? [{kind:"context", label:"Organisational history", detail:considerations.historyContext}] : []),
              ]}
              resolveRef={ref=>ref}
              onClose={()=>setShowRiskWhy(false)}
            />
          )}
        </aside>
        )}
      </div>
    </div>
  );
}
