import { useState, useEffect } from 'react';
import { SCREENS } from '../constants';
import { Btn } from '../components/Primitives';
import { PageHeader } from '../components/design/PageHeader';
import { CONTENT_MAX_WIDTH } from '../styles/tokens';
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
import { NotificationsSection } from './settings/NotificationsSection';
import { AutomationsSection } from './settings/AutomationsSection';
import { IntegrationsSection } from './settings/IntegrationsSection';
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
    // Client IA cleanup — Billing removed from Settings navigation
    // entirely (was previously isHR-gated, but that gate still meant any
    // HR team member — not just whoever actually owns the org's
    // subscription — could see and reach it). No separate "org owner"
    // role exists in the current permission model to gate this more
    // finely, and this pass was explicitly told not to invent one.
    // BillingSection itself, its route, and every /api/billing/* endpoint
    // are untouched — see the render branch below, still reachable via
    // the same initialSection deep-link mechanism every other section
    // uses, just with no current caller wiring anything to it. Confirmed
    // before removing: Billing has never gated app usage anywhere (no
    // paywall/subscription check exists in App.jsx) — removing it from
    // nav doesn't block any required account functionality.
    ...(isHR?[{id:"organisation", label:"Organisation"}]:[]),
    // Phase 6.5 hardening (structural remediation, Prompt 14 — Family 1
    // Part 6 coordination). This tab lets a caller define org_roles
    // (job titles/access levels) AND directly edit another member's own
    // access_level/job_title (org_members) — both are HR-only operations
    // by design (access_level gates who can appoint disciplinary
    // officers), but this tab had no isHR gate at all, UI or database,
    // until this pass. Matches the existing Wellbeing/Automations/Data
    // & Privacy precedent (hide the tab; RLS/triggers are the real
    // boundary either way).
    ...(isHR?[{id:"team-access", label:"Team & access"}]:[]),
    ...(isHR?[{id:"locations", label:"Locations"}]:[]),
    {id:"branding", label:"Branding & letters"},
    ...(isHR?[{id:"portal-access", label:"Portal access"}]:[]),
    // Phase 6.5 hardening (Prompt 14, Family 1 Part 6) — bulk CSV
    // import/export of full employee records (including probation dates
    // and other sensitive HRIS fields) plus bulk case-history import is an
    // HR-only write surface at the DB layer (employee_records' write
    // policy, cases created via caseCsv import) even though read access to
    // employee_records itself stays org-wide elsewhere in the app. Found
    // during the same Part 6 UI/DB coordination audit as Organisation/
    // Onboarding/Offboarding.
    ...(isHR?[{id:"employee-records", label:"Employee data"}]:[]),
    {id:"policies", label:"Policies"},
    ...(isHR?[{id:"process-templates", label:"Process templates"}]:[]),
    {id:"integrations", label:"Integrations"},
    // Client IA cleanup — "Integration health" folded into Integrations
    // itself (see IntegrationsSection.jsx): it was four read-only rows
    // duplicating the four OAuth integrations already listed there, with
    // no functionality of its own beyond a status badge. Same
    // summarizeIntegrationHealth data, now shown contextually against
    // each connected integration instead of as a separate destination.
    {id:"notifications", label:"Notifications"},
    ...(isHR?[{id:"automations", label:"Automations"}]:[]),
    {id:"audit-trail", label:"Audit trail"},
    {id:"data-privacy", label:"Data & privacy"},
    {id:"help", label:"Help"},
  ];
  // Client IA cleanup — presentation-only grouping for SettingsNav's own
  // optional `groups` prop, reorganised around the mental model an HR
  // admin actually thinks in (Organisation / People & access / Compass
  // setup / Security & data / Support) rather than the previous
  // implementation-flavoured "Processes" + "Integrations & automation"
  // split. Every id/label/route/isHR-gate above is completely untouched —
  // this only says which category header each already-existing section
  // renders under. "Support" is new only as a group *label* (Help already
  // existed as an ungrouped section before this pass; it silently had no
  // header at all — see SettingsNav's own ungrouped-fallback rendering).
  const SETTINGS_GROUPS = [
    { label: "Organisation", sectionIds: ["organisation", "locations", "branding"] },
    { label: "People & access", sectionIds: ["team-access", "portal-access", "employee-records"] },
    { label: "Compass setup", sectionIds: ["policies", "process-templates", "integrations", "notifications", "automations"] },
    { label: "Security & data", sectionIds: ["audit-trail", "data-privacy"] },
    { label: "Support", sectionIds: ["help"] },
  ];
  // Lets a deep link (Home's "Suggested for you" / "View all policies &
  // templates") land directly on the relevant section instead of always
  // the default. Cleared on unmount so a later, ordinary nav-bar click
  // into Settings still lands on the default rather than getting stuck
  // wherever the last deep link pointed.
  // Client IA cleanup — default is now sections[0], which is "Organisation"
  // for an HR user (a sensible overview, not billing or an arbitrary
  // technical page) and the first surviving non-gated section for a
  // non-HR user — never hardcoded to a specific id here, so it can't
  // drift out of sync with the isHR gates above.
  const [active, setActive] = useState(initialSection || sections[0]?.id);
  // Deliberately runs only on unmount, not whenever clearInitialSection
  // changes identity — this should fire exactly once, when the user
  // leaves Settings, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => clearInitialSection?.(), []);

  return(
    // Settings shell geometry — fixes a horizontal jump between sections.
    // This div is a direct flex-item child of App.jsx's content column
    // (display:flex, flexDirection:"column", no explicit alignItems, so
    // the default is stretch). A flex item's own auto side-margins
    // disable that default stretch per the flexbox spec, so without an
    // explicit width this div fell back to shrink-to-fit sizing (capped
    // by maxWidth, but never filling up to it) — its rendered width, and
    // therefore its centred left/right position, tracked whichever
    // section's Card content happened to be narrower or wider. width:
    // "100%" gives it a definite size again, so maxWidth/margin:auto
    // resolve to the same fixed, centred box for every section.
    <div style={{width:"100%",maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"40px 28px"}}>
      {/* Phase 2B — demoted from the editorial identity heading treatment
          (serif, purple) to the plain PageHeader every other non-
          identity screen uses (Compass Design Vision §5): Settings is
          deliberately secondary to the case-management product, not
          another hero screen. Routes/permissions/sections below are
          completely unchanged. */}
      <PageHeader title="Settings" subtitle="Case files and employee records are stored securely in the cloud, shared with your organisation."/>

      <div style={{display:"flex",gap:32,alignItems:"flex-start"}}>
        <SettingsNav sections={sections} active={active} onChange={setActive} isMobile={isMobile} groups={SETTINGS_GROUPS}/>

        <div style={{flex:1,minWidth:0}}>
          {active==="billing"&&<BillingSection org={org.org} locations={org.locations} showToast={showToast}/>}
          {active==="team-access"&&<TeamAccessSection isHR={isHR} org={org.org} locations={org.locations} teamMembers={team.teamMembers} editingMember={team.editingMember} setEditingMember={team.setEditingMember} removeMember={team.removeMember} updateMemberRole={team.updateMemberRole} assignLocations={team.assignLocations} inviteForm={team.inviteForm} setInviteForm={team.setInviteForm} inviting={team.inviting} inviteMember={team.inviteMember}/>}
          {active==="organisation"&&isHR&&<OrganisationSection org={org.org} orgRoles={org.orgRoles} loadOrgRoles={org.loadOrgRoles} orgMembers={org.orgMembers} loadOrgMembers={org.loadOrgMembers} showToast={showToast}/>}
          {active==="locations"&&<LocationsSection isHR={isHR} locations={org.locations} deleteLocation={org.deleteLocation} addLocation={org.addLocation}/>}
          {active==="portal-access"&&<PortalAccessSection isHR={isHR} portalAccounts={portal.portalAccounts} revokePortalAccess={portal.revokePortalAccess}/>}
          {active==="employee-records"&&isHR&&<EmployeeRecordsSection employeeCsvFileRef={employeeData.employeeCsvFileRef} employeeCsvProcessing={employeeData.employeeCsvProcessing} handleEmployeeCsvImport={employeeData.handleEmployeeCsvImport} exportEmployeesCsv={employeeData.exportEmployeesCsv} caseCsvFileRef={employeeData.caseCsvFileRef} caseCsvProcessing={employeeData.caseCsvProcessing} handleCaseCsvImport={employeeData.handleCaseCsvImport} downloadCaseCsvTemplate={employeeData.downloadCaseCsvTemplate}/>}
          {/* Phase 6.5 hardening — signature/letterhead/word-template/policy
              removal are real tenant data, so these two sections get the
              org-scoped orgLsSet (passed in as the "lsSet" prop name their
              own code already expects) rather than the plain global lsSet
              DataPrivacySection below still legitimately uses for the
              non-sensitive, deliberately-global compass_gdpr flag. */}
          {active==="branding"&&<BrandingSection wordTemplate={branding.wordTemplate} setWordTemplate={branding.setWordTemplate} lsSet={branding.orgLsSet} wordTemplateRef={branding.wordTemplateRef} handleWordTemplateUpload={branding.handleWordTemplateUpload} letterhead={branding.letterhead} setLetterhead={branding.setLetterhead} letterheadRef={branding.letterheadRef} handleLetterheadUpload={branding.handleLetterheadUpload} signature={branding.signature} setSignature={branding.setSignature} setShowSigPad={branding.setShowSigPad}/>}
          {active==="policies"&&<PoliciesSection policies={policies.policies} setPolicies={policies.setPolicies} policyFileRef={policies.policyFileRef} handlePolicyUpload={policies.handlePolicyUpload} policyProcessing={policies.policyProcessing} lsSet={branding.orgLsSet} changePolicyCategory={policies.changePolicyCategory}/>}
          {active==="process-templates"&&<ProcessTemplatesSection processTemplates={templates.processTemplates} saveProcessTemplate={templates.saveProcessTemplate}/>}
          {active==="integrations"&&<IntegrationsSection isHR={isHR} mailConnected={integrations.mailConnected} mailboxEmail={integrations.mailboxEmail} onConnectMail={integrations.onConnectMail} onDisconnectMail={integrations.onDisconnectMail} gmailConnected={integrations.gmailConnected} gmailboxEmail={integrations.gmailboxEmail} connectGmail={integrations.connectGmail} disconnectGmail={integrations.disconnectGmail} calendarConnected={integrations.calendarConnected} connectGoogleCalendar={integrations.connectGoogleCalendar} disconnectGoogleCalendar={integrations.disconnectGoogleCalendar} ms365CalendarConnected={integrations.ms365CalendarConnected} connectMs365Calendar={integrations.connectMs365Calendar} disconnectMs365Calendar={integrations.disconnectMs365Calendar} orgWebhookUrl={integrations.orgWebhookUrl} orgWebhookType={integrations.orgWebhookType} integrationEvents={integrations.integrationEvents} onManageNotifications={()=>setActive("notifications")}/>}
          {active==="notifications"&&<NotificationsSection dueSoon={notifications.dueSoon} caseTasks={notifications.caseTasks} createCaseTask={notifications.createCaseTask} requestNotifications={notifications.requestNotifications} notifGranted={notifications.notifGranted} emailDigestOptIn={notifications.emailDigestOptIn} toggleEmailDigest={notifications.toggleEmailDigest} orgWebhookUrl={integrations.orgWebhookUrl} orgWebhookType={integrations.orgWebhookType} saveOrgWebhook={integrations.saveOrgWebhook} sendTestWebhook={integrations.sendTestWebhook}/>}
          {active==="automations"&&isHR&&<AutomationsSection automationLevels={automation.automationLevels} saveAutomationLevel={automation.saveAutomationLevel}/>}
          {active==="audit-trail"&&<AuditTrailSection auditLog={auditLog}/>}
          {active==="data-privacy"&&<DataPrivacySection isHR={isHR} exportCSV={dataPrivacy.exportCSV} exportPDF={dataPrivacy.exportPDF} cases={dataPrivacy.cases} policies={policies.policies} auditLog={auditLog} exportAllData={dataPrivacy.exportAllData} deleteAllData={dataPrivacy.deleteAllData} setGdprAccepted={dataPrivacy.setGdprAccepted} setShowGdpr={dataPrivacy.setShowGdpr} lsSet={lsSet} dataRetentionYears={dataPrivacy.dataRetentionYears} saveDataRetentionYears={dataPrivacy.saveDataRetentionYears} ukJurisdiction={dataPrivacy.ukJurisdiction} saveUkJurisdiction={dataPrivacy.saveUkJurisdiction}/>}
          {active==="help"&&<HelpSection setOnboardStep={onboarding.setOnboardStep} setShowOnboard={onboarding.setShowOnboard}/>}

          <div style={{marginTop:24}}>
            <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
