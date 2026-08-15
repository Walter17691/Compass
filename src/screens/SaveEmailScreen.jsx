import { useState, useEffect } from 'react';

// Phase 24 of the reasoning-layer build-out — Email integration.
// Started as a manual-only "paste an email" flow; now also supports
// connecting the signed-in user's own Outlook inbox (delegated OAuth via
// api/graph-mail/*, same architecture as the Google Calendar connection)
// so a recent email can be picked instead of copy-pasted. Either path feeds
// the exact same extraction — see lib/emailIngestion.js. Nothing is saved
// until the user explicitly picks a case and confirms, even when Compass
// found a confident match or the message came straight from a connected
// inbox.
export function SaveEmailScreen({ cases, extraction, extractionLoading, onExtract, onSave, onClear, mailConnected, mailboxEmail, onConnectMail, onDisconnectMail, inboxMessages, inboxLoading, onLoadInbox, onPickMessage, onCreateConcern }) {
  const [rawText, setRawText] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');

  useEffect(() => {
    if (mailConnected && inboxMessages === null && !inboxLoading) onLoadInbox?.();
  }, [mailConnected, inboxMessages, inboxLoading, onLoadInbox]);

  const matchedCase = extraction?.matchedCaseId ? cases.find(c => c.id === extraction.matchedCaseId) : null;
  // IP9 — only pre-select the dropdown on a "high" (exact name) match;
  // "medium" (substring — e.g. "Sarah" could be the wrong Sarah) is
  // still shown as a suggestion but requires HR to actually pick it, not
  // silently land on a guess that could be the wrong employee.
  const targetCaseId = selectedCaseId || (extraction?.matchConfidence === "high" ? extraction?.matchedCaseId : "") || '';

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{maxWidth:700,margin:"0 auto",padding:"32px 32px"}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:"#9B9098",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Groundwork</div>
          <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:28,fontWeight:400,color:"#1C1820",margin:0}}>Save email to case</h1>
          <p style={{fontSize:13,color:"#9B9098",margin:"6px 0 0"}}>Paste an email below — Compass reads it, suggests which case it belongs to, and files it as evidence once you confirm. Nothing is saved automatically.</p>
        </div>

        {!extraction && !extractionLoading && (
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:20,marginBottom:16}}>
            {!mailConnected ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1C1820"}}>Connect your Outlook inbox</div>
                  <div style={{fontSize:12,color:"#9B9098",marginTop:2}}>Pick a recent email instead of pasting it — nothing is read or saved until you choose one.</div>
                </div>
                <button onClick={onConnectMail} style={{fontSize:12,background:"#F5F1EA",border:"none",borderRadius:8,padding:"7px 14px",color:"#1C1820",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",whiteSpace:"nowrap"}}>Connect Outlook</button>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                  <div style={{fontSize:12,color:"#1A7A4A",fontWeight:600}}>Outlook connected{mailboxEmail?` — ${mailboxEmail}`:""}</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={onLoadInbox} disabled={inboxLoading} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 10px",color:"#6B6375",cursor:inboxLoading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{inboxLoading?"Loading…":"Refresh"}</button>
                    <button onClick={onDisconnectMail} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 10px",color:"#9B9098",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Disconnect</button>
                  </div>
                </div>
                {inboxLoading && !inboxMessages && <div style={{fontSize:12,color:"#9B9098"}}>Loading your recent emails…</div>}
                {inboxMessages && inboxMessages.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No recent emails found.</div>}
                {inboxMessages && inboxMessages.length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:260,overflowY:"auto"}}>
                    {inboxMessages.map(m=>(
                      <button key={m.id} onClick={()=>onPickMessage(m.id)} style={{textAlign:"left",background:"#FDFAF5",border:"1px solid #F0EAD8",borderRadius:8,padding:"8px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                        <div style={{fontSize:12,fontWeight:600,color:"#1C1820"}}>{m.subject}</div>
                        <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{m.from}{m.receivedAt?` · ${new Date(m.receivedAt).toLocaleDateString('en-GB')}`:""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!extraction && !extractionLoading && (
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:20}}>
            <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Paste the email</label>
            <textarea value={rawText} onChange={e=>setRawText(e.target.value)} rows={12} placeholder={"From: manager@company.com\nSubject: Re: absence on 5 August\n\nHi HR, following up on..."} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",color:"#1A1535",outline:"none",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box"}}/>
            <button onClick={()=>onExtract(rawText)} disabled={!rawText.trim()} style={{marginTop:10,fontSize:13,background:!rawText.trim()?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontWeight:600,cursor:!rawText.trim()?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Read this email</button>
          </div>
        )}

        {extractionLoading && (
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:20,fontSize:13,color:"#9B9098"}}>Reading the email…</div>
        )}

        {extraction && !extractionLoading && (
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:20}}>
            <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Compass read this email as</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,fontSize:13,color:"#1A1535"}}>
              {extraction.sender&&<div><strong>From:</strong> {extraction.sender}</div>}
              {extraction.recipients?.length>0&&<div><strong>To:</strong> {extraction.recipients.join(", ")}</div>}
              {extraction.subject&&<div><strong>Subject:</strong> {extraction.subject}</div>}
              {extraction.date&&<div><strong>Date:</strong> {extraction.date}</div>}
              {extraction.employeeName&&<div><strong>About:</strong> {extraction.employeeName}</div>}
              {extraction.employeesMentioned?.length>0&&<div><strong>Other employees mentioned:</strong> {extraction.employeesMentioned.join(", ")}</div>}
              {extraction.caseReferences?.length>0&&<div><strong>Case references:</strong> {extraction.caseReferences.join(", ")}</div>}
              {extraction.datesMentioned?.length>0&&<div><strong>Other dates mentioned:</strong> {extraction.datesMentioned.join(", ")}</div>}
              {extraction.attachmentsMentioned?.length>0&&<div><strong>Attachments mentioned:</strong> {extraction.attachmentsMentioned.join(", ")}</div>}
              {extraction.summary&&<div style={{color:"#6B6375",marginTop:4}}>{extraction.summary}</div>}
              {!extraction.sender&&!extraction.subject&&!extraction.employeeName&&<div style={{color:"#9B9098"}}>Compass couldn't confidently extract details from this text — you can still file it to a case manually below.</div>}
            </div>

            {(extraction.potentialActions?.length>0||extraction.potentialDeadlines?.length>0||extraction.potentialWitnesses?.length>0||extraction.potentialEvidence?.length>0)&&(
              <div style={{background:"#FDFAF5",border:"1px solid #F0EAD8",borderRadius:8,padding:"10px 12px",marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Worth reviewing once filed</div>
                <div style={{display:"flex",flexDirection:"column",gap:3,fontSize:12,color:"#1A1535"}}>
                  {extraction.potentialActions?.map((a,i)=><div key={"a"+i}>Action: {a}</div>)}
                  {extraction.potentialDeadlines?.map((d,i)=><div key={"d"+i}>Deadline: {d}</div>)}
                  {extraction.potentialWitnesses?.map((w,i)=><div key={"w"+i}>Witness: {w}</div>)}
                  {extraction.potentialEvidence?.map((e,i)=><div key={"e"+i}>Evidence: {e}</div>)}
                </div>
              </div>
            )}

            <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>
              {matchedCase ? `Suggested case: ${matchedCase.employeeName}${extraction.matchConfidence==="medium"?" (please confirm — not an exact name match)":""}` : "Choose a case to file this under"}
            </label>
            <select value={targetCaseId} onChange={e=>setSelectedCaseId(e.target.value)} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box"}}>
              <option value="">Select a case…</option>
              {cases.map(c=>(
                <option key={c.id} value={c.id}>{c.employeeName} — {c.caseType||"HR matter"}</option>
              ))}
            </select>

            <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
              <button onClick={()=>onSave(targetCaseId)} disabled={!targetCaseId} style={{fontSize:13,background:!targetCaseId?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontWeight:600,cursor:!targetCaseId?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Save to this case</button>
              {onCreateConcern&&<button onClick={onCreateConcern} style={{fontSize:13,background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 18px",color:"#1C1820",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Create New Concern</button>}
              <button onClick={()=>{onClear();setRawText('');setSelectedCaseId('');}} style={{fontSize:13,background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 18px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Ignore</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
