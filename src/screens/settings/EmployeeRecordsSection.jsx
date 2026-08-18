import { Btn, Card } from '../../components/Primitives';

export function EmployeeRecordsSection({ employeeCsvFileRef, employeeCsvProcessing, handleEmployeeCsvImport, exportEmployeesCsv, caseCsvFileRef, caseCsvProcessing, handleCaseCsvImport, downloadCaseCsvTemplate }) {
  return (
    <>
      <Card style={{marginBottom:12}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Employee records</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Import or export employee records as a CSV — works with an export from any HRIS or payroll system (BambooHR, Xero, Sage, etc). Expected columns: Name, Job title, Start date, Location, Employee number, Department, Manager, Status, Working pattern, Probation end date — only Name is required, the rest are optional.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn onClick={()=>employeeCsvFileRef.current?.click()} disabled={employeeCsvProcessing}>{employeeCsvProcessing?"Importing...":"Import from CSV"}</Btn>
          <Btn variant="secondary" onClick={exportEmployeesCsv}>Export to CSV</Btn>
        </div>
        <input ref={employeeCsvFileRef} type="file" accept=".csv" onChange={handleEmployeeCsvImport} style={{display:"none"}} />
      </Card>

      <Card>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Case history</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Bring in existing case records when switching from spreadsheets or another system — meeting transcripts and letters aren't importable this way, but the case-level record (who, what, when, status) is. Expected columns: Employee name, Case type, Stage (open/closed), Date received, Description, Outcome.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn onClick={()=>caseCsvFileRef.current?.click()} disabled={caseCsvProcessing}>{caseCsvProcessing?"Importing...":"Import from CSV"}</Btn>
          <Btn variant="ghost" onClick={downloadCaseCsvTemplate}>Download template</Btn>
        </div>
        <input ref={caseCsvFileRef} type="file" accept=".csv" onChange={handleCaseCsvImport} style={{display:"none"}} />
      </Card>
    </>
  );
}
