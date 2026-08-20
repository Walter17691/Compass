import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { buildRootCauseSummary, buildReviewAreas } from '../lib/rootCauseExploration';
import { CreateActionButton } from './CreateActionButton';

// Organisational ER Intelligence (Phase 6, OP8, §4) — root-cause
// exploration for one theme, opened from TrendsPanel's "Explore" button
// on a theme trend card. Fetches org_theme_root_cause() (OP8's RPC) for
// the specific themeId. Language throughout stays in "areas to
// investigate" framing (rootCauseExploration.js's own doc comment) —
// never a proven cause.
export function RootCauseExplorationPanel({ themeId, themeName, createCaseTask, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_theme_root_cause', { p_theme_id: themeId, p_period_days: 90 });
      if (cancelled) return;
      if (rpcError) { console.error("org_theme_root_cause", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, [themeId]);

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E0D8FF",borderRadius:10,padding:"16px 18px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.4px",textTransform:"uppercase"}}>Root-cause exploration — {themeName}</div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontSize:14,fontFamily:"DM Sans,system-ui,sans-serif"}}>×</button>
      </div>

      {error && <div style={{fontSize:13,color:"#6B6375"}}>Couldn't load root-cause data right now.</div>}
      {!error && !data && <div style={{fontSize:13,color:"#6B6375"}}>Loading…</div>}
      {data && (
        <>
          <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6,marginBottom:12}}>{buildRootCauseSummary(themeName, data)}</div>
          {(data.co_occurring_themes || []).length === 0 ? (
            <div style={{fontSize:12,color:"#9B9098"}}>No commonly co-occurring themes found for this period.</div>
          ) : (
            <>
              <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Potential areas for review</div>
              {buildReviewAreas(data.co_occurring_themes).map(area => (
                <div key={area.themeId} style={{fontSize:13,color:"#1A1535",padding:"6px 0",borderBottom:"1px solid #F5F1EA"}}>{area.suggestion}</div>
              ))}
            </>
          )}
          {createCaseTask && <CreateActionButton insightRef={`Root-cause exploration: ${themeName}`} createCaseTask={createCaseTask}/>}
        </>
      )}
    </div>
  );
}
