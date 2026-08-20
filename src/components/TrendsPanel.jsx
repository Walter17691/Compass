import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isSignificantTrend, describeTrend } from '../lib/trendDetection';

const TrendCard = ({ text }) => (
  <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
    <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Trend identified</div>
    <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6}}>{text}</div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP7, §2) — trend detection.
// Fetches org_trend_detection() (OP7's own RPC, extending OP2's
// foundation) and surfaces only SIGNIFICANT trends (isSignificantTrend's
// MIN_SAMPLE_SIZE + threshold guard) — a raw list of every case type's
// count, most of them flat, would bury the pattern worth flagging.
// Rendered above ThemeTaxonomyManager in the same "Trends & Themes" tab.
export function TrendsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

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

  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Trends (last 90 days vs previous 90 days)</div>
      {!hasAny && <div style={{fontSize:13,color:"#6B6375",marginBottom:16}}>No significant trends identified in the current period.</div>}
      {typeTrends.map(t => <TrendCard key={"type-"+t.caseType} text={describeTrend(t, t.caseType)}/>)}
      {themeTrends.map(t => <TrendCard key={"theme-"+t.themeId} text={describeTrend(t, t.themeName)}/>)}
    </div>
  );
}
