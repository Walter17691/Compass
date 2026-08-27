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

export function InsightsScreen({
  isHR,
  deepLink = {},
  caseData = {},
  orgIntel = {},
  orgIntelActions = {},
  reporting = {},
  nav = {},
}) {
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
  const [active, setActive] = useState(deepLink.initialSection && sections.some(s=>s.id===deepLink.initialSection) ? deepLink.initialSection : "overview");

  return (
    <div style={{maxWidth:1080,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Insights</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>What your Employee Relations data is telling you across every case — patterns, themes, and where to focus.</p>

      <div style={{display:"flex",gap:32,alignItems:"flex-start"}}>
        <SettingsNav sections={sections} active={active} onChange={v=>{setActive(v); deepLink.clearInitialSection?.();}} isMobile={false}/>

        <div style={{flex:1,minWidth:0}}>
          {active==="overview"&&(
            <OrganisationalIntelligenceOverview
              orgId={reporting.org?.id}
              cases={caseData.cases}
              dueSoon={caseData.dueSoon}
              hrReviewRequests={caseData.hrReviewRequests}
              processTemplates={caseData.processTemplates}
              employeeRecords={caseData.employeeRecords}
              onOpenCase={(caseId, stageId)=>{nav.setActiveCaseId(caseId); nav.setActiveCaseStage(stageId); nav.setScreen(SCREENS.CASE_VIEW);}}
              allegations={caseData.allegations}
              caseSignals={caseData.caseSignals}
              caseTasks={caseData.caseTasks}
              policies={caseData.policies}
              caseAccess={caseData.caseAccess}
              orgMembers={caseData.orgMembers}
              caseThemes={orgIntel.caseThemes}
              organisationThemes={orgIntel.organisationThemes}
            />
          )}
          {active==="trends"&&(
            <>
              <TrendsPanel orgId={reporting.org?.id} createCaseTask={orgIntelActions.createCaseTask} improvementInitiatives={orgIntel.improvementInitiatives}/>
              <ThemeTaxonomyManager organisationThemes={orgIntel.organisationThemes} isHR={isHR} onAdd={orgIntelActions.onAddOrganisationTheme} onUpdate={orgIntelActions.onUpdateOrganisationTheme}/>
            </>
          )}
          {active==="early-signals"&&<EarlySignalsPanel orgId={reporting.org?.id} createCaseTask={orgIntelActions.createCaseTask} improvementInitiatives={orgIntel.improvementInitiatives}/>}
          {active==="manager"&&isHR&&(
            <ManagerInsightsScreen
              cases={caseData.cases}
              caseAccess={caseData.caseAccess}
              hrReviewRequests={caseData.hrReviewRequests}
              auditLog={caseData.auditLog}
              dueSoon={caseData.dueSoon}
              caseTasks={caseData.caseTasks}
              managerCapabilityInsights={orgIntel.managerCapabilityInsights}
              generatingManagerInsight={orgIntel.generatingManagerInsight}
              onGenerateManagerInsight={orgIntelActions.onGenerateManagerInsight}
            />
          )}
          {active==="org-events"&&isHR&&<OrgEventsPanel orgEvents={orgIntel.orgEvents} isHR={isHR} onAddEvent={orgIntelActions.onAddOrgEvent}/>}
          {active==="risk-map"&&isHR&&<RiskMapPanel orgId={reporting.org?.id} cases={caseData.cases} employeeRecords={caseData.employeeRecords} processTemplates={caseData.processTemplates} orgEvents={orgIntel.orgEvents} createCaseTask={orgIntelActions.createCaseTask} improvementInitiatives={orgIntel.improvementInitiatives}/>}
          {active==="improvement-initiatives"&&isHR&&<ImprovementInitiativesPanel orgId={reporting.org?.id} improvementInitiatives={orgIntel.improvementInitiatives} isHR={isHR} onAdd={orgIntelActions.onAddImprovementInitiative} onUpdate={orgIntelActions.onUpdateImprovementInitiative} caseTasks={caseData.caseTasks} cases={caseData.cases} organisationThemes={orgIntel.organisationThemes}/>}
          {active==="reports"&&(
            <>
              <ExecutiveBriefPanel org={reporting.org} user={reporting.user} memberName={reporting.memberName} isHR={isHR}/>
              <PeriodicReviewPanel org={reporting.org} user={reporting.user} memberName={reporting.memberName} isHR={isHR}/>
              <ErReportScreen
                cases={caseData.cases}
                getCaseStage={reporting.getCaseStage}
                employeeRecords={caseData.employeeRecords}
                setReportNarrative={reporting.setReportNarrative}
                reportNarrative={reporting.reportNarrative}
                setActiveCaseId={nav.setActiveCaseId}
                setActiveCaseStage={nav.setActiveCaseStage}
                setScreen={nav.setScreen}
                setActivePerson={nav.setActivePerson}
                getNextStep={reporting.getNextStep}
                fmtDate={reporting.fmtDate}
                loadJsPDF={reporting.loadJsPDF}
                caseThemes={orgIntel.caseThemes}
                organisationThemes={orgIntel.organisationThemes}
                isHR={isHR}
              />
            </>
          )}

          <div style={{marginTop:24}}>
            <Btn variant="ghost" onClick={()=>nav.setScreen(SCREENS.HOME)}>← Back to home</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
