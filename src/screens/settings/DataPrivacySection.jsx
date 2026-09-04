import { useState } from 'react';
import { Btn, Card } from '../../components/Primitives';
import { UK_JURISDICTIONS } from '../../lib/ukBankHolidays';
import { COLOR, FONT } from '../../styles/tokens';

export function DataPrivacySection({ isHR, exportCSV, exportPDF, cases, policies, auditLog, exportAllData, deleteAllData, setGdprAccepted, setShowGdpr, lsSet, dataRetentionYears, saveDataRetentionYears, ukJurisdiction, saveUkJurisdiction }) {
  const [retentionDraft, setRetentionDraft] = useState(dataRetentionYears ?? "");
  return (
    <>
      {isHR&&(
        <Card style={{marginBottom:12}}>
          <div style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",marginBottom:4}}>Data export</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Export all cases and meeting records for reporting or backup.</p>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={exportCSV} style={{flex:1}}>Export CSV</Btn>
            <Btn onClick={exportPDF} variant="ghost" style={{flex:1}}>Export PDF</Btn>
          </div>
          <div style={{fontSize:11,color:"#5A5570",marginTop:10}}>CSV includes all cases, meetings, risk scores and dates. PDF includes full case summaries.</div>
        </Card>
      )}

      {isHR&&(
        <Card style={{marginBottom:12}}>
          <div style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",marginBottom:4}}>Working-day calendar</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:14,lineHeight:1.6}}>Which UK bank holidays Compass excludes when it calculates a "working days" deadline (e.g. the ACAS-recommended 5 working days for an outcome letter or appeal window). ACAS guidance is a recommended timescale, not a fixed statutory deadline — Compass calculates against it for consistency, but the right period for a specific case is always a judgment call for the person running it.</p>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <label htmlFor="uk-jurisdiction" style={{fontSize:12,color:"#1A1535",flexShrink:0}}>Calendar</label>
            <select id="uk-jurisdiction" value={ukJurisdiction||""} onChange={e=>saveUkJurisdiction(e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}>
              <option value="">England & Wales (default)</option>
              {UK_JURISDICTIONS.filter(j=>j.id!=="england-and-wales").map(j=>(
                <option key={j.id} value={j.id}>{j.label}</option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {isHR&&(
        <Card style={{marginBottom:12}}>
          <div style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",marginBottom:4}}>Data retention</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:14,lineHeight:1.6}}>Record how long your organisation intends to keep case and employee records for. This is informational only — Compass does not automatically delete or anonymise anything based on it. Retention periods vary by record type under UK employment law; take your own legal advice before setting a figure, and never rely on this to remove records subject to a live tribunal claim or ongoing process.</p>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <label htmlFor="data-retention-years" style={{fontSize:12,color:"#1A1535",flexShrink:0}}>Retention period (years)</label>
            <input id="data-retention-years" type="number" min="0" placeholder="Not set" value={retentionDraft} onChange={e=>setRetentionDraft(e.target.value)} style={{width:80,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            <Btn variant="secondary" onClick={()=>saveDataRetentionYears(retentionDraft)}>Save</Btn>
          </div>
        </Card>
      )}

      <Card>
        <h3 style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Data &amp; privacy</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Case files, employee records and the audit trail are stored in the cloud, shared with your organisation. Policies and signature/letterhead stay in this browser. You are responsible for UK GDPR compliance when processing employee personal data.</p>
        <div style={{background:"#FDFAF5",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:12,color:COLOR.purple,fontWeight:700,marginBottom:8}}>Data inventory</div>
          {[
            {l:"Case files & meetings",v:cases.length+" cases, "+cases.reduce((t,c)=>t+c.meetings.length,0)+" meetings"},
            {l:"Policies uploaded",v:policies.length+" documents"},
            {l:"Audit log entries",v:auditLog.length+" entries"},
            {l:"Storage used",v:Math.round(JSON.stringify(localStorage).length/1024)+"kb"},
          ].map(({l,v})=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",padding:"3px 0"}}>
              <span>{l}</span><span style={{color:"#6B6375"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn variant="secondary" onClick={exportAllData}>Export all data</Btn>
          <Btn variant="danger" onClick={deleteAllData} style={{color:"#C84B2F"}}>Delete all data</Btn>
          <button onClick={()=>{setGdprAccepted(false);lsSet("compass_gdpr",false);setShowGdpr(true);}} style={{background:"none",border:"none",color:"#6B6880",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>View privacy notice</button>
        </div>
      </Card>
    </>
  );
}
