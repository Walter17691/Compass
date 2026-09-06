import { computePendingHrReview, computeFirstPassApprovalRate, HR_REVIEW_MIN_SAMPLE_SIZE } from '../lib/hrReviewIntelligence';
import { DataQualityCaveat } from './DataQualityCaveat';
import { CreateActionButton } from './CreateActionButton';
import { COLOR, TYPE, FONT, SPACE } from '../styles/tokens';

// Insights Phase 5 (Process Quality + HR Review Intelligence) — HR's
// current investigation-review queue and the one deterministic fact its
// history supports: whether a submission was approved as-is or sent back
// for further work. Both read only already-loaded, already-authorised
// hrReviewRequests (see hrReviewIntelligence.js's own header) — no new
// query, no record_snapshot/comments ever surfaced here. Deliberately
// plain text, no KPI cards or percentage gauges — this is operational
// queue state and one process fact, not a scored dashboard.
export function HrReviewIntelligencePanel({ hrReviewRequests, onViewCases, createCaseTask, improvementInitiatives }) {
  const pending = computePendingHrReview(hrReviewRequests);
  const firstPass = computeFirstPassApprovalRate(hrReviewRequests);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:SPACE.lg}}>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>HR review</div>

      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:COLOR.ink,lineHeight:1.5}}>
            {pending.count === 0
              ? "No cases are currently awaiting HR review of their investigation."
              : pending.count === 1
                ? "1 case is awaiting HR review of its investigation."
                : `${pending.count} cases are awaiting HR review of their investigation.`}
          </span>
          {pending.count > 0 && onViewCases && (
            <button type="button" onClick={() => onViewCases({ caseIds: pending.caseIds })} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,flexShrink:0,padding:0,whiteSpace:"nowrap"}}>View cases →</button>
          )}
        </div>
        {pending.count > 0 && pending.oldestPendingDays !== null && (
          <div style={{fontSize:12,color:COLOR.inkFaint,marginTop:4}}>Oldest waiting: {pending.oldestPendingDays}d</div>
        )}
        {pending.count > 0 && createCaseTask && (
          <CreateActionButton
            insightRef={`HR review: ${pending.count} case${pending.count===1?"":"s"} awaiting investigation review`}
            createCaseTask={createCaseTask}
            improvementInitiatives={improvementInitiatives}
          />
        )}
      </div>

      <div>
        <div style={{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Investigation review</div>
        {firstPass.applicable ? (
          <div>
            <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.5}}>{firstPass.rate}% of investigation submissions were approved without being returned for further work.</div>
            <div style={{fontSize:12,color:COLOR.inkFaint,marginTop:4}}>{firstPass.numerator} of {firstPass.denominator} reviewed cases</div>
            {firstPass.reworkCaseIds.length > 0 && onViewCases && (
              <button type="button" onClick={() => onViewCases({ caseIds: firstPass.reworkCaseIds })} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0,marginTop:6}}>View cases returned for further work →</button>
            )}
            {firstPass.reworkCaseIds.length > 0 && createCaseTask && (
              <CreateActionButton
                insightRef="Investigation submissions returned for further work"
                createCaseTask={createCaseTask}
                improvementInitiatives={improvementInitiatives}
              />
            )}
          </div>
        ) : (
          <DataQualityCaveat total={firstPass.denominator} minRequired={HR_REVIEW_MIN_SAMPLE_SIZE} label="completed investigation reviews"/>
        )}
      </div>
    </div>
  );
}
