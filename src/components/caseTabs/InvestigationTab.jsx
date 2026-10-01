import { INVESTIGATION_CHECKLIST_STEPS } from '../../lib/investigationChecklist';
import { hasInvestigationStage } from '../../lib/caseWorkspace';
import { meetingStateChips } from '../../lib/meetingRecordState';
import { isGenuineMeeting } from '../../lib/meetingLifecycle';
import { COLOR, TYPE, RADIUS } from '../../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 corrective — the investigation, as one stage.
//
// Human finding: "Inside Meetings I can switch between Investigation and
// Disciplinary meeting types, but there is no Investigation destination in the
// Case View itself. An investigation is not merely a meeting category."
//
// That was right. A complete investigation workflow already existed, spread
// across five separate accordion rows:
//
//   Allegations    what is being investigated
//   Evidence       what has been gathered
//   Meetings       the investigation interviews, and the witnesses in them
//   Tasks          the seeded seven-step investigation checklist
//   Documents      the investigation report
//
// plus an assigned investigator with a target completion date, a submit-findings
// action, and an HR review gate — none of which were visible together.
//
// ┌─ THIS IS NOT A SECOND INVESTIGATION SYSTEM ─────────────────────────────┐
// │ Every record shown here is the existing record, read from the existing   │
// │ source, rendered by the existing panel. No new table, no new state, no   │
// │ new workflow, no new transition. The checklist is the seven steps        │
// │ investigationChecklist.js already seeds; the report is cs.investigation- │
// │ Report; the gate is the existing hrReviewRequests step "inv_report".     │
// │                                                                          │
// │ It changes where a user looks, not what the process is.                  │
// └─────────────────────────────────────────────────────────────────────────┘
//
// On a process type with no investigation stage — a grievance — this renders
// the same artefacts without the investigation framing, because asserting a
// stage the type does not have would be a lie about the procedure.
// ─────────────────────────────────────────────────────────────────────────

function StageStrip({ cs, investigator, targetDate, checklistTasks, fmtDate }) {
  const done = (checklistTasks || []).filter(t => t.status === "done" || t.done).length;
  const total = INVESTIGATION_CHECKLIST_STEPS.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const reportDone = !!cs.investigationReport;

  return (
    <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{...TYPE.metadata,color:COLOR.inkFaint}}>Investigation progress</div>
        <div style={{...TYPE.metadata,color:COLOR.inkQuiet}}>
          {done} of {total} steps{reportDone ? " · findings submitted" : ""}
        </div>
      </div>
      <div style={{height:4,background:COLOR.borderFaint,borderRadius:2,marginTop:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:COLOR.purple,borderRadius:2}}/>
      </div>
      {(investigator || targetDate) && (
        <div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginTop:8}}>
          {investigator ? <>Led by {investigator.name}</> : "No investigator assigned"}
          {targetDate && fmtDate ? <> · due {fmtDate(targetDate)}</> : null}
        </div>
      )}
    </div>
  );
}

export function InvestigationTab({
  cs, fmtDate,
  investigator = null, targetDate = null, checklistTasks = [],
  allegationsPanel = null, evidencePanel = null,
  onOpenMeeting = null, onOpenDocuments = null,
}) {
  const investigates = hasInvestigationStage(cs.caseType);
  const investigationMeetings = (cs.meetings || [])
    .filter(isGenuineMeeting)
    .filter(m => (m.type || "").toLowerCase().includes("investigation"));

  return (
    <div>
      {/* The stage's own progress, assembled from the checklist that already
          exists. Shown only where the process type genuinely has the stage. */}
      {investigates && (
        <StageStrip cs={cs} investigator={investigator} targetDate={targetDate}
          checklistTasks={checklistTasks} fmtDate={fmtDate}/>
      )}

      <section style={{marginBottom:28}}>
        <h3 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:"0 0 10px"}}>Allegations</h3>
        {allegationsPanel}
      </section>

      <section style={{marginBottom:28}}>
        <h3 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:"0 0 10px"}}>Evidence</h3>
        {evidencePanel}
      </section>

      {investigates && (
        <section style={{marginBottom:28}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,marginBottom:10}}>
            <h3 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:0}}>Investigation meetings</h3>
            {onOpenMeeting && (
              <button type="button" onClick={onOpenMeeting}
                style={{...TYPE.metadata,background:"none",border:"none",padding:0,color:COLOR.purple,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                All meetings
              </button>
            )}
          </div>
          {investigationMeetings.length === 0 ? (
            <p style={{...TYPE.rowContext,color:COLOR.inkFaint,margin:0}}>No investigation meetings held yet.</p>
          ) : (
            <div style={{border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,overflow:"hidden"}}>
              {investigationMeetings.map((m, i) => (
                <div key={m.id || i} style={{padding:"10px 14px",borderTop:i===0?"none":`1px solid ${COLOR.borderFaint}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                  <div style={{...TYPE.rowContext,color:COLOR.ink}}>
                    {m.type}{m.date && fmtDate ? ` · ${fmtDate(m.date)}` : ""}
                  </div>
                  {/* The same authoritative record/signature state the Meetings
                      destination shows — one source, two places that cannot disagree. */}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {meetingStateChips(m).map(s => (
                      <span key={s.key} style={{...TYPE.metadata,color:COLOR.inkQuiet,background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.pill,padding:"2px 9px"}}>{s.label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {investigates && (
        <section>
          <h3 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:"0 0 10px"}}>Findings</h3>
          {cs.investigationReport ? (
            <div style={{border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:14}}>
              <div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginBottom:6}}>
                Investigation report{cs.investigationReportDate && fmtDate ? ` · ${fmtDate(cs.investigationReportDate)}` : ""}
              </div>
              <div style={{...TYPE.rowContext,color:COLOR.ink,whiteSpace:"pre-wrap",lineHeight:1.6,maxHeight:260,overflow:"auto"}}>
                {cs.investigationReport}
              </div>
              {onOpenDocuments && (
                <button type="button" onClick={onOpenDocuments}
                  style={{...TYPE.metadata,background:"none",border:"none",padding:0,marginTop:10,color:COLOR.purple,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  See it in Documents
                </button>
              )}
            </div>
          ) : (
            <p style={{...TYPE.rowContext,color:COLOR.inkFaint,margin:0}}>
              No investigation report yet. It is written once the investigation steps are complete.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
