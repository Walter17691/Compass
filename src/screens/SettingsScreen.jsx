import { useState, useEffect } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { SettingsNav } from './settings/SettingsNav';
import { BillingSection } from './settings/BillingSection';
import { TeamAccessSection } from './settings/TeamAccessSection';
import { OrganisationSection } from './settings/OrganisationSection';
import { LocationsSection } from './settings/LocationsSection';
import { PortalAccessSection } from './settings/PortalAccessSection';
import { EmployeeRecordsSection } from './settings/EmployeeRecordsSection';
import { BrandingSection } from './settings/BrandingSection';
import { PoliciesSection } from './settings/PoliciesSection';
import { ProcessTemplatesSection } from './settings/ProcessTemplatesSection';
import { TemplatesSection } from './settings/TemplatesSection';
import { NotificationsSection } from './settings/NotificationsSection';
import { AutomationsSection } from './settings/AutomationsSection';
import { IntegrationsSection } from './settings/IntegrationsSection';
import { IntegrationHealthSection } from './settings/IntegrationHealthSection';
import { AuditTrailSection } from './settings/AuditTrailSection';
import { DataPrivacySection } from './settings/DataPrivacySection';
import { HelpSection } from './settings/HelpSection';

// One section renders at a time via SettingsNav instead of one long
// scrolling page — was previously ~15 stacked cards behind a scroll-to-
// anchor pill row. "Organisation" was previously a separate popup
// (OrgSettingsModal, reached only from its own header button); it's now
// just another section here, alongside everything else that configures
// the org.
// Phase 6.5 hardening (Batch 10b, task #205) — was 99 individually
// destructured props, making the call site in App.jsx a 100-line wall
// impossible to scan for what actually changed between two edits. Grouped
// by which sub-section component each prop feeds (SettingsScreen is a
// pure router over 16 independent settings sections, so groups mirror
// those sections rather than a shared data model). A handful of trivially
// shared scalars (isHR, auditLog, lsSet — the deliberately global one,
// see the branding/policies comment below) stay flat since several
// sections read them identically and grouping would only add indirection.
export function SettingsScreen({
  isHR, isMobile, initialSection, clearInitialSection, setScreen, showToast, auditLog, lsSet,
  org = {},
  team = {},
  portal = {},
  employeeData = {},
  branding = {},
  policies = {},
  templates = {},
  integrations = {},
  notifications = {},
  automation = {},
  dataPrivacy = {},
  onboarding = {},
}) {
  const sections = [
    {id:"billing", label:"Billing"},
    ...(isHR?[{id:"team-access", label:"Team & access"}]:[]),
    {id:"organisation", label:"Organisation"},
    ...(isHR?[{id:"locations", label:"Locations"}]:[]),
    ...(isHR?[{id:"portal-access", label:"Portal access"}]:[]),
    {id:"employee-records", label:"Employee data"},
    {id:"branding", label:"Branding & letters"},
    {id:"policies", label:"Policies"},
    ...(isHR?[{id:"process-templates", label:"Process templates"}]:[]),
    {id:"templates", label:"Checklist templates"},
    {id:"integrations", label:"Integrations"},
    ...(isHR?[{id:"integration-health", label:"Integration health"}]:[]),
    {id:"notifications", label:"Notifications"},
    ...(isHR?[{id:"automations", label:"Automations"}]:[]),
    {id:"audit-trail", label:"Audit trail"},
    {id:"data-privacy", label:"Data & privacy"},
    {id:"help", label:"Help"},
  ];
  // Lets a deep link (Home's "Suggested for you" / "View all policies &
  // templates") land directly on the relevant section instead of always
  // Billing. Cleared on unmount so a later, ordinary nav-bar click into
  // Settings still defaults to Billing rather than getting stuck wherever
  // the last deep link pointed.
  const [active, setActive] = useState(initialSection || "billing");
  // Deliberately runs only on unmount, not whenever clearInitialSection
  // changes identity — this should fire exactly once, when the user
  // leaves Settings, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => clearInitialSection?.(), []);

  return(
    <div style={{maxWidth:920,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Settings</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px"}}>Case files and employee records are stored securely in the cloud, shared with your organisation.</p>

      <div style={{display:"flex",gap:32,alignItems:"flex-start"}}>
        <SettingsNav sections={sections} active={active} onChange={setActive} isMobile={isMobile}/>

        <div style={{flex:1,minWidth:0}}>
          {active==="billing"&&<BillingSection org={org.org} locations={org.locations} showToast={showToast}/>}
          {active==="team-access"&&<TeamAccessSection isHR={isHR} org={org.org} locations={org.locations} teamMembers={team.teamMembers} editingMember={team.editingMember} setEditingMember={team.setEditingMember} removeMember={team.removeMember} updateMemberRole={team.updateMemberRole} assignLocations={team.assignLocations} inviteForm={team.inviteForm} setInviteForm={team.setInviteForm} inviting={team.inviting} inviteMember={team.inviteMember}/>}
          {active==="organisation"&&<OrganisationSection org={org.org} orgRoles={org.orgRoles} loadOrgRoles={org.loadOrgRoles} orgMembers={org.orgMembers} loadOrgMembers={org.loadOrgMembers} showToast={showToast}/>}
          {active==="locations"&&<LocationsSection isHR={isHR} locations={org.locations} deleteLocation={org.deleteLocation} addLocation={org.addLocation}/>}
          {active==="portal-access"&&<PortalAccessSection isHR={isHR} portalAccounts={portal.portalAccounts} revokePortalAccess={portal.revokePortalAccess}/>}
          {active==="employee-records"&&<EmployeeRecordsSection employeeCsvFileRef={employeeData.employeeCsvFileRef} employeeCsvProcessing={employeeData.employeeCsvProcessing} handleEmployeeCsvImport={employeeData.handleEmployeeCsvImport} exportEmployeesCsv={employeeData.exportEmployeesCsv} caseCsvFileRef={employeeData.caseCsvFileRef} caseCsvProcessing={employeeData.caseCsvProcessing} handleCaseCsvImport={employeeData.handleCaseCsvImport} downloadCaseCsvTemplate={employeeData.downloadCaseCsvTemplate}/>}
          {/* Phase 6.5 hardening — signature/letterhead/word-template/policy
              removal are real tenant data, so these two sections get the
              org-scoped orgLsSet (passed in as the "lsSet" prop name their
              own code already expects) rather than the plain global lsSet
              DataPrivacySection below still legitimately uses for the
              non-sensitive, deliberately-global compass_gdpr flag. */}
          {active==="branding"&&<BrandingSection wordTemplate={branding.wordTemplate} setWordTemplate={branding.setWordTemplate} lsSet={branding.orgLsSet} wordTemplateRef={branding.wordTemplateRef} handleWordTemplateUpload={branding.handleWordTemplateUpload} letterhead={branding.letterhead} setLetterhead={branding.setLetterhead} letterheadRef={branding.letterheadRef} handleLetterheadUpload={branding.handleLetterheadUpload} signature={branding.signature} setSignature={branding.setSignature} setShowSigPad={branding.setShowSigPad}/>}
          {active==="policies"&&<PoliciesSection policies={policies.policies} setPolicies={policies.setPolicies} policyFileRef={policies.policyFileRef} handlePolicyUpload={policies.handlePolicyUpload} policyProcessing={policies.policyProcessing} lsSet={branding.orgLsSet} changePolicyCategory={policies.changePolicyCategory}/>}
          {active==="process-templates"&&<ProcessTemplatesSection processTemplates={templates.processTemplates} saveProcessTemplate={templates.saveProcessTemplate}/>}
          {active==="templates"&&<TemplatesSection starterTemplates={templates.starterTemplates} saveStarterTemplates={templates.saveStarterTemplates} leaverTemplates={templates.leaverTemplates} saveLeaverTemplates={templates.saveLeaverTemplates} promptDialog={templates.promptDialog} confirmDialog={templates.confirmDialog}/>}
          {active==="integrations"&&<IntegrationsSection mailConnected={integrations.mailConnected} mailboxEmail={integrations.mailboxEmail} onConnectMail={integrations.onConnectMail} onDisconnectMail={integrations.onDisconnectMail} gmailConnected={integrations.gmailConnected} gmailboxEmail={integrations.gmailboxEmail} connectGmail={integrations.connectGmail} disconnectGmail={integrations.disconnectGmail} calendarConnected={integrations.calendarConnected} connectGoogleCalendar={integrations.connectGoogleCalendar} disconnectGoogleCalendar={integrations.disconnectGoogleCalendar} ms365CalendarConnected={integrations.ms365CalendarConnected} connectMs365Calendar={integrations.connectMs365Calendar} disconnectMs365Calendar={integrations.disconnectMs365Calendar} orgWebhookUrl={integrations.orgWebhookUrl} orgWebhookType={integrations.orgWebhookType} onManageNotifications={()=>setActive("notifications")}/>}
          {active==="integration-health"&&isHR&&<IntegrationHealthSection integrationEvents={integrations.integrationEvents}/>}
          {active==="notifications"&&<NotificationsSection dueSoon={notifications.dueSoon} caseTasks={notifications.caseTasks} createCaseTask={notifications.createCaseTask} requestNotifications={notifications.requestNotifications} notifGranted={notifications.notifGranted} emailDigestOptIn={notifications.emailDigestOptIn} toggleEmailDigest={notifications.toggleEmailDigest} orgWebhookUrl={integrations.orgWebhookUrl} orgWebhookType={integrations.orgWebhookType} saveOrgWebhook={integrations.saveOrgWebhook} sendTestWebhook={integrations.sendTestWebhook}/>}
          {active==="automations"&&isHR&&<AutomationsSection automationLevels={automation.automationLevels} saveAutomationLevel={automation.saveAutomationLevel}/>}
          {active==="audit-trail"&&<AuditTrailSection auditLog={auditLog}/>}
          {active==="data-privacy"&&<DataPrivacySection isHR={isHR} exportCSV={dataPrivacy.exportCSV} exportPDF={dataPrivacy.exportPDF} cases={dataPrivacy.cases} policies={policies.policies} auditLog={auditLog} exportAllData={dataPrivacy.exportAllData} deleteAllData={dataPrivacy.deleteAllData} setGdprAccepted={dataPrivacy.setGdprAccepted} setShowGdpr={dataPrivacy.setShowGdpr} lsSet={lsSet}/>}
          {active==="help"&&<HelpSection setOnboardStep={onboarding.setOnboardStep} setShowOnboard={onboarding.setShowOnboard}/>}

          <div style={{marginTop:24}}>
            <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
