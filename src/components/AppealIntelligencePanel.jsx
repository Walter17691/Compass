import { computeAppealIntelligence, APPEAL_MIN_SAMPLE_SIZE } from '../lib/appealIntelligence';
import { APPEAL_OUTCOMES } from '../lib/allegations';
import { DataQualityCaveat } from './DataQualityCaveat';
import { CreateActionButton } from './CreateActionButton';
import { COLOR, TYPE, FONT, RADIUS } from '../styles/tokens';

// Phase 2C — plain ink accent for the headline rate (not a graded
// metric), and one neutral bar colour for outcome/stage breakdowns
// (categories, not urgency states).
const StatBox = ({ label, value, sub, accent = COLOR.ink }) => (
  <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"18px 20px"}}>
    <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:8}}>{label}</div>
    <div style={{fontSize:28,fontWeight:700,color:accent,fontFamily:FONT.serif,marginBottom:4,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:COLOR.inkFaint}}>{sub}</div>}
  </div>
);

// Insights Phase 6 (Actionability) — actionInsightRef is only ever
// passed for the "Original stage of successful appeals" rows (see the
// panel below), never for the plain outcome-count bars: an outcome
// count (e.g. "3 appeals not upheld") is a raw distributional fact with
// no specific HR follow-up implied by the number alone, whereas a stage
// where successful appeals concentrate is a genuine, actionable
// pattern — matching the audit's own explicit example. Gated at the
// row's OWN count clearing APPEAL_MIN_SAMPLE_SIZE, not merely on the
// section's already-passed aggregate floor, so a single one-off stage
// mention never earns an action button just because two OTHER stages in
// the same list are genuinely repeated.
const BarRow = ({ label, value, max, color = COLOR.inkQuiet, actionInsightRef, createCaseTask, improvementInitiatives }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:COLOR.ink}}>{label}</span>
      <span style={{fontSize:12,color:COLOR.inkFaint}}>{value}</span>
    </div>
    <div style={{background:COLOR.borderFaint,borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value/max)*100):0}%`}}/>
    </div>
    {actionInsightRef && createCaseTask && value >= APPEAL_MIN_SAMPLE_SIZE && (
      <CreateActionButton insightRef={actionInsightRef} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>
    )}
  </div>
);

// Organisational ER Intelligence (Phase 6, OP11, §8) — appeal
// intelligence. Pure client-side aggregation (no new RPC/table) over
// allegations' own appealOutcome field and the "Appeal ground:"
// case_signals appealReview.js already writes — see
// appealIntelligence.js's own header for the full data lineage.
export function AppealIntelligencePanel({ allegations, cases, caseSignals, createCaseTask, improvementInitiatives }) {
  const data = computeAppealIntelligence(allegations, cases, caseSignals);
  const outcomeEntries = APPEAL_OUTCOMES.map(o => [o.label, data.outcomeCounts[o.id]]).filter(([,v]) => v > 0);
  const maxOutcome = Math.max(1, ...outcomeEntries.map(([,v]) => v));
  const stageEntries = Object.entries(data.stageCounts).sort((a,b) => b[1]-a[1]);
  const maxStage = Math.max(1, ...stageEntries.map(([,v]) => v));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Appeal intelligence</div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {data.appealRate !== null
          ? <StatBox label="Appeal rate" value={data.appealRate+"%"} sub={data.appealedCount+" of "+data.totalFindings+" findings appealed"}/>
          : <DataQualityCaveat total={data.totalFindings} minRequired={APPEAL_MIN_SAMPLE_SIZE} label="findings recorded"/>}
      </div>

      <div>
        <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:8}}>Appeal outcomes</div>
        {outcomeEntries.length === 0
          ? <div style={{fontSize:13,color:COLOR.inkFaint}}>No appeal outcomes recorded yet.</div>
          : data.outcomeSampleSize < APPEAL_MIN_SAMPLE_SIZE
          ? <DataQualityCaveat total={data.outcomeSampleSize} minRequired={APPEAL_MIN_SAMPLE_SIZE} label="appeals recorded"/>
          : outcomeEntries.map(([label, value]) => <BarRow key={label} label={label} value={value} max={maxOutcome}/>)}
      </div>

      <div>
        <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:8}}>Original stage of successful appeals</div>
        {stageEntries.length === 0
          ? <div style={{fontSize:13,color:COLOR.inkFaint}}>No successful appeals with a recorded appeal meeting yet.</div>
          : data.stageSampleSize < APPEAL_MIN_SAMPLE_SIZE
          ? <DataQualityCaveat total={data.stageSampleSize} minRequired={APPEAL_MIN_SAMPLE_SIZE} label="successful appeals recorded"/>
          : stageEntries.map(([label, value]) => <BarRow key={label} label={label} value={value} max={maxStage} actionInsightRef={`Appeal learning: successful appeals concentrated at ${label} stage (${value} case${value===1?"":"s"})`} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>)}
      </div>

      <div>
        <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:8}}>Most common appeal grounds</div>
        {data.commonGrounds.length === 0
          ? <div style={{fontSize:13,color:COLOR.inkFaint}}>No appeal grounds recorded yet.</div>
          : data.groundSampleSize < APPEAL_MIN_SAMPLE_SIZE
          ? <DataQualityCaveat total={data.groundSampleSize} minRequired={APPEAL_MIN_SAMPLE_SIZE} label="appeal grounds recorded"/>
          : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {data.commonGrounds.map(g => (
                  <span key={g.ground} style={{fontSize:11,color:COLOR.inkSoft,background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.pill,padding:"3px 10px"}}>{g.ground} · {g.count} case{g.count===1?"":"s"}</span>
                ))}
              </div>
              {/* Insights Phase 6 — one action per genuinely repeated
                  ground (its own count clearing APPEAL_MIN_SAMPLE_SIZE),
                  never on a ground mentioned only once or twice even
                  though the section's own aggregate sample floor has
                  already been cleared by the grounds combined. */}
              {createCaseTask && data.commonGrounds.filter(g => g.count >= APPEAL_MIN_SAMPLE_SIZE).map(g => (
                <CreateActionButton key={g.ground} insightRef={`Appeal learning: repeated appeal ground — ${g.ground} (${g.count} case${g.count===1?"":"s"})`} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
