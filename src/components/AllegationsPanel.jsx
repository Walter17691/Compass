import { useState } from 'react';
import { InvestigationConclusionField } from './InvestigationConclusionField';
import { DraftTextarea } from './DraftTextarea';
import { FONT } from '../styles/tokens';
import { ALLEGATION_STATUSES, EVIDENCE_STANCES, allegationStatusMeta, evidenceForAllegation, linkEvidenceToAllegation, unlinkEvidenceFromAllegation, isFindingStatus, APPEAL_OUTCOMES, appealOutcomeMeta } from '../lib/allegations';
import { computeOutcomeDistribution, computeSanctionDistribution, comparableCaseSummaries } from '../lib/outcomeConsistency';
import { appealMeetingsForCase } from '../lib/appealReview';
import { allegationPolicyClauseRef } from '../lib/guardrails';
import { EvidenceMatrixPanel } from './EvidenceMatrixPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { AppealGroundCard } from './AppealGroundCard';
import { PolicyCitation } from './PolicyCitation';

const inputStyle = { width:"100%", fontSize:13, border:"1px solid #E8EAF2", borderRadius:6, padding:"8px 10px", color:"#0F1224", outline:"none", fontFamily:FONT.sans, boxSizing:"border-box" };
const labelStyle = { fontSize:11, color:"#8A8EA3", display:"block", marginBottom:4 };

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
// DraftTextarea (the Phase 6.5 commit-on-blur hardening) now lives in
// ./DraftTextarea so the investigator's findings workspace shares one
// implementation rather than carrying a second copy of that fix.
function ReadOnlyField({ label, value, placeholder }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={labelStyle}>{label}</label>
      <div style={{fontSize:13,color:value?"#0F1224":"#8A8EA3",padding:"8px 10px",background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:6}}>{value||placeholder}</div>
    </div>
  );
}

export function AllegationsPanel({ cs, allegations, allAllegations, createAllegation, patchAllegation, changeAllegationStatus, deleteAllegation, saveCases, cases, confirmDialog, showToast, evidenceSuggestions=[], evidenceSuggestionsLoading, generateEvidenceSuggestions, acceptEvidenceSuggestion, rejectEvidenceSuggestion, onPresentMeetingRecord, orgMembers, fmtDate, caseSignals=[], onAskWhy, generateAppealReview, appealReviewLoading, recordAppealOutcome, policies, consistencyReview, consistencyReviewLoading, generateConsistencyReview, canDecide=true, canDecideAppeal=true,
  // ER Journey Slice 1. atDecisionStage: has this process reached its own
  // decision point (disciplinary hearing / grievance meeting)? Derived by
  // CaseViewScreen from the canonical hasReachedOutcomeStage, never here.
  // canRecordInvestigation: may this user write the investigation narrative —
  // true for HR and the assigned investigator ONLY. It admitted the
  // disciplinary officer until the IR-REPORT-01b/B2 review, which found that
  // was inherited from canDecide rather than decided; findings belong to the
  // investigation workflow. Note the default below is still `canDecide`, which
  // is a CALLER-less fallback for tests — CaseViewScreen always passes the
  // mayRecordInvestigationNarrative() result explicitly.
  atDecisionStage = true, canRecordInvestigation = canDecide,
  // IR-REPORT-01a. canConcludeInvestigation is NARROWER than
  // canRecordInvestigation: HR or this case's assigned investigator, and
  // deliberately not the disciplinary officer, mirroring
  // protect_allegations_investigation_conclusion_columns. Defaulting it to
  // canRecordInvestigation would reinstate the mismatch it exists to close, so
  // it defaults to false — a caller that has not decided the authority does
  // not get to offer the control.
  canConcludeInvestigation = false,
  recordInvestigationConclusion }) {
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
    if (ev.record) { onPresentMeetingRecord(ev.record); }
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
      {/* Sanction consistency and comparable closed cases. Legitimate when
          choosing a penalty; prejudicial while establishing facts, because it
          shows what punishments similar cases attracted before this case has
          any case to answer. Calculation is untouched — only its timing. */}
      {atDecisionStage && <ConsistencyPanel cs={cs} sanctionDistribution={sanctionDistribution} comparableCases={comparableCases} consistencyReview={consistencyReview} consistencyReviewLoading={consistencyReviewLoading} onGenerateReview={generateConsistencyReview} onAskWhy={onAskWhy}/>}
    <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7A2FD8"}}>Allegations ({allegations.length})</div>
        <button onClick={()=>setShowNew(v=>!v)} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>{showNew?"Cancel":"+ Add allegation"}</button>
      </div>
      <div style={{padding:"16px"}}>
        {showNew && (
          <div style={{background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:8,padding:14,marginBottom:allegations.length>0?14:0}}>
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
            <button onClick={submitNew} style={{fontSize:12,background:"#7A2FD8",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Add allegation</button>
          </div>
        )}

        {allegations.length===0 && !showNew && <div style={{fontSize:13,color:"#8A8EA3"}}>No allegations recorded yet — add the specific issues under investigation so evidence and the AI overview can be tied to each one.</div>}

        {allegations.map(a => {
          const meta = allegationStatusMeta(a.status);
          const linked = evidenceForAllegation(evidence, a.id);
          const expanded = expandedId===a.id;
          return (
            <div key={a.id} style={{border:"1px solid #E3E5EE",borderRadius:8,marginTop:10,overflow:"hidden"}}>
              <button type="button" aria-expanded={expanded} onClick={()=>setExpandedId(expanded?null:a.id)}
                style={{width:"100%",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",background:expanded?"#FFFFFF":"#FFFFFF",border:"none",borderRadius:0,textAlign:"left",font:"inherit",color:"inherit"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:"#0F1224"}}>{a.title}</div>
                  {a.period && <div style={{fontSize:11,color:"#8A8EA3",marginTop:2}}>{a.period}</div>}
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
                <div style={{padding:"14px",borderTop:"1px solid #E3E5EE"}} onClick={e=>e.stopPropagation()}>
                  {a.description && <div style={{fontSize:13,color:"#0F1224",marginBottom:12}}>{a.description}</div>}
                  {a.peopleInvolved && <div style={{fontSize:12,color:"#4A4E63",marginBottom:12}}>People involved: {a.peopleInvolved}</div>}

                  {(()=>{
                    const policyRef = allegationPolicyClauseRef(a, policies);
                    return policyRef && (
                      <div style={{marginBottom:12}}>
                        <PolicyCitation policyName={policyRef.label} clauseHeading={policyRef.clauseHeading} clauseText={policyRef.clauseText} />
                      </div>
                    );
                  })()}

                  {/* ── THE DISCIPLINARY QUESTION ─────────────────────────────
                      Substantiated / not substantiated is decided after the
                      employee has been heard, so the control is withheld until
                      the process reaches its decision point. Withheld, not
                      removed: a status already on the record (including the 343
                      historical rows) still shows read-only, so nothing becomes
                      inaccessible and nothing is rewritten. */}
                  {canDecide && atDecisionStage ? (
                    <div style={{marginBottom:12}}>
                      <label htmlFor={`allegation-status-${a.id}`} style={labelStyle}>Status</label>
                      <select id={`allegation-status-${a.id}`} value={a.status} onChange={e=>changeAllegationStatus(a.id, e.target.value)} style={{...inputStyle,width:"auto"}}>
                        {ALLEGATION_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  ) : (!atDecisionStage && !isFindingStatus(a.status)) ? null : (
                    <ReadOnlyField label="Status" value={allegationStatusMeta(a.status).label} />
                  )}

                  {/* The INVESTIGATION question, and the investigator's own
                      fields. Writable by HR and the assigned investigator; the
                      disciplinary officer reads them (outcome letter, hearing
                      pack, evidence matrix) and records their own reasoning
                      separately. Relabelled "assessment":
                      "finding" invited confusion with the disciplinary finding,
                      and the old label referred to a reasoning box that is no
                      longer on screen during investigation. */}
                  {canRecordInvestigation ? (
                    <>
                      <div style={{marginBottom:12}}>
                        <label htmlFor={`allegation-investigator-finding-${a.id}`} style={labelStyle}>Investigator's assessment — what the investigation itself concluded, not the disciplinary decision</label>
                        <DraftTextarea id={`allegation-investigator-finding-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.investigatorFinding||""} placeholder="What did the investigation itself conclude, before any hearing?" onCommit={v=>patchAllegation(a.id,{investigatorFinding:v})} />
                      </div>
                      <div style={{marginBottom:12}}>
                        <label htmlFor={`allegation-outstanding-uncertainty-${a.id}`} style={labelStyle}>Outstanding uncertainty</label>
                        <DraftTextarea id={`allegation-outstanding-uncertainty-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.outstandingUncertainty||""} placeholder="Anything still unclear or unresolved about this allegation?" onCommit={v=>patchAllegation(a.id,{outstandingUncertainty:v})} />
                      </div>
                    </>
                  ) : (
                    <>
                      <ReadOnlyField label="Investigator's assessment" value={a.investigatorFinding} placeholder="Not yet recorded" />
                      <ReadOnlyField label="Outstanding uncertainty" value={a.outstandingUncertainty} placeholder="None recorded" />
                    </>
                  )}

                  {/* ── THE INVESTIGATION CONCLUSION (Slice 2) ──────────────────
                      Last in the investigation sequence, and above everything
                      disciplinary: evidence and accounts, then the investigator's
                      assessment, then the outstanding uncertainty, then this.
                      It is the conclusion of that work, so it comes after it.

                      Ungated by atDecisionStage — unlike the status control
                      above, this belongs DURING the investigation. The authority
                      is canRecordInvestigation (HR or the assigned investigator),
                      which is also what the database enforces; the UI gate is
                      only the front door. */}
                  <InvestigationConclusionField
                    allegation={a}
                    canRecord={canConcludeInvestigation}
                    onRecord={(conclusion, reasoning) => recordInvestigationConclusion?.(a.id, conclusion, reasoning)}
                    fmtDate={fmtDate}
                    orgMembers={orgMembers}
                  />

                  {/* Finding consistency. Base-rate information about how
                      comparable allegations were decided is not evidence about
                      THIS one, and showing it during investigation anchors the
                      investigator on the question they must not yet answer. */}
                  {atDecisionStage && outcomeDistribution.applicable && (
                    <div style={{marginBottom:12,background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:8,padding:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#4A4E63",marginBottom:8}}>How similar cases have been decided</div>
                      <div style={{fontSize:11,color:"#8A8EA3",marginBottom:10}}>Based on {outcomeDistribution.total} closed {cs.caseType} case{outcomeDistribution.total===1?"":"s"} at this organisation. For context only — every case turns on its own facts.</div>
                      {outcomeDistribution.distribution.map(d=>(
                        <div key={d.status} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                          <div style={{width:130,fontSize:11,color:"#0F1224",flexShrink:0}}>{d.label}</div>
                          <div style={{flex:1,background:"#E3E5EE",borderRadius:4,height:6,overflow:"hidden"}}>
                            <div style={{width:d.pct+"%",background:"#7A2FD8",height:"100%"}}/>
                          </div>
                          <div style={{width:64,fontSize:11,color:"#4A4E63",textAlign:"right",flexShrink:0}}>{d.pct}% ({d.count})</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {atDecisionStage && isFindingStatus(a.status) && (
                    <div style={{marginBottom:12,background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:8,padding:12}}>
                      <label htmlFor={`allegation-decision-reasoning-${a.id}`} style={labelStyle}>Decision reasoning — why was this finding reached?</label>
                      {canDecide ? (
                        <DraftTextarea id={`allegation-decision-reasoning-${a.id}`} style={{...inputStyle,resize:"vertical",background:"#FFFFFF"}} rows={3} value={a.decisionReasoning||""} placeholder="Summarise what the evidence showed and why it supports this finding." onCommit={v=>patchAllegation(a.id,{decisionReasoning:v})} />
                      ) : (
                        <div style={{fontSize:13,color:a.decisionReasoning?"#0F1224":"#8A8EA3",padding:"8px 10px",background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:6}}>{a.decisionReasoning||"Not yet recorded"}</div>
                      )}
                      {a.decidedAt && (
                        <div style={{fontSize:11,color:"#8A8EA3",marginTop:6}}>
                          Decided {fmtDate?fmtDate(a.decidedAt):new Date(a.decidedAt).toLocaleDateString("en-GB")}{a.decidedBy&&orgMembers&&(()=>{const m=orgMembers.find(x=>x.user_id===a.decidedBy);return m?" by "+m.name:"";})()}
                        </div>
                      )}
                    </div>
                  )}

                  {hasAppealMeeting && isFindingStatus(a.status) && (
                    <div style={{marginBottom:12,background:"#F3EDFD",border:"1px solid #E8EAF2",borderRadius:8,padding:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        {/* Section heading, not a single control's label — the appeal outcome <select> below has its own real label. */}
                        <div style={{...labelStyle,marginBottom:0}}>Appeal review</div>
                        <button onClick={()=>generateAppealReview(cs)} disabled={appealReviewLoading} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"4px 10px",color:"#7A2FD8",cursor:appealReviewLoading?"not-allowed":"pointer",fontFamily:FONT.sans}}>
                          {appealReviewLoading?"Reviewing…":"Generate appeal review"}
                        </button>
                      </div>
                      {caseSignals.filter(s=>s.caseId===cs.id&&s.status==="open"&&s.title.startsWith("Appeal ground:")&&(s.sourceRefs||[]).some(r=>r.kind==="allegation"&&r.id===a.id)).map(s=>(
                        <AppealGroundCard key={s.id} signal={s} onAskWhy={()=>onAskWhy?.(s)} />
                      ))}
                      <div style={{marginTop:10}}>
                        <label htmlFor={`allegation-appeal-outcome-${a.id}`} style={labelStyle}>Appeal outcome — recorded by the chair, never Compass</label>
                        {/* Independent appeal officer workflow (2026-09-16) —
                            gated to canDecideAppeal (HR or this case's
                            appointed appeal_manager), not canDecide (which
                            also covers the original disciplinary_officer,
                            who does not automatically gain appeal-decision
                            authority). Mirrors
                            protect_allegations_appeal_decision_columns(). */}
                        {canDecideAppeal ? (
                          <select id={`allegation-appeal-outcome-${a.id}`} value={a.appealOutcome||""} onChange={e=>recordAppealOutcome(a.id, e.target.value, a.appealReasoning||"")} style={{...inputStyle,width:"auto"}}>
                            <option value="" disabled>Not yet decided</option>
                            {APPEAL_OUTCOMES.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        ) : (
                          <div style={{fontSize:13,color:a.appealOutcome?"#0F1224":"#8A8EA3",padding:"8px 10px",background:"#FFFFFF",border:"1px solid #E3E5EE",borderRadius:6}}>{a.appealOutcome ? appealOutcomeMeta(a.appealOutcome)?.label : "Not yet decided"}</div>
                        )}
                        {a.appealOutcome && (
                          canDecideAppeal ? (
                            <DraftTextarea aria-label="Appeal decision reasoning" style={{...inputStyle,resize:"vertical",background:"#FFFFFF",marginTop:8}} rows={2} value={a.appealReasoning||""} placeholder="Reasoning for the appeal decision." onCommit={v=>recordAppealOutcome(a.id, a.appealOutcome, v)} />
                          ) : (
                            <ReadOnlyField label="Appeal decision reasoning" value={a.appealReasoning} placeholder="Not yet recorded" />
                          )
                        )}
                        {a.appealDecidedAt && (
                          <div style={{fontSize:11,color:"#8A8EA3",marginTop:6}}>
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
                  {/* IR-REPORT-01a — this field had NO gate at all, unlike
                      every sibling around it: it rendered an editable textarea
                      unconditionally, so an appeal manager, approver or case
                      owner viewing the case read-only could still rewrite the
                      witness evidence summary. Gated on canRecordInvestigation
                      — the same authority as the investigator's assessment,
                      because a witness evidence summary is investigation
                      material, which is exactly what that gate is for.
                      B2 REVIEW: that gate no longer admits the disciplinary
                      officer. If a disciplinary officer hears new witness
                      evidence AT the hearing they can no longer record it
                      here, and must route it to the investigator or HR — the
                      one practitioner-visible consequence of the narrowing,
                      flagged for decision rather than quietly carved out. */}
                  {canRecordInvestigation ? (
                    <div style={{marginBottom:14}}>
                      <label htmlFor={`allegation-witness-evidence-${a.id}`} style={labelStyle}>Witness evidence summary</label>
                      <DraftTextarea id={`allegation-witness-evidence-${a.id}`} style={{...inputStyle,resize:"vertical"}} rows={2} value={a.witnessEvidence||""} onCommit={v=>patchAllegation(a.id,{witnessEvidence:v})} />
                    </div>
                  ) : (
                    <ReadOnlyField label="Witness evidence summary" value={a.witnessEvidence} placeholder="Not yet recorded" />
                  )}

                  <div style={{fontSize:11,fontWeight:700,color:"#4A4E63",marginBottom:8}}>Linked evidence ({linked.length})</div>
                  {linked.map(ev => (
                    <div key={ev.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F0F1F7",gap:8}}>
                      <div style={{fontSize:12,color:"#0F1224",flex:1,minWidth:0}}>{ev.name}</div>
                      <select aria-label={`Evidence stance for ${ev.name}`} value={ev.stance||"neutral"} onChange={e=>linkEvidence(a.id, ev.id, e.target.value)} style={{fontSize:11,border:"1px solid #E8EAF2",borderRadius:4,padding:"2px 6px",color:"#4A4E63"}}>
                        {EVIDENCE_STANCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <button onClick={()=>unlinkEvidence(ev.id)} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Unlink</button>
                    </div>
                  ))}
                  {evidence.filter(ev=>!ev.allegationId).length>0 && (
                    <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
                      {/* IR-REPORT-01a — this passed "supports", so merely
                          LINKING an item asserted that it supported the
                          allegation, and the investigator had to notice and
                          correct a classification they never made. The stance
                          is now left to linkEvidenceToAllegation's own
                          documented default (neutral) — one place decides it —
                          and the per-item select above is where a human
                          classifies it. Existing links are untouched: this
                          changes only what a NEW link starts as. */}
                      <select aria-label="Link existing evidence" defaultValue="" onChange={e=>{ const evId=e.target.value; linkEvidence(a.id, evId); e.target.value=""; }} style={{...inputStyle,fontSize:12}}>
                        <option value="" disabled>Link existing evidence...</option>
                        {evidence.map(ev=>!ev.allegationId && <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                      </select>
                    </div>
                  )}
                  {evidence.length===0 && <div style={{fontSize:12,color:"#8A8EA3"}}>No evidence uploaded to this case yet.</div>}

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
