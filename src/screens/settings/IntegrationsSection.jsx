import { Card, Btn, Badge } from '../../components/Primitives';
import { computeIntegrationStatuses, integrationStatusLabel, INTEGRATION_STATUS } from '../../lib/integrations';

const STATUS_COLOR = {
  [INTEGRATION_STATUS.CONNECTED]: "#1A7A4A",
  [INTEGRATION_STATUS.CONNECTION_ERROR]: "#C84B2F",
  [INTEGRATION_STATUS.REQUIRES_ADMIN]: "#B87520",
  [INTEGRATION_STATUS.NOT_CONNECTED]: "#9B9098",
};

// Integrations & Workflow Automation (Phase 5, IP1, §1) — Integration
// Centre. Every row reads off computeIntegrationStatuses (src/lib/
// integrations.js) rather than being hand-written per integration, so
// later phases (IP2/IP3 giving Gmail/MS365 Calendar a real backend, IP4's
// health dashboard) extend the same shape instead of a parallel one.
// Outlook and Google Calendar reuse App.jsx's own existing connect/
// disconnect handlers (connectOutlookMail etc.) — this is the new
// canonical home for their status, not a second implementation of the
// OAuth flow already wired into SaveEmailScreen/HomeScreen.
export function IntegrationsSection({ mailConnected, mailboxEmail, onConnectMail, onDisconnectMail, gmailConnected, gmailboxEmail, connectGmail, disconnectGmail, calendarConnected, connectGoogleCalendar, disconnectGoogleCalendar, orgWebhookUrl, orgWebhookType, onManageNotifications }) {
  const rows = computeIntegrationStatuses({ mailConnected, mailboxEmail, gmailConnected, gmailboxEmail, calendarConnected, orgWebhookUrl, orgWebhookType });

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
              </div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>
                {row.notYetAvailable ? "Not yet available — " + row.category.toLowerCase() + " connections are on the roadmap." : (row.detail || row.category)}
              </div>
            </div>
            <div style={{flexShrink:0}}>{actionFor(row)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
