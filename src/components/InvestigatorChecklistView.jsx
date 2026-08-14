import { INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';

// Phase 15 of the reasoning-layer build-out (Manager Investigation Mode).
// A restricted, checklist-driven workspace over the SAME underlying case
// data (allegations, evidence, unanswered-question signals) — not a new
// source of truth, not a parallel screen with its own state. Rendered
// instead of CaseViewScreen's normal tabbed workspace when the current,
// non-HR user has been granted case_access with role "investigator" on
// this specific case (see App.jsx's assignInvestigator).
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

export function InvestigatorChecklistView({ cs, caseAllegations, checklistTasks, toggleCaseTaskDone, openQuestions, onStartWitnessInterview, onStartEmployeeInterview, setScreen, screens, scopeAllegationIds, targetCompletionDate, scopeNote, fmtDate }) {
  const evidence = cs.evidence||[];
  const stepFor = (label) => checklistTasks.find(t=>t.name===label);
  const doneCount = checklistTasks.filter(t=>t.status==="done").length;
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
          <div style={{fontSize:12,color:"#5B3FD4",background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"8px 12px",marginBottom:24}}>{scopeNote}</div>
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
      </div>
    </div>
  );
}
