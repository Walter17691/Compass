import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { authedFetch } from '../lib/authedFetch';
import { buildExecutiveBriefInputs, buildExecutiveBriefPrompt } from '../lib/execBrief';
import { COLOR, TYPE, RADIUS } from '../styles/tokens';

const fmtGeneratedAt = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

// Design System Convergence pass, Phase 7 — buildExecutiveBriefPrompt
// (lib/execBrief.js) explicitly asks the model for "3-4 paragraphs"
// followed by a "-"-prefixed bulleted "Recommended areas for leadership
// attention" list; the narrative already carries that structure, it was
// just rendered as one undifferentiated block of prose. This finds the
// real split point (the first "- " bullet line) and gives the
// recommendations their own labelled section — same generated text,
// same words, nothing paraphrased or added. If a narrative doesn't
// follow the requested shape (older briefs generated before this
// pass, or the model not complying), splitPoint stays -1 and the whole
// thing renders exactly as before — never a broken or partial display.
function splitBriefNarrative(narrative) {
  const lines = narrative.split("\n");
  const splitIndex = lines.findIndex(l => l.trim().startsWith("- "));
  if (splitIndex <= 0) return { summary: narrative, recommendations: [] };
  const recommendations = lines.slice(splitIndex).filter(l => l.trim().startsWith("- ")).map(l => l.trim().slice(2).trim());
  const summary = lines.slice(0, splitIndex).join("\n").trim();
  return recommendations.length ? { summary, recommendations } : { summary: narrative, recommendations: [] };
}

function SupportingData({ data }) {
  return (
    <div style={{background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"10px 12px",marginTop:10}}>
      <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Supporting data</div>
      <div style={{fontSize:12,color:COLOR.inkSoft,lineHeight:1.7}}>
        {data.totalCases} total cases · {data.openCases} open · {data.openedInPeriod} opened / {data.closedInPeriod} closed this period
        {data.avgCaseDurationDays != null && <> · {data.avgCaseDurationDays}d avg duration</>}
        {(data.significantTypeTrends?.length > 0 || data.significantThemeTrends?.length > 0) && (
          <div style={{marginTop:4}}>
            Trends included: {[...(data.significantTypeTrends||[]).map(t=>t.caseType), ...(data.significantThemeTrends||[]).map(t=>t.themeName)].join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// Organisational ER Intelligence (Phase 6, OP18, §15) — ER Executive
// Brief. A new, additive capability alongside ErReportScreen's own
// existing "Generate AI summary" button (left completely unchanged —
// see execBrief.js's own header for why this wasn't a rewrite of that
// already-working, already-tested screen). Fetches org_insights_overview()
// (OP2/OP4) and org_trend_detection() (OP7) for real, RPC-backed,
// correct-at-scale data, reuses ErReportScreen's own proven
// anti-attribution prompt wording verbatim, and persists every
// generated brief to er_executive_briefs so a real history builds up —
// same shape as managerCapabilityInsights' own learning-loop pattern.
// "Supporting data" is a deterministic listing of exactly what was fed
// into the prompt, not an AI-guessed per-sentence link.
export function ExecutiveBriefPanel({ org, user, memberName, isHR }) {
  const [briefs, setBriefs] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  // Phase 6.5 hardening (Batch 8) — a failed load silently left briefs
  // at its initial [], which the empty state below couldn't distinguish
  // from "genuinely no briefs generated yet" — a real load failure
  // (network blip, RLS issue) read to the user as "nothing here."
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!org?.id) return;
      const { data, error: loadErr } = await supabase.from('er_executive_briefs').select('*').eq('org_id', org.id).order('created_at', { ascending: false });
      if (cancelled) return;
      if (loadErr) { console.error("loadExecutiveBriefs", loadErr); setLoadError(true); return; }
      setLoadError(false);
      if (data) setBriefs(data);
    })();
    return () => { cancelled = true; };
  }, [org?.id]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data: overview, error: overviewError } = await supabase.rpc('org_insights_overview', { p_org_id: org.id, p_period_days: 30 });
      if (overviewError) throw overviewError;
      const { data: trendData, error: trendError } = await supabase.rpc('org_trend_detection', { p_org_id: org.id, p_period_days: 90 });
      if (trendError) throw trendError;

      const inputs = buildExecutiveBriefInputs(overview, trendData);
      const prompt = buildExecutiveBriefPrompt(inputs);
      const res = await authedFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1400, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json();
      const narrative = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (!narrative) throw new Error("No narrative returned");

      const { data: saved, error: saveError } = await supabase.from('er_executive_briefs').insert({
        org_id: org.id, generated_by: user?.id || null, generated_by_name: memberName || null,
        narrative, supporting_data: inputs,
      }).select().single();
      if (saveError) throw saveError;
      setBriefs(list => [saved, ...list]);
    } catch (e) {
      console.error("generateExecutiveBrief", e);
      setError("Couldn't generate the brief — " + e.message);
    }
    setGenerating(false);
  };

  return (
    <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"18px 20px",marginBottom:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>ER Executive Brief</div>
        {isHR && (
          <button onClick={generate} disabled={generating} style={{fontSize:13,background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"8px 18px",color:"#fff",fontWeight:600,cursor:generating?"default":"pointer",opacity:generating?0.7:1,fontFamily:"DM Sans,system-ui,sans-serif"}}>
            {generating?"Generating…":"Generate brief"}
          </button>
        )}
      </div>

      {error && <div style={{fontSize:13,color:COLOR.red,marginBottom:12}}>{error}</div>}
      {loadError && <div style={{fontSize:13,color:COLOR.red,marginBottom:12}}>Couldn't load the executive brief history right now.</div>}
      {briefs.length === 0 && !generating && !loadError && <div style={{fontSize:13,color:COLOR.inkFaint}}>No executive brief generated yet.</div>}

      {briefs.map(b => {
        const { summary, recommendations } = splitBriefNarrative(b.narrative);
        return (
          <div key={b.id} style={{marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${COLOR.borderFaint}`}}>
            <div style={{fontSize:11,color:COLOR.inkFaint,marginBottom:8}}>Generated {fmtGeneratedAt(b.created_at)}{b.generated_by_name?" by "+b.generated_by_name:""}</div>
            <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.8,whiteSpace:"pre-wrap",maxWidth:"min(720px, 100%)"}}>{summary}</div>
            {recommendations.length>0 && (
              <div style={{marginTop:14,maxWidth:"min(720px, 100%)"}}>
                <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:8}}>Recommended areas for leadership attention</div>
                <ul style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                  {recommendations.map((r,i) => <li key={i} style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{r}</li>)}
                </ul>
              </div>
            )}
            {b.supporting_data && <SupportingData data={b.supporting_data}/>}
          </div>
        );
      })}
    </div>
  );
}
