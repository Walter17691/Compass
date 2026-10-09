import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';

vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));

const { DsarScreen } = await import('../screens/DsarScreen.jsx');
const { authedFetch } = await import('../lib/authedFetch');

// ═══════════════════════════════════════════════════════════════════════════
// DSAR COMPLETION INTEGRITY.
//
// THE DEFECT. `reviewed_flagged_sections` is the one field recording that a
// human reviewed the flagged third-party mentions before an official response
// went out, and nothing enforced it:
//   * `status` was bare text — no CHECK, no trigger, no policy clause. Ten of
//     the thirteen status-bearing tables in this schema have a vocabulary
//     CHECK; dsar_requests was one of three without.
//   * The only gate was an <option> filter omitting "Completed" until the box
//     was ticked — bypassed by a direct updateDsarRequest call, by DevTools, or
//     by tick -> complete -> untick.
//   * The DOWNLOAD was gated only on identity, and was labelled "Download
//     response package" whether or not review had happened. An unreviewed
//     export was presented as the official response.
//   * No reviewer identity, no timestamp, no audit row for either the status
//     change or the attestation.
//
// TWO DIFFERENT GUARANTEES, DELIBERATELY NOT CONFLATED.
//   (1) DATABASE: the completion RECORD cannot claim a review that did not
//       happen. supabase/dsar_completion_integrity_2026-10-09.sql.
//   (2) CLIENT: the artefact cannot PRESENT itself as approved while review is
//       outstanding. Tested here behaviourally.
// No database rule can gate the download — compileSubjectData is pure
// client-side and downloadJson is an in-memory blob — and saying otherwise
// would overstate the fix.
//
// The download is NOT blocked when review is outstanding, on purpose: the
// reviewer needs the compiled package in order to review the flags, so blocking
// it would make the attestation unreachable.
// ═══════════════════════════════════════════════════════════════════════════

const MIGRATION = 'supabase/dsar_completion_integrity_2026-10-09.sql';
const sql = () => readFileSync(MIGRATION, 'utf8');
const guardBody = () => {
  const s = sql();
  const i = s.indexOf('create or replace function public.dsar_requests_completion_integrity_guard');
  expect(i, 'the guard function moved or was renamed').toBeGreaterThan(-1);
  return s.slice(i);
};

const noop = () => {};
const request = (over = {}) => ({
  id: 'r1', employeeName: 'Sam Employee', requestedBy: '', receivedDate: '2026-08-01',
  dueDate: '2026-09-01', status: 'received', extended: false, ...over,
});

const baseProps = (req) => ({
  canAdministerDsar: true,
  dsarRequests: [req],
  createDsarRequest: noop, updateDsarRequest: noop, extendDsarRequest: noop,
  promptDialog: async () => null,
  cases: [{ id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', caseType: 'Misconduct', meetings: [] }],
  employeeRecords: [{ id: 'emp-sam', name: 'Sam Employee', jobTitle: 'Analyst', location: 'London' }],
  starterInstances: [], leaverInstances: [], wellbeingNotes: [], concernReferrals: [],
  allegations: [], caseSignals: [], hrReviewRequests: [], auditLog: [],
  orgId: 'org-1', setScreen: noop,
});

/** Compile, click whichever download button is offered, return {name, filename, pkg}. */
async function compileAndCapture(req, propsFor = baseProps) {
  const blobs = [];
  const names = [];
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (b) => { blobs.push(b); return 'blob:captured'; };
  URL.revokeObjectURL = () => {};
  // capture the filename the anchor is given
  const origCreateEl = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = origCreateEl(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'download', {
        set(v) { names.push(v); }, get() { return names[names.length - 1]; }, configurable: true,
      });
      el.click = () => {};
    }
    return el;
  };
  try {
    const user = userEvent.setup();
    render(<DsarScreen {...propsFor(req)} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    // THREE states, not two: an attestation that cannot be attributed to a
    // named reviewer is neither a draft nor a fully evidenced approval.
    const label = !req.reviewedFlaggedSections
      ? 'Download draft for review'
      : req.reviewedBy
        ? 'Download response package'
        : 'Download response package (reviewer not recorded)';
    await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeInTheDocument(), { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: label }));
    expect(blobs).toHaveLength(1);
    return { label, filename: names[0], pkg: JSON.parse(await blobs[0].text()) };
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    document.createElement = origCreateEl;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
});

describe('the artefact does not present itself as approved while review is outstanding', () => {
  it('offers a DRAFT download, not a "response package", when review has not happened', async () => {
    const { label } = await compileAndCapture(request({ reviewedFlaggedSections: false }));
    expect(label).toBe('Download draft for review');
  });

  it('marks the FILENAME as an unapproved draft', async () => {
    const { filename } = await compileAndCapture(request({ reviewedFlaggedSections: false }));
    expect(filename).toMatch(/DRAFT_NOT_APPROVED/);
  });

  it('stamps the status INSIDE the file, which a rename cannot strip', async () => {
    const { pkg } = await compileAndCapture(request({ reviewedFlaggedSections: false }));
    expect(pkg.responseStatus).toBe('draft_review_outstanding');
    expect(pkg.reviewRecorded).toBe(false);
    expect(pkg.warning).toMatch(/not an approved subject access response/i);
    expect(pkg.warning).toMatch(/must not be sent/i);
  });

  it('does NOT block the draft — the reviewer needs it to review the flags', async () => {
    // Blocking would make the attestation unreachable. Asserted so a future
    // "just block it" change has to confront the reason.
    const { pkg } = await compileAndCapture(request({ reviewedFlaggedSections: false }));
    expect(pkg.cases).toBeTruthy();
    expect(pkg.flaggedThirdPartyMentions).toBeTruthy();
  });

  it('becomes the official response once the review is recorded AND attributable', async () => {
    // This fixture previously omitted reviewedBy, which made it the HISTORICAL
    // state while asserting the fully-approved outcome — the exact conflation
    // the three-state derivation exists to remove.
    const { label, filename, pkg } = await compileAndCapture(request({
      reviewedFlaggedSections: true, reviewedBy: 'user-hr-7', reviewedAt: '2026-09-02T10:00:00Z',
    }));
    expect(label).toBe('Download response package');
    expect(filename).not.toMatch(/DRAFT|REVIEWER_NOT_RECORDED/);
    expect(pkg.responseStatus).toBe('approved_for_release');
    expect(pkg.reviewRecorded).toBe(true);
    expect(pkg.reviewAttributable).toBe(true);
    expect(pkg).not.toHaveProperty('warning');
  });

  it('carries the reviewer provenance into the approved artefact', async () => {
    const { pkg } = await compileAndCapture(request({
      reviewedFlaggedSections: true,
      reviewedBy: 'user-hr-7', reviewedAt: '2026-09-02T10:00:00Z',
    }));
    expect(pkg.reviewedBy).toBe('user-hr-7');
    expect(pkg.reviewedAt).toBe('2026-09-02T10:00:00Z');
  });

  it('audits the draft and the approved response as DIFFERENT events', async () => {
    const audit = vi.fn();
    const user = userEvent.setup();
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:x';
    try {
      render(<DsarScreen {...baseProps(request({ reviewedFlaggedSections: false }))} audit={audit} />);
      await user.click(screen.getByRole('button', { name: 'Compile data' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Download draft for review' })).toBeInTheDocument(), { timeout: 5000 });
      await user.click(screen.getByRole('button', { name: 'Download draft for review' }));
      expect(audit).toHaveBeenCalledWith('DSAR draft downloaded (review outstanding)', 'Sam Employee');
      expect(audit).not.toHaveBeenCalledWith('DSAR response downloaded', 'Sam Employee');
    } finally { URL.createObjectURL = origCreate; }
  });

  it('still blocks entirely when identity cannot be reconciled, in BOTH states', async () => {
    // The identity gate is independent of, and stricter than, the review gate.
    for (const reviewed of [true, false]) {
      const props = baseProps(request({ reviewedFlaggedSections: reviewed }));
      props.cases = [
        { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', caseType: 'Misconduct', meetings: [] },
        { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'other@acme.com', caseType: 'Grievance', meetings: [] },
      ];
      const user = userEvent.setup();
      const { unmount } = render(<DsarScreen {...props} />);
      await user.click(screen.getByRole('button', { name: 'Compile data' }));
      await waitFor(() => expect(screen.getByText(/Download blocked/i)).toBeInTheDocument(), { timeout: 5000 });
      expect(screen.queryByRole('button', { name: 'Download response package' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Download draft for review' })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('the reviewer can see WHAT was withheld and find the source records', () => {
  // Item 2 of the release gate: "Verify that the HR Director can identify
  // relevant source records and understand what has been withheld pending
  // review." A withholding nobody is told about is indistinguishable from data
  // Compass does not hold.
  const priyaCase = {
    id: 'case-priya', employeeName: 'Priya Shah', email: 'priya@acme.test',
    caseType: 'Misconduct', stage: 'investigation', dateReceived: '2026-05-01',
    investigatingManager: 'Sam Employee',
    outcomeNotes: 'HR view: settle.',
    meetings: [{ id: 'm1', type: 'disciplinary', date: '2026-05-10',
      record: 'Priya spoke.\n\n## HR Advisor Notes\nTribunal risk.' }],
  };

  const withStaffRole = (req) => {
    const props = baseProps(req);
    props.cases = [props.cases[0], priyaCase];
    props.employeeRecords = [
      { id: 'emp-sam', name: 'Sam Employee', jobTitle: 'Analyst', location: 'London' },
      { id: 'emp-priya', name: 'Priya Shah', jobTitle: 'Analyst', location: 'London' },
    ];
    return props;
  };

  it('tells the reviewer that another person\'s information was held back', async () => {
    const user = userEvent.setup();
    render(<DsarScreen {...withStaffRole(request({ reviewedFlaggedSections: false }))} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      () => expect(screen.getByText(/held back from this response/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    // and says it is not permanent
    expect(screen.getByText(/This is not permanent/i)).toBeInTheDocument();
  });

  it('puts the mixed-record review item in the one banner reviewers read', async () => {
    const user = userEvent.setup();
    render(<DsarScreen {...withStaffRole(request({ reviewedFlaggedSections: false }))} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      () => expect(screen.getByText(/MIXED personal data/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it('carries identifiable source records into the artefact, with no content', async () => {
    const { pkg } = await compileAndCapture(request({ reviewedFlaggedSections: true }), withStaffRole);
    const staffCase = pkg.actedAsStaff.cases[0];
    expect(staffCase.sourceRecords).toEqual([
      { kind: 'meeting', meetingId: 'm1', meetingType: 'disciplinary', date: '2026-05-10', hasRecord: true, hasTranscript: false },
    ]);
    const asText = JSON.stringify(pkg);
    expect(asText).not.toContain('HR Advisor Notes');
    expect(asText).not.toContain('Tribunal risk');
    expect(asText).not.toContain('HR view: settle');
  });

  it('records a basis on every withheld item rather than a bare field name', async () => {
    const { pkg } = await compileAndCapture(request({ reviewedFlaggedSections: true }), withStaffRole);
    const withheld = pkg.actedAsStaff.cases[0].withheldAsThirdPartyData;
    expect(withheld.length).toBeGreaterThan(0);
    for (const w of withheld) {
      expect(typeof w).toBe('object');
      expect(w.field).toBeTruthy();
      expect(w.basis).toBeTruthy();
      expect(w.reason).toBeTruthy();
    }
  });
});

describe('the migration that makes the completion RECORD truthful', () => {
  it('closes the status vocabulary, so a rule about one status cannot be side-stepped', () => {
    const s = sql();
    expect(s).toMatch(/add constraint dsar_requests_status_valid/);
    expect(s).toMatch(/check \(status in \('received', 'in_progress', 'ready_to_send', 'completed'\)\)/);
  });

  it('guards the TRANSITION, not the row, so legacy rows stay valid and editable', () => {
    // 41 production rows hold status='completed' with the flag false (all E2E
    // debris; 0 non-E2E). A validated CHECK could not be applied at all, and
    // NOT VALID would start failing on any edit to those rows.
    const g = guardBody();
    expect(g).toMatch(/v_was_completed/);
    expect(g).toMatch(/v_is_completed and not v_was_completed and not v_is_reviewed/);
  });

  it('does NOT backfill the attestation onto historical rows', () => {
    // Writing `true` would assert a review that is not recorded — the one thing
    // an evidence control must never do.
    const s = sql().replace(/--[^\n]*/g, ' ');
    expect(s).not.toMatch(/update\s+public\.dsar_requests/i);
    expect(s).not.toMatch(/set\s+reviewed_flagged_sections\s*=\s*true/i);
  });

  it('refuses withdrawal of the attestation from a completed request', () => {
    // Closes tick -> complete -> untick.
    expect(guardBody()).toMatch(/v_was_completed and v_is_completed and v_was_reviewed and not v_is_reviewed/);
  });

  it('ASSIGNS reviewer identity and timestamp rather than accepting them', () => {
    const g = guardBody();
    // v_actor, not auth.uid() directly — see the privilege test below.
    expect(g).toMatch(/new\.reviewed_by := v_actor/);
    expect(g).toMatch(/new\.reviewed_at := now\(\)/);
    // and a client-supplied value cannot survive
    expect(g).not.toMatch(/new\.reviewed_by := new\./);
  });

  // ── The service-role correction ──────────────────────────────────────────
  //
  // These assertions read the SQL. That is NOT the proof — the proof is the
  // behavioural run on an isolated Supabase branch (2026-10-09), where the
  // UNCORRECTED guard was shown to credit a real HR Director for a review they
  // never performed when a service-role connection presented their `sub`
  // (test T6b), and the corrected guard refused the same write. These tests
  // exist to stop the corrected shape being silently reverted.
  it('reads PRIVILEGE before it trusts the subject claim', () => {
    const g = guardBody();
    // auth.role() survives SECURITY DEFINER; current_user does not (it is
    // always the function owner), so the check must use auth.role().
    expect(g).toMatch(/v_privileged\s+boolean\s*:=\s*coalesce\(auth\.role\(\), ''\) = 'service_role'/);
    // executable lines only — the commentary above deliberately NAMES
    // current_user to explain why it is the wrong thing to test.
    expect(g.replace(/--[^\n]*/g, '')).not.toMatch(/current_user/);
    // and the subject is only trusted when the caller is NOT privileged
    expect(g).toMatch(/v_actor\s+uuid\s*:=\s*case when v_privileged then null else auth\.uid\(\) end/);
  });

  it('refuses a NEW attestation that has no identifiable human behind it', () => {
    // One condition covers service_role, anon, and a maintenance session with
    // no JWT: all three produce a null v_actor.
    const g = guardBody();
    expect(g).toMatch(/if v_new_attestation and v_actor is null then/);
    expect(g).toMatch(/cannot attest that a human reviewed the flagged sections/);
  });

  it('does not merely NULL the reviewer for a privileged caller', () => {
    // Forcing reviewed_by to null and allowing the write would leave
    // reviewed_flagged_sections = true with no reviewer — indistinguishable
    // from the legacy rows, so an automated process could still manufacture
    // something that reads as approved. The write must be refused outright.
    const g = guardBody();
    const refusalIdx = g.indexOf('v_new_attestation and v_actor is null');
    const assignIdx  = g.indexOf('new.reviewed_by := v_actor');
    expect(refusalIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(-1);
    // the refusal must come FIRST, or the assignment would run for a
    // privileged caller before anything rejected it
    expect(refusalIdx).toBeLessThan(assignIdx);
  });

  it('clears the provenance when the attestation is withdrawn', () => {
    const g = guardBody();
    expect(g).toMatch(/new\.reviewed_by := null/);
    expect(g).toMatch(/new\.reviewed_at := null/);
  });

  it('preserves the original provenance across unrelated edits', () => {
    expect(guardBody()).toMatch(/new\.reviewed_by := old\.reviewed_by/);
  });

  it('fires on INSERT as well as UPDATE, so a request cannot be born completed', () => {
    const s = sql();
    const trg = s.slice(s.indexOf('create trigger dsar_requests_completion_integrity_trg'));
    expect(trg).toMatch(/before\s+insert\s+or\s+update\s+on\s+public\.dsar_requests/);
  });

  it('is SECURITY DEFINER, search_path-pinned, and not callable as an RPC', () => {
    const s = sql();
    expect(guardBody()).toContain('security definer');
    expect(guardBody()).toMatch(/set search_path to 'public'/);
    expect(s).toContain('revoke all on function public.dsar_requests_completion_integrity_guard() from anon, authenticated, public;');
  });

  it('adds the provenance columns without dropping anything', () => {
    const s = sql();
    expect(s).toMatch(/add column if not exists reviewed_by uuid references auth\.users\(id\)/);
    expect(s).toMatch(/add column if not exists reviewed_at timestamptz/);
    const stripped = s.replace(/--[^\n]*/g, ' ');
    expect(stripped).not.toMatch(/\bdrop\s+(table|column|policy|trigger|function)\b/i);
  });

  it('does not pretend to gate the download', () => {
    // The honesty requirement: the file must say what it cannot do.
    expect(sql()).toMatch(/does not stop the browser writing a file|NO DOWNLOAD GATE/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F2 — THE PROVENANCE MUST SURVIVE THE ROUND TRIP.
//
// The trigger assigns reviewed_by/reviewed_at from auth.uid(); they are never
// in the payload the client sends. So if updateDsarRequest merges only the
// fields it sent, local state never learns them, and a package downloaded
// before the next page load carries reviewRecorded:true with no reviewer —
// the exact evidence gap this slice exists to close.
// ═══════════════════════════════════════════════════════════════════════════
describe('F2 — database-assigned review provenance reaches the client immediately', () => {
  const appSrc = () => readFileSync('src/App.jsx', 'utf8');

  const updateFn = () => {
    const s = appSrc();
    const start = s.indexOf('const updateDsarRequest = async');
    expect(start).toBeGreaterThan(-1);
    return s.slice(start, s.indexOf('\n  };', start));
  };

  it('reads the row BACK from the database instead of assuming the write', () => {
    expect(updateFn()).toMatch(/\.update\(payload\)\.eq\('id', id\)\.select\(\)\.single\(\)/);
  });

  it('takes reviewedBy and reviewedAt from the returned row, not from the caller', () => {
    const fn = updateFn();
    expect(fn).toMatch(/reviewedBy:\s*data\?\.reviewed_by/);
    expect(fn).toMatch(/reviewedAt:\s*data\?\.reviewed_at/);
    // never from `fields` — that would be the client asserting its own provenance
    expect(fn).not.toMatch(/reviewedBy:\s*fields\./);
    expect(fn).not.toMatch(/reviewedAt:\s*fields\./);
  });

  it('still never SENDS reviewer identity or timestamp to the database', () => {
    const fn = updateFn();
    expect(fn).not.toMatch(/payload\.reviewed_by/);
    expect(fn).not.toMatch(/payload\.reviewed_at/);
  });

  it('the returned row wins over the optimistic merge, so a stale value cannot persist', () => {
    const fn = updateFn();
    const spread = fn.indexOf('...fields');
    const assign = fn.indexOf('reviewedBy: data?.reviewed_by');
    expect(spread).toBeGreaterThan(-1);
    expect(assign).toBeGreaterThan(spread);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STAGE2-UX-01 — a refused deep link must SAY SO.
// ═══════════════════════════════════════════════════════════════════════════
describe('STAGE2-UX-01 — ?screen=dsar refuses visibly instead of rendering nothing', () => {
  const appSrc = () => readFileSync('src/App.jsx', 'utf8');
  const screenSrc = () => readFileSync('src/screens/DsarScreen.jsx', 'utf8');

  it('mounts DsarScreen for every user and lets its own guard decide', () => {
    // Previously `screen===SCREENS.DSAR&&canAdministerDsar&&`, which rendered a
    // blank content area for a non-director.
    const s = appSrc().replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(s).toMatch(/\{screen===SCREENS\.DSAR&&\(/);
    expect(s).not.toMatch(/screen===SCREENS\.DSAR&&canAdministerDsar/);
  });

  it('still passes the authority down, so the screen can refuse', () => {
    expect(appSrc()).toMatch(/<DsarScreen canAdministerDsar=\{canAdministerDsar\}/);
  });

  it('the screen renders a refusal, and the guard still defaults to DENY', () => {
    const s = screenSrc();
    expect(s).toMatch(/canAdministerDsar = false/);      // default-deny prop
    expect(s).toMatch(/if \(!canAdministerDsar\) \{/);
    expect(s).toMatch(/Only an HR Director can work on subject access requests/);
  });

  it('a non-director sees the refusal and none of the workspace', async () => {
    render(<DsarScreen canAdministerDsar={false} dsarRequests={[
      { id:'r1', employeeName:'Someone', receivedDate:'2026-10-01', dueDate:'2026-11-01', status:'received' },
    ]} cases={[]} employeeRecords={[]} orgId="org-1" audit={vi.fn()} updateDsarRequest={vi.fn()} />);
    expect(screen.getByText(/Only an HR Director can work on subject access requests/i)).toBeTruthy();
    expect(screen.queryByText(/Compile data/i)).toBeNull();
    expect(screen.queryByText(/Log new request/i)).toBeNull();
    expect(screen.queryByText(/Someone/)).toBeNull();
  });

  it('an HR Director still gets the workspace', async () => {
    render(<DsarScreen canAdministerDsar={true} dsarRequests={[
      { id:'r1', employeeName:'Someone', receivedDate:'2026-10-01', dueDate:'2026-11-01', status:'received' },
    ]} cases={[]} employeeRecords={[]} orgId="org-1" audit={vi.fn()} updateDsarRequest={vi.fn()} />);
    expect(screen.queryByText(/Only an HR Director can work on subject access requests/i)).toBeNull();
    expect(screen.getByText(/Someone/)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DISCLOSURE INTEGRITY — THREE ATTESTATION STATES.
//
// `!!reviewedFlaggedSections` collapsed two different facts: that an
// attestation EXISTS, and that it can be ATTRIBUTED to a named human. A request
// attested before the completion-integrity migration added reviewed_by/
// reviewed_at therefore exported as `approved_for_release` with
// `reviewRecorded: true` and a null reviewer — a compliance artefact asserting
// an approval the system cannot evidence.
//
// The historical attestation is NOT revoked and the record is NOT altered. Only
// the claim the package makes about it changes.
// ═══════════════════════════════════════════════════════════════════════════
describe('three attestation states are distinguishable in the exported package', () => {
  it('STATE 1 — no attestation: a draft that says so', async () => {
    const { label, filename, pkg } = await compileAndCapture(request({ reviewedFlaggedSections: false }));
    expect(label).toBe('Download draft for review');
    expect(filename).toMatch(/_DRAFT_NOT_APPROVED\.json$/);
    expect(pkg.responseStatus).toBe('draft_review_outstanding');
    expect(pkg.reviewRecorded).toBe(false);
    expect(pkg.reviewAttributable).toBe(false);
    expect(pkg.reviewedBy).toBeNull();
    expect(pkg.warning).toMatch(/must not be sent/i);
  });

  it('STATE 2 — historical attestation, no attributable reviewer', async () => {
    const { label, filename, pkg } = await compileAndCapture(request({
      reviewedFlaggedSections: true, reviewedBy: null, reviewedAt: null,
    }));
    // NOT presented as a fully evidenced approval...
    expect(pkg.responseStatus).toBe('approved_reviewer_not_recorded');
    expect(pkg.responseStatus).not.toBe('approved_for_release');
    expect(pkg.reviewAttributable).toBe(false);
    // ...and NOT downgraded to a draft either — the review genuinely happened.
    expect(pkg.responseStatus).not.toBe('draft_review_outstanding');
    expect(pkg.reviewRecorded).toBe(true);
    // the caveat travels with the artefact, and the filename carries it too
    expect(filename).toMatch(/_REVIEWER_NOT_RECORDED\.json$/);
    expect(label).toBe('Download response package (reviewer not recorded)');
    expect(pkg.warning).toMatch(/no reviewer can be evidenced/i);
    expect(pkg.warning).toMatch(/not withdrawn/i);
    // the warning must name BOTH missing facts — who, and when — so the
    // artefact explains itself without the reader consulting anything else
    expect(pkg.warning).toMatch(/\bWHO\b/);
    expect(pkg.warning).toMatch(/\bWHEN\b/);
    // and it must say the attestation EXISTS, not that review is outstanding
    expect(pkg.warning).toMatch(/recorded as reviewed/i);
    expect(pkg.warning).not.toMatch(/must not be sent/i);
  });

  it('STATE 3 — new attestation with database-recorded provenance', async () => {
    const { label, filename, pkg } = await compileAndCapture(request({
      reviewedFlaggedSections: true,
      reviewedBy: '6dc60cca-5bae-475f-8e1a-bae85072455f',
      reviewedAt: '2026-10-09T12:00:00Z',
    }));
    expect(label).toBe('Download response package');
    expect(filename).not.toMatch(/DRAFT|REVIEWER_NOT_RECORDED/);
    expect(pkg.responseStatus).toBe('approved_for_release');
    expect(pkg.reviewRecorded).toBe(true);
    expect(pkg.reviewAttributable).toBe(true);
    expect(pkg.reviewedBy).toBe('6dc60cca-5bae-475f-8e1a-bae85072455f');
    expect(pkg.reviewedAt).toBe('2026-10-09T12:00:00Z');
    expect(pkg).not.toHaveProperty('warning');
  });

  it('the three states produce three DIFFERENT responseStatus values', async () => {
    const a = await compileAndCapture(request({ reviewedFlaggedSections: false }));
    const b = await compileAndCapture(request({ reviewedFlaggedSections: true }));
    const c = await compileAndCapture(request({ reviewedFlaggedSections: true, reviewedBy: 'u1', reviewedAt: '2026-10-09T12:00:00Z' }));
    const statuses = [a.pkg.responseStatus, b.pkg.responseStatus, c.pkg.responseStatus];
    expect(new Set(statuses).size).toBe(3);
  });

  it('the historical state is never silently upgraded by a non-null reviewedAt alone', async () => {
    // Attribution means a PERSON. A timestamp without one is not attribution.
    const { pkg } = await compileAndCapture(request({
      reviewedFlaggedSections: true, reviewedBy: null, reviewedAt: '2026-10-09T12:00:00Z',
    }));
    expect(pkg.reviewAttributable).toBe(false);
    expect(pkg.responseStatus).toBe('approved_reviewer_not_recorded');
  });

  it('IMMEDIATELY after a new review, the downloaded package carries the provenance', async () => {
    // The F2 round trip end to end: the reviewer ticks the box, updateDsarRequest
    // reads the row back, and the row the DATABASE returned (not the client's
    // optimistic guess) is what the very next download stamps — no page reload.
    const user = userEvent.setup();
    const DB_REVIEWER = '6dc60cca-5bae-475f-8e1a-bae85072455f';
    const DB_AT = '2026-10-09T12:34:56Z';

    let row = { ...request({ reviewedFlaggedSections: false }) };
    const updateDsarRequest = vi.fn(async (_id, fields) => {
      // what src/App.jsx does: merge the returned row, provenance included
      row = { ...row, ...fields,
              reviewedBy: fields.reviewedFlaggedSections ? DB_REVIEWER : null,
              reviewedAt: fields.reviewedFlaggedSections ? DB_AT : null };
      rerenderWith(row);
      return true;
    });

    const blobs = []; const names = [];
    const origCreate = URL.createObjectURL; const origCreateEl = document.createElement.bind(document);
    URL.createObjectURL = (b) => { blobs.push(b); return 'blob:x'; };
    document.createElement = (t) => { const e = origCreateEl(t); if (t === 'a') {
      Object.defineProperty(e, 'download', { set(v){ names.push(v); }, get(){ return names[names.length-1]; }, configurable: true });
      e.click = () => {}; } return e; };

    let rerender;
    const rerenderWith = (r) => rerender(<DsarScreen {...baseProps(r)} updateDsarRequest={updateDsarRequest} />);
    try {
      const view = render(<DsarScreen {...baseProps(row)} updateDsarRequest={updateDsarRequest} />);
      rerender = view.rerender;

      await user.click(screen.getByRole('button', { name: 'Compile data' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Download draft for review' })).toBeInTheDocument(), { timeout: 5000 });

      // record the review
      await user.click(screen.getByRole('checkbox'));
      expect(updateDsarRequest).toHaveBeenCalledWith(row.id, { reviewedFlaggedSections: true });

      // download straight away — no reload
      await waitFor(() => expect(screen.getByRole('button', { name: 'Download response package' })).toBeInTheDocument(), { timeout: 5000 });
      await user.click(screen.getByRole('button', { name: 'Download response package' }));

      const pkg = JSON.parse(await blobs[blobs.length - 1].text());
      expect(pkg.responseStatus).toBe('approved_for_release');
      expect(pkg.reviewAttributable).toBe(true);
      expect(pkg.reviewedBy).toBe(DB_REVIEWER);
      expect(pkg.reviewedAt).toBe(DB_AT);
      expect(pkg).not.toHaveProperty('warning');
      expect(names[names.length - 1]).not.toMatch(/DRAFT|REVIEWER_NOT_RECORDED/);
    } finally {
      URL.createObjectURL = origCreate; document.createElement = origCreateEl;
    }
  });

  it('[UI] explains the historical state next to the attestation, and only then', async () => {
    // The note sits inside the flagged-sections panel, which only exists once
    // the package has been compiled — so compile first, then assert.
    const note = /recorded before Compass captured who performed it/i;
    const user = userEvent.setup();
    const { rerender } = render(<DsarScreen {...baseProps(request({ reviewedFlaggedSections: true, reviewedBy: null }))} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(note)).toBeInTheDocument(), { timeout: 5000 });

    // attributable review -> no note
    rerender(<DsarScreen {...baseProps(request({ reviewedFlaggedSections: true, reviewedBy: 'u1' }))} />);
    expect(screen.queryByText(note)).toBeNull();

    // no attestation at all -> no note (it would be meaningless)
    rerender(<DsarScreen {...baseProps(request({ reviewedFlaggedSections: false }))} />);
    expect(screen.queryByText(note)).toBeNull();
  });
});
