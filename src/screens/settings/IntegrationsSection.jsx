import { Card, Btn, Badge } from '../../components/Primitives';
import { computeIntegrationStatuses, integrationStatusLabel, INTEGRATION_STATUS } from '../../lib/integrations';
import { summarizeIntegrationHealth } from '../../lib/integrationHealth';

const STATUS_COLOR = {
  [INTEGRATION_STATUS.CONNECTED]: "#1A7A4A",
  [INTEGRATION_STATUS.CONNECTION_ERROR]: "#C84B2F",
  [INTEGRATION_STATUS.REQUIRES_ADMIN]: "#B87520",
  [INTEGRATION_STATUS.NOT_CONNECTED]: "#9B9098",
};

// Client IA cleanup, §5 — the plain-English "what Compass actually does
// with this" line the row is organised around, alongside status/action.
// Written from each integration's real, already-shipped behaviour (the
// same behaviour each connect handler below already performs), not
// aspirational copy.
const USE_DESCRIPTION = {
  outlook_mail: "Save relevant emails to Compass",
  gmail: "Save relevant emails to Compass",
  google_calendar: "Sync case deadlines to your calendar",
  ms365_calendar: "Sync case deadlines to your calendar",
  slack: "Daily digest of overdue actions",
  teams: "Daily digest of overdue actions",
};

// Client IA cleanup, §3 — Integration health folded in here rather than
// staying a separate destination: it was four rows that map 1:1 onto the
// four OAuth integrations already listed below, with no functionality of
// its own beyond a status badge. Same summarizeIntegrationHealth data,
// shown contextually against each connected integration instead. Only
// meaningful once something is actually connected (Slack/Teams and the
// roadmap stubs never had a sync/action history to summarise, matching
// the original section's own scope).
//
// Permission note: "Integration health" was isHR-gated as its own
// section before this merge, while "Integrations" itself has never been
// isHR-gated (any org member can connect their own mailbox — see
// SaveEmailScreen's own Outlook button). Folding the health data into an
// otherwise-ungated screen would silently hand every org member
// information that used to require isHR, so the badge itself stays
// behind an explicit isHR check at its render site below rather than
// inheriting the host section's own (deliberately broader) visibility.
const HEALTH_TRACKED = new Set(["outlook_mail", "gmail", "google_calendar", "ms365_calendar"]);

function HealthBadge({ id, health }) {
  if (!HEALTH_TRACKED.has(id) || !health) return null;
  const hasActivity = !!(health.lastSuccessAt || health.lastErrorAt);
  if (!hasActivity) return null;
  return health.recentFailureCount > 0
    ? <Badge color="#C84B2F">{health.recentFailureCount} recent failure{health.recentFailureCount > 1 ? "s" : ""}</Badge>
    : <Badge color="#1A7A4A">Healthy</Badge>;
}

// Integrations & Workflow Automation (Phase 5, IP1, §1) — Integration
// Centre. Every row reads off computeIntegrationStatuses (src/lib/
// integrations.js) rather than being hand-written per integration, so
// later phases (IP2/IP3 giving Gmail/MS365 Calendar a real backend, IP4's
// health dashboard) extend the same shape instead of a parallel one.
// Outlook and Google Calendar reuse App.jsx's own existing connect/
// disconnect handlers (connectOutlookMail etc.) — this is the new
// canonical home for their status, not a second implementation of the
// OAuth flow already wired into SaveEmailScreen/HomeScreen.
export function IntegrationsSection({ isHR, mailConnected, mailboxEmail, onConnectMail, onDisconnectMail, gmailConnected, gmailboxEmail, connectGmail, disconnectGmail, calendarConnected, connectGoogleCalendar, disconnectGoogleCalendar, ms365CalendarConnected, connectMs365Calendar, disconnectMs365Calendar, orgWebhookUrl, orgWebhookType, integrationEvents, onManageNotifications }) {
  const allRows = computeIntegrationStatuses({ mailConnected, mailboxEmail, gmailConnected, gmailboxEmail, calendarConnected, ms365CalendarConnected, orgWebhookUrl, orgWebhookType });
  // Client IA cleanup, §4 — unsupported/roadmap entries (HRIS,
  // Occupational Health, e-signature, document storage) no longer sit in
  // the primary list badged "Requires administrator", which implied an
  // admin could actually connect them today. They can't — nothing behind
  // that badge exists yet. Split into a visually subordinate "Coming
  // soon" list below instead, labelled honestly, with no status badge or
  // action that would suggest otherwise.
  const rows = allRows.filter(r => !r.notYetAvailable);
  const comingSoon = allRows.filter(r => r.notYetAvailable);
  const health = summarizeIntegrationHealth(integrationEvents);

  const actionFor = (row) => {
    if (row.id === "outlook_mail") {
      return row.status === INTEGRATION_STATUS.CONNECTED
        ? <Btn variant="ghost" onClick={onDisconnectMail}>Disconnect</Btn>
        : <Btn variant="secondary" onClick={onConnectMail}>Connect</Btn>;
    }
    if (row.id === "gmail") {
      return row.status === INTEGRATION_STATUS.CONNECTED
        ? <Btn variant="ghost" onClick={disconnectGmail}>Disconnect</Btn>
        : <Btn variant="secondary" onClick={connectGmail}>Connect</Btn>;
    }
    if (row.id === "google_calendar") {
      return row.status === INTEGRATION_STATUS.CONNECTED
        ? <Btn variant="ghost" onClick={disconnectGoogleCalendar}>Disconnect</Btn>
        : <Btn variant="secondary" onClick={connectGoogleCalendar}>Connect</Btn>;
    }
    if (row.id === "ms365_calendar") {
      return row.status === INTEGRATION_STATUS.CONNECTED
        ? <Btn variant="ghost" onClick={disconnectMs365Calendar}>Disconnect</Btn>
        : <Btn variant="secondary" onClick={connectMs365Calendar}>Connect</Btn>;
    }
    if (row.id === "slack" || row.id === "teams") {
      return <Btn variant="ghost" onClick={onManageNotifications}>{row.status === INTEGRATION_STATUS.CONNECTED ? "Manage" : "Set up"}</Btn>;
    }
    return null;
  };

  return (
    <Card>
      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Integrations</h3>
      <p style={{fontSize:12,color:"#6B6375",margin:"0 0 16px",lineHeight:1.6}}>Connect the systems your organisation already uses so Compass can coordinate with them directly, instead of information moving back and forth by hand.</p>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {rows.map(row=>(
          <div key={row.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:"1px solid #F5F1EA"}}>
            <div style={{minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{row.label}</span>
                <Badge color={STATUS_COLOR[row.status]}>{integrationStatusLabel(row.status)}</Badge>
                {isHR&&<HealthBadge id={row.id} health={health[row.id]}/>}
              </div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>
                {USE_DESCRIPTION[row.id]}{row.detail ? " · " + row.detail : ""}
              </div>
            </div>
            <div style={{flexShrink:0}}>{actionFor(row)}</div>
          </div>
        ))}
      </div>

      {comingSoon.length>0&&(
        <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #F5F1EA"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Coming soon</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {comingSoon.map(row=>(
              <div key={row.id} style={{padding:"6px 0"}}>
                <span style={{fontSize:12.5,color:"#6B6375"}}>{row.label}</span>
                <span style={{fontSize:11,color:"#9B9098"}}> — {row.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
