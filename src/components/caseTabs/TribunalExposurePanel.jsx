import { estimateExposure } from '../../lib/tribunalEstimate';
import { WarningIcon } from '../Icons';
import { COLOR, TYPE } from '../../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 — the tribunal exposure estimator, moved out of general case
// management.
//
// This is a specialist calculator, not case administration. It was sitting
// inside a "Checks and analysis" accordion alongside the case description and a
// role-assignment form, asking a manager running an ordinary disciplinary for
// the employee's weekly pay and age. Nothing in the product reads its output —
// no workflow, no next step, no signal, no letter (audited: the only readers of
// estimatedWeeklyPay/estimatedAgeAtDismissal are this panel, the case row
// mapper, the App save path and the DSAR disclosure list).
//
// So it is now its own collapsed section, last in Case details, and it appears
// only for cases where isRiskExposureRelevant already said it applied — the
// identical gate, unchanged.
//
// WHAT IT IS: deterministic arithmetic over statutory figures. No AI, no
// network, no model. It is NOT legal advice and does not claim to be.
// ─────────────────────────────────────────────────────────────────────────

const RISK_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
};
const fmtGBP = n => "£"+Math.round(n).toLocaleString("en-GB");

export function TribunalExposurePanel({ cs, cases, saveCases, currentRisk, yearsService }) {
  const exposure = estimateExposure({
    weeklyPay: cs.estimatedWeeklyPay,
    ageAtDismissal: cs.estimatedAgeAtDismissal,
    yearsService,
    caseType: cs.caseType,
  });
  const patch = fields => saveCases(cases.map(x => x.id===cs.id ? {...x, ...fields} : x));

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:8}}>
        <div style={{...TYPE.metadata,color:COLOR.inkQuiet,maxWidth:560,lineHeight:1.6}}>
          An indicative range for what an unfair dismissal claim could cost, worked out
          from statutory figures. It is a planning aid only — nothing in Compass acts on it,
          and it is not legal advice.
        </div>
        {currentRisk&&RISK_STYLE[currentRisk]&&(
          <span style={{fontSize:11,fontWeight:700,color:RISK_STYLE[currentRisk].color,background:RISK_STYLE[currentRisk].bg,borderRadius:4,padding:"3px 9px",whiteSpace:"nowrap"}}>{currentRisk} RISK</span>
        )}
      </div>

      <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <label htmlFor="exposure-weekly-pay" style={{fontSize:11,color:"#8A8EA3",display:"block",marginBottom:4}}>Weekly pay (£, gross)</label>
          <input id="exposure-weekly-pay" type="number" min="0" value={cs.estimatedWeeklyPay||""} placeholder="For exposure estimate"
            onChange={e=>patch({estimatedWeeklyPay: e.target.value?Number(e.target.value):null})}
            style={{width:150,fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 10px",color:"#0F1224"}}/>
        </div>
        <div>
          <label htmlFor="exposure-age-at-dismissal" style={{fontSize:11,color:"#8A8EA3",display:"block",marginBottom:4}}>Age at dismissal (optional)</label>
          {/* Wave B.2 — this input was 110px wide with a placeholder naming the
              22-40 band, which the browser clipped mid-phrase. A reader could
              reasonably take the clipped text as Compass asserting an age.
              Widened so the placeholder is readable in full, and the band is spelled
              out underneath rather than hidden in a truncated hint. */}
          <input id="exposure-age-at-dismissal" type="number" min="16" max="80" value={cs.estimatedAgeAtDismissal||""} placeholder="Leave blank if unknown"
            onChange={e=>patch({estimatedAgeAtDismissal: e.target.value?Number(e.target.value):null})}
            style={{width:190,fontSize:13,border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 10px",color:"#0F1224"}}/>
          <div style={{fontSize:11,color:"#8A8EA3",marginTop:4}}>
            Age changes the basic-award multiplier per year of service.
          </div>
        </div>
      </div>

      {exposure&&(
        <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F0F1F7"}}>
          <div style={{fontSize:13,color:"#0F1224"}}>Indicative exposure: <strong>{fmtGBP(exposure.totalLow)} – {fmtGBP(exposure.totalHigh)}</strong>{exposure.compensatoryUncapped&&<span style={{color:"#C84B2F"}}> (compensatory award uncapped)</span>}</div>
          <div style={{fontSize:11,color:"#8A8EA3",marginTop:4}}>Basic award {fmtGBP(exposure.basicAward)} + compensatory range {fmtGBP(exposure.compensatoryLow)}–{fmtGBP(exposure.compensatoryHigh)}. Indicative only — not legal advice, statutory caps change annually.</div>
          {/* Wave B.2 — when no age was given the calculation uses the mid-point of
              the 22-40 statutory band. That is an ASSUMPTION OF THIS CALCULATION, not
              a fact about the employee, and it is now labelled as one. The underlying
              semantics are untouched: the same band, the same multiplier, the same
              figure as before. Nothing is stored, so nothing assumed is ever
              disclosed as an employee fact in a DSAR. */}
          {exposure.ageAssumed&&(
            <div style={{fontSize:11,color:"#B87520",marginTop:4,fontWeight:600}}>
              No age recorded, so this figure assumes the 22–40 statutory band. Compass is not
              claiming the employee&apos;s age — enter it for an accurate estimate.
            </div>
          )}
          {exposure.capsStale&&<div style={{fontSize:11,color:"#C84B2F",marginTop:4,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><WarningIcon size={12} color="#C84B2F" style={{flexShrink:0}}/>These statutory caps haven&apos;t been re-verified against gov.uk in over a year — they may be out of date. Check gov.uk/employment-tribunal-compensation-limits before relying on this figure.</div>}
        </div>
      )}
    </div>
  );
}
