import { useState } from 'react';
import { Btn, Card } from '../../components/Primitives';

export function NotificationsSection({ dueSoon, caseTasks, createCaseTask, requestNotifications, notifGranted, emailDigestOptIn, toggleEmailDigest, orgWebhookUrl, orgWebhookType, saveOrgWebhook, sendTestWebhook }) {
  const [webhookUrlDraft, setWebhookUrlDraft] = useState(orgWebhookUrl||"");
  // Only deadlines tied to a real case can become a case_task — DSAR,
  // wellbeing, leaver and redundancy deadlines aren't case-scoped. Hidden
  // once a matching open task already exists *on the same case*, so
  // accepting one doesn't leave a "Create task" button sitting there to
  // click again — scoped by caseId+name together, not name alone, since
  // several deadline labels (e.g. "Disciplinary outcome letter due (ACAS:
  // 5 working days)") are identical text across every case that has one.
  const openTaskKeys = new Set((caseTasks||[]).filter(t=>t.status!=="done").map(t=>t.caseId+"::"+t.name));
  return (
    <>
      <Card style={{marginBottom:12}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Deadline reminders</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Get browser notifications for upcoming and overdue deadlines.</p>
        {dueSoon.length>0?(
          <div style={{marginBottom:14,maxHeight:320,overflowY:"auto"}}>
            {/* Was hard-capped at the first 5 — with wellbeing/leaver/
                redundancy deadlines now threaded in too (Phase 12), an org
                with more than a handful of live deadlines was silently
                losing the rest with no way to see further down the list.
                A scrollable list keeps every item reachable without the
                page itself growing unbounded. */}
            {dueSoon.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12,gap:8}}>
                <div style={{minWidth:0}}>
                  <span style={{color:d.overdue?"#E8622A":"#1C1820"}}>{d.employeeName}</span>
                  <span style={{color:"#6B6880",marginLeft:8}}>{d.label}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <span style={{color:d.overdue?"#E8622A":"#888",fontFamily:"JetBrains Mono,monospace"}}>{d.overdue?`${d.daysOverdue}d overdue`:`${d.daysLeft}d`}</span>
                  {d.caseId&&createCaseTask&&!openTaskKeys.has(d.caseId+"::"+d.label)&&(
                    <button onClick={()=>createCaseTask(d.caseId, {name:d.label, dueDate:d.deadlineDate, priority:d.overdue?"high":"normal"})}
                      style={{fontSize:10,background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",color:"#7C5CFC",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",whiteSpace:"nowrap"}}>
                      + Create task
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ):<div style={{fontSize:12,color:"#5A5570",marginBottom:14}}>No upcoming deadlines in the next 7 days</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <Btn onClick={requestNotifications} disabled={notifGranted}>{notifGranted?"Notifications enabled":"Enable browser notifications"}</Btn>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#6B6375",cursor:"pointer",marginLeft:4}}>
            <input type="checkbox" checked={!!emailDigestOptIn} onChange={toggleEmailDigest} style={{cursor:"pointer"}}/>
            Email me a daily compliance digest
          </label>
        </div>
      </Card>

      <Card>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Team chat notifications</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Post a count of overdue/near-term deadlines into a Slack or Teams channel via an incoming webhook — never employee names or case details, since anyone in that channel can read it. Those stay in the daily email digest and in Compass itself.</p>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <select aria-label="Webhook type" value={orgWebhookType} onChange={e=>saveOrgWebhook(webhookUrlDraft, e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",background:"#fff",color:"#1A1535"}}>
            <option value="slack">Slack</option>
            <option value="teams">Microsoft Teams</option>
          </select>
          <input aria-label="Webhook URL" value={webhookUrlDraft} onChange={e=>setWebhookUrlDraft(e.target.value)} onBlur={()=>saveOrgWebhook(webhookUrlDraft, orgWebhookType)} placeholder="https://hooks.slack.com/services/..." style={{flex:1,minWidth:240,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",color:"#1A1535"}}/>
        </div>
        <Btn variant="secondary" onClick={sendTestWebhook} disabled={!webhookUrlDraft}>Send test message</Btn>
      </Card>
    </>
  );
}
