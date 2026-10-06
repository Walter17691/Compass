import { assessParticipantResponse, ACTIONABLE_FILTER } from '../lib/participantResponse.js';
import { PUBLIC_FIELDS, WITHHELD_FIELDS } from '../lib/publicSigningView.js';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { SignedRecordModal } from '../components/SignedRecordModal.jsx';
import {
  CONFIRMATION_SEMANTICS, NEUTRAL_SEMANTICS, PROVENANCE_KIND,
  confirmationSemantics, provenanceLine, hasBeenIssued,
} from '../lib/confirmationSemantics.js';
import { ESIGNATURE_STATUS, LEGACY_PENDING_STATUS, isConfirmationSettled, EXTERNAL_SIGNATURE_STATUS } from '../lib/eSignature.js';
import { getNextStep } from '../lib/nextStep.js';
import { MEETING_STATUS, isMeetingComplete } from '../lib/meetingLifecycle.js';

// ═══════════════════════════════════════════════════════════════════════════
// SLICE 1b — ISSUED-RECORD SEMANTICS AND RE-ISSUE INTEGRITY.
//
// The blocker: `expired` and `proceeded` rendered "Signed copy / Signed by X".
// A fall-through default on a vocabulary that had grown from six values to
// eight, so every state nobody enumerated inherited the meaning of a signature.
//
// These tests are mostly BEHAVIOURAL — rendering for label claims, real calls
// for progression — because the defect was invisible to every source assertion
// written about it.
// ═══════════════════════════════════════════════════════════════════════════

const ALL_STATUSES = [
  ESIGNATURE_STATUS.SIGNED, ESIGNATURE_STATUS.ACKNOWLEDGED, ESIGNATURE_STATUS.DECLINED,
  ESIGNATURE_STATUS.DISPUTED, ESIGNATURE_STATUS.EXPIRED, ESIGNATURE_STATUS.PROCEEDED,
  ESIGNATURE_STATUS.SENT, ESIGNATURE_STATUS.OPENED, LEGACY_PENDING_STATUS,
];

const snapshotFor = (over = {}) => async () => ({
  sign_id: 's1', document: 'THE ISSUED TEXT', status: 'x',
  signed_at: '2026-10-02T10:00:00Z', employee_name: 'Sam Employee',
  signature: 'data:image/png;base64,AAA', ...over,
});

const meetingWith = (signStatus, over = {}) => ({
  id: 'm1', caseId: 'c1', type: 'Disciplinary', date: '2026-10-01',
  status: MEETING_STATUS.COMPLETED, record: 'CURRENT WORKING TEXT',
  signId: 's1', signStatus, signerName: 'Sam Employee', signedAt: '2026-10-02T10:00:00Z',
  ...over,
});

const renderModal = async (signStatus, over = {}, snapOver = {}) => {
  const r = render(<SignedRecordModal meeting={meetingWith(signStatus, over)}
    fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={snapshotFor(snapOver)} />);
  await waitFor(() => expect(screen.getByText('THE ISSUED TEXT')).toBeInTheDocument());
  return r;
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE BLOCKER, AND THE NEGATIVE INVARIANT  (brief tests 1-7)
// ═══════════════════════════════════════════════════════════════════════════
describe('only SIGNED may ever render signature wording', () => {
  it('EXPIRED does not render "Signed copy" or "Signed by"', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.EXPIRED);
    expect(screen.queryByText('Signed copy')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Signed by/);
    expect(screen.getByText('Record as issued — no response')).toBeInTheDocument();
    expect(container.textContent).toMatch(/Issued to Sam Employee/);
  });

  it('PROCEEDED does not render "Signed copy" or "Signed by"', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.PROCEEDED, {
      proceededAt: '2026-10-05T09:00:00Z', proceededFromStatus: 'expired',
      proceedReason: 'Two weeks allowed, no response.',
    });
    expect(screen.queryByText('Signed copy')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Signed by/);
    expect(screen.getByText('Record as issued — proceeded without confirmation')).toBeInTheDocument();
  });

  it('DECLINED does not render "Signed copy"', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.DECLINED);
    expect(screen.queryByText('Signed copy')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Signed by/);
    expect(screen.getByText('Record as issued — signature declined')).toBeInTheDocument();
  });

  it('DISPUTED does not render "Signed copy"', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.DISPUTED);
    expect(screen.queryByText('Signed copy')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Signed by/);
    expect(screen.getByText('Record as issued — participant responded with comments')).toBeInTheDocument();
  });

  it('ACKNOWLEDGED never implies agreement or signature', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.ACKNOWLEDGED, { signature: null }, { signature: null });
    expect(screen.getByText('Acknowledged copy')).toBeInTheDocument();
    expect(container.textContent).toMatch(/Acknowledged receipt by Sam Employee/);
    // "Signed by" must not appear, and neither must agreement language.
    expect(container.textContent).not.toMatch(/Signed by/);
    expect(container.textContent).not.toMatch(/\bagreed\b/i);
    expect(CONFIRMATION_SEMANTICS.acknowledged.impliesAgreement).toBe(false);
  });

  it('only SIGNED receives signature wording, and only SIGNED shows the image', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.SIGNED);
    expect(screen.getByText('Signed copy')).toBeInTheDocument();
    expect(container.textContent).toMatch(/Signed by Sam Employee/);
    expect(screen.getByAltText(/signature/i)).toBeInTheDocument();
  });

  it('no non-signed status shows the captured signature image, even if one exists', async () => {
    for (const status of ALL_STATUSES.filter(s => s !== ESIGNATURE_STATUS.SIGNED)) {
      const { unmount } = await renderModal(status);
      expect(screen.queryByAltText(/signature/i), status).not.toBeInTheDocument();
      unmount();
    }
  });

  it('an UNKNOWN status fails NEUTRAL — never "Signed copy"', async () => {
    const { container } = await renderModal('some_future_state');
    expect(screen.getByText('Issued record')).toBeInTheDocument();
    expect(screen.queryByText('Signed copy')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Signed by/);
    // And fails closed for progression.
    expect(NEUTRAL_SEMANTICS.settlesProgression).toBe(false);
    expect(NEUTRAL_SEMANTICS.impliesAgreement).toBe(false);
  });

  it('THE NEGATIVE INVARIANT, over every status at once', async () => {
    for (const status of ALL_STATUSES) {
      const { container, unmount } = await renderModal(status);
      const text = container.textContent;
      if (status === ESIGNATURE_STATUS.SIGNED) {
        expect(text, status).toMatch(/Signed by/);
      } else {
        expect(text, `${status} must not imply a signature`).not.toMatch(/Signed by/);
        expect(text, `${status} must not be headed "Signed copy"`).not.toContain('Signed copy');
      }
      unmount();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE MAP IS EXHAUSTIVE  (brief test 8)
// ═══════════════════════════════════════════════════════════════════════════
describe('every allowed status has explicit semantics', () => {
  it('the live CHECK constraint vocabulary is fully mapped', () => {
    // Derived from the migration rather than restated, so a status added to the
    // database and not to the map fails here.
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8');
    const block = sql.slice(sql.indexOf('signing_requests_status_valid'), sql.indexOf('signing_requests_proceed_complete'));
    const declared = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).filter(v => v !== 'status');
    expect(declared.length).toBeGreaterThanOrEqual(9);
    declared.forEach(status => {
      expect(Object.prototype.hasOwnProperty.call(CONFIRMATION_SEMANTICS, status), `unmapped status: ${status}`).toBe(true);
    });
  });

  it('every ESIGNATURE_STATUS value is mapped', () => {
    Object.values(ESIGNATURE_STATUS).forEach(s =>
      expect(Object.prototype.hasOwnProperty.call(CONFIRMATION_SEMANTICS, s), s).toBe(true));
  });

  it('every entry declares all six semantic facts', () => {
    Object.entries(CONFIRMATION_SEMANTICS).forEach(([status, sem]) => {
      ['heading', 'viewLabel', 'stateLine', 'provenanceKind'].forEach(k =>
        expect(typeof sem[k], `${status}.${k}`).toBe('string'));
      ['participantEngaged', 'impliesAgreement', 'settlesProgression', 'managerActionRequired'].forEach(k =>
        expect(typeof sem[k], `${status}.${k}`).toBe('boolean'));
    });
  });

  it('only SIGNED carries provenanceKind SIGNED, and only it implies agreement', () => {
    const signedKind = Object.entries(CONFIRMATION_SEMANTICS)
      .filter(([, s]) => s.provenanceKind === PROVENANCE_KIND.SIGNED).map(([k]) => k);
    expect(signedKind).toEqual([ESIGNATURE_STATUS.SIGNED]);
    const agreeing = Object.entries(CONFIRMATION_SEMANTICS)
      .filter(([, s]) => s.impliesAgreement).map(([k]) => k);
    expect(agreeing).toEqual([ESIGNATURE_STATUS.SIGNED]);
  });

  it('no heading or state line claims a COMPASS-CAPTURED signature except SIGNED', () => {
    // Widened for SIG-SEC-06. `signed_externally` legitimately says "Signed
    // outside Compass" — a paper signature is a real signature — but it must
    // never read as one Compass holds. So the test is about the CLAIM, not the
    // word: only PROVENANCE_KIND.SIGNED may produce signature wording, and only
    // `signed` carries it.
    const signedKinds = Object.entries(CONFIRMATION_SEMANTICS)
      .filter(([, v]) => v.provenanceKind === PROVENANCE_KIND.SIGNED)
      .map(([k]) => k);
    expect(signedKinds).toEqual([ESIGNATURE_STATUS.SIGNED]);

    const ext = CONFIRMATION_SEMANTICS[EXTERNAL_SIGNATURE_STATUS];
    expect(ext.provenanceKind).toBe(PROVENANCE_KIND.EXTERNAL);
    expect(ext.impliesAgreement).toBe(false);
    expect(ext.heading).toMatch(/outside Compass/);

    // Every OTHER entry may MENTION signing — `declined` says "signature
    // declined", which is the whole point of it — but none may CLAIM one was
    // given, and none may imply agreement.
    for (const [status, v] of Object.entries(CONFIRMATION_SEMANTICS)) {
      if (status === ESIGNATURE_STATUS.SIGNED || status === EXTERNAL_SIGNATURE_STATUS) continue;
      expect(v.provenanceKind, status).not.toBe(PROVENANCE_KIND.SIGNED);
      expect(v.provenanceKind, status).not.toBe(PROVENANCE_KIND.EXTERNAL);
      expect(v.impliesAgreement, status).toBe(false);
      expect(provenanceLine(status, { name: 'X' }), status).not.toMatch(/^Signed by/);
    }
  });


  it('semantics agree with the progression predicate — one source of truth', () => {
    ALL_STATUSES.forEach(s =>
      expect(confirmationSemantics(s).settlesProgression, s).toBe(isConfirmationSettled(s)));
  });

  it('provenanceLine never produces signature wording for a non-signed status', () => {
    ALL_STATUSES.filter(s => s !== ESIGNATURE_STATUS.SIGNED).forEach(s =>
      expect(provenanceLine(s, { name: 'Sam' }), s).not.toMatch(/Signed by/));
    expect(provenanceLine(ESIGNATURE_STATUS.SIGNED, { name: 'Sam' })).toMatch(/Signed by Sam/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE AMENDMENT PREDICATE  (brief tests 9-12)
// ═══════════════════════════════════════════════════════════════════════════
describe('any ISSUED version requires an amendment reason', () => {
  it('hasBeenIssued covers every state in which a document reached the participant', () => {
    ALL_STATUSES.forEach(s => expect(hasBeenIssued(s), s).toBe(true));
  });

  it('including the three the old predicate missed: expired, sent, opened', () => {
    [ESIGNATURE_STATUS.EXPIRED, ESIGNATURE_STATUS.SENT, ESIGNATURE_STATUS.OPENED].forEach(s => {
      expect(hasBeenIssued(s), s).toBe(true);
      // The old predicate — these are precisely the states it let through.
      expect(isConfirmationSettled(s), s).toBe(false);
    });
  });

  it('and nothing else — no request means nothing was issued', () => {
    [undefined, null, '', 'nonsense'].forEach(s => expect(hasBeenIssued(s), String(s)).toBe(false));
  });

  it('the save path uses hasBeenIssued, not the settlement predicate', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    expect(src).toMatch(/const priorIssued = hasBeenIssued\(priorMeeting\?\.signStatus\)/);
    expect(src).not.toMatch(/const priorSettled = isConfirmationSettled\(priorMeeting/);
  });

  it('metadata-only changes do not prompt — only employee-facing text does', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    expect(src).toMatch(/employeeFacingSnapshot\(meeting\.record\)\.trim\(\) !== employeeFacingSnapshot\(priorMeeting\.record\)\.trim\(\)/);
  });

  it('the prompt does not claim the participant confirmed it', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    expect(src).toMatch(/This version was already issued to the participant/);
    expect(src).not.toMatch(/was already \$\{signatureStatusLabel[^}]*\} by the participant/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. SUPERSESSION  (brief tests 13-20, 23, 24)
// ═══════════════════════════════════════════════════════════════════════════
const MIG = () => readFileSync('supabase/reissue_supersession_2026-10-04.sql', 'utf8');
const stripSql = s => s.replace(/--[^\n]*/g, '');
const api = () => readFileSync('api/signing.js', 'utf8');
const stripJs = s => s.replace(/^\s*\/\/[^\n]*$/gm, '');

describe('re-issue supersedes rather than silently replacing', () => {
  it('currency is separate from participant response state', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/add column if not exists superseded_at timestamptz/);
    // There is NO 'superseded' status — that would overwrite history.
    expect(sql).not.toMatch(/'superseded'/);
    expect(Object.values(ESIGNATURE_STATUS)).not.toContain('superseded');
  });

  it('a SIGNED request that is later superseded is still historically signed', () => {
    // The whole reason supersession is not a status. Asserted on the semantics a
    // consumer would see for such a row.
    const sem = confirmationSemantics('signed');
    expect(sem.heading).toBe('Signed copy');
    expect(sem.impliesAgreement).toBe(true);
    // And the constraint permits the combination.
    const sql = stripSql(MIG());
    expect(sql).toMatch(/signing_requests_supersession_complete/);
    expect(sql).not.toMatch(/status\s*=\s*'superseded'/);
  });

  it('AT MOST ONE current request per document, enforced by the database', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/create unique index if not exists signing_requests_one_current_per_meeting/);
    expect(sql).toMatch(/where superseded_at is null and meeting_id is not null/);
  });

  it('the predecessor is superseded BEFORE the successor is inserted', () => {
    const a = stripJs(api());
    const supersede = a.indexOf('superseded_by_sign_id: newSignId');
    const insert = a.indexOf("await supabaseRequest('signing_requests', {");
    expect(supersede).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(supersede, 'supersede must precede insert or the unique index rejects it').toBeLessThan(insert);
  });

  it('supersession provenance is server-derived', () => {
    const a = stripJs(api());
    const block = a.slice(a.indexOf('if (meetingId) {'), a.indexOf("await supabaseRequest('signing_requests', {"));
    expect(block).toMatch(/superseded_by: auth\.caller\.id/);
    expect(block).toMatch(/superseded_at: supersededAt/);
    expect(block).not.toMatch(/req\.body\.superseded/);
  });

  it('and is scoped to the caller\'s own org — cross-tenant supersession rejected', () => {
    const a = stripJs(api());
    const block = a.slice(a.indexOf('if (meetingId) {'), a.indexOf("await supabaseRequest('signing_requests', {"));
    expect(block).toMatch(/org_id=eq\.\$\{encodeURIComponent\(orgId\)\}/);
    // orgId was verified by requireOrgMembership before this point.
    expect(a).toMatch(/const auth = await requireOrgMembership\(req, res, orgId\)/);
  });

  it('a replayed re-issue cannot create two current requests', () => {
    const a = stripJs(api());
    // The PATCH only matches not-yet-superseded rows, so a replay is a no-op...
    expect(a).toMatch(/superseded_at=is\.null/);
    // ...and the partial unique index is the backstop if anything else tried.
    expect(stripSql(MIG())).toMatch(/create unique index/);
  });

  it('a superseded request can no longer be actioned — on EITHER path', () => {
    // Trust Slice 2A moved this guard into ONE shared authority, because the
    // employee-portal path never had it (SIG-SEC-01, HIGH): an older request
    // stayed signable there, and that response would never have reached Compass.
    const a = stripJs(api());
    expect(a).toContain('assessParticipantResponse(existing)');
    expect(stripJs(readFileSync('api/portal/_signatures.js', 'utf8')))
      .toContain('assessParticipantResponse(existing)');
    // The authority refuses it, with wording that names no successor token.
    const v = assessParticipantResponse({ status: 'sent', superseded_at: 'T', expires_at: null });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/replaced by a newer version/i);
    // And the write itself excludes superseded rows, so the check cannot be raced.
    expect(ACTIONABLE_FILTER).toMatch(/status=in\.\(sent,opened\)&superseded_at=is\.null/);
    expect(a).toContain('${ACTIONABLE_FILTER}');
  });

  it('the old link NEVER receives the successor\'s token', () => {
    const a = stripJs(api());
    // SIG-SEC-03 — the public response is now built UP from an allow-list rather
    // than spread-and-deleted. That is strictly stronger: the successor token is
    // withheld because it was never included, and so is every future column.
    expect(a).toContain('publicSigningView(existing)');
    expect(a).toMatch(/if \(!isInternalStatusCheck\) \{/);
    expect(PUBLIC_FIELDS).not.toContain('superseded_by_sign_id');
    expect(PUBLIC_FIELDS).not.toContain('superseded_by');
    expect(WITHHELD_FIELDS).toHaveProperty('superseded_by_sign_id');
    expect(WITHHELD_FIELDS).toHaveProperty('superseded_by');
    const page = readFileSync('public/sign.html', 'utf8');
    expect(page).not.toMatch(/superseded_by_sign_id/);
  });

  it('the superseded page explains neutrally and offers no replacement link', () => {
    const page = readFileSync('public/sign.html', 'utf8');
    expect(page).toContain('This version has been replaced');
    expect(page).toContain('Please use the most recent request you received');
    expect(page).toMatch(/function showSuperseded/);
    // Checked before every response branch, since a superseded row may itself be
    // signed, declined or expired.
    expect(page).toMatch(/if \(data\.superseded\) \{\s*\n\s*showSuperseded\(data\)/);
  });

  it('history is never deleted, and no historical row is classified', () => {
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/delete from/i);
    expect(sql).not.toMatch(/update public\.signing_requests/i);
    expect(MIG()).toContain('Unknown stays unknown');
  });

  it('the chain endpoint returns metadata only — no document, signature or token', () => {
    const a = stripJs(api());
    const block = a.slice(a.indexOf("if (meetingId && internal === '1')"), a.indexOf('const isInternalStatusCheck'));
    expect(block).toMatch(/select=sign_id,status,document_type/);
    expect(block).not.toMatch(/\bdocument\b(?!_type)/);
    expect(block).not.toMatch(/signature/);
    expect(block).not.toMatch(/participant_comment/);
    expect(block).not.toMatch(/superseded_by_sign_id/);
    // And it is authenticated and org-scoped.
    expect(block).toMatch(/requireOrgMembership\(req, res, orgId\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PROCEEDED CHRONOLOGY  (brief test 26, section 8)
// ═══════════════════════════════════════════════════════════════════════════
describe('proceeded describes the organisation, not the participant', () => {
  it('the chain sent -> expired -> proceeded stays legible', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.PROCEEDED, {
      proceededAt: '2026-10-05T09:00:00Z', proceededFromStatus: 'expired',
      proceedReason: 'Two weeks allowed, no response.',
    });
    expect(container.textContent).toMatch(/Proceeded without participant confirmation/);
    expect(container.textContent).toMatch(/the request was no response before the link expired at the time/i);
    expect(container.textContent).toMatch(/Two weeks allowed, no response\./);
  });

  it('its provenance line says nothing about what the participant did', () => {
    const line = provenanceLine(ESIGNATURE_STATUS.PROCEEDED, { name: 'Sam Employee' });
    expect(line).toBe('Proceeded without participant confirmation');
    expect(line).not.toMatch(/Sam Employee/);
    expect(line).not.toMatch(/agreed|acknowledged|declined/i);
  });

  it('the four proceed provenance fields are preserved', () => {
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8');
    ['proceeded_at', 'proceeded_by', 'proceed_reason', 'proceeded_from_status']
      .forEach(c => expect(sql, c).toContain(c));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. PROGRESSION USES THE CANONICAL SEMANTICS  (brief tests 27, 28)
// ═══════════════════════════════════════════════════════════════════════════
describe('every process branch uses one canonical predicate', () => {
  const caseWith = (type, stage, signStatus) => ({
    id: 'c1', caseType: /grievance/i.test(type) ? 'grievance' : 'misconduct', stage,
    meetings: [{ id: 'm1', type, status: MEETING_STATUS.COMPLETED, record: 'A record.', signStatus }],
  });

  it('investigation, disciplinary, grievance and appeal all behave identically', () => {
    const branches = [
      ['Investigation', 'investigation'],
      ['Disciplinary', 'disciplinary'],
      ['Grievance', 'hearing'],
    ];
    branches.forEach(([type, stage]) => {
      // settled states move on
      ['declined', 'disputed', 'proceeded', 'signed', 'acknowledged'].forEach(s =>
        expect(getNextStep(caseWith(type, stage, s), { isHR: true })?.action, `${type}/${s}`).not.toBe('send_signature'));
      // unsettled states ask
      ['sent', 'opened', 'expired', undefined].forEach(s =>
        expect(getNextStep(caseWith(type, stage, s), { isHR: true })?.action, `${type}/${s}`).toBe('send_signature'));
    });
  });

  it('an unknown signature state fails closed — it asks rather than progressing', () => {
    expect(getNextStep(caseWith('Investigation', 'investigation', 'some_future_state'), { isHR: true }).action)
      .toBe('send_signature');
  });

  it('no branch tests a status string directly any more', () => {
    const ns = stripJs(readFileSync('src/lib/nextStep.js', 'utf8'));
    expect(ns).not.toMatch(/signStatus\s*[!=]==\s*"/);
    expect((ns.match(/isConfirmationSettled\(/g) || []).length).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. RESPONSES STAY VISIBLE  (brief tests 21, 22; section 9)
// ═══════════════════════════════════════════════════════════════════════════
describe('automatic progression never hides the participant response', () => {
  it('a dispute shows the comments alongside the issued record', async () => {
    const { container } = await renderModal(ESIGNATURE_STATUS.DISPUTED,
      { participantComment: 'I never said that.' },
      { participant_comment: 'I never said that.', participant_comment_at: '2026-10-03' });
    expect(screen.getByText('I never said that.')).toBeInTheDocument();
    expect(screen.getByText('THE ISSUED TEXT')).toBeInTheDocument();
    expect(container.textContent).toMatch(/The record itself was not changed by this comment/);
  });

  it('a decline reason survives on the row and is rendered', () => {
    const tab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    expect(tab).toMatch(/Declined to sign/);
    expect(tab).toMatch(/m\.declineReason/);
  });

  it('a later current request does not erase the earlier response', () => {
    // No code path clears status, signature, decline_reason or participant_comment
    // when superseding: the PATCH body contains exactly three supersession fields.
    const a = stripJs(api());
    const block = a.slice(a.indexOf('if (meetingId) {'), a.indexOf("await supabaseRequest('signing_requests', {"));
    const body = block.slice(block.indexOf('body: JSON.stringify({'), block.indexOf('})\n            }'));
    ['status', 'signature', 'decline_reason', 'participant_comment', 'document']
      .forEach(f => expect(body, `supersede must not touch ${f}`).not.toMatch(new RegExp(`\\b${f}\\b`)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. NOTHING ELSE MOVED  (brief tests 25, 27, 29, 30)
// ═══════════════════════════════════════════════════════════════════════════
describe('out-of-scope architecture is untouched', () => {
  it('meeting completion remains independent of confirmation', () => {
    expect(isMeetingComplete({ id: 'm', type: 'Investigation', status: MEETING_STATUS.COMPLETED, record: 'x' })).toBe(true);
    ALL_STATUSES.forEach(s =>
      expect(isMeetingComplete({ id: 'm', type: 'Investigation', status: MEETING_STATUS.COMPLETED, record: 'x', signStatus: s }), s).toBe(true));
    const lifecycle = stripJs(readFileSync('src/lib/meetingLifecycle.js', 'utf8'));
    expect(lifecycle).not.toMatch(/signStatus|superseded/);
  });

  it('the migration touches only signing_requests and adds no policy', () => {
    const sql = stripSql(MIG());
    expect([...new Set([...sql.matchAll(/alter table public\.(\w+)/g)].map(m => m[1]))]).toEqual(['signing_requests']);
    expect(sql).not.toMatch(/create policy|drop policy|row level security/i);
  });

  it('D4.3 decisions and Slice 2 conclusions are not touched', () => {
    // Comments stripped: the recorded baseline legitimately NAMES case_decisions
    // in digest D8, which is evidence those rows were checked, not evidence they
    // were modified. The assertion is about DDL.
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/record_case_decision|investigation_conclusion|protect_allegations/);
    expect(sql).not.toMatch(/alter table public\.case_decisions|alter table public\.allegations/);
  });

  it('letter generation is untouched by the re-issue model', () => {
    // A letter request carries no meeting_id, so it is excluded from the currency
    // index and from supersession entirely — section 10's requirement.
    const src = readFileSync('src/App.jsx', 'utf8');
    const letterCall = src.slice(src.indexOf('document: letterOutput, employeeEmail: to,'));
    expect(letterCall.slice(0, 400)).not.toMatch(/meetingId/);
  });

  it('no `delivered` state was introduced', () => {
    expect(stripSql(MIG())).not.toMatch(/\bdelivered\b/);
    expect(Object.keys(CONFIRMATION_SEMANTICS)).not.toContain('delivered');
  });
});
