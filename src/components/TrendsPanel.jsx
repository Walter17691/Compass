import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isSignificantTrend, describeTrend, computePctChange } from '../lib/trendDetection';
import { RootCauseExplorationPanel } from './RootCauseExplorationPanel';
import { InsightEvidenceModal } from './InsightEvidenceModal';

const TrendCard = ({ text, onExplore, onShowEvidence }) => (
  <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.4px",textTransform:"uppercase"}}>Trend identified</div>
      <div style={{display:"flex",gap:6,flexShrink:0}}>
        <button onClick={onShowEvidence} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"3px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Show evidence</button>
        {onExplore && <button onClick={onExplore} style={{fontSize:11,background:"none",border:"1px solid #E0D8FF",borderRadius:6,padding:"3px 10px",color:"#7C5CFC",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Explore</button>}
      </div>
    </div>
    <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6}}>{text}</div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP7/OP8/OP17, §2/§4/§23) —
// trend detection plus, for theme trends specifically, a root-cause
// exploration drill-in and (OP17) a "Show evidence" drill-in for both
// trend kinds. Fetches org_trend_detection() (OP7's RPC, extending
// OP2's foundation) and surfaces only SIGNIFICANT trends
// (isSignificantTrend's MIN_SAMPLE_SIZE + threshold guard) — a raw list
// of every case type's count, most of them flat, would bury the pattern
// worth flagging. "Explore" only appears on theme trend cards, not case
// type ones — §4's root-cause concept (co-occurring themes) has no
// coherent case-type equivalent (org_theme_root_cause_2026-08-20.sql's
// own header explains why). Rendered above ThemeTaxonomyManager in the
// same "Trends & Themes" tab.
export function TrendsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [exploringThemeId, setExploringThemeId] = useState(null);
  const [evidenceFor, setEvidenceFor] = useState(null); // { label, entry } | null

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_trend_detection', { p_period_days: 90 });
      if (cancelled) return;
      if (rpcError) { console.error("org_trend_detection", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>Couldn't load trend data right now.</div>;
  if (!data) return <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>Loading trends…</div>;

  const typeTrends = (data.by_type_trend || []).filter(isSignificantTrend);
  const themeTrends = (data.by_theme_trend || []).filter(isSignificantTrend);
  const hasAny = typeTrends.length > 0 || themeTrends.length > 0;
  const exploringTheme = themeTrends.find(t => t.themeId === exploringThemeId);

  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Trends (last 90 days vs previous 90 days)</div>
      {!hasAny && <div style={{fontSize:13,color:"#6B6375",marginBottom:16}}>No significant trends identified in the current period.</div>}
      {typeTrends.map(t => (
        <TrendCard key={"type-"+t.caseType} text={describeTrend(t, t.caseType)} onShowEvidence={()=>setEvidenceFor({ label: t.caseType, entry: t })}/>
      ))}
      {themeTrends.map(t => (
        <TrendCard key={"theme-"+t.themeId} text={describeTrend(t, t.themeName)} onExplore={()=>setExploringThemeId(t.themeId)} onShowEvidence={()=>setEvidenceFor({ label: t.themeName, entry: t })}/>
      ))}
      {exploringTheme && (
        // key={themeId} forces a full remount when the explored theme
        // changes, so RootCauseExplorationPanel's own effect never needs
        // to reset stale state from the previous theme synchronously —
        // it always starts fresh from its own initial null/false state.
        <RootCauseExplorationPanel key={exploringTheme.themeId} themeId={exploringTheme.themeId} themeName={exploringTheme.themeName} onClose={()=>setExploringThemeId(null)}/>
      )}
      {evidenceFor && (
        <InsightEvidenceModal
          title={evidenceFor.label}
          metrics={[
            { label: "Current period count", value: evidenceFor.entry.currentCount },
            { label: "Previous period count", value: evidenceFor.entry.previousCount },
          ]}
          period="last 90 days"
          comparisonPeriod="previous 90 days"
          confidenceNote={computePctChange(evidenceFor.entry.currentCount, evidenceFor.entry.previousCount) === null ? "This theme/type had no cases in the comparison period — treat the pattern as newly emerging, not a measured percentage change." : undefined}
          onClose={()=>setEvidenceFor(null)}
        />
      )}
    </div>
  );
}
