import { computeSanctionDistribution } from '../lib/outcomeConsistency';
import { DataQualityCaveat } from './DataQualityCaveat';
import { COLOR, TYPE, RADIUS } from '../styles/tokens';

const MIN_DURATION_SAMPLE = 3;

// Phase 2C — one neutral bar colour (department/outcome breakdowns are
// comparisons for learning, not a ranking — the old blue/red per-panel
// colours implied a graded meaning that isn't there).
const BarRow = ({ label, value, max, color = COLOR.inkQuiet, right }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:COLOR.ink}}>{label}</span>
      <span style={{fontSize:12,color:COLOR.inkFaint}}>{right!=null?right:value}</span>
    </div>
    <div style={{background:COLOR.borderFaint,borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value/max)*100):0}%`}}/>
    </div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP5, §14) — benchmarking
// within the organisation. The spec's own example benchmarks by REGION;
// as established in OP4, no region concept exists in this schema, so
// this benchmarks by department (employee_records.department, the real
// populated grouping) — same substitution OP4 already made for site
// intelligence. Purely for learning/operational improvement, same as
// the spec asks: plain comparison against the company average, not a
// ranked league table.
//
// Sanction consistency reuses outcomeConsistency.js's existing
// computeSanctionDistribution(cases, caseType) unchanged — called here
// without its optional excludeCaseId (this is the one existing call
// site that wants the FULL org-wide distribution, not "every other
// case of this type" the way a single case's own ConsistencyPanel does).
export function BenchmarkingPanel({ overview, cases }) {
  const departmentDurations = Object.entries(overview.avg_duration_by_department || {});
  const companyAvg = overview.avg_case_duration_days;
  const maxDeptDays = Math.max(1, ...departmentDurations.map(([,d])=>d.avg_days||0), companyAvg||0);

  const caseTypes = Object.keys(overview.cases_by_type || {});
  const sanctionByType = caseTypes.map(type => ({ type, distribution: computeSanctionDistribution(cases, type) }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Avg case duration by department</div>
        {departmentDurations.length===0 && <div style={{fontSize:13,color:COLOR.inkFaint}}>No department data available yet.</div>}
        {departmentDurations.map(([dept, d]) => (
          <div key={dept} style={{marginBottom:10}}>
            {d.count >= MIN_DURATION_SAMPLE
              ? <BarRow label={dept} value={d.avg_days} max={maxDeptDays} right={d.avg_days+"d"+(companyAvg!=null?" · company avg "+companyAvg+"d":"")}/>
              : <DataQualityCaveat total={d.count} minRequired={MIN_DURATION_SAMPLE} label={"closed cases in "+dept+" with measurable duration"}/>}
          </div>
        ))}
      </div>

      <div>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Sanction consistency by case type</div>
        {sanctionByType.length===0 && <div style={{fontSize:13,color:COLOR.inkFaint}}>No case types recorded yet.</div>}
        {sanctionByType.map(({ type, distribution }) => (
          <div key={type} style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:600,color:COLOR.ink,marginBottom:8}}>{type}</div>
            {distribution.applicable
              ? distribution.distribution.map(o => <BarRow key={o.outcome} label={o.outcome} value={o.pct} max={100} right={o.pct+"% ("+o.count+")"}/>)
              : <DataQualityCaveat total={distribution.total} minRequired={3} label={"closed "+type+" cases with a recorded outcome"}/>}
          </div>
        ))}
      </div>
    </div>
  );
}
