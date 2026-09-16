import { useState } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { PageHeader } from '../components/design/PageHeader';
import { CONTENT_MAX_WIDTH } from '../styles/tokens';
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
import { ManagementAnalysisSection } from '../components/ManagementAnalysisSection';

// Organisational ER Intelligence (Phase 6, OP1, §1) — the new "Insights"
// home replacing AppSidebar.jsx's two flat, disconnected rows
// (Performance Insights, Reports). Reuses SettingsNav.jsx's own
// {id,label} sub-nav rail exactly as-is rather than inventing new nav
// chrome. "Manager Insights" and "Reports" mount the existing
// ManagerInsightsScreen/ErReportScreen unchanged — this phase gives them
// a shared home, it does not rebuild them.

export function InsightsScreen({
  isHR,
  isMobile = false,
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
  // Insights Visual Upgrade, Phase 1 — Reports is now the first/default
  // tab (previously last), per the Insights Product & UX Review's
  // primary finding: a senior HR user should see the management
  // dashboard within seconds of opening Insights, not after clicking
  // through 7 other tabs. Every other tab keeps its existing id/label/
  // position relative to each other — this phase is deliberately bounded
  // to Reports' own content and position, not a redistribution of the
  // rest of Insights (see the review's §2/§19 phasing).
  const sections = [
    {id:"reports", label:"Reports"},
    {id:"overview", label:"Organisational Intelligence"},
    {id:"trends", label:"Trends & Themes"},
    {id:"early-signals", label:"Early Signals"},
    ...(isHR ? [{id:"manager", label:"Manager Insights"}] : []),
    ...(isHR ? [{id:"org-events", label:"Organisational Events"}] : []),
    ...(isHR ? [{id:"risk-map", label:"Risk Map"}] : []),
    ...(isHR ? [{id:"improvement-initiatives", label:"Improvement Initiatives"}] : []),
  ];
  const [active, setActive] = useState(deepLink.initialSection && sections.some(s=>s.id===deepLink.initialSection) ? deepLink.initialSection : "reports");
  // Shared by every Insights tab that drills into Cases (Overview's Needs
  // Attention/Emerging Patterns, Trends & Themes' theme drill-down) — one
  // handler, not a copy per tab, since they all do the exact same thing:
  // seed the Cases screen's one-shot deep link and navigate there.
  const onViewCases = (filterSpec) => { nav.setCasesInitialFilters(filterSpec); nav.setScreen(SCREENS.CASES); };

  return (
    <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"40px 28px",minWidth:0,width:"100%",boxSizing:"border-box"}}>
      <PageHeader title="Insights" subtitle="What your Employee Relations data is telling you across every case — patterns, themes, and where to focus."/>

      <div style={{display:"flex",gap:32,alignItems:"flex-start"}}>
        <SettingsNav sections={sections} active={active} onChange={v=>{setActive(v); deepLink.clearInitialSection?.();}} isMobile={isMobile}/>

        <div style={{flex:1,minWidth:0}}>
          {active==="overview"&&(
            <OrganisationalIntelligenceOverview
              orgId={reporting.org?.id}
              isHR={isHR}
              cases={caseData.cases}
              dueSoon={caseData.dueSoon}
              hrReviewRequests={caseData.hrReviewRequests}
              processTemplates={caseData.processTemplates}
              employeeRecords={caseData.employeeRecords}
              onOpenCase={(caseId, stageId)=>{nav.setActiveCaseId(caseId); nav.setActiveCaseStage(stageId); nav.setScreen(SCREENS.CASE_VIEW);}}
              onViewCases={onViewCases}
              allegations={caseData.allegations}
              caseSignals={caseData.caseSignals}
              caseTasks={caseData.caseTasks}
              policies={caseData.policies}
              caseAccess={caseData.caseAccess}
              orgMembers={caseData.orgMembers}
              caseThemes={orgIntel.caseThemes}
              organisationThemes={orgIntel.organisationThemes}
              createCaseTask={orgIntelActions.createCaseTask}
              improvementInitiatives={orgIntel.improvementInitiatives}
            />
          )}
          {active==="trends"&&(
            <>
              <TrendsPanel orgId={reporting.org?.id} cases={caseData.cases} caseThemes={orgIntel.caseThemes} onViewCases={onViewCases} createCaseTask={orgIntelActions.createCaseTask} improvementInitiatives={orgIntel.improvementInitiatives}/>
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
              <ErReportScreen
                cases={caseData.cases}
                getCaseStage={reporting.getCaseStage}
                employeeRecords={caseData.employeeRecords}
                dueSoon={caseData.dueSoon}
                onViewCases={onViewCases}
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
              {/* Insights Visual Upgrade, Phase 1 — the two persisted-
                  history AI narrative panels, previously rendered
                  unconditionally expanded ABOVE the dashboard above.
                  Collapsed by default now, below it — see
                  ManagementAnalysisSection's own header comment. */}
              <ManagementAnalysisSection>
                <ExecutiveBriefPanel org={reporting.org} user={reporting.user} memberName={reporting.memberName} isHR={isHR} cases={caseData.cases} dueSoon={caseData.dueSoon} hrReviewRequests={caseData.hrReviewRequests} allegations={caseData.allegations} caseSignals={caseData.caseSignals} caseTasks={caseData.caseTasks} policies={caseData.policies} caseAccess={caseData.caseAccess} orgMembers={caseData.orgMembers}/>
                <PeriodicReviewPanel org={reporting.org} user={reporting.user} memberName={reporting.memberName} isHR={isHR} cases={caseData.cases} dueSoon={caseData.dueSoon} hrReviewRequests={caseData.hrReviewRequests} allegations={caseData.allegations} caseSignals={caseData.caseSignals} caseTasks={caseData.caseTasks} policies={caseData.policies} caseAccess={caseData.caseAccess} orgMembers={caseData.orgMembers}/>
              </ManagementAnalysisSection>
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
