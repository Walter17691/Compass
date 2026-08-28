import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isSignificantTrend, computePctChange } from '../lib/trendDetection';
import { describeEarlySignal, buildSuggestedReview, EARLY_SIGNAL_WINDOW_DAYS } from '../lib/earlySignals';
import { InsightEvidenceModal } from './InsightEvidenceModal';
import { CreateActionButton } from './CreateActionButton';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';

// Phase 2C — restrained, non-alarmist: amber is the one real semantic
// signal here (a genuine "worth watching" state, not urgent/high-risk),
// so it stays on the eyebrow label only, not as a card background or
// border. No fabricated "Watching"/"Limited evidence" confidence tiers
// were added — isSignificantTrend is a single significant/not-significant
// gate with no underlying confidence score to grade further.
const EarlySignalCard = ({ entry, onShowEvidence, createCaseTask, improvementInitiatives }) => (
  <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:SPACE.sm}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
      <div style={{...TYPE.sectionHeading,color:COLOR.amber}}>Emerging theme</div>
      <button onClick={onShowEvidence} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>Show evidence</button>
    </div>
    <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6,marginBottom:6}}>{describeEarlySignal(entry)}</div>
    <div style={{fontSize:12,color:COLOR.inkSoft}}>{buildSuggestedReview(entry.themeName)}</div>
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
export function EarlySignalsPanel({ orgId, createCaseTask, improvementInitiatives } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_trend_detection', { p_org_id: orgId, p_period_days: EARLY_SIGNAL_WINDOW_DAYS });
      if (cancelled) return;
      if (rpcError) { console.error("org_trend_detection", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (error) return <div style={{fontSize:13,color:COLOR.inkFaint}}>Couldn't load early signal data right now.</div>;
  if (!data) return <div style={{fontSize:13,color:COLOR.inkFaint}}>Loading early signals…</div>;

  const signals = (data.by_theme_trend || []).filter(isSignificantTrend);

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>What may be emerging? (last 6 weeks vs previous 6 weeks)</div>
      {signals.length === 0
        ? <div style={{fontSize:13,color:COLOR.inkFaint}}>No emerging themes identified in the current 6-week window.</div>
        : signals.map(s => <EarlySignalCard key={s.themeId} entry={s} onShowEvidence={()=>setEvidenceFor(s)} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>)}
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
