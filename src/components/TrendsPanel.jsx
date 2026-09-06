import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { isSignificantTrend, describeTrend, computePctChange, computeOverallVolumeTrend, getTrendPeriodBounds, rankSignificantThemeTrends, themeCaseIdsInPeriod, describeVolumeSignal } from '../lib/trendDetection';
import { RootCauseExplorationPanel } from './RootCauseExplorationPanel';
import { InsightEvidenceModal } from './InsightEvidenceModal';
import { CreateActionButton } from './CreateActionButton';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';

// Phase 2C — each real, significant trend genuinely earns its own
// surface (a distinct finding, not decoration), so the card stays —
// just tokenised and with a quieter eyebrow than the old purple
// uppercase label, since every card said the same "Trend identified"
// and didn't need to shout it.
const TrendCard = ({ text, insightRef, onExplore, onShowEvidence, onViewCases, createCaseTask, improvementInitiatives }) => (
  <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:SPACE.sm}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Trend identified</div>
      <div style={{display:"flex",gap:6,flexShrink:0}}>
        <button onClick={onShowEvidence} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans}}>Show evidence</button>
        {onExplore && <button onClick={onExplore} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans}}>Explore</button>}
        {onViewCases && <button onClick={onViewCases} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans}}>View cases →</button>}
      </div>
    </div>
    <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{text}</div>
    {createCaseTask && <CreateActionButton insightRef={insightRef} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>}
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
export function TrendsPanel({ orgId, cases = [], caseThemes = [], onViewCases, createCaseTask, improvementInitiatives } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [exploringThemeId, setExploringThemeId] = useState(null);
  const [evidenceFor, setEvidenceFor] = useState(null); // { label, entry } | null

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_trend_detection', { p_org_id: orgId, p_period_days: 90 });
      if (cancelled) return;
      if (rpcError) { console.error("org_trend_detection", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // Frozen once per mount, same convention as OrganisationalIntelligenceOverview's
  // own trendNow — the drill-down below must use the exact same instant
  // the displayed count was computed from, or the two could disagree at
  // the boundary.
  const [trendNow] = useState(() => new Date());
  const overallVolumeTrend = useMemo(() => computeOverallVolumeTrend(cases, { now: trendNow }), [cases, trendNow]);
  const trendPeriodBounds = useMemo(() => getTrendPeriodBounds(trendNow), [trendNow]);

  if (error) return <div style={{fontSize:13,color:COLOR.inkFaint,marginBottom:20}}>Couldn't load trend data right now.</div>;
  if (!data) return <div style={{fontSize:13,color:COLOR.inkFaint,marginBottom:20}}>Loading trends…</div>;

  const typeTrends = (data.by_type_trend || []).filter(isSignificantTrend);
  // Insights Phase 4 — unlike typeTrends above (unchanged, increase-only,
  // out of this phase's approved scope), theme trends now also surface
  // material declines, ranked by magnitude rather than the RPC's own raw
  // current-count order — see rankSignificantThemeTrends' own header.
  const themeTrends = rankSignificantThemeTrends(data.by_theme_trend || []);
  const hasAny = typeTrends.length > 0 || themeTrends.length > 0;
  const exploringTheme = themeTrends.find(t => t.themeId === exploringThemeId);

  return (
    <div style={{marginBottom:SPACE.xl}}>
      {/* Insights Phase 4 — a restrained editorial headline, not a KPI
          tile (this surface already favours sentences over charts/cards
          for exactly this kind of top-line number). Always shown,
          reusing Phase 3's own wording function unconditionally: the
          significance gate below only decides which INDIVIDUAL trend
          cards earn their own surfaced row, never whether the plain,
          factual current-period count itself is worth stating. */}
      <div style={{fontSize:14,color:COLOR.ink,lineHeight:1.6,marginBottom:SPACE.md}}>{describeVolumeSignal(overallVolumeTrend)}</div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>What is changing? (last 90 days vs previous 90 days)</div>
      {!hasAny && <div style={{fontSize:13,color:COLOR.inkFaint,marginBottom:16}}>No significant trends identified in the current period.</div>}
      {typeTrends.map(t => (
        <TrendCard key={"type-"+t.caseType} text={describeTrend(t, t.caseType)} insightRef={`Trend: ${t.caseType} cases (last 90 days)`} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives} onShowEvidence={()=>setEvidenceFor({ label: t.caseType, entry: t })}/>
      ))}
      {themeTrends.map(t => (
        <TrendCard key={"theme-"+t.themeId} text={describeTrend(t, t.themeName)} insightRef={`Trend: ${t.themeName} theme (last 90 days)`} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives} onExplore={()=>setExploringThemeId(t.themeId)} onShowEvidence={()=>setEvidenceFor({ label: t.themeName, entry: t })}
          onViewCases={onViewCases ? () => onViewCases({
            caseIds: themeCaseIdsInPeriod(cases, caseThemes, t.themeId, trendPeriodBounds),
            createdFrom: trendPeriodBounds.curStart.toISOString(),
            createdTo: trendPeriodBounds.curEnd.toISOString(),
          }) : null}/>
      ))}
      {exploringTheme && (
        // key={themeId} forces a full remount when the explored theme
        // changes, so RootCauseExplorationPanel's own effect never needs
        // to reset stale state from the previous theme synchronously —
        // it always starts fresh from its own initial null/false state.
        <RootCauseExplorationPanel key={exploringTheme.themeId} orgId={orgId} themeId={exploringTheme.themeId} themeName={exploringTheme.themeName} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives} onClose={()=>setExploringThemeId(null)}/>
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
