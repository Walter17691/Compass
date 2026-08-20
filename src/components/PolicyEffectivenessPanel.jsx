import { computePolicyReferenceCounts, countClarificationRequests, POLICY_MIN_SAMPLE_SIZE } from '../lib/policyEffectiveness';
import { DataQualityCaveat } from './DataQualityCaveat';

const BarRow = ({ label, value, max, color = "#1C5AA0" }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:"#1C1820"}}>{label}</span>
      <span style={{fontSize:12,color:"#9B9098"}}>{value} case{value===1?"":"s"}</span>
    </div>
    <div style={{background:"#F5F1EA",borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value/max)*100):0}%`}}/>
    </div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP13, §10) — policy
// effectiveness. See policyEffectiveness.js's own header for the real
// data-model finding this is scoped around: policies are stored
// per-browser, not org-wide, so this aggregates by policy NAME (from
// case_signals' own persisted sourceRefs), never by re-resolving an id
// against whichever user's local policy list happens to be open.
export function PolicyEffectivenessPanel({ caseSignals, hrReviewRequests }) {
  const references = computePolicyReferenceCounts(caseSignals);
  const totalReferences = references.reduce((a, r) => a + r.caseCount, 0);
  const clarificationCount = countClarificationRequests(hrReviewRequests);
  const max = Math.max(1, ...references.map(r => r.caseCount));

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Policy effectiveness</div>

      {totalReferences < POLICY_MIN_SAMPLE_SIZE
        ? <DataQualityCaveat total={totalReferences} minRequired={POLICY_MIN_SAMPLE_SIZE} label="policy references"/>
        : references.map(r => <BarRow key={r.policyName} label={r.policyName} value={r.caseCount} max={max}/>)}

      {clarificationCount > 0 && (
        <div style={{marginTop:12,fontSize:12,color:"#6B6375"}}>
          {clarificationCount} clarification request{clarificationCount===1?"":"s"} raised on investigations this year, organisation-wide — not attributable to a specific policy.
        </div>
      )}
    </div>
  );
}
