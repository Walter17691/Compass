import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
// Client IA cleanup — "billing" removed from the reachable-via-nav list
// (it's no longer in `sections` for any user); "integration-health"
// removed as a distinct section (folded into "integrations" itself, see
// IntegrationsSection.test.jsx's own health-badge coverage).
const sections = [
  ['team-access', 'Team members'],
  ['organisation', 'Job titles & access levels'],
  ['locations', 'No locations added yet'],
  ['portal-access', 'Employee Portal access'],
  ['employee-records', 'Employee records'],
  ['branding', 'Word letter template'],
  ['policies', 'Company policies'],
  ['process-templates', /Define required documents, suggested meetings/],
  ['integrations', /Connect the systems your organisation already uses/],
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

// Client IA cleanup, §1 — Billing removed from Settings navigation
// entirely, for every user, not just non-HR. BillingSection itself and
// every /api/billing/* endpoint are untouched (confirmed: nothing in
// App.jsx gates app usage on billing status, so removing the nav entry
// doesn't block any required account functionality) — this only proves
// the nav no longer exposes it.
describe('SettingsScreen — Billing removed from navigation (Client IA cleanup, §1)', () => {
  it('never shows Billing in the nav, for an HR user or otherwise', () => {
    const { unmount } = render(<SettingsScreen {...baseProps} isHR={true} />);
    expect(screen.queryByRole('button', { name: 'Billing' })).not.toBeInTheDocument();
    unmount();
    render(<SettingsScreen {...baseProps} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'Billing' })).not.toBeInTheDocument();
  });

  it('never lands on Billing by default for any user', () => {
    render(<SettingsScreen {...baseProps} isHR={true} initialSection={null} />);
    expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();
  });

  it('falls back to the first available section, not a blank pane, when a non-HR user has no initialSection', () => {
    render(<SettingsScreen {...baseProps} isHR={false} initialSection={null} />);
    expect(screen.getByText('Word letter template')).toBeInTheDocument();
  });

  it('defaults an HR user to Organisation — a sensible overview, not an arbitrary technical page', () => {
    render(<SettingsScreen {...baseProps} isHR={true} initialSection={null} />);
    expect(screen.getByText('Job titles & access levels')).toBeInTheDocument();
  });

  // BillingSection/the "billing" render branch are deliberately still
  // present in SettingsScreen.jsx's code (not deleted) — this proves the
  // component still renders correctly if something reaches it via the
  // same initialSection deep-link mechanism every other section uses,
  // even though no in-app caller currently sets it to "billing".
  it('still renders BillingSection correctly if reached via a direct deep link', () => {
    render(<SettingsScreen {...baseProps} initialSection="billing" />);
    expect(screen.getByText('Manage subscription')).toBeInTheDocument();
  });
});

// Client IA cleanup, §2 — grouping reorganised around Organisation /
// People & access / Compass setup / Security & data / Support. Every
// section from the smoke test above must still be reachable as a nav
// button, under a real category header, with routes/behaviour untouched
// (already proven per-section above; this proves none of them silently
// vanished from the nav once regrouped).
describe('SettingsScreen — grouped navigation (Client IA cleanup, §2)', () => {
  it('shows the new category headers and every section as a still-clickable nav button', () => {
    render(<SettingsScreen {...baseProps} />);
    // getAllByText, not getByText: "Organisation" is both a category
    // header and its own section's nav-button label, so it's expected
    // to match twice.
    for (const label of ['Organisation', 'People & access', 'Compass setup', 'Security & data', 'Support']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const name of ['Team & access', 'Locations', 'Policies', 'Integrations', 'Notifications', 'Automations', 'Audit trail', 'Data & privacy', 'Help']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('does not show the old implementation-flavoured group labels', () => {
    render(<SettingsScreen {...baseProps} />);
    expect(screen.queryByText('Processes')).not.toBeInTheDocument();
    expect(screen.queryByText('Integrations & automation')).not.toBeInTheDocument();
    expect(screen.queryByText('Governance & data')).not.toBeInTheDocument();
  });

  it('groups Policies, Process templates, Integrations, Notifications and Automations together under "Compass setup"', () => {
    render(<SettingsScreen {...baseProps} />);
    const compassSetupHeader = screen.getByText('Compass setup');
    const group = compassSetupHeader.parentElement;
    for (const name of ['Policies', 'Process templates', 'Integrations', 'Notifications', 'Automations']) {
      expect(within(group).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('still navigates to the correct section when a grouped nav button is clicked', () => {
    render(<SettingsScreen {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Locations' }));
    expect(screen.getByText('No locations added yet')).toBeInTheDocument();
  });
});
