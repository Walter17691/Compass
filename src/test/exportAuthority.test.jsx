import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';

import {
  mayExportOrganisationData, ORG_EXPORT_ROLE, ORG_EXPORT_REFUSAL,
} from '../lib/exportAuthority.js';
import { ROLES, isHrRole } from '../lib/roles.js';
import { DataPrivacySection } from '../screens/settings/DataPrivacySection.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// WHO MAY EXPORT WHOLE-ORGANISATION DATA — adversarial tests.
//
// THE DEFECT. Settings → "Export all data" emitted 25 collections — every case
// with its meetings, transcripts and HR advisor notes, raw allegations through
// all nine free-text fields, wellbeing notes, concern referrals, employee
// records, the audit trail, every DSAR row — from a button with no permission
// check at all, and from a function with no check either.
//
// It was easy to miss because DataPrivacySection closes three `{isHR && (`
// wrappers and then opens a FOURTH, ungated card. "Export all data" is in that
// fourth card. The two export buttons immediately above it ARE HR-gated, so the
// pane reads as gated at a glance. Its destructive twin in the same ungated
// card — "Delete all data" — is safe, because it is enforced server-side
// (api/delete-org-data.js refuses anyone who is not hr_director).
//
// These tests check the predicate over the WHOLE role vocabulary, not two
// examples, and check that the enforcement is in the function rather than only
// in the rendering.
// ═══════════════════════════════════════════════════════════════════════════

describe('the org-export predicate, over every role that exists', () => {
  it('admits ONLY hr_director', () => {
    const admitted = ROLES.map(r => r.id).filter(role => mayExportOrganisationData({ role }));
    expect(admitted).toEqual(['hr_director']);
  });

  it('matches the role the destructive twin already requires', () => {
    // api/delete-org-data.js:89 — `if (callerMember.role !== 'hr_director')`.
    // Asserted as behaviour against the server source, so the two cannot drift.
    const server = readFileSync('api/delete-org-data.js', 'utf8');
    expect(server).toContain("callerMember.role !== 'hr_director'");
    expect(ORG_EXPORT_ROLE).toBe('hr_director');
  });

  it('is STRICTER than isHR — an HR manager may not export everything', () => {
    // The deliberate asymmetry: Export CSV/PDF emit truncated extracts and are
    // isHR-gated; this emits everything raw.
    expect(isHrRole('hr_manager')).toBe(true);
    expect(mayExportOrganisationData({ role: 'hr_manager' })).toBe(false);
  });

  it('refuses every ordinary member role', () => {
    for (const role of ['line_manager', 'location_manager', 'investigator', 'legal_reviewer', 'auditor']) {
      expect(mayExportOrganisationData({ role }), role).toBe(false);
    }
  });

  it('refuses absent, empty and malformed roles rather than defaulting open', () => {
    for (const role of [undefined, null, '', ' ', 'HR_DIRECTOR', 'hr_director ', 0, 1, true, {}, []]) {
      expect(mayExportOrganisationData({ role }), String(role)).toBe(false);
    }
    expect(mayExportOrganisationData()).toBe(false);
    expect(mayExportOrganisationData({})).toBe(false);
  });

  it('cannot be satisfied by a role-like object', () => {
    expect(mayExportOrganisationData({ role: { toString: () => 'hr_director' } })).toBe(false);
  });

  it('names the authorised role in its refusal, so a blocked user knows who to ask', () => {
    expect(ORG_EXPORT_REFUSAL).toMatch(/HR Director/);
  });
});

describe('enforcement is in the function, not the rendering', () => {
  const src = () => readFileSync('src/App.jsx', 'utf8');

  it('exportAllData checks authority BEFORE it fetches or assembles anything', () => {
    const s = src();
    const start = s.indexOf('const exportAllData = async () => {');
    expect(start, 'exportAllData moved').toBeGreaterThan(-1);
    const body = s.slice(start, s.indexOf('audit("Data exported (GDPR)"', start));
    const guard = body.indexOf('mayExportOrganisationData');
    const firstFetch = body.indexOf('authedFetch');
    const blob = body.indexOf('new Blob');
    expect(guard, 'no authority check in exportAllData').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstFetch === -1 ? Number.MAX_SAFE_INTEGER : firstFetch);
    expect(guard).toBeLessThan(blob === -1 ? Number.MAX_SAFE_INTEGER : blob);
  });

  it('records a refused attempt, so an attempt is not invisible', () => {
    const s = src();
    const start = s.indexOf('const exportAllData = async () => {');
    const body = s.slice(start, start + 1200);
    expect(body).toContain('Organisation data export refused');
  });

  it('the roster CSV export is gated too — it was the other ungated path', () => {
    const s = src();
    const start = s.indexOf('const exportEmployeesCsv = () => {');
    expect(start).toBeGreaterThan(-1);
    const body = s.slice(start, start + 400);
    expect(body).toContain('if (!isHR)');
  });

  it('the bulk case export is gated in its own function, not only on its button', () => {
    const s = readFileSync('src/screens/CasesScreen.jsx', 'utf8');
    const start = s.indexOf('const bulkExport = () => {');
    expect(start).toBeGreaterThan(-1);
    // wide enough to contain the whole function body including the download
    const body = s.slice(start, start + 1200);
    expect(body).toContain('if (!isHR)');
    const guard = body.indexOf('if (!isHR)');
    const download = body.indexOf('downloadJson');
    expect(download, 'downloadJson not found in the slice — widen the window').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(download);
  });
});

describe('ADVERSARIAL — an ordinary member cannot reach the org export control', () => {
  const baseProps = {
    exportCSV: vi.fn(), exportPDF: vi.fn(), exportAllData: vi.fn(), deleteAllData: vi.fn(),
    cases: [], policies: [], auditLog: [],
    setGdprAccepted: vi.fn(), setShowGdpr: vi.fn(), lsSet: vi.fn(),
    dataRetentionYears: 6, saveDataRetentionYears: vi.fn(),
    ukJurisdiction: 'england-wales', saveUkJurisdiction: vi.fn(),
  };

  it('does not offer "Export all data" to a non-HR member', () => {
    render(<DataPrivacySection {...baseProps} isHR={false} mayExportOrgData={false} />);
    expect(screen.queryByRole('button', { name: 'Export all data' })).not.toBeInTheDocument();
  });

  it('does not offer it to an HR MANAGER either', () => {
    // isHR true, org-export authority false — the case the old gate would have
    // allowed had it simply been wrapped in {isHR && ...}.
    render(<DataPrivacySection {...baseProps} isHR={true} mayExportOrgData={false} />);
    expect(screen.queryByRole('button', { name: 'Export all data' })).not.toBeInTheDocument();
  });

  it('DOES offer it to an HR Director, so the capability is not lost', () => {
    render(<DataPrivacySection {...baseProps} isHR={true} mayExportOrgData={true} />);
    expect(screen.getByRole('button', { name: 'Export all data' })).toBeInTheDocument();
  });

  it('still shows everyone the privacy notice in the same card', () => {
    // The card is deliberately not HR-wrapped; proving this stops a future fix
    // from gating the whole card and hiding the privacy notice from staff.
    render(<DataPrivacySection {...baseProps} isHR={false} mayExportOrgData={false} />);
    expect(screen.getByRole('button', { name: 'View privacy notice' })).toBeInTheDocument();
  });

  it('still shows the HR-only extracts only to HR', () => {
    const { unmount } = render(<DataPrivacySection {...baseProps} isHR={false} mayExportOrgData={false} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    unmount();
    render(<DataPrivacySection {...baseProps} isHR={true} mayExportOrgData={false} />);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('a non-HR member clicking a rendered button still cannot export — the handler refuses', async () => {
    // Simulates the DOM-tampering case: the button is forced into the tree.
    // mayExportOrganisationData is the real predicate, so this asserts the
    // decision the handler makes, not the markup.
    const user = userEvent.setup();
    const exportAllData = vi.fn(() => {
      if (!mayExportOrganisationData({ role: 'line_manager' })) return 'refused';
      return 'exported';
    });
    render(<DataPrivacySection {...baseProps} exportAllData={exportAllData} isHR mayExportOrgData />);
    await user.click(screen.getByRole('button', { name: 'Export all data' }));
    expect(exportAllData).toHaveBeenCalled();
    expect(exportAllData.mock.results[0].value).toBe('refused');
  });
});

describe('the server boundary that already existed', () => {
  it('the one server call inside the export is role-gated at the route', () => {
    // Deliberately predicate-AGNOSTIC. Slice B (this file) only needs to know
    // that the export's single server call is gated at the route at all; WHICH
    // role it demands is Slice E's decision, asserted in
    // src/test/dsarAuthority.test.jsx under '[API] the server layers'.
    // Naming mayAdministerDsar here would make this file depend on a later
    // slice and stop the export restriction being deployable on its own.
    const s = readFileSync('api/portal/_dsar-lookup.js', 'utf8');
    expect(s).toContain('requireOrgRole(req, res, orgId,');
    // and the export really does route through it
    expect(readFileSync('src/App.jsx', 'utf8')).toContain('/api/portal/dsar-lookup');
  });
});
