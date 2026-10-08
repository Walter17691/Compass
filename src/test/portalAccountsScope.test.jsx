import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { isHrRole } from '../lib/roles.js';
import { PortalAccessSection } from '../screens/settings/PortalAccessSection.jsx';

// ─────────────────────────────────────────────────────────────────────────
// PORTAL ACCOUNTS ARE HR-ONLY, ON BOTH SIDES OF THE REQUEST.
//
// IR-REPORT-01a browser UAT, as a real assigned investigator (org role
// line_manager), surfaced a red "Couldn't load portal accounts" banner and
// four console errors on every page load. The 403 was CORRECT —
// /api/portal/accounts calls requireOrgRole(..., isHrRole) because
// employee_portal_accounts has no client-facing RLS. The bug was that the
// client asked at all, for a feature that user cannot reach.
//
// The server side of this boundary is covered in api/portal/_accounts.test.js.
// This file covers the client side: the predicate that gates the load, and
// the only consumer of the resulting state — proving that withholding the
// fetch from non-HR breaks no UI, because that UI was never theirs.
// ─────────────────────────────────────────────────────────────────────────

describe('the role predicate that gates the portal-accounts load', () => {
  it('admits exactly the two HR roles', () => {
    expect(isHrRole('hr_manager')).toBe(true);
    expect(isHrRole('hr_director')).toBe(true);
  });

  it('excludes every non-HR org role, including the investigator\'s', () => {
    // line_manager is the org role an assigned investigator actually holds —
    // the exact case that produced the banner in UAT.
    ['line_manager', 'location_manager', 'investigator', 'disciplinary_officer', '', null, undefined]
      .forEach(role => expect(isHrRole(role)).toBe(false));
  });
});

describe('the only consumer of portalAccounts state', () => {
  it('renders nothing at all for a non-HR viewer, so withholding the data breaks no UI', () => {
    const { container } = render(
      <PortalAccessSection isHR={false} portalAccounts={[]} revokePortalAccess={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders nothing for a non-HR viewer even if rows were somehow supplied', () => {
    // Defence in depth: the component refuses on role, not on emptiness, so a
    // future caller that forgot the gate cannot leak rows through it.
    const { container } = render(
      <PortalAccessSection isHR={false}
        portalAccounts={[{ id: 'a1', employee_name: 'Jordan Ellis', created_at: '2026-10-01' }]}
        revokePortalAccess={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toContain('Jordan Ellis');
  });

  it('shows HR the empty state without error when there are no accounts', () => {
    render(<PortalAccessSection isHR={true} portalAccounts={[]} revokePortalAccess={vi.fn()} />);
    expect(screen.getByText('No employees have Portal access yet')).toBeInTheDocument();
  });

  it('shows HR the accounts it was given, with a revoke control', () => {
    render(
      <PortalAccessSection isHR={true}
        portalAccounts={[{ id: 'a1', employee_name: 'Jordan Ellis', created_at: '2026-10-01' }]}
        revokePortalAccess={vi.fn()} />
    );
    expect(screen.getByText('Jordan Ellis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeInTheDocument();
  });

  it('calls revoke with the account id, not the employee name', () => {
    const revokePortalAccess = vi.fn();
    render(
      <PortalAccessSection isHR={true}
        portalAccounts={[{ id: 'acc-1', employee_name: 'Jordan Ellis', created_at: '2026-10-01' }]}
        revokePortalAccess={revokePortalAccess} />
    );
    screen.getByRole('button', { name: 'Revoke access' }).click();
    expect(revokePortalAccess).toHaveBeenCalledWith('acc-1', 'Jordan Ellis');
  });
});
