import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsScreen } from '../screens/SettingsScreen.jsx';

// Phase 6.5 hardening (Batch 10b, task #205) — SettingsScreen had zero test
// coverage before this. Smoke test: render once per section id (via
// initialSection, same deep-link mechanism Home's own "Suggested for you"
// uses), assert one stable string unique to that section. Written first
// against the pre-refactor flat 99-prop API to lock in baseline behaviour,
// then reshaped into the grouped API below once SettingsScreen.jsx itself
// was bundled into 12 groups — this file verifies the refactor, not the
// other way around.
const noop = () => {};
const baseProps = {
  isHR: true, isMobile: false, initialSection: null, clearInitialSection: noop, setScreen: noop,
  showToast: noop, auditLog: [], lsSet: noop,
  org: { org: { id: 'o1' }, locations: [], deleteLocation: noop, addLocation: noop, orgRoles: [], loadOrgRoles: noop, orgMembers: [], loadOrgMembers: noop },
  team: { teamMembers: [], editingMember: null, setEditingMember: noop, removeMember: noop, updateMemberRole: noop, assignLocations: noop, inviteForm: { name: '', email: '', role: 'manager', locationIds: [] }, setInviteForm: noop, inviting: false, inviteMember: noop },
  portal: { portalAccounts: [], revokePortalAccess: noop },
  employeeData: { employeeCsvFileRef: { current: null }, employeeCsvProcessing: false, handleEmployeeCsvImport: noop, exportEmployeesCsv: noop, caseCsvFileRef: { current: null }, caseCsvProcessing: false, handleCaseCsvImport: noop, downloadCaseCsvTemplate: noop },
  branding: { wordTemplate: null, setWordTemplate: noop, orgLsSet: noop, wordTemplateRef: { current: null }, handleWordTemplateUpload: noop, letterhead: null, setLetterhead: noop, letterheadRef: { current: null }, handleLetterheadUpload: noop, signature: null, setSignature: noop, setShowSigPad: noop },
  policies: { policies: [], setPolicies: noop, policyFileRef: { current: null }, handlePolicyUpload: noop, policyProcessing: false, changePolicyCategory: noop },
  templates: { starterTemplates: [], saveStarterTemplates: noop, leaverTemplates: [], saveLeaverTemplates: noop, processTemplates: [], saveProcessTemplate: noop, promptDialog: noop, confirmDialog: noop },
  integrations: { mailConnected: false, mailboxEmail: '', onConnectMail: noop, onDisconnectMail: noop, gmailConnected: false, gmailboxEmail: '', connectGmail: noop, disconnectGmail: noop, calendarConnected: false, connectGoogleCalendar: noop, disconnectGoogleCalendar: noop, ms365CalendarConnected: false, connectMs365Calendar: noop, disconnectMs365Calendar: noop, integrationEvents: [], orgWebhookUrl: '', orgWebhookType: '', saveOrgWebhook: noop, sendTestWebhook: noop },
  notifications: { dueSoon: [], caseTasks: [], createCaseTask: noop, requestNotifications: noop, notifGranted: false, emailDigestOptIn: false, toggleEmailDigest: noop },
  automation: { automationLevels: {}, saveAutomationLevel: noop },
  dataPrivacy: { exportCSV: noop, exportPDF: noop, cases: [], exportAllData: noop, deleteAllData: noop, setGdprAccepted: noop, setShowGdpr: noop },
  onboarding: { setOnboardStep: noop, setShowOnboard: noop },
};

// Assertion text is deliberately body copy, not each section's own
// heading — SettingsNav renders every section's label as a nav button
// too (e.g. "Billing", "Locations", "Integrations"), so asserting on the
// heading text alone matches two elements once the nav renders alongside
// the active section.
const sections = [
  ['billing', 'Manage subscription'],
  ['team-access', 'Team members'],
  ['organisation', 'Job titles & access levels'],
  ['locations', 'No locations added yet'],
  ['portal-access', 'Employee Portal access'],
  ['employee-records', 'Employee records'],
  ['branding', 'Word letter template'],
  ['policies', 'Company policies'],
  ['process-templates', /Define required documents, suggested meetings/],
  ['integrations', /Connect the systems your organisation already uses/],
  ['integration-health', /Last successful sync and recent failures/],
  ['notifications', 'Deadline reminders'],
  ['automations', 'Chase signature on stale meeting records'],
  ['audit-trail', 'Every action timestamped and logged.'],
  ['data-privacy', 'View privacy notice'],
  ['help', 'Help & onboarding'],
];

describe('SettingsScreen — section smoke test (Phase 6.5, task #205)', () => {
  for (const [id, expectedText] of sections) {
    it(`renders the ${id} section`, () => {
      render(<SettingsScreen {...baseProps} initialSection={id} />);
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });
  }
});

// Phase 7.5B (P0 polish, item 8) — grouping is presentation only: every
// section from the smoke test above must still be reachable as a nav
// button, under a real category header, with routes/behaviour untouched
// (already proven per-section above; this proves none of them silently
// vanished from the nav once grouped).
describe('SettingsScreen — grouped navigation (Phase 7.5B, item 8)', () => {
  it('shows category headers and every section as a still-clickable nav button', () => {
    render(<SettingsScreen {...baseProps} />);
    // getAllByText, not getByText: "Organisation" is both a category
    // header and its own section's nav-button label, so it's expected
    // to match twice.
    for (const label of ['Organisation', 'People & access', 'Processes', 'Integrations & automation', 'Governance & data']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const name of ['Billing', 'Team & access', 'Locations', 'Policies', 'Integrations', 'Notifications', 'Audit trail', 'Data & privacy', 'Help']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('still navigates to the correct section when a grouped nav button is clicked', () => {
    render(<SettingsScreen {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Locations' }));
    expect(screen.getByText('No locations added yet')).toBeInTheDocument();
  });
});
