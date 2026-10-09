import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

import { mayAdministerDsar, DSAR_ADMIN_ROLE, DSAR_ADMIN_REFUSAL } from '../lib/dsarAuthority.js';
import { ROLES, isHrRole } from '../lib/roles.js';
import { isAuthorisedFor } from '../../api/cron/_digest.js';

// ═══════════════════════════════════════════════════════════════════════════
// DSAR ADMINISTRATION IS HR-DIRECTOR ONLY — authority tests.
//
// Compass is employer-facing. Employees do not log in to submit subject access
// requests; requests arrive externally and are registered by an authorised
// internal user. Every DSAR capability is reserved to hr_director: reaching the
// workspace, registering and managing requests, collecting subject data,
// reviewing/redacting/withholding, generating and downloading the package, and
// recording completion.
//
// THE DEFECT. Every DSAR surface was gated on `isHR`, which admits hr_manager
// AND hr_director — so every HR manager could read, create, amend and complete
// every DSAR in the organisation. Worse, the screen had NO gate of its own and
// `?screen=dsar` rendered the full workspace for ANY role, because nothing sat
// between the URL parameter and the component.
//
// FOUR LAYERS, ONE PREDICATE. These tests check each layer and, critically,
// check that the narrowing did NOT spill into the gates DSAR shares with
// unrelated features.
// ═══════════════════════════════════════════════════════════════════════════

const ALL_ROLES = ROLES.map(r => r.id);

describe('the predicate, over every role that exists', () => {
  it('admits ONLY hr_director', () => {
    expect(ALL_ROLES.filter(role => mayAdministerDsar({ role }))).toEqual(['hr_director']);
  });

  it('is STRICTER than isHR — an HR manager is admitted by one and not the other', () => {
    expect(isHrRole('hr_manager')).toBe(true);
    expect(mayAdministerDsar({ role: 'hr_manager' })).toBe(false);
  });

  it('refuses absent, empty, malformed and look-alike roles rather than defaulting open', () => {
    for (const role of [undefined, null, '', ' ', 'HR_DIRECTOR', 'hr_director ', 'hr-director', 0, 1, true, {}, []]) {
      expect(mayAdministerDsar({ role }), String(role)).toBe(false);
    }
    expect(mayAdministerDsar()).toBe(false);
    expect(mayAdministerDsar({})).toBe(false);
    expect(mayAdministerDsar({ role: { toString: () => 'hr_director' } })).toBe(false);
  });

  it('names the role in its refusal, so a blocked user knows who to ask', () => {
    expect(DSAR_ADMIN_REFUSAL).toMatch(/HR Director/);
    expect(DSAR_ADMIN_ROLE).toBe('hr_director');
  });

  it('matches the role the org-wide delete and export already require', () => {
    const server = readFileSync('api/delete-org-data.js', 'utf8');
    expect(server).toContain("callerMember.role !== 'hr_director'");
  });
});

describe('[UI] the client layers', () => {
  const app = () => readFileSync('src/App.jsx', 'utf8');

  it('derives the capability once, from the member role', () => {
    expect(app()).toContain('const canAdministerDsar = mayAdministerDsar({ role: member?.role });');
  });

  it('CLOSES THE DEEP LINK — the capability reaches the screen, which refuses', () => {
    // ?screen=dsar previously rendered the full workspace for any role, because
    // src/App.jsx reads `params.get('screen')` and the render site tested only
    // the screen value.
    //
    // This originally asserted the literal
    //   '{screen===SCREENS.DSAR&&canAdministerDsar&&('
    // which closed the link by rendering NOTHING — a blank content area with no
    // explanation (STAGE2-UX-01). The condition was removed so that DsarScreen's
    // own default-deny guard, which was already written and already placed after
    // every hook, renders a visible refusal instead. The deep link is still
    // closed; it now says so.
    //
    // Asserted as the capability being PASSED, plus the screen's behavioural
    // refusal in src/test/dsarCompletionIntegrity.test.jsx — not as the shape of
    // the JSX, which is what made this assertion brittle in the first place.
    expect(app()).toContain('<DsarScreen canAdministerDsar={canAdministerDsar}');
    // the workspace must never render on the capability being merely truthy-by-default
    expect(readFileSync('src/screens/DsarScreen.jsx', 'utf8')).toContain('canAdministerDsar = false');
  });

  it('guards the data loader in its OWN condition, not the shared isHR block', () => {
    const s = app();
    const start = s.indexOf('const loadDsarRequests = async () => {');
    expect(start).toBeGreaterThan(-1);
    const body = s.slice(start, start + 900);
    expect(body).toContain('if(!canAdministerDsar) return;');
    // the shared block still loads only its own non-DSAR collections
    const shared = s.slice(s.indexOf('if(isHR) { loadPortalAccounts()'), s.indexOf('if(isHR) { loadPortalAccounts()') + 220);
    expect(shared).not.toContain('loadDsarRequests');
  });

  it('enforces in every write FUNCTION, not only where a control renders', () => {
    const s = app();
    for (const fn of ['createDsarRequest', 'updateDsarRequest', 'extendDsarRequest']) {
      const start = s.indexOf(`const ${fn} = async `);
      expect(start, `${fn} moved`).toBeGreaterThan(-1);
      const body = s.slice(start, start + 600);
      expect(body, `${fn} is not guarded`).toContain('if(!canAdministerDsar)');
      expect(body, `${fn} does not record the refusal`).toContain('DSAR action refused');
    }
  });

  it('narrows the nav ITEM and leaves the shared group alone', () => {
    const s = readFileSync('src/components/AppSidebar.jsx', 'utf8');
    // group still isHR — Redundancy and Wellbeing unaffected
    expect(s).toContain('...(isHR ? [{ label:"HR Processes"');
    // item individually gated
    expect(s).toMatch(/canAdministerDsar \? \[\{s:SCREENS\.DSAR/);
    expect(s).toContain('canAdministerDsar = false');
  });

  it('default-denies at the screen, so a forgetful call site cannot open it', () => {
    const s = readFileSync('src/screens/DsarScreen.jsx', 'utf8');
    expect(s).toContain('canAdministerDsar = false');
    expect(s).toContain('if (!canAdministerDsar) {');
  });

  it('places the screen guard AFTER the hooks, not before them', () => {
    // A guard above useState would change the hook count when the prop flips
    // and React would throw "rendered fewer hooks than expected" — a
    // correctness bug introduced by a security fix.
    const s = readFileSync('src/screens/DsarScreen.jsx', 'utf8');
    const firstHook = s.indexOf('useState(');
    const guard = s.indexOf('if (!canAdministerDsar) {');
    expect(firstHook).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(firstHook);
  });
});

describe('[API] the server layers', () => {
  it('the service-role lookup refuses a non-director', () => {
    const s = readFileSync('api/portal/_dsar-lookup.js', 'utf8');
    expect(s).toContain('mayAdministerDsar');
    const code = s.replace(/\/\/[^\n]*/g, ' ');
    expect(code).not.toMatch(/requireOrgRole\(req, res, orgId, isHrRole\)/);
  });

  it('the deadline digest tells only a director that a DSAR exists', () => {
    // Executable, not source-text: the cron runs with the service-role key and
    // bypasses RLS, so its own recipient gate is the only thing standing
    // between an hr_manager and an email naming who has filed a DSAR.
    const dsar = { category: 'dsar', confidential: false, caseId: null };
    expect(isAuthorisedFor(dsar, { user_id: 'd', role: 'hr_director' }, new Map())).toBe(true);
    expect(isAuthorisedFor(dsar, { user_id: 'm', role: 'hr_manager' }, new Map())).toBe(false);
    for (const role of ['line_manager', 'location_manager', 'investigator', 'legal_reviewer', 'auditor']) {
      expect(isAuthorisedFor(dsar, { user_id: 'x', role }, new Map()), role).toBe(false);
    }
  });

  it('does NOT narrow the categories that share that map', () => {
    // The regression signal: wellbeing and redundancy keep is_hr_role.
    for (const category of ['wellbeing', 'redundancy']) {
      const d = { category, confidential: false, caseId: null };
      expect(isAuthorisedFor(d, { user_id: 'm', role: 'hr_manager' }, new Map()), category).toBe(true);
    }
  });
});

describe('[DB] the backstop, and what it must not disturb', () => {
  const MIGRATION = 'supabase/dsar_director_only_authority_2026-10-09.sql';
  const sql = () => readFileSync(MIGRATION, 'utf8');

  it('replaces the is_hr_role policy with an hr_director one', () => {
    const s = sql();
    expect(s).toContain('drop policy if exists "hr staff only can manage dsar requests in their org" on public.dsar_requests;');
    expect(s).toContain('create policy "Only an HR Director may administer subject access requests"');
    expect(s).toMatch(/org_members\.role = 'hr_director'/);
  });

  it('does NOT redefine is_hr_role — 36 policies across 18 tables depend on it', () => {
    const s = sql().replace(/--[^\n]*/g, ' ');
    expect(s).not.toMatch(/create or replace function public\.is_hr_role/i);
    // Scoped to the POLICY PREDICATE. The `comment on policy` text deliberately
    // names is_hr_role to explain what changed, and that mention must not read
    // as live use — the same distinction the earlier _dsar-lookup assertion hit.
    const start = s.indexOf('create policy "Only an HR Director may administer subject access requests"');
    const predicate = s.slice(start, s.indexOf('comment on policy', start));
    expect(predicate).not.toMatch(/is_hr_role/);
    expect(predicate).toMatch(/org_members\.role = 'hr_director'/);
  });

  it('stays a single FOR ALL policy, so the recorded posture count stays true', () => {
    // src/lib/dataClassification.js records dsar_requests as { policies: 1 }.
    // Splitting per command would silently make that measured map wrong.
    const s = sql();
    expect(s).toMatch(/for all/);
    expect((s.match(/create policy/g) || []).length).toBe(1);
  });

  it('touches no other table, policy, trigger or function', () => {
    const s = sql().replace(/--[^\n]*/g, ' ');
    expect(s).not.toMatch(/\bdrop\s+(table|trigger|function|column)\b/i);
    for (const other of ['cases', 'allegations', 'case_access', 'meetings', 'employee_records', 'wellbeing_notes']) {
      expect(s, `must not touch ${other}`).not.toMatch(new RegExp(`(alter|create)[^;]*public\\.${other}\\b`, 'i'));
    }
  });
});

describe('ordinary case and investigation permissions are untouched', () => {
  it('isHrRole itself still admits both HR roles', () => {
    expect(isHrRole('hr_manager')).toBe(true);
    expect(isHrRole('hr_director')).toBe(true);
  });

  it('an HR manager keeps narrative authority on an investigation', async () => {
    // The explicit constraint: do not change investigation permissions in order
    // to restrict DSAR administration.
    const { mayRecordInvestigationNarrative } = await import('../lib/investigationAuthority.js');
    expect(mayRecordInvestigationNarrative({ isHR: true, caseRole: null })).toBe(true);
  });

  it('an HR manager keeps the HR-only exports that are not org-wide', async () => {
    const { mayExportOrganisationData } = await import('../lib/exportAuthority.js');
    // org-wide export is director-only (its own decision), but isHR-gated
    // extracts are unaffected by the DSAR change
    expect(mayExportOrganisationData({ role: 'hr_manager' })).toBe(false);
    expect(isHrRole('hr_manager')).toBe(true);
  });
});
