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
export function SettingsScreen({ isHR, showToast, exportCSV, exportPDF, org, locations, deleteLocation, addLocation, teamMembers, editingMember, setEditingMember, removeMember, updateMemberRole, assignLocations, inviteForm, setInviteForm, inviting, inviteMember, wordTemplate, setWordTemplate, lsSet, wordTemplateRef, handleWordTemplateUpload, letterhead, setLetterhead, letterheadRef, handleLetterheadUpload, signature, setSignature, setShowSigPad, policies, setPolicies, policyFileRef, handlePolicyUpload, policyProcessing, changePolicyCategory, starterTemplates, saveStarterTemplates, leaverTemplates, saveLeaverTemplates, processTemplates, saveProcessTemplate, promptDialog, confirmDialog, dueSoon, caseTasks, createCaseTask, requestNotifications, notifGranted, emailDigestOptIn, toggleEmailDigest, orgWebhookUrl, orgWebhookType, saveOrgWebhook, sendTestWebhook, employeeCsvFileRef, employeeCsvProcessing, handleEmployeeCsvImport, exportEmployeesCsv, caseCsvFileRef, caseCsvProcessing, handleCaseCsvImport, downloadCaseCsvTemplate, auditLog, cases, exportAllData, deleteAllData, setGdprAccepted, setShowGdpr, setOnboardStep, setShowOnboard, setScreen, portalAccounts, revokePortalAccess, orgRoles, loadOrgRoles, orgMembers, loadOrgMembers, isMobile, initialSection, clearInitialSection, mailConnected, mailboxEmail, onConnectMail, onDisconnectMail, calendarConnected, connectGoogleCalendar, disconnectGoogleCalendar }) {
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
    {id:"notifications", label:"Notifications"},
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
          {active==="billing"&&<BillingSection org={org} locations={locations} showToast={showToast}/>}
          {active==="team-access"&&<TeamAccessSection isHR={isHR} org={org} locations={locations} teamMembers={teamMembers} editingMember={editingMember} setEditingMember={setEditingMember} removeMember={removeMember} updateMemberRole={updateMemberRole} assignLocations={assignLocations} inviteForm={inviteForm} setInviteForm={setInviteForm} inviting={inviting} inviteMember={inviteMember}/>}
          {active==="organisation"&&<OrganisationSection org={org} orgRoles={orgRoles} loadOrgRoles={loadOrgRoles} orgMembers={orgMembers} loadOrgMembers={loadOrgMembers} showToast={showToast}/>}
          {active==="locations"&&<LocationsSection isHR={isHR} locations={locations} deleteLocation={deleteLocation} addLocation={addLocation}/>}
          {active==="portal-access"&&<PortalAccessSection isHR={isHR} portalAccounts={portalAccounts} revokePortalAccess={revokePortalAccess}/>}
          {active==="employee-records"&&<EmployeeRecordsSection employeeCsvFileRef={employeeCsvFileRef} employeeCsvProcessing={employeeCsvProcessing} handleEmployeeCsvImport={handleEmployeeCsvImport} exportEmployeesCsv={exportEmployeesCsv} caseCsvFileRef={caseCsvFileRef} caseCsvProcessing={caseCsvProcessing} handleCaseCsvImport={handleCaseCsvImport} downloadCaseCsvTemplate={downloadCaseCsvTemplate}/>}
          {active==="branding"&&<BrandingSection wordTemplate={wordTemplate} setWordTemplate={setWordTemplate} lsSet={lsSet} wordTemplateRef={wordTemplateRef} handleWordTemplateUpload={handleWordTemplateUpload} letterhead={letterhead} setLetterhead={setLetterhead} letterheadRef={letterheadRef} handleLetterheadUpload={handleLetterheadUpload} signature={signature} setSignature={setSignature} setShowSigPad={setShowSigPad}/>}
          {active==="policies"&&<PoliciesSection policies={policies} setPolicies={setPolicies} policyFileRef={policyFileRef} handlePolicyUpload={handlePolicyUpload} policyProcessing={policyProcessing} lsSet={lsSet} changePolicyCategory={changePolicyCategory}/>}
          {active==="process-templates"&&<ProcessTemplatesSection processTemplates={processTemplates} saveProcessTemplate={saveProcessTemplate}/>}
          {active==="templates"&&<TemplatesSection starterTemplates={starterTemplates} saveStarterTemplates={saveStarterTemplates} leaverTemplates={leaverTemplates} saveLeaverTemplates={saveLeaverTemplates} promptDialog={promptDialog} confirmDialog={confirmDialog}/>}
          {active==="integrations"&&<IntegrationsSection mailConnected={mailConnected} mailboxEmail={mailboxEmail} onConnectMail={onConnectMail} onDisconnectMail={onDisconnectMail} calendarConnected={calendarConnected} connectGoogleCalendar={connectGoogleCalendar} disconnectGoogleCalendar={disconnectGoogleCalendar} orgWebhookUrl={orgWebhookUrl} orgWebhookType={orgWebhookType} onManageNotifications={()=>setActive("notifications")}/>}
          {active==="notifications"&&<NotificationsSection dueSoon={dueSoon} caseTasks={caseTasks} createCaseTask={createCaseTask} requestNotifications={requestNotifications} notifGranted={notifGranted} emailDigestOptIn={emailDigestOptIn} toggleEmailDigest={toggleEmailDigest} orgWebhookUrl={orgWebhookUrl} orgWebhookType={orgWebhookType} saveOrgWebhook={saveOrgWebhook} sendTestWebhook={sendTestWebhook}/>}
          {active==="audit-trail"&&<AuditTrailSection auditLog={auditLog}/>}
          {active==="data-privacy"&&<DataPrivacySection isHR={isHR} exportCSV={exportCSV} exportPDF={exportPDF} cases={cases} policies={policies} auditLog={auditLog} exportAllData={exportAllData} deleteAllData={deleteAllData} setGdprAccepted={setGdprAccepted} setShowGdpr={setShowGdpr} lsSet={lsSet}/>}
          {active==="help"&&<HelpSection setOnboardStep={setOnboardStep} setShowOnboard={setShowOnboard}/>}

          <div style={{marginTop:24}}>
            <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
