import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isSignificantTrend, computePctChange } from '../lib/trendDetection';
import { describeEarlySignal, buildSuggestedReview, EARLY_SIGNAL_WINDOW_DAYS } from '../lib/earlySignals';
import { InsightEvidenceModal } from './InsightEvidenceModal';
import { CreateActionButton } from './CreateActionButton';

const SignalCard = ({ entry, onShowEvidence, createCaseTask, improvementInitiatives }) => (
  <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
      <div style={{fontSize:11,fontWeight:700,color:"#B87520",letterSpacing:"0.4px",textTransform:"uppercase"}}>Emerging theme</div>
      <button onClick={onShowEvidence} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"3px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",flexShrink:0}}>Show evidence</button>
    </div>
    <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6,marginBottom:6}}>{describeEarlySignal(entry)}</div>
    <div style={{fontSize:12,color:"#6B6375"}}>{buildSuggestedReview(entry.themeName)}</div>
    {createCaseTask && <CreateActionButton insightRef={`Early signal: ${entry.themeName} theme (last 6 weeks)`} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>}
  </div>
);

// Organisational ER Intelligence (Phase 6, OP9/OP17, §12/§23) — Early
// Signals. Reuses org_trend_detection() (OP7's RPC) with
// EARLY_SIGNAL_WINDOW_DAYS (6 weeks) instead of the Trends tab's 90-day
// quarter window — same current-vs-previous-window mechanic,
// deliberately theme-only (an organisational-theme lens, not
// individual-employee risk scoring — see this phase's own cross-cutting
// constraint). Its own Insights tab, separate from Trends & Themes,
// since a 6-week emerging-theme signal answers a different question
// ("what's just starting to show up") than a 90-day trend ("what's
// meaningfully shifted this quarter"). "Show evidence" (OP17) opens
// InsightEvidenceModal with the real underlying counts and window.
export function EarlySignalsPanel({ createCaseTask, improvementInitiatives } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_trend_detection', { p_period_days: EARLY_SIGNAL_WINDOW_DAYS });
      if (cancelled) return;
      if (rpcError) { console.error("org_trend_detection", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div style={{fontSize:13,color:"#6B6375"}}>Couldn't load early signal data right now.</div>;
  if (!data) return <div style={{fontSize:13,color:"#6B6375"}}>Loading early signals…</div>;

  const signals = (data.by_theme_trend || []).filter(isSignificantTrend);

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Early signals (last 6 weeks vs previous 6 weeks)</div>
      {signals.length === 0
        ? <div style={{fontSize:13,color:"#6B6375"}}>No emerging themes identified in the current 6-week window.</div>
        : signals.map(s => <SignalCard key={s.themeId} entry={s} onShowEvidence={()=>setEvidenceFor(s)} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>)}
      {evidenceFor && (
        <InsightEvidenceModal
          title={evidenceFor.themeName}
          metrics={[
            { label: "Current 6-week count", value: evidenceFor.currentCount },
            { label: "Previous 6-week count", value: evidenceFor.previousCount },
          ]}
          period="last 6 weeks"
          comparisonPeriod="previous 6 weeks"
          confidenceNote={computePctChange(evidenceFor.currentCount, evidenceFor.previousCount) === null ? "This theme had no cases in the comparison window — treat this as a newly emerging pattern, not a measured percentage change." : undefined}
          onClose={()=>setEvidenceFor(null)}
        />
      )}
    </div>
  );
}
