import { INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';
import { computeInvestigatorRecommendation } from '../lib/investigatorRecommendation';

// Phase 15 of the reasoning-layer build-out (Manager Investigation Mode).
// A restricted, checklist-driven workspace over the SAME underlying case
// data (allegations, evidence, unanswered-question signals) — not a new
// source of truth, not a parallel screen with its own state. Rendered
// instead of CaseViewScreen's normal tabbed workspace when the current,
// non-HR user has been granted case_access with role "investigator" on
// this specific case (see App.jsx's assignInvestigator).
//
// Manager Enablement (Phase 4, MP9, §8/§21) — this component's own prop
// contract IS the within-case minimization boundary: it is never handed
// wellbeingNotes, other cases for the same employee, or anything beyond
// this one case's allegations/evidence/signals/tasks, regardless of what
// CaseViewScreen's own broader fetch contains. Keep it that way when
// adding props here — don't widen this beyond what an investigator
// should see.
function StepCard({ index, step, task, onToggle, children }) {
  const done = task?.status==="done";
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <button onClick={()=>task&&onToggle(task.id)} aria-label={done?"Mark not done":"Mark done"}
          style={{flexShrink:0,width:22,height:22,borderRadius:"50%",border:"2px solid",borderColor:done?"#1A7A4A":"#E8E0D0",background:done?"#1A7A4A":"#FFFFFF",cursor:task?"pointer":"default",marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12}}>{done?"✓":""}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Step {index+1} of {INVESTIGATION_CHECKLIST_STEPS.length}</div>
          <div style={{fontSize:15,fontWeight:600,color:done?"#6B6375":"#1A1535",textDecoration:done?"line-through":"none"}}>{step.label}</div>
          {children&&<div style={{marginTop:10}}>{children}</div>}
        </div>
      </div>
    </div>
  );
}

export function InvestigatorChecklistView({ cs, caseAllegations, checklistTasks, toggleCaseTaskDone, openQuestions, onStartWitnessInterview, onStartEmployeeInterview, setScreen, screens, scopeAllegationIds, targetCompletionDate, scopeNote, fmtDate, planTasks=[], onGeneratePlan, planLoading, caseSignals=[] }) {
  const evidence = cs.evidence||[];
  const stepFor = (label) => checklistTasks.find(t=>t.name===label);
  const doneCount = checklistTasks.filter(t=>t.status==="done").length;
  const recommendation = computeInvestigatorRecommendation(cs, checklistTasks, planTasks, caseSignals);
  // Manager Enablement (Phase 4, MP7, §7) — scopeAllegationIds is null for
  // investigators assigned before this phase (or via a scope-less caller),
  // which keeps their old "sees every allegation" behaviour; a non-null
  // array (even an empty one, if HR deliberately unchecked everything)
  // narrows this step's list to just what was actually assigned.
  const scopedAllegations = scopeAllegationIds ? caseAllegations.filter(a=>scopeAllegationIds.includes(a.id)) : caseAllegations;

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{maxWidth:640,margin:"0 auto",padding:"40px 20px"}}>
        <button onClick={()=>setScreen(screens.CASES)} style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0,marginBottom:16}}>← Cases</button>
        <div style={{fontSize:11,color:"#9B9098"}}>{cs.employeeName}</div>
        <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:24,color:"#7C5CFC",margin:"2px 0 6px",fontWeight:600}}>Investigation checklist</h2>
        <p style={{fontSize:13,color:"#6B6375",margin:"0 0 8px"}}>You've been assigned to investigate this case. Work through each step below — HR can see your progress at any point.</p>
        <p style={{fontSize:12,color:"#9B9098",margin:targetCompletionDate||scopeNote?"0 0 8px":"0 0 24px"}}>{doneCount} of {INVESTIGATION_CHECKLIST_STEPS.length} steps complete{targetCompletionDate&&<> · Due {fmtDate(targetCompletionDate)}</>}</p>
        {scopeNote&&(
          <div style={{fontSize:12,color:"#5B3FD4",background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"8px 12px",marginBottom:12}}>{scopeNote}</div>
        )}

        {/* Manager Enablement (Phase 4, MP9, §8) — the one deterministic
            "what next" line, combining an unresolved guardrail, MP8's own
            plan, and the fixed checklist in that priority order
            (computeInvestigatorRecommendation). Never free-form AI text. */}
        {recommendation&&(
          <div style={{background:recommendation.kind==="guardrail"?"#FEF0EB":"#F5F3FF",border:"1px solid "+(recommendation.kind==="guardrail"?"#F5C9BA":"#DDD9F5"),borderRadius:8,padding:"12px 14px",marginBottom:24}}>
            <div style={{fontSize:10,fontWeight:700,color:recommendation.kind==="guardrail"?"#C84B2F":"#5B3FD4",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:4}}>Compass recommends next</div>
            <div style={{fontSize:13,color:"#1A1535"}}>{recommendation.text}</div>
          </div>
        )}

        <StepCard index={0} step={INVESTIGATION_CHECKLIST_STEPS[0]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[0].label)} onToggle={toggleCaseTaskDone}>
          {scopedAllegations.length===0&&<div style={{fontSize:13,color:"#9B9098"}}>No allegations recorded on this case yet.</div>}
          {scopedAllegations.map(a=>(
            <div key={a.id} style={{padding:"8px 0",borderBottom:"1px solid #F5F1EA"}}>
              <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{a.title}</div>
              {a.description&&<div style={{fontSize:12,color:"#6B6375",marginTop:2}}>{a.description}</div>}
            </div>
          ))}
        </StepCard>

        <StepCard index={1} step={INVESTIGATION_CHECKLIST_STEPS[1]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[1].label)} onToggle={toggleCaseTaskDone}>
          {evidence.length===0&&<div style={{fontSize:13,color:"#9B9098"}}>No evidence uploaded to this case yet.</div>}
          {evidence.map((e,i)=>(
            <div key={i} style={{fontSize:13,color:"#1A1535",padding:"6px 0",borderBottom:"1px solid #F5F1EA"}}>{e.name}</div>
          ))}
        </StepCard>

        <StepCard index={2} step={INVESTIGATION_CHECKLIST_STEPS[2]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[2].label)} onToggle={toggleCaseTaskDone}>
          <button onClick={onStartWitnessInterview} style={{fontSize:12,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 12px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Start a witness interview</button>
        </StepCard>

        <StepCard index={3} step={INVESTIGATION_CHECKLIST_STEPS[3]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[3].label)} onToggle={toggleCaseTaskDone}>
          <button onClick={onStartEmployeeInterview} style={{fontSize:12,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 12px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Start the investigation meeting</button>
        </StepCard>

        <StepCard index={4} step={INVESTIGATION_CHECKLIST_STEPS[4]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[4].label)} onToggle={toggleCaseTaskDone}>
          {openQuestions.length===0&&<div style={{fontSize:13,color:"#9B9098"}}>No outstanding questions flagged on this case.</div>}
          {openQuestions.map(q=>(
            <div key={q.id} style={{fontSize:13,color:"#1A1535",padding:"6px 0",borderBottom:"1px solid #F5F1EA"}}>{q.title}</div>
          ))}
        </StepCard>

        <StepCard index={5} step={INVESTIGATION_CHECKLIST_STEPS[5]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[5].label)} onToggle={toggleCaseTaskDone} />
        <StepCard index={6} step={INVESTIGATION_CHECKLIST_STEPS[6]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[6].label)} onToggle={toggleCaseTaskDone} />

        {/* Manager Enablement (Phase 4, MP8, §9) — distinct from the fixed
            steps above: Compass's own case-specific plan, grounded in this
            case's actual allegations/evidence rather than a generic list.
            Deliberately separate, not folded into a StepCard, since it
            isn't a fixed step — it's a variable-length, generated set. */}
        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginTop:8}}>
          <div style={{fontSize:11,color:"#9B9098",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Investigation plan</div>
          <div style={{fontSize:12,color:"#6B6375",marginBottom:planTasks.length?14:10}}>Compass-suggested, based on what's already on this case.</div>
          {planTasks.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid #F5F1EA"}}>
              <button onClick={()=>toggleCaseTaskDone(t.id)} aria-label={t.status==="done"?"Mark not done":"Mark done"}
                style={{flexShrink:0,width:18,height:18,borderRadius:"50%",border:"2px solid",borderColor:t.status==="done"?"#1A7A4A":"#E8E0D0",background:t.status==="done"?"#1A7A4A":"#FFFFFF",cursor:"pointer",marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10}}>{t.status==="done"?"✓":""}</button>
              <div style={{fontSize:13,color:t.status==="done"?"#6B6375":"#1A1535",textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</div>
            </div>
          ))}
          {onGeneratePlan&&(
            <button onClick={onGeneratePlan} disabled={planLoading} style={{marginTop:planTasks.length?14:0,fontSize:12,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 12px",color:"#6B6375",cursor:planLoading?"default":"pointer",fontFamily:"DM Sans,system-ui,sans-serif",opacity:planLoading?0.6:1}}>
              {planLoading?"Compass is drafting a plan…":planTasks.length?"Regenerate plan":"Generate investigation plan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
