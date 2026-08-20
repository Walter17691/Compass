import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { authedFetch } from '../lib/authedFetch';
import { buildExecutiveBriefInputs } from '../lib/execBrief';
import { PERIOD_TYPES, periodTypeLabel, buildPeriodicReviewPrompt } from '../lib/periodicReview';

const fmtGeneratedAt = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

// Organisational ER Intelligence (Phase 6, OP19, §16) — Weekly/Monthly/
// Quarterly ER Review, look-back-able history. Reuses OP18's own
// er_executive_briefs table (period_type distinguishes a periodic
// review from an ad-hoc brief — see the migration's own header for why
// this isn't a second table) and the same real, RPC-backed data
// (org_insights_overview/org_trend_detection), windowed to the
// selected period's own days rather than a fixed 30/90-day default —
// a "Weekly" review genuinely reflects the last 7 days, not a stale
// 30-day snapshot with a misleading label. Also pulls
// org_case_stats()'s high_priority_active for real case-movement
// context §16 asks for, that org_insights_overview doesn't carry.
export function PeriodicReviewPanel({ org, user, memberName, isHR }) {
  const [periodType, setPeriodType] = useState(PERIOD_TYPES[0].id);
  const [reviews, setReviews] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!org?.id) return;
      const { data, error: loadError } = await supabase.from('er_executive_briefs').select('*').eq('org_id', org.id).not('period_type', 'is', null).order('created_at', { ascending: false });
      if (cancelled) return;
      if (loadError) { console.error("loadPeriodicReviews", loadError); return; }
      if (data) setReviews(data);
    })();
    return () => { cancelled = true; };
  }, [org?.id]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const period = PERIOD_TYPES.find(p => p.id === periodType);
      const { data: overview, error: overviewError } = await supabase.rpc('org_insights_overview', { p_period_days: period.days });
      if (overviewError) throw overviewError;
      const { data: trendData, error: trendError } = await supabase.rpc('org_trend_detection', { p_period_days: period.days });
      if (trendError) throw trendError;
      const { data: caseStats } = await supabase.rpc('org_case_stats');

      const inputs = buildExecutiveBriefInputs(overview, trendData);
      const prompt = buildPeriodicReviewPrompt(inputs, periodType, caseStats?.high_priority_active ?? null);
      const res = await authedFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1400, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json();
      const narrative = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (!narrative) throw new Error("No narrative returned");

      const { data: saved, error: saveError } = await supabase.from('er_executive_briefs').insert({
        org_id: org.id, generated_by: user?.id || null, generated_by_name: memberName || null,
        narrative, supporting_data: inputs, period_type: periodType,
      }).select().single();
      if (saveError) throw saveError;
      setReviews(list => [saved, ...list]);
    } catch (e) {
      console.error("generatePeriodicReview", e);
      setError("Couldn't generate the review — " + e.message);
    }
    setGenerating(false);
  };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px",marginBottom:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Periodic ER review</div>
        {isHR && (
          <div style={{display:"flex",gap:8}}>
            <select value={periodType} onChange={e=>setPeriodType(e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif"}}>
              {PERIOD_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button onClick={generate} disabled={generating} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:9,padding:"8px 18px",color:"#fff",fontWeight:600,cursor:generating?"default":"pointer",opacity:generating?0.7:1,fontFamily:"DM Sans,system-ui,sans-serif"}}>
              {generating?"Generating…":"Generate review"}
            </button>
          </div>
        )}
      </div>

      {error && <div style={{fontSize:13,color:"#C84B2F",marginBottom:12}}>{error}</div>}
      {reviews.length === 0 && !generating && <div style={{fontSize:13,color:"#6B6375"}}>No periodic review generated yet.</div>}

      {reviews.map(r => (
        <div key={r.id} style={{marginBottom:16,paddingBottom:16,borderBottom:"1px solid #F5F1EA"}}>
          <div style={{fontSize:11,color:"#9B9098",marginBottom:8}}>{periodTypeLabel(r.period_type)} · generated {fmtGeneratedAt(r.created_at)}{r.generated_by_name?" by "+r.generated_by_name:""}</div>
          <div style={{fontSize:13,color:"#1C1820",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{r.narrative}</div>
        </div>
      ))}
    </div>
  );
}
