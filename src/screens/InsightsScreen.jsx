import { useState } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { SettingsNav } from './settings/SettingsNav';
import { ManagerInsightsScreen } from './ManagerInsightsScreen';
import { ErReportScreen } from './ErReportScreen';
import { OrganisationalIntelligenceOverview } from '../components/OrganisationalIntelligenceOverview';
import { ThemeTaxonomyManager } from '../components/ThemeTaxonomyManager';
import { TrendsPanel } from '../components/TrendsPanel';
import { EarlySignalsPanel } from '../components/EarlySignalsPanel';
import { OrgEventsPanel } from '../components/OrgEventsPanel';
import { RiskMapPanel } from '../components/RiskMapPanel';
import { ExecutiveBriefPanel } from '../components/ExecutiveBriefPanel';
import { PeriodicReviewPanel } from '../components/PeriodicReviewPanel';
import { ImprovementInitiativesPanel } from '../components/ImprovementInitiativesPanel';

// Organisational ER Intelligence (Phase 6, OP1, §1) — the new "Insights"
// home replacing AppSidebar.jsx's two flat, disconnected rows
// (Performance Insights, Reports). Reuses SettingsNav.jsx's own
// {id,label} sub-nav rail exactly as-is rather than inventing new nav
// chrome. "Manager Insights" and "Reports" mount the existing
// ManagerInsightsScreen/ErReportScreen unchanged — this phase gives them
// a shared home, it does not rebuild them.

export function InsightsScreen({ isHR, cases, caseAccess, hrReviewRequests, auditLog, dueSoon, caseTasks, createCaseTask, managerCapabilityInsights, generatingManagerInsight, onGenerateManagerInsight, employeeRecords, setReportNarrative, reportNarrative, setActiveCaseId, setActiveCaseStage, setScreen, setActivePerson, getCaseStage, getNextStep, fmtDate, loadJsPDF, processTemplates, organisationThemes, onAddOrganisationTheme, onUpdateOrganisationTheme, allegations, caseSignals, policies, orgMembers, orgEvents, onAddOrgEvent, improvementInitiatives, onAddImprovementInitiative, onUpdateImprovementInitiative, org, user, memberName, initialSection, clearInitialSection }) {
  // Reports and the org-wide dashboard/trends tabs stay as widely
  // reachable as ErReportScreen already was; Manager Insights, Org
  // Events, Risk Map, and Improvement Initiatives are HR-only, same
  // restriction ManagerInsightsScreen already had on its own sidebar
  // row (§6, §13) — Org Events is viewable by any org member per its
  // own RLS, but the tab itself stays behind isHR since logging/
  // exploring correlation (its only real actions) are HR-only anyway.
  const sections = [
    {id:"overview", label:"Organisational Intelligence"},
    {id:"trends", label:"Trends & Themes"},
    {id:"early-signals", label:"Early Signals"},
    ...(isHR ? [{id:"manager", label:"Manager Insights"}] : []),
    ...(isHR ? [{id:"org-events", label:"Organisational Events"}] : []),
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
          {active==="overview"&&(
            <OrganisationalIntelligenceOverview
              cases={cases}
              dueSoon={dueSoon}
              hrReviewRequests={hrReviewRequests}
              processTemplates={processTemplates}
              employeeRecords={employeeRecords}
              onOpenCase={(caseId, stageId)=>{setActiveCaseId(caseId); setActiveCaseStage(stageId); setScreen(SCREENS.CASE_VIEW);}}
              allegations={allegations}
              caseSignals={caseSignals}
              caseTasks={caseTasks}
              policies={policies}
              caseAccess={caseAccess}
              orgMembers={orgMembers}
            />
          )}
          {active==="trends"&&(
            <>
              <TrendsPanel createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>
              <ThemeTaxonomyManager organisationThemes={organisationThemes} isHR={isHR} onAdd={onAddOrganisationTheme} onUpdate={onUpdateOrganisationTheme}/>
            </>
          )}
          {active==="early-signals"&&<EarlySignalsPanel createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>}
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
          {active==="org-events"&&isHR&&<OrgEventsPanel orgEvents={orgEvents} isHR={isHR} onAddEvent={onAddOrgEvent}/>}
          {active==="risk-map"&&isHR&&<RiskMapPanel cases={cases} employeeRecords={employeeRecords} processTemplates={processTemplates} orgEvents={orgEvents} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>}
          {active==="improvement-initiatives"&&isHR&&<ImprovementInitiativesPanel improvementInitiatives={improvementInitiatives} isHR={isHR} onAdd={onAddImprovementInitiative} onUpdate={onUpdateImprovementInitiative} caseTasks={caseTasks}/>}
          {active==="reports"&&(
            <>
              <ExecutiveBriefPanel org={org} user={user} memberName={memberName} isHR={isHR}/>
              <PeriodicReviewPanel org={org} user={user} memberName={memberName} isHR={isHR}/>
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
            </>
          )}

          <div style={{marginTop:24}}>
            <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
