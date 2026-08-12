import { useState } from 'react';

// Phase 24 of the reasoning-layer build-out — Email integration
// groundwork. The manual half of a flow designed so a later webhook
// adapter (Graph mail push / Gmail push) can feed the same pipeline once
// OAuth credentials exist and the org owner registers the app — see
// lib/emailIngestion.js. Nothing is saved until the user explicitly picks
// a case and confirms, even when Compass found a confident match.
export function SaveEmailScreen({ cases, extraction, extractionLoading, onExtract, onSave, onClear }) {
  const [rawText, setRawText] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');

  const matchedCase = extraction?.matchedCaseId ? cases.find(c => c.id === extraction.matchedCaseId) : null;
  const targetCaseId = selectedCaseId || extraction?.matchedCaseId || '';

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{maxWidth:700,margin:"0 auto",padding:"32px 32px"}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:"#9B9098",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Groundwork</div>
          <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:28,fontWeight:400,color:"#1C1820",margin:0}}>Save email to case</h1>
          <p style={{fontSize:13,color:"#9B9098",margin:"6px 0 0"}}>Paste an email below — Compass reads it, suggests which case it belongs to, and files it as evidence once you confirm. Nothing is saved automatically.</p>
        </div>

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
              {extraction.subject&&<div><strong>Subject:</strong> {extraction.subject}</div>}
              {extraction.date&&<div><strong>Date:</strong> {extraction.date}</div>}
              {extraction.employeeName&&<div><strong>About:</strong> {extraction.employeeName}</div>}
              {extraction.summary&&<div style={{color:"#6B6375",marginTop:4}}>{extraction.summary}</div>}
              {!extraction.sender&&!extraction.subject&&!extraction.employeeName&&<div style={{color:"#9B9098"}}>Compass couldn't confidently extract details from this text — you can still file it to a case manually below.</div>}
            </div>

            <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>
              {matchedCase ? `Suggested case: ${matchedCase.employeeName}` : "Choose a case to file this under"}
            </label>
            <select value={targetCaseId} onChange={e=>setSelectedCaseId(e.target.value)} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box"}}>
              <option value="">Select a case…</option>
              {cases.map(c=>(
                <option key={c.id} value={c.id}>{c.employeeName} — {c.caseType||"HR matter"}</option>
              ))}
            </select>

            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={()=>onSave(targetCaseId)} disabled={!targetCaseId} style={{fontSize:13,background:!targetCaseId?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontWeight:600,cursor:!targetCaseId?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Save to this case</button>
              <button onClick={()=>{onClear();setRawText('');setSelectedCaseId('');}} style={{fontSize:13,background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 18px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Start over</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
