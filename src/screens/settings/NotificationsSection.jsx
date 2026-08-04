import { useState } from 'react';
import { Btn, Card } from '../../components/Primitives';

export function NotificationsSection({ dueSoon, requestNotifications, notifGranted, emailDigestOptIn, toggleEmailDigest, orgWebhookUrl, orgWebhookType, saveOrgWebhook, sendTestWebhook }) {
  const [webhookUrlDraft, setWebhookUrlDraft] = useState(orgWebhookUrl||"");
  return (
    <>
      <Card style={{marginBottom:12}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Deadline reminders</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Get browser notifications for upcoming and overdue deadlines.</p>
        {dueSoon.length>0?(
          <div style={{marginBottom:14}}>
            {dueSoon.slice(0,5).map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                <div>
                  <span style={{color:d.overdue?"#E8622A":"#1C1820"}}>{d.employeeName}</span>
                  <span style={{color:"#6B6880",marginLeft:8}}>{d.label}</span>
                </div>
                <span style={{color:d.overdue?"#E8622A":"#888",fontFamily:"JetBrains Mono,monospace"}}>{d.overdue?`${d.daysOverdue}d overdue`:`${d.daysLeft}d`}</span>
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
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Post the same overdue/near-term deadlines from the daily digest into a Slack or Teams channel via an incoming webhook.</p>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <select value={orgWebhookType} onChange={e=>saveOrgWebhook(webhookUrlDraft, e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",background:"#fff",color:"#1A1535"}}>
            <option value="slack">Slack</option>
            <option value="teams">Microsoft Teams</option>
          </select>
          <input value={webhookUrlDraft} onChange={e=>setWebhookUrlDraft(e.target.value)} onBlur={()=>saveOrgWebhook(webhookUrlDraft, orgWebhookType)} placeholder="https://hooks.slack.com/services/..." style={{flex:1,minWidth:240,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",color:"#1A1535"}}/>
        </div>
        <Btn variant="secondary" onClick={sendTestWebhook} disabled={!webhookUrlDraft}>Send test message</Btn>
      </Card>
    </>
  );
}
