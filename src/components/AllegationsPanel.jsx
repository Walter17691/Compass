import { useState, useEffect, useRef } from 'react';
import { FONT } from '../styles/tokens';
import { ALLEGATION_STATUSES, EVIDENCE_STANCES, allegationStatusMeta, evidenceForAllegation, linkEvidenceToAllegation, unlinkEvidenceFromAllegation, isFindingStatus, APPEAL_OUTCOMES, appealOutcomeMeta } from '../lib/allegations';
import { computeOutcomeDistribution, computeSanctionDistribution, comparableCaseSummaries } from '../lib/outcomeConsistency';
import { appealMeetingsForCase } from '../lib/appealReview';
import { allegationPolicyClauseRef } from '../lib/guardrails';
import { EvidenceMatrixPanel } from './EvidenceMatrixPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { AppealGroundCard } from './AppealGroundCard';
import { PolicyCitation } from './PolicyCitation';

const inputStyle = { width:"100%", fontSize:13, border:"1px solid #E8E0D0", borderRadius:6, padding:"8px 10px", color:"#1A1535", outline:"none", fontFamily:FONT.sans, boxSizing:"border-box" };
const labelStyle = { fontSize:11, color:"#9B9098", display:"block", marginBottom:4 };

// The AI case overview and case-scoped AI Q&A (both later phases) are
// downstream of this data existing at all — an allegation is the atomic
// "thing being investigated," distinct from a meeting (an event) or a
// piece of evidence (support for/against one). Evidence stays on
// cs.evidence; linking it here just tags an existing item with which
// allegation it speaks to and whether it supports or contradicts it.
// Manager Enablement (Phase 4, MP3) — a plain read-only stand-in for a
// gated decision field: same label, same spacing, just no input. Kept
// tiny and local rather than a shared component since its only job is
// to preserve the exact visual rhythm of the editable version it
// replaces.
// Phase 6.5 hardening (P0, Cluster 7) — these fields used to call
// onCommit (patchAllegation, a full-row upsert) on every keystroke via
// onChange. A local draft persists only on blur (or unmount, so
// collapsing the row without a natural blur event doesn't drop the last
// edit) — cuts write volume from one-per-character to one-per-field-edit,
// and shrinks the window the paired optimistic-concurrency guard
// (saveAllegationToDB) has to protect. Syncs from the incoming value only
// when it actually changes, so an unrelated re-render never clobbers an
// in-progress edit.
function DraftTextarea({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(value || "");
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { draftRef.current = draft; onCommitRef.current = onCommit; });

  useEffect(() => {
    if (value !== valueRef.current) { setDraft(value || ""); valueRef.current = value; }
  }, [value]);

  useEffect(() => () => {
    if (draftRef.current !== (valueRef.current || "")) onCommitRef.current(draftRef.current);
  }, []);

  const commit = () => { if (draft !== (value || "")) { onCommit(draft); valueRef.current = draft; } };

  return <textarea {...rest} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} />;
}

function ReadOnlyField({ label, value, placeholder }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={labelStyle}>{label}</label>
      <div style={{fontSize:13,color:value?"#1A1535":"#9B9098",padding:"8px 10px",background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:6}}>{value||placeholder}</div>
    </div>
  );
}

export function AllegationsPanel({ cs, allegations, allAllegations, createAllegation, patchAllegation, changeAllegationStatus, deleteAllegation, saveCases, cases, confirmDialog, showToast, evidenceSuggestions=[], evidenceSuggestionsLoading, generateEvidenceSuggestions, acceptEvidenceSuggestion, rejectEvidenceSuggestion, setReviewOutput, setScreen, screens, orgMembers, fmtDate, caseSignals=[], onAskWhy, generateAppealReview, appealReviewLoading, recordAppealOutcome, policies, consistencyReview, consistencyReviewLoading, generateConsistencyReview, canDecide=true }) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ title:"", description:"", period:"", peopleInvolved:"" });
  const [expandedId, setExpandedId] = useState(null);
  const evidence = cs.evidence || [];
  // Phase 17 — same distribution for every allegation on this case (it's
  // grouped by the case's own caseType, not per-allegation), so computed
  // once rather than inside the allegation .map() below.
  const outcomeDistribution = computeOutcomeDistribution(cases, allAllegations||allegations, cs.caseType, cs.id);
  // Process Intelligence (P14) — same "case-level, computed once" note as
  // outcomeDistribution above; ConsistencyPanel renders once per case,
  // not per allegation.
  const sanctionDistribution = computeSanctionDistribution(cases, cs.caseType, cs.id);
  const comparableCases = comparableCaseSummaries(cases, allAllegations||allegations, cs.caseType, cs.id);
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

  const linkEvidence = (allegationId, evidenceId, stance) => {
    if(evidenceId==="") return;
    saveCases(cases.map(x => x.id===cs.id ? { ...x, evidence: linkEvidenceToAllegation(x.evidence||[], evidenceId, allegationId, stance) } : x));
  };

  const unlinkEvidence = (evidenceId) => {
    saveCases(cases.map(x => x.id===cs.id ? { ...x, evidence: unlinkEvidenceFromAllegation(x.evidence||[], evidenceId) } : x));
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
      <ConsistencyPanel cs={cs} sanctionDistribution={sanctionDistribution} comparableCases={comparableCases} consistencyReview={consistencyReview} consistencyReviewLoading={consistencyReviewLoading} onGenerateReview={generateConsistencyReview} onAskWhy={onAskWhy}/>
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7C5CFC"}}>Allegations ({allegations.length})</div>
        <button onClick={()=>setShowNew(v=>!v)} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:FONT.sans}}>{showNew?"Cancel":"+ Add allegation"}</button>
      </div>
      <div style={{padding:"16px"}}>
        {showNew && (
          <div style={{background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:14,marginBottom:allegations.length>0?14:0}}>
            <div style={{marginBottom:10}}>
              <label htmlFor="new-allegation-title" style={labelStyle}>Title</label>
              <input id="new-allegation-title" style={inputStyle} value={newForm.title} placeholder="e.g. Unauthorised absence on 5 August" onChange={e=>setNewForm(f=>({...f,title:e.target.value}))} />
            </div>
            <div style={{marginBottom:10}}>
              <label htmlFor="new-allegation-description" style={labelStyle}>Description</label>
              <textarea id="new-allegation-description" style={{...inputStyle,resize:"vertical"}} rows={2} value={newForm.description} onChange={e=>setNewForm(f=>({...f,description:e.target.value}))} />
            </div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1}}>
                <label htmlFor="new-allegation-period" style={labelStyle}>Period / date</label>
                <input id="new-allegation-period" style={inputStyle} value={newForm.period} placeholder="5 August 2026" onChange={e=>setNewForm(f=>({...f,period:e.target.value}))} />
              </div>
              <div style={{flex:1}}>
                <label htmlFor="new-allegation-people" style={labelStyle}>People involved</label>
                <input id="new-allegation-people" style={inputStyle} value={newForm.peopleInvolved} placeholder="Names, witnesses" onChange={e=>setNewForm(f=>({...f,peopleInvolved:e.target.value}))} />
              </div>
            </div>
            <button onClick={submitNew} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Add allegation</button>
          </div>
        )}

        {allegations.length===0 && !showNew && <div style={{fontSize:13,color:"#9B9098"}}>No allegations recorded yet — add the specific issues under investigation so evidence and the AI overview can be tied to each one.</div>}

        {allegations.map(a => {
          const meta = allegationStatusMeta(a.status);
          const linked = evidenceForAllegation(evidence, a.id);
          const expanded = expandedId===a.id;
          return (
            <div key={a.id} style={{border:"1px solid #EDE5D8",borderRadius:8,marginTop:10,overflow:"hidden"}}>
              <button type="button" aria-expanded={expanded} onClick={()=>setExpandedId(expanded?null:a.id)}
                style={{width:"100%",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",background:expanded?"#FDFAF5":"#FFFFFF",border:"none",borderRadius:0,textAlign:"left",font:"inherit",color:"inherit"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{a.title}</div>
                  {a.period && <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{a.period}</div>}
                </div>
                <span style={{fontSize:10,fontWeight:600,color:meta.color,background:meta.bg,borderRadius:4,padding:"2px 8px",flexShrink:0}}>{meta.label}</span>
              </button>
              {expanded && (
                // Not itself interactive — inert content wrapper, present
                // only so a click landing on it doesn't bubble up to a
                // parent handler elsewhere (there is none directly above
                // this any more now the toggle is a real button, but kept
                // for defence against one being added later).
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div style={{padding:"14px",borderTop:"1px solid #EDE5D8"}} onClick={e=>e.stopPropagation()}>
                  {a.description && <div style={{fontSize:13,color:"#1A1535",marginBottom:12}}>{a.description}</div>}
                  {a.peopleInvolved && <div style={{fontSize:12,color:"#6B6375",marginBottom:12}}>People involved: {a.peopleInvolved}</div>}

                  {(()=>{
                    const policyRef = allegationPolicyClauseRef(a, policies);
                    return policyRef && (
                      <div style={{marginBottom:12}}>
                        <PolicyCitation policyName={policyRef.label} clauseHeading={policyRef.clauseHeading} clauseText={policyRef.clauseText} />
                      </div>
                    );
                  })()}

                  {canDecide ? (
                    <div style={{marginBottom:12}}>
                      <label htmlFor={`allegation-status-${a.id}`} style={labelStyle}>Status</label>
                      <select id={`allegation-status-${a.id}`} value={a.status} onChange={e=>changeAllegationStatus(a.id, e.target.value)} style={{...inputStyle,width:"auto"}}>
                        {ALLEGATION_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <ReadOnlyField label="Status" value={allegationStatusMeta(a.status).label} />
                  )}

                  {canDecide ? (
                    <>
                      <div style={{marginBottom:12}}>
                        <label htmlFor={`allegation-investigator-finding-${a.id}`} style={labelStyle}>Investigator's finding — distinct from the decision-maker's reasoning below</label>
                        <DraftTextarea id={`allegation-investigator-finding-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.investigatorFinding||""} placeholder="What did the investigation itself conclude, before any hearing?" onCommit={v=>patchAllegation(a.id,{investigatorFinding:v})} />
                      </div>
                      <div style={{marginBottom:12}}>
                        <label htmlFor={`allegation-outstanding-uncertainty-${a.id}`} style={labelStyle}>Outstanding uncertainty</label>
                        <DraftTextarea id={`allegation-outstanding-uncertainty-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.outstandingUncertainty||""} placeholder="Anything still unclear or unresolved about this allegation?" onCommit={v=>patchAllegation(a.id,{outstandingUncertainty:v})} />
                      </div>
                    </>
                  ) : (
                    <>
                      <ReadOnlyField label="Investigator's finding" value={a.investigatorFinding} placeholder="Not yet recorded" />
                      <ReadOnlyField label="Outstanding uncertainty" value={a.outstandingUncertainty} placeholder="None recorded" />
                    </>
                  )}

                  {outcomeDistribution.applicable && (
                    <div style={{marginBottom:12,background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",marginBottom:8}}>How similar cases have been decided</div>
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
                      <label htmlFor={`allegation-decision-reasoning-${a.id}`} style={labelStyle}>Decision reasoning — why was this finding reached?</label>
                      {canDecide ? (
                        <DraftTextarea id={`allegation-decision-reasoning-${a.id}`} style={{...inputStyle,resize:"vertical",background:"#FFFFFF"}} rows={3} value={a.decisionReasoning||""} placeholder="Summarise what the evidence showed and why it supports this finding." onCommit={v=>patchAllegation(a.id,{decisionReasoning:v})} />
                      ) : (
                        <div style={{fontSize:13,color:a.decisionReasoning?"#1A1535":"#9B9098",padding:"8px 10px",background:"#FFFFFF",border:"1px solid #EDE5D8",borderRadius:6}}>{a.decisionReasoning||"Not yet recorded"}</div>
                      )}
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
                        {/* Section heading, not a single control's label — the appeal outcome <select> below has its own real label. */}
                        <div style={{...labelStyle,marginBottom:0}}>Appeal review</div>
                        <button onClick={()=>generateAppealReview(cs)} disabled={appealReviewLoading} style={{fontSize:11,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"4px 10px",color:"#5B3FD4",cursor:appealReviewLoading?"not-allowed":"pointer",fontFamily:FONT.sans}}>
                          {appealReviewLoading?"Reviewing…":"Generate appeal review"}
                        </button>
                      </div>
                      {caseSignals.filter(s=>s.caseId===cs.id&&s.status==="open"&&s.title.startsWith("Appeal ground:")&&(s.sourceRefs||[]).some(r=>r.kind==="allegation"&&r.id===a.id)).map(s=>(
                        <AppealGroundCard key={s.id} signal={s} onAskWhy={()=>onAskWhy?.(s)} />
                      ))}
                      <div style={{marginTop:10}}>
                        <label htmlFor={`allegation-appeal-outcome-${a.id}`} style={labelStyle}>Appeal outcome — recorded by the chair, never Compass</label>
                        <select id={`allegation-appeal-outcome-${a.id}`} value={a.appealOutcome||""} onChange={e=>recordAppealOutcome(a.id, e.target.value, a.appealReasoning||"")} style={{...inputStyle,width:"auto"}}>
                          <option value="" disabled>Not yet decided</option>
                          {APPEAL_OUTCOMES.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        {a.appealOutcome && (
                          <DraftTextarea aria-label="Appeal decision reasoning" style={{...inputStyle,resize:"vertical",background:"#FFFFFF",marginTop:8}} rows={2} value={a.appealReasoning||""} placeholder="Reasoning for the appeal decision." onCommit={v=>recordAppealOutcome(a.id, a.appealOutcome, v)} />
                        )}
                        {a.appealDecidedAt && (
                          <div style={{fontSize:11,color:"#9B9098",marginTop:6}}>
                            {appealOutcomeMeta(a.appealOutcome)?.label} — decided {fmtDate?fmtDate(a.appealDecidedAt):new Date(a.appealDecidedAt).toLocaleDateString("en-GB")}{a.appealDecidedBy&&orgMembers&&(()=>{const m=orgMembers.find(x=>x.user_id===a.appealDecidedBy);return m?" by "+m.name:"";})()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {canDecide ? (
                    <div style={{marginBottom:12}}>
                      <label htmlFor={`allegation-employee-response-${a.id}`} style={labelStyle}>Employee response</label>
                      <DraftTextarea id={`allegation-employee-response-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.employeeResponse||""} placeholder="What did the employee say about this allegation?" onCommit={v=>patchAllegation(a.id,{employeeResponse:v})} />
                    </div>
                  ) : (
                    <ReadOnlyField label="Employee response" value={a.employeeResponse} placeholder="Not yet recorded" />
                  )}
                  <div style={{marginBottom:14}}>
                    <label htmlFor={`allegation-witness-evidence-${a.id}`} style={labelStyle}>Witness evidence summary</label>
                    <DraftTextarea id={`allegation-witness-evidence-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.witnessEvidence||""} onCommit={v=>patchAllegation(a.id,{witnessEvidence:v})} />
                  </div>

                  <div style={{fontSize:11,fontWeight:700,color:"#6B6375",marginBottom:8}}>Linked evidence ({linked.length})</div>
                  {linked.map(ev => (
                    <div key={ev.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F1EA",gap:8}}>
                      <div style={{fontSize:12,color:"#1A1535",flex:1,minWidth:0}}>{ev.name}</div>
                      <select aria-label={`Evidence stance for ${ev.name}`} value={ev.stance||"neutral"} onChange={e=>linkEvidence(a.id, ev.id, e.target.value)} style={{fontSize:11,border:"1px solid #E8E0D0",borderRadius:4,padding:"2px 6px",color:"#6B6375"}}>
                        {EVIDENCE_STANCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <button onClick={()=>unlinkEvidence(ev.id)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Unlink</button>
                    </div>
                  ))}
                  {evidence.filter(ev=>!ev.allegationId).length>0 && (
                    <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
                      <select aria-label="Link existing evidence" defaultValue="" onChange={e=>{ const evId=e.target.value; linkEvidence(a.id, evId, "supports"); e.target.value=""; }} style={{...inputStyle,fontSize:12}}>
                        <option value="" disabled>Link existing evidence...</option>
                        {evidence.map(ev=>!ev.allegationId && <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                      </select>
                    </div>
                  )}
                  {evidence.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No evidence uploaded to this case yet.</div>}

                  <div style={{marginTop:14,textAlign:"right"}}>
                    <button onClick={()=>removeAllegationConfirm(a)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Remove allegation</button>
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
