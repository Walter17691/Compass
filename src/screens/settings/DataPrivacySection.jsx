import { Btn, Card } from '../../components/Primitives';

export function DataPrivacySection({ isHR, exportCSV, exportPDF, cases, policies, auditLog, exportAllData, deleteAllData, setGdprAccepted, setShowGdpr, lsSet }) {
  return (
    <>
      {isHR&&(
        <Card style={{marginBottom:12}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Data export</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Export all cases and meeting records for reporting or backup.</p>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={exportCSV} style={{flex:1}}>Export CSV</Btn>
            <Btn onClick={exportPDF} variant="ghost" style={{flex:1}}>Export PDF</Btn>
          </div>
          <div style={{fontSize:11,color:"#5A5570",marginTop:10}}>CSV includes all cases, meetings, risk scores and dates. PDF includes full case summaries.</div>
        </Card>
      )}

      <Card>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Data &amp; privacy</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Case files, employee records and the audit trail are stored in the cloud, shared with your organisation. Policies and signature/letterhead stay in this browser. You are responsible for UK GDPR compliance when processing employee personal data.</p>
        <div style={{background:"#FDFAF5",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>DATA INVENTORY</div>
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
