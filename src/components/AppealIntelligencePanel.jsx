import { computeAppealIntelligence, APPEAL_MIN_SAMPLE_SIZE } from '../lib/appealIntelligence';
import { APPEAL_OUTCOMES } from '../lib/allegations';
import { DataQualityCaveat } from './DataQualityCaveat';

const StatBox = ({ label, value, sub, accent = "#7C5CFC" }) => (
  <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
    <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>{label}</div>
    <div style={{fontSize:30,fontWeight:700,color:accent,fontFamily:"DM Serif Display,Georgia,serif",marginBottom:4,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:"#9B9098"}}>{sub}</div>}
  </div>
);

const BarRow = ({ label, value, max, color = "#7C5CFC" }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:"#1C1820"}}>{label}</span>
      <span style={{fontSize:12,color:"#9B9098"}}>{value}</span>
    </div>
    <div style={{background:"#F5F1EA",borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value/max)*100):0}%`}}/>
    </div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP11, §8) — appeal
// intelligence. Pure client-side aggregation (no new RPC/table) over
// allegations' own appealOutcome field and the "Appeal ground:"
// case_signals appealReview.js already writes — see
// appealIntelligence.js's own header for the full data lineage.
export function AppealIntelligencePanel({ allegations, cases, caseSignals }) {
  const data = computeAppealIntelligence(allegations, cases, caseSignals);
  const outcomeEntries = APPEAL_OUTCOMES.map(o => [o.label, data.outcomeCounts[o.id]]).filter(([,v]) => v > 0);
  const maxOutcome = Math.max(1, ...outcomeEntries.map(([,v]) => v));
  const stageEntries = Object.entries(data.stageCounts).sort((a,b) => b[1]-a[1]);
  const maxStage = Math.max(1, ...stageEntries.map(([,v]) => v));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Appeal intelligence</div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {data.appealRate !== null
          ? <StatBox label="Appeal rate" value={data.appealRate+"%"} sub={data.appealedCount+" of "+data.totalFindings+" findings appealed"}/>
          : <DataQualityCaveat total={data.totalFindings} minRequired={APPEAL_MIN_SAMPLE_SIZE} label="findings recorded"/>}
      </div>

      <div>
        <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:8}}>Appeal outcomes</div>
        {outcomeEntries.length === 0
          ? <div style={{fontSize:13,color:"#6B6375"}}>No appeal outcomes recorded yet.</div>
          : outcomeEntries.map(([label, value]) => <BarRow key={label} label={label} value={value} max={maxOutcome} color="#C84B2F"/>)}
      </div>

      <div>
        <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:8}}>Original stage of successful appeals</div>
        {stageEntries.length === 0
          ? <div style={{fontSize:13,color:"#6B6375"}}>No successful appeals with a recorded appeal meeting yet.</div>
          : stageEntries.map(([label, value]) => <BarRow key={label} label={label} value={value} max={maxStage} color="#1A7A4A"/>)}
      </div>

      <div>
        <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:8}}>Most common appeal grounds</div>
        {data.commonGrounds.length === 0
          ? <div style={{fontSize:13,color:"#6B6375"}}>No appeal grounds recorded yet.</div>
          : (
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {data.commonGrounds.map(g => (
                <span key={g.ground} style={{fontSize:11,color:"#6B6375",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:20,padding:"3px 10px"}}>{g.ground} · {g.count} case{g.count===1?"":"s"}</span>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
