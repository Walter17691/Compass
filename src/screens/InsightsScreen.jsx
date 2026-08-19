import { useState } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { SettingsNav } from './settings/SettingsNav';
import { ManagerInsightsScreen } from './ManagerInsightsScreen';
import { ErReportScreen } from './ErReportScreen';

// Organisational ER Intelligence (Phase 6, OP1, §1) — the new "Insights"
// home replacing AppSidebar.jsx's two flat, disconnected rows
// (Performance Insights, Reports). Reuses SettingsNav.jsx's own
// {id,label} sub-nav rail exactly as-is rather than inventing new nav
// chrome. "Manager Insights" and "Reports" mount the existing
// ManagerInsightsScreen/ErReportScreen unchanged — this phase gives them
// a shared home, it does not rebuild them. The other four tabs land
// their real content in later OP phases (OP3 dashboard, OP7-9 trends,
// OP16 risk map, OP22 improvement initiatives); until then they show a
// plain "not built yet" placeholder rather than a fake empty dashboard.
function ComingSoon({ label }) {
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"32px 24px",textAlign:"center"}}>
      <div style={{fontSize:14,color:"#6B6375"}}>{label} is being built as part of this phase and isn't available yet.</div>
    </div>
  );
}

export function InsightsScreen({ isHR, cases, caseAccess, hrReviewRequests, auditLog, dueSoon, caseTasks, managerCapabilityInsights, generatingManagerInsight, onGenerateManagerInsight, employeeRecords, setReportNarrative, reportNarrative, setActiveCaseId, setActiveCaseStage, setScreen, setActivePerson, getCaseStage, getNextStep, fmtDate, loadJsPDF, initialSection, clearInitialSection }) {
  // Reports and the org-wide dashboard/trends tabs stay as widely
  // reachable as ErReportScreen already was; Manager Insights, Risk Map,
  // and Improvement Initiatives are HR-only, same restriction
  // ManagerInsightsScreen already had on its own sidebar row (§6, §13).
  const sections = [
    {id:"overview", label:"Organisational Intelligence"},
    {id:"trends", label:"Trends & Themes"},
    ...(isHR ? [{id:"manager", label:"Manager Insights"}] : []),
    ...(isHR ? [{id:"risk-map", label:"Risk Map"}] : []),
    ...(isHR ? [{id:"improvement-initiatives", label:"Improvement Initiatives"}] : []),
    {id:"reports", label:"Reports"},
  ];
  const [active, setActive] = useState(initialSection && sections.some(s=>s.id===initialSection) ? initialSection : "overview");

  return (
    <div style={{maxWidth:1080,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Insights</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>What your Employee Relations data is telling you across every case — patterns, themes, and where to focus.</p>

      <div style={{display:"flex",gap:32,alignItems:"flex-start"}}>
        <SettingsNav sections={sections} active={active} onChange={v=>{setActive(v); clearInitialSection?.();}} isMobile={false}/>

        <div style={{flex:1,minWidth:0}}>
          {active==="overview"&&<ComingSoon label="The Organisational Intelligence dashboard"/>}
          {active==="trends"&&<ComingSoon label="Trends & Themes"/>}
          {active==="manager"&&isHR&&(
            <ManagerInsightsScreen
              cases={cases}
              caseAccess={caseAccess}
              hrReviewRequests={hrReviewRequests}
              auditLog={auditLog}
              dueSoon={dueSoon}
              caseTasks={caseTasks}
              managerCapabilityInsights={managerCapabilityInsights}
              generatingManagerInsight={generatingManagerInsight}
              onGenerateManagerInsight={onGenerateManagerInsight}
            />
          )}
          {active==="risk-map"&&isHR&&<ComingSoon label="The Risk Map"/>}
          {active==="improvement-initiatives"&&isHR&&<ComingSoon label="Improvement Initiatives"/>}
          {active==="reports"&&(
            <ErReportScreen
              cases={cases}
              getCaseStage={getCaseStage}
              employeeRecords={employeeRecords}
              setReportNarrative={setReportNarrative}
              reportNarrative={reportNarrative}
              setActiveCaseId={setActiveCaseId}
              setActiveCaseStage={setActiveCaseStage}
              setScreen={setScreen}
              setActivePerson={setActivePerson}
              getNextStep={getNextStep}
              fmtDate={fmtDate}
              loadJsPDF={loadJsPDF}
            />
          )}

          <div style={{marginTop:24}}>
            <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
