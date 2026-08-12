import { useState } from 'react';
import { ALLEGATION_STATUSES, EVIDENCE_STANCES, allegationStatusMeta, evidenceForAllegation, linkEvidenceToAllegation, unlinkEvidenceFromAllegation, isFindingStatus, APPEAL_OUTCOMES, appealOutcomeMeta } from '../lib/allegations';
import { computeOutcomeDistribution } from '../lib/outcomeConsistency';
import { appealMeetingsForCase } from '../lib/appealReview';
import { EvidenceMatrixPanel } from './EvidenceMatrixPanel';
import { SignalCard } from './SignalCard';

const inputStyle = { width:"100%", fontSize:13, border:"1px solid #E8E0D0", borderRadius:6, padding:"8px 10px", color:"#1A1535", outline:"none", fontFamily:"DM Sans,system-ui,sans-serif", boxSizing:"border-box" };
const labelStyle = { fontSize:11, color:"#9B9098", display:"block", marginBottom:4 };

// The AI case overview and case-scoped AI Q&A (both later phases) are
// downstream of this data existing at all — an allegation is the atomic
// "thing being investigated," distinct from a meeting (an event) or a
// piece of evidence (support for/against one). Evidence stays on
// cs.evidence; linking it here just tags an existing item with which
// allegation it speaks to and whether it supports or contradicts it.
export function AllegationsPanel({ cs, allegations, allAllegations, createAllegation, patchAllegation, changeAllegationStatus, deleteAllegation, saveCases, cases, confirmDialog, showToast, evidenceSuggestions=[], evidenceSuggestionsLoading, generateEvidenceSuggestions, acceptEvidenceSuggestion, rejectEvidenceSuggestion, setReviewOutput, setScreen, screens, orgMembers, fmtDate, caseSignals=[], onAskWhy, generateAppealReview, appealReviewLoading, recordAppealOutcome }) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ title:"", description:"", period:"", peopleInvolved:"" });
  const [expandedId, setExpandedId] = useState(null);
  const evidence = cs.evidence || [];
  // Phase 17 — same distribution for every allegation on this case (it's
  // grouped by the case's own caseType, not per-allegation), so computed
  // once rather than inside the allegation .map() below.
  const outcomeDistribution = computeOutcomeDistribution(cases, allAllegations||allegations, cs.caseType, cs.id);
  // Phase 19 — the Appeal Workspace only appears once there's a real
  // appeal meeting record to compare against; before that, this is just
  // Phase 16's Decision Workspace with nothing appeal-specific to show.
  const hasAppealMeeting = appealMeetingsForCase(cs).length > 0;

  // Same "open the original" affordances EvidenceTab already exposes
  // (Download for a stored file, View notes for a meeting-derived record)
  // — reused, not reimplemented, so the matrix never substitutes an AI
  // summary for the actual source.
  const openEvidence = (ev) => {
    if (ev.record) { setReviewOutput(ev.record); setScreen(screens.REVIEW); }
    else if (ev.dataUrl) { window.open(ev.dataUrl, "_blank"); }
    else { showToast?.("No stored file for this evidence item", "error"); }
  };

  const submitNew = () => {
    if(!newForm.title.trim()) { showToast?.("Give the allegation a short title first", "error"); return; }
    createAllegation(cs.id, newForm);
    setNewForm({ title:"", description:"", period:"", peopleInvolved:"" });
    setShowNew(false);
  };

  const linkEvidence = (allegationId, evidenceIndex, stance) => {
    if(evidenceIndex==="") return;
    saveCases(cases.map(x => x.id===cs.id ? { ...x, evidence: linkEvidenceToAllegation(x.evidence||[], Number(evidenceIndex), allegationId, stance) } : x));
  };

  const unlinkEvidence = (evidenceIndex) => {
    saveCases(cases.map(x => x.id===cs.id ? { ...x, evidence: unlinkEvidenceFromAllegation(x.evidence||[], evidenceIndex) } : x));
  };

  const removeAllegationConfirm = async (allegation) => {
    const ok = await confirmDialog({ title:"Remove allegation?", message:`"${allegation.title}" will be permanently removed. Linked evidence stays on the case, just unlinked from this allegation.` });
    if(!ok) return;
    saveCases(cases.map(x => x.id===cs.id ? { ...x, evidence: (x.evidence||[]).map(ev => ev.allegationId===allegation.id ? { ...ev, allegationId:undefined, stance:undefined } : ev) } : x));
    deleteAllegation(allegation.id);
  };

  return (
    <>
      <EvidenceMatrixPanel cs={cs} allegations={allegations} suggestions={evidenceSuggestions} suggestionsLoading={evidenceSuggestionsLoading} onGenerateSuggestions={generateEvidenceSuggestions} onAcceptSuggestion={acceptEvidenceSuggestion} onRejectSuggestion={rejectEvidenceSuggestion} onOpenEvidence={openEvidence}/>
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Allegations ({allegations.length})</div>
        <button onClick={()=>setShowNew(v=>!v)} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{showNew?"Cancel":"+ Add allegation"}</button>
      </div>
      <div style={{padding:"16px"}}>
        {showNew && (
          <div style={{background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:14,marginBottom:allegations.length>0?14:0}}>
            <div style={{marginBottom:10}}>
              <label style={labelStyle}>Title</label>
              <input style={inputStyle} value={newForm.title} placeholder="e.g. Unauthorised absence on 5 August" onChange={e=>setNewForm(f=>({...f,title:e.target.value}))} />
            </div>
            <div style={{marginBottom:10}}>
              <label style={labelStyle}>Description</label>
              <textarea style={{...inputStyle,resize:"vertical"}} rows={2} value={newForm.description} onChange={e=>setNewForm(f=>({...f,description:e.target.value}))} />
            </div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1}}>
                <label style={labelStyle}>Period / date</label>
                <input style={inputStyle} value={newForm.period} placeholder="5 August 2026" onChange={e=>setNewForm(f=>({...f,period:e.target.value}))} />
              </div>
              <div style={{flex:1}}>
                <label style={labelStyle}>People involved</label>
                <input style={inputStyle} value={newForm.peopleInvolved} placeholder="Names, witnesses" onChange={e=>setNewForm(f=>({...f,peopleInvolved:e.target.value}))} />
              </div>
            </div>
            <button onClick={submitNew} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Add allegation</button>
          </div>
        )}

        {allegations.length===0 && !showNew && <div style={{fontSize:13,color:"#9B9098"}}>No allegations recorded yet — add the specific issues under investigation so evidence and the AI overview can be tied to each one.</div>}

        {allegations.map(a => {
          const meta = allegationStatusMeta(a.status);
          const linked = evidenceForAllegation(evidence, a.id);
          const expanded = expandedId===a.id;
          return (
            <div key={a.id} style={{border:"1px solid #EDE5D8",borderRadius:8,marginTop:10,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",background:expanded?"#FDFAF5":"#FFFFFF"}} onClick={()=>setExpandedId(expanded?null:a.id)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{a.title}</div>
                  {a.period && <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{a.period}</div>}
                </div>
                <span style={{fontSize:10,fontWeight:600,color:meta.color,background:meta.bg,borderRadius:4,padding:"2px 8px",flexShrink:0}}>{meta.label}</span>
              </div>
              {expanded && (
                <div style={{padding:"14px",borderTop:"1px solid #EDE5D8"}} onClick={e=>e.stopPropagation()}>
                  {a.description && <div style={{fontSize:13,color:"#1A1535",marginBottom:12}}>{a.description}</div>}
                  {a.peopleInvolved && <div style={{fontSize:12,color:"#6B6375",marginBottom:12}}>People involved: {a.peopleInvolved}</div>}

                  <div style={{marginBottom:12}}>
                    <label style={labelStyle}>Status</label>
                    <select value={a.status} onChange={e=>changeAllegationStatus(a.id, e.target.value)} style={{...inputStyle,width:"auto"}}>
                      {ALLEGATION_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>

                  {outcomeDistribution.applicable && (
                    <div style={{marginBottom:12,background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>How similar cases have been decided</div>
                      <div style={{fontSize:11,color:"#9B9098",marginBottom:10}}>Based on {outcomeDistribution.total} closed {cs.caseType} case{outcomeDistribution.total===1?"":"s"} at this organisation. For context only — every case turns on its own facts.</div>
                      {outcomeDistribution.distribution.map(d=>(
                        <div key={d.status} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                          <div style={{width:130,fontSize:11,color:"#1A1535",flexShrink:0}}>{d.label}</div>
                          <div style={{flex:1,background:"#EDE5D8",borderRadius:4,height:6,overflow:"hidden"}}>
                            <div style={{width:d.pct+"%",background:"#7C5CFC",height:"100%"}}/>
                          </div>
                          <div style={{width:64,fontSize:11,color:"#6B6375",textAlign:"right",flexShrink:0}}>{d.pct}% ({d.count})</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isFindingStatus(a.status) && (
                    <div style={{marginBottom:12,background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:12}}>
                      <label style={labelStyle}>Decision reasoning — why was this finding reached?</label>
                      <textarea style={{...inputStyle,resize:"vertical",background:"#FFFFFF"}} rows={3} value={a.decisionReasoning||""} placeholder="Summarise what the evidence showed and why it supports this finding." onChange={e=>patchAllegation(a.id, {decisionReasoning:e.target.value})} onBlur={e=>patchAllegation(a.id,{decisionReasoning:e.target.value})} />
                      {a.decidedAt && (
                        <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>
                          Decided {fmtDate?fmtDate(a.decidedAt):new Date(a.decidedAt).toLocaleDateString("en-GB")}{a.decidedBy&&orgMembers&&(()=>{const m=orgMembers.find(x=>x.user_id===a.decidedBy);return m?" by "+m.name:"";})()}
                        </div>
                      )}
                    </div>
                  )}

                  {hasAppealMeeting && isFindingStatus(a.status) && (
                    <div style={{marginBottom:12,background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <label style={{...labelStyle,marginBottom:0}}>Appeal review</label>
                        <button onClick={()=>generateAppealReview(cs)} disabled={appealReviewLoading} style={{fontSize:11,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"4px 10px",color:"#5B3FD4",cursor:appealReviewLoading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                          {appealReviewLoading?"Reviewing…":"Generate appeal review"}
                        </button>
                      </div>
                      {caseSignals.filter(s=>s.caseId===cs.id&&s.title==="Appeal review: "+a.title&&s.status==="open").map(s=>(
                        <SignalCard key={s.id} signal={s} onAskWhy={()=>onAskWhy?.(s)} />
                      ))}
                      <div style={{marginTop:10}}>
                        <label style={labelStyle}>Appeal outcome — recorded by the chair, never Compass</label>
                        <select value={a.appealOutcome||""} onChange={e=>recordAppealOutcome(a.id, e.target.value, a.appealReasoning||"")} style={{...inputStyle,width:"auto"}}>
                          <option value="" disabled>Not yet decided</option>
                          {APPEAL_OUTCOMES.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        {a.appealOutcome && (
                          <textarea style={{...inputStyle,resize:"vertical",background:"#FFFFFF",marginTop:8}} rows={2} value={a.appealReasoning||""} placeholder="Reasoning for the appeal decision." onChange={e=>patchAllegation(a.id,{appealReasoning:e.target.value})} onBlur={e=>recordAppealOutcome(a.id, a.appealOutcome, e.target.value)} />
                        )}
                        {a.appealDecidedAt && (
                          <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>
                            {appealOutcomeMeta(a.appealOutcome)?.label} — decided {fmtDate?fmtDate(a.appealDecidedAt):new Date(a.appealDecidedAt).toLocaleDateString("en-GB")}{a.appealDecidedBy&&orgMembers&&(()=>{const m=orgMembers.find(x=>x.user_id===a.appealDecidedBy);return m?" by "+m.name:"";})()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{marginBottom:12}}>
                    <label style={labelStyle}>Employee response</label>
                    <textarea style={{...inputStyle,resize:"vertical"}} rows={2} value={a.employeeResponse||""} placeholder="What did the employee say about this allegation?" onChange={e=>patchAllegation(a.id, {employeeResponse:e.target.value})} onBlur={e=>patchAllegation(a.id,{employeeResponse:e.target.value})} />
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={labelStyle}>Witness evidence summary</label>
                    <textarea style={{...inputStyle,resize:"vertical"}} rows={2} value={a.witnessEvidence||""} onChange={e=>patchAllegation(a.id, {witnessEvidence:e.target.value})} onBlur={e=>patchAllegation(a.id,{witnessEvidence:e.target.value})} />
                  </div>

                  <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Linked evidence ({linked.length})</div>
                  {linked.map(ev => (
                    <div key={ev.index} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F1EA",gap:8}}>
                      <div style={{fontSize:12,color:"#1A1535",flex:1,minWidth:0}}>{ev.name}</div>
                      <select value={ev.stance||"neutral"} onChange={e=>linkEvidence(a.id, ev.index, e.target.value)} style={{fontSize:11,border:"1px solid #E8E0D0",borderRadius:4,padding:"2px 6px",color:"#6B6375"}}>
                        {EVIDENCE_STANCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <button onClick={()=>unlinkEvidence(ev.index)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Unlink</button>
                    </div>
                  ))}
                  {evidence.filter(ev=>!ev.allegationId).length>0 && (
                    <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
                      <select defaultValue="" onChange={e=>{ const idx=e.target.value; linkEvidence(a.id, idx, "supports"); e.target.value=""; }} style={{...inputStyle,fontSize:12}}>
                        <option value="" disabled>Link existing evidence...</option>
                        {evidence.map((ev,i)=>!ev.allegationId && <option key={i} value={i}>{ev.name}</option>)}
                      </select>
                    </div>
                  )}
                  {evidence.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No evidence uploaded to this case yet.</div>}

                  <div style={{marginTop:14,textAlign:"right"}}>
                    <button onClick={()=>removeAllegationConfirm(a)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove allegation</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
