import { Card, Badge } from '../../components/Primitives';
import { INTEGRATION_CATALOG } from '../../lib/integrations';
import { summarizeIntegrationHealth } from '../../lib/integrationHealth';

// Integrations & Workflow Automation (Phase 5, IP4, §30) — admin-facing
// aggregate over the same four real OAuth integrations IntegrationsSection
// already lists (Slack/Teams and the stub-only rows aren't OAuth
// connections with a sync/action history to summarise, so they're left
// out here rather than shown with an empty state that means nothing).
const HEALTH_PROVIDERS = ["outlook_mail", "gmail", "google_calendar", "ms365_calendar"];

function formatWhen(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function IntegrationHealthSection({ integrationEvents }) {
  const summary = summarizeIntegrationHealth(integrationEvents);
  const rows = HEALTH_PROVIDERS.map(id => ({
    id,
    label: INTEGRATION_CATALOG.find(c => c.id === id)?.label || id,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorDetail: null,
    recentFailureCount: 0,
    ...(summary[id] || {}),
  }));

  return (
    <Card>
      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Integration health</h3>
      <p style={{fontSize:12,color:"#6B6375",margin:"0 0 16px",lineHeight:1.6}}>Last successful sync and recent failures for every connected integration across your organisation, so a problem is visible here rather than assumed.</p>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {rows.map(row=>{
          const hasActivity = !!(row.lastSuccessAt || row.lastErrorAt);
          const failing = row.recentFailureCount > 0;
          return (
            <div key={row.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:"1px solid #F5F1EA"}}>
              <div style={{minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{row.label}</span>
                  {!hasActivity && <Badge color="#9B9098">No activity yet</Badge>}
                  {hasActivity && failing && <Badge color="#C84B2F">{row.recentFailureCount} recent failure{row.recentFailureCount>1?"s":""}</Badge>}
                  {hasActivity && !failing && <Badge color="#1A7A4A">Healthy</Badge>}
                </div>
                <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>
                  {row.lastSuccessAt ? `Last success: ${formatWhen(row.lastSuccessAt)}` : "No successful action recorded yet"}
                  {failing && ` · Last error: ${formatWhen(row.lastErrorAt)}${row.lastErrorDetail ? " — " + row.lastErrorDetail : ""}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
