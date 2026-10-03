import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { compileSubjectData, DSAR_SUBJECT_SOURCES } from '../lib/dsarCompile.js';
import { DECISION_OUTCOMES, LEGACY_UNMAPPED, currentDecision } from '../lib/caseDecisions.js';
import {
  recordCaseDecisionWrite, describeDecisionOutcome, isAlreadyDecided, isRefused,
  isRpcMissing, DECISION_RESULT,
} from '../lib/caseDecisionWrites.js';
import { deriveCurrentWarnings } from '../lib/employeeFile.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3 — AUTHORITATIVE CASE DECISION CUTOVER.
//
// After this wave a newly issued outcome is ONE atomic authoritative event in
// case_decisions, and the cases.* outcome fields are a transactionally
// maintained compatibility projection rather than an independently writable
// source. The property being defended is that there is never more than one
// writable truth.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. A migration file is text until it is
// applied, so the SQL assertions here are necessary but NOT sufficient: they
// prove the artifact says what it must, and the live proofs in the wave report
// prove the database does it. Where behaviour is reachable in JS — the write
// wrapper, the warnings derivation, the DSAR compilation — it is exercised
// rather than read, because a passing grep over source is not a passing
// behaviour.
// ─────────────────────────────────────────────────────────────────────────

const CUTOVER = 'supabase/case_decision_cutover_2026-10-03.sql';
const sqlRaw = () => readFileSync(CUTOVER, 'utf8');
// Comments are prose. Asserting against un-stripped SQL is how a migration that
// DESCRIBES a removed clause reads as still containing it — the single most
// repeated mistake across this engagement.
const sql = () => sqlRaw().split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

// The body of one function, so an assertion about the RPC cannot be satisfied by
// a different function in the same file.
function fnBody(name) {
  const s = sql();
  const start = s.indexOf(`function public.${name}(`);
  expect(start, `${name} must be defined in the cutover`).toBeGreaterThan(-1);
  const end = s.indexOf('$$;', start);
  return s.slice(start, end);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE RPC IS THE ONLY ISSUANCE PATH
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — record_case_decision is the authoritative operation', () => {
  it('is SECURITY DEFINER with a pinned search_path', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path to 'public'/);
  });

  it('is callable by authenticated and NOT by anon or public', () => {
    const s = sql();
    expect(s).toMatch(/grant execute on function public\.record_case_decision\([^)]*\) to authenticated;/);
    expect(s).toMatch(/revoke all on function public\.record_case_decision\([^)]*\) from anon, public;/);
  });

  it('accepts no parameter the caller could use to lie about provenance', () => {
    // The signature is the security boundary. org_id, decided_by, decided_at and
    // the warning expiry are all derived server-side, so there must be no
    // parameter for any of them — a trusted-by-accident parameter is how
    // provenance gets forged.
    const sig = sql().slice(sql().indexOf('function public.record_case_decision('),
      sql().indexOf('returns jsonb'));
    const params = [...sig.matchAll(/p_[a-z_]+/g)].map(m => m[0]);
    expect([...new Set(params)].sort()).toEqual([
      'p_case_id', 'p_expected_updated_at', 'p_outcome', 'p_outcome_notes',
      'p_warning_duration_months',
    ]);
    for (const forbidden of ['p_org_id', 'p_decided_by', 'p_decided_at', 'p_warning_expires_at', 'p_actor']) {
      expect(sig, `${forbidden} must not be a parameter`).not.toContain(forbidden);
    }
  });

  it('reads org_id from the case row rather than from the caller', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/select \* into v_case from public\.cases where id = p_case_id/);
    expect(body).toMatch(/v_case\.org_id/);
  });

  it('refuses an unauthenticated caller before doing anything else', () => {
    const body = fnBody('record_case_decision');
    const authCheck = body.indexOf('auth.uid() is null');
    const caseRead = body.indexOf('select * into v_case');
    expect(authCheck).toBeGreaterThan(-1);
    expect(authCheck, 'the authentication check comes first').toBeLessThan(caseRead);
  });

  it('applies EXACTLY the authority the pre-wave trigger applied, and nothing broader', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/public\.is_hr_role\(v_member\.role\)/);
    expect(body).toMatch(/ca\.role = 'disciplinary_officer'/);
    // not widened to any other role
    for (const wider of ['manager', 'auditor', 'owner', 'admin']) {
      expect(body, `authority must not be widened to ${wider}`)
        .not.toMatch(new RegExp(`role = '${wider}'`));
    }
  });

  it('enforces the case-access boundary itself, because SECURITY DEFINER bypasses RLS', () => {
    // L1 full access, L2 only on a case they created, or an explicit grant. This
    // is the confidential-case boundary too — a SECURITY DEFINER function does
    // not inherit cases' RLS, so omitting this would make the RPC a way to
    // record a decision on a case the caller cannot even see.
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/om\.case_access_level = 1/);
    expect(body).toMatch(/om\.case_access_level = 2/);
    expect(body).toMatch(/v_case\.created_by = auth\.uid\(\)/);
    expect(body).toMatch(/from public\.case_access ca\s+where ca\.case_id = v_case\.id and ca\.user_id = auth\.uid\(\)/);
    expect(body).toMatch(/You do not have access to this case/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE MARKER IS EVIDENCE OF PROVENANCE, NEVER AUTHORIZATION
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — the transaction-local marker is not authorization', () => {
  it('is set only AFTER every authorization check has passed', () => {
    const body = fnBody('record_case_decision');
    const marker = body.indexOf("set_config('compass.recording_case_decision'");
    expect(marker).toBeGreaterThan(-1);
    // every gate must appear before it
    for (const gate of [
      'auth.uid() is null',
      'Case not found',
      'Not a member of this organisation',
      "Only HR or this case''s disciplinary officer can record a decision",
      'You do not have access to this case',
      'Not a recognised outcome',
      "'conflict'",
    ]) {
      const at = body.indexOf(gate);
      expect(at, `${gate} must be checked before the marker is set`).toBeGreaterThan(-1);
      expect(at, `${gate} must be checked before the marker is set`).toBeLessThan(marker);
    }
  });

  it('no authorization decision consults the marker', () => {
    // If any gate read the marker, the marker would BE authorization.
    const body = fnBody('record_case_decision');
    const marker = body.indexOf("set_config('compass.recording_case_decision'");
    const before = body.slice(0, marker);
    expect(before).not.toContain('current_setting');
    expect(before).not.toContain('compass.recording_case_decision');
  });

  it('is transaction-local, so it cannot outlive the operation', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/set_config\('compass\.recording_case_decision', p_case_id::text, true\)/);
  });

  it('is bound to ONE case id, so it cannot license a protected write to another row', () => {
    const guard = fnBody('protect_case_hr_only_columns');
    expect(guard).toMatch(/v_marker <> old\.id::text/);
  });

  it('FAILS CLOSED when the marker is absent or empty', () => {
    const guard = fnBody('protect_case_hr_only_columns');
    // nullif collapses '' to null, and null is refused
    expect(guard).toMatch(/v_marker := nullif\(current_setting\('compass\.recording_case_decision', true\), ''\)/);
    expect(guard).toMatch(/if v_marker is null or v_marker <> old\.id::text then/);
    expect(guard).toMatch(/errcode = '42501'/);
  });

  it('removes the direct HR/disciplinary-officer allowance for the six columns', () => {
    // THE WHOLE POINT. Before this wave an HR user could UPDATE the outcome
    // columns directly; the only accepted provenance is now the RPC.
    const guard = fnBody('protect_case_hr_only_columns');
    const outcomeBranch = guard.slice(guard.indexOf('new.outcome is distinct from old.outcome'));
    expect(outcomeBranch).not.toMatch(/is_hr_role/);
    expect(outcomeBranch).not.toMatch(/disciplinary_officer/);
    expect(outcomeBranch).toMatch(/record_case_decision/);
  });

  it('guards all six protected columns, not just outcome', () => {
    const guard = fnBody('protect_case_hr_only_columns');
    for (const col of ['outcome', 'outcome_issued_at', 'outcome_notes',
      'warning_duration_months', 'warning_expires_at', 'disciplinary_decided_by']) {
      expect(guard, col).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
  });

  it('leaves the investigation_paused control untouched', () => {
    // A different control with a different authority test. This wave has no
    // business changing it, and a silent change would be a scope breach.
    const guard = fnBody('protect_case_hr_only_columns');
    expect(guard).toMatch(/new\.investigation_paused is distinct from old\.investigation_paused/);
    expect(guard).toMatch(/public\.can_see_all_org_cases\(role\)/);
    expect(guard).toMatch(/Only HR can pause or resume an investigation/);
  });

  it('keeps service_role exempt, matching the existing trigger architecture', () => {
    const guard = fnBody('protect_case_hr_only_columns');
    expect(guard).toMatch(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  });

  it('uses auth.role() and NEVER current_user — the NEW-49 class of bug', () => {
    // current_user inside SECURITY DEFINER is always the function OWNER, so a
    // `current_user in ('postgres',…)` exemption is unconditionally true and the
    // guard never fires. Proven live before correcting it.
    for (const fn of ['protect_case_hr_only_columns', 'case_decisions_append_only_guard']) {
      expect(fnBody(fn), `${fn} must not branch on current_user`).not.toContain('current_user');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. NEW-49 — the D4.2 append-only guard was inert and is now restored
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — NEW-49: the decision-history guard actually fires', () => {
  it('tests privilege on auth.role() = service_role and nothing else', () => {
    const body = fnBody('case_decisions_append_only_guard');
    expect(body).toMatch(/privileged boolean := coalesce\(auth\.role\(\), ''\) = 'service_role';/);
    expect(body).not.toMatch(/or current_user/);
    expect(body).not.toMatch(/'supabase_admin'/);
  });

  it('refuses UPDATE and DELETE of a recorded decision', () => {
    const body = fnBody('case_decisions_append_only_guard');
    expect(body).toMatch(/if tg_op = 'DELETE' then[\s\S]*?Decision history cannot be deleted/);
    expect(body).toMatch(/if tg_op = 'UPDATE' then[\s\S]*?A recorded decision cannot be changed/);
  });

  it('forces decided_by to the caller and requires decided_at', () => {
    const body = fnBody('case_decisions_append_only_guard');
    expect(body).toMatch(/new\.decided_by := auth\.uid\(\)/);
    expect(body).toMatch(/if new\.decided_at is null then[\s\S]*?must record when it was decided/);
  });

  it('refuses legacy_unmapped for an application write', () => {
    const body = fnBody('case_decisions_append_only_guard');
    expect(body).toMatch(/new\.outcome = 'legacy_unmapped'/);
    expect(body).toMatch(/historical marker and cannot be chosen/);
  });

  it('subjects the RPC itself to the guard rather than exempting it', () => {
    // auth.role() is NOT rewritten by SECURITY DEFINER, so an HR caller is still
    // 'authenticated' inside record_case_decision and the guard applies to its
    // own insert. That makes it a genuine second lock, not a formality.
    const body = fnBody('record_case_decision');
    expect(body).not.toMatch(/set_config\('role'|set local role|security invoker/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. PROVENANCE IS DERIVED SERVER-SIDE
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — provenance is never accepted from the client', () => {
  it('derives decided_by, decided_at and the expiry inside the transaction', () => {
    const body = fnBody('record_case_decision');
    const insert = body.slice(body.indexOf('insert into public.case_decisions'));
    expect(insert).toMatch(/v_case\.org_id, v_case\.id, 'original'/);
    expect(insert).toMatch(/v_now, auth\.uid\(\)/);
    expect(body).toMatch(/v_now timestamptz := now\(\)/);
    expect(body).toMatch(/v_expires := \(v_now::date \+ make_interval\(months => p_warning_duration_months\)\)::date/);
  });

  it('projects the SAME derived values onto the case, not client values', () => {
    const body = fnBody('record_case_decision');
    const update = body.slice(body.indexOf('update public.cases set'), body.indexOf('returning updated_at'));
    expect(update).toMatch(/outcome_issued_at = v_now/);
    expect(update).toMatch(/warning_expires_at = v_expires/);
    expect(update).toMatch(/disciplinary_decided_by = auth\.uid\(\)/);
    expect(update).toMatch(/updated_at = v_now/);
  });

  it('the client wrapper sends exactly the five permitted keys', () => {
    // BEHAVIOURAL, not a grep: the real wrapper is called with a fake client and
    // the actual RPC payload is inspected. A provenance field added later would
    // fail here even if the source still looked tidy.
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, decision_id: 'd1' }, error: null });
    return recordCaseDecisionWrite({
      supabase: { rpc }, caseId: 'c1', outcome: 'First written warning',
      outcomeNotes: 'notes', warningDurationMonths: 12, expectedUpdatedAt: '2026-10-03T00:00:00Z',
    }).then(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
      const [name, payload] = rpc.mock.calls[0];
      expect(name).toBe('record_case_decision');
      expect(Object.keys(payload).sort()).toEqual([
        'p_case_id', 'p_expected_updated_at', 'p_outcome', 'p_outcome_notes',
        'p_warning_duration_months',
      ]);
      for (const forbidden of ['p_org_id', 'p_decided_by', 'p_decided_at', 'p_warning_expires_at']) {
        expect(payload, forbidden).not.toHaveProperty(forbidden);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. THE OUTCOME VOCABULARY, AND legacy_unmapped
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — the RPC accepts exactly the product vocabulary', () => {
  it('lists the same six outcomes the domain boundary defines', () => {
    const body = fnBody('record_case_decision');
    const list = body.slice(body.indexOf('p_outcome not in ('), body.indexOf('raise exception \'Not a recognised outcome'));
    for (const o of DECISION_OUTCOMES) expect(list, o).toContain(`'${o}'`);
    expect(DECISION_OUTCOMES).toHaveLength(6);
  });

  it('refuses the historical marker explicitly, with a sentence rather than a constraint name', () => {
    const body = fnBody('record_case_decision');
    const markerCheck = body.indexOf(`p_outcome = '${LEGACY_UNMAPPED}'`);
    const vocabCheck = body.indexOf('p_outcome not in (');
    expect(markerCheck).toBeGreaterThan(-1);
    expect(markerCheck, 'the marker is refused before the generic vocabulary error').toBeLessThan(vocabCheck);
    expect(body).toMatch(/cannot be issued as a decision/);
  });

  it('requires a warning duration in range for a warning, and forbids one otherwise', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/v_is_warning := p_outcome in \('First written warning', 'Final written warning'\)/);
    expect(body).toMatch(/p_warning_duration_months <= 0 or p_warning_duration_months > 60/);
    expect(body).toMatch(/Only a warning outcome carries a duration/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ATOMICITY — one transaction, one truth
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — the decision, the projection, the audit and the approval are one transaction', () => {
  it('all four writes live in the single RPC body', () => {
    const body = fnBody('record_case_decision');
    expect(body).toContain('insert into public.case_decisions');
    expect(body).toContain('update public.cases set');
    expect(body).toContain('insert into public.audit_log');
    expect(body).toContain('insert into public.hr_review_requests');
  });

  it('writes the outcome projection in exactly one place in the whole migration', () => {
    expect((sql().match(/update public\.cases set/g) || []).length).toBe(1);
  });

  it('correlates the audit event with the decision it records', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/insert into public\.audit_log \(org_id, user_id, user_name, action, detail, case_id, case_decision_id\)/);
    expect(body).toMatch(/v_case\.id, v_decision_id\s*\);/);
    expect(sql()).toMatch(/alter table public\.audit_log\s+add column if not exists case_decision_id uuid\s+references public\.case_decisions\(id\) on delete set null/);
  });

  it("makes 'Outcome issued' unforgeable through the generic audit RPC", () => {
    const body = fnBody('log_audit_event');
    const listStart = body.indexOf('if p_action in (');
    const reserved = body.slice(listStart, body.indexOf(') then', listStart));
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved).toContain("'Outcome issued'");
    // the reservations that already existed must survive
    for (const keep of ['Case deleted', 'Employee identity reconciled', 'Appeal officer appointed']) {
      expect(reserved, keep).toContain(`'${keep}'`);
    }
  });

  it('opens an HR approval request for exactly the sign-off outcomes', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/when p_outcome = 'Final written warning' then 'final_written_warning'/);
    expect(body).toMatch(/when p_outcome in \('Dismissal with notice', 'Summary dismissal \(gross misconduct\)'\) then 'dismissal'/);
    expect(body).toMatch(/else null end;/);
    expect(body).toMatch(/if v_step is not null then/);
  });

  it('applies the existing optimistic-concurrency contract, returning conflict rather than raising', () => {
    const body = fnBody('record_case_decision');
    expect(body).toMatch(/if p_expected_updated_at is not null\s+and v_case\.updated_at is distinct from p_expected_updated_at then/);
    expect(body).toMatch(/return jsonb_build_object\('ok', false, 'reason', 'conflict'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. THE CLIENT CONTRACT — behavioural
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — the write wrapper maps every outcome the UI must distinguish', () => {
  const call = (rpcResult) => recordCaseDecisionWrite({
    supabase: { rpc: vi.fn().mockResolvedValue(rpcResult) },
    caseId: 'c1', outcome: 'First written warning', warningDurationMonths: 6,
  });

  it('reports ok and carries the decision id back', async () => {
    const res = await call({ data: { ok: true, decision_id: 'd1', approval_requested: false }, error: null });
    expect(res.result).toBe(DECISION_RESULT.OK);
    expect(res.data.decision_id).toBe('d1');
    expect(describeDecisionOutcome(res.result)).toBeNull();
  });

  it('distinguishes a stale-version conflict from a failure', async () => {
    const res = await call({ data: { ok: false, reason: 'conflict' }, error: null });
    expect(res.result).toBe(DECISION_RESULT.CONFLICT);
    // the refresh toast speaks, so the modal must not ALSO show an error
    expect(describeDecisionOutcome(res.result)).toBeNull();
  });

  it('treats a double submission as already-decided, never as a second decision', async () => {
    // The partial unique index is the idempotency contract: a replay raises
    // 23505 rather than creating a second authoritative original.
    const res = await call({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "case_decisions_one_original_per_case_idx"' } });
    expect(res.result).toBe(DECISION_RESULT.ALREADY_DECIDED);
    expect(describeDecisionOutcome(res.result)).toMatch(/already has a recorded outcome/i);
  });

  it('recognises the index by name even when the code is not surfaced', () => {
    expect(isAlreadyDecided({ message: 'violates case_decisions_one_original_per_case_idx' })).toBe(true);
    expect(isAlreadyDecided({ message: 'violates case_decisions_one_successor_idx' })).toBe(true);
    expect(isAlreadyDecided({ code: '23505' })).toBe(true);
    expect(isAlreadyDecided(null)).toBe(false);
  });

  it('reports an authorisation refusal as a refusal, not a generic error', async () => {
    const res = await call({ data: null, error: { code: '42501', message: 'Only HR or this case\'s disciplinary officer can record a decision' } });
    expect(res.result).toBe(DECISION_RESULT.REFUSED);
    expect(describeDecisionOutcome(res.result)).toMatch(/do not have authority/i);
    expect(isRefused({ code: '42501' })).toBe(true);
    // and a refusal is never mistaken for the RPC being absent
    expect(isRpcMissing({ code: '42501', message: 'Only HR' })).toBe(false);
    // nor is a genuine schema bug dressed up as a deployment window
    expect(isRpcMissing({ code: '42703', message: 'column "foo" does not exist' })).toBe(false);
  });

  it('refuses to call the RPC at all without the minimum inputs', async () => {
    const rpc = vi.fn();
    const res = await recordCaseDecisionWrite({ supabase: { rpc }, caseId: null, outcome: 'Demotion' });
    expect(res.result).toBe(DECISION_RESULT.INVALID);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('names the cutover window instead of blaming the user, when the RPC is not yet there', async () => {
    // The ONE expected cause is the few seconds between the new bundle going live
    // and the migration landing. "Couldn't record the outcome" would be wrong
    // there — nothing failed, and nothing was written.
    for (const err of [
      { code: 'PGRST202', message: 'Could not find the function public.record_case_decision' },
      { code: '42883', message: 'function record_case_decision(...) does not exist' },
    ]) {
      const res = await call({ data: null, error: err });
      expect(res.result).toBe(DECISION_RESULT.UNAVAILABLE);
      expect(describeDecisionOutcome(res.result)).toMatch(/finishing an update/i);
      expect(describeDecisionOutcome(res.result)).toMatch(/nothing was recorded/i);
    }
  });

  it('turns a thrown transport error into an error result rather than propagating', async () => {
    const res = await recordCaseDecisionWrite({
      supabase: { rpc: vi.fn().mockRejectedValue(new Error('network down')) },
      caseId: 'c1', outcome: 'Demotion',
    });
    expect(res.result).toBe(DECISION_RESULT.ERROR);
    expect(describeDecisionOutcome(res.result)).toMatch(/try again/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. CURRENT WARNINGS NOW RESOLVE THROUGH THE DECISION CHAIN — behavioural
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — Current Warnings reads the decision head', () => {
  const now = new Date('2026-10-03T00:00:00Z');
  const liveCase = { id: 'c1', employeeName: 'Ada Lovelace', stage: 'closed' };

  const decision = (over = {}) => ({
    id: 'd1', caseId: 'c1', decisionType: 'original', outcome: 'First written warning',
    decidedAt: '2026-06-01T00:00:00Z', warningDurationMonths: 12,
    warningExpiresAt: '2027-06-01', appealEffect: null, supersedesDecisionId: null, ...over,
  });

  it('shows a live warning from the decision, carrying its decision id', () => {
    const warnings = deriveCurrentWarnings([liveCase], [], now, [decision()]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].decisionId).toBe('d1');
    expect(warnings[0].type).toBe('First written warning');
    expect(warnings[0].expiresAt).toBe('2027-06-01');
  });

  it('does NOT show a warning that has expired', () => {
    expect(deriveCurrentWarnings([liveCase], [], now, [decision({ warningExpiresAt: '2026-01-01' })]))
      .toHaveLength(0);
  });

  it('does NOT show a decision with no decided_at — unknown provenance is not a live sanction', () => {
    expect(deriveCurrentWarnings([liveCase], [], now, [decision({ decidedAt: null })])).toHaveLength(0);
  });

  it('shows nothing for a case with no decision at all', () => {
    expect(deriveCurrentWarnings([liveCase], [], now, [])).toHaveLength(0);
  });

  it('follows supersession: the superseded original is not the live warning', () => {
    // THE PROPERTY cases.outcome alone can never express. An appeal that varied
    // a final written warning down to a first written warning leaves BOTH rows
    // in history, and only the head is current.
    const original = decision({ id: 'd1', outcome: 'Final written warning' });
    const appeal = decision({
      id: 'd2', decisionType: 'appeal', outcome: 'First written warning',
      appealEffect: 'varied', supersedesDecisionId: 'd1',
    });
    // currentDecision returns { decision, heads } — the head count matters, so
    // the resolver can say "this set has no single head" rather than guessing.
    const resolved = currentDecision([original, appeal]);
    expect(resolved.heads).toBe(1);
    expect(resolved.decision.id).toBe('d2');
    const warnings = deriveCurrentWarnings([liveCase], [], now, [original, appeal]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].decisionId).toBe('d2');
    expect(warnings[0].type).toBe('First written warning');
  });

  it('shows no live warning when an appeal overturned the sanction', () => {
    const original = decision({ id: 'd1' });
    const appeal = decision({
      id: 'd2', decisionType: 'appeal', outcome: 'No further action',
      appealEffect: 'overturned', supersedesDecisionId: 'd1',
    });
    expect(deriveCurrentWarnings([liveCase], [], now, [original, appeal])).toHaveLength(0);
  });

  it('never treats the legacy marker as a sanction', () => {
    const warnings = deriveCurrentWarnings([liveCase], [], now,
      [decision({ outcome: LEGACY_UNMAPPED, outcomeSourceText: 'First written warning issued' })]);
    expect(warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. DSAR CUTOVER — behavioural
// ═══════════════════════════════════════════════════════════════════════════
describe('D4.3 — case_decisions is disclosed, correctly', () => {
  const base = {
    employeeRecords: [
      { name: 'Ada Lovelace', jobTitle: 'Engineer', location: 'London' },
      { name: 'Grace Hopper', jobTitle: 'Manager', location: 'London' },
    ],
    cases: [
      { id: 'c1', employeeName: 'Ada Lovelace', caseType: 'Misconduct', meetings: [] },
      { id: 'c9', employeeName: 'Grace Hopper', caseType: 'Misconduct', meetings: [] },
    ],
  };
  const adaDecision = {
    id: 'd1', caseId: 'c1', decisionType: 'original', outcome: 'First written warning',
    decidedAt: '2026-06-01T00:00:00Z', warningDurationMonths: 12, warningExpiresAt: '2027-06-01',
    appealEffect: null, supersedesDecisionId: null, decidedBy: 'user-hr-1', outcomeNotes: 'HR reasoning',
  };

  it('is registered in the subject-source manifest, so the governance gate covers it', () => {
    expect(DSAR_SUBJECT_SOURCES.caseDecisions).toBe('case_decisions');
  });

  it("discloses the subject's own decision", () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [adaDecision] });
    expect(r.caseDecisions).toHaveLength(1);
    expect(r.caseDecisions[0].outcome).toBe('First written warning');
    expect(r.caseDecisions[0].decidedAt).toBe('2026-06-01T00:00:00Z');
    expect(r.caseDecisions[0].warningExpiresAt).toBe('2027-06-01');
  });

  it('NEVER discloses decided_by — the internal actor is not the subject\'s data to receive', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [adaDecision] });
    expect(r.caseDecisions[0]).not.toHaveProperty('decidedBy');
    expect(JSON.stringify(r.caseDecisions)).not.toContain('user-hr-1');
  });

  it('keeps HR reasoning review-required rather than releasing it', () => {
    // cases.outcomeNotes is already CASE_REVIEW_REQUIRED. A decision row must not
    // become a side door around that human review.
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [adaDecision] });
    expect(r.caseDecisions[0].reasoningRequiresReview).toBe(true);
    expect(JSON.stringify(r.caseDecisions)).not.toContain('HR reasoning');
  });

  it('does not leak another subject\'s decision', () => {
    const other = { ...adaDecision, id: 'd9', caseId: 'c9', decidedBy: 'user-hr-2' };
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [adaDecision, other] });
    expect(r.caseDecisions.map(d => d.caseId)).toEqual(['c1']);
  });

  it('does not leak a decision whose case is not in the authorised set at all', () => {
    // cross-org protection: a decision referencing a case the compiler was never
    // handed cannot appear, because the filter is the case boundary itself.
    const foreign = { ...adaDecision, id: 'dx', caseId: 'case-from-another-org' };
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [foreign] });
    expect(r.caseDecisions).toHaveLength(0);
  });

  it('reports unknown provenance as unknown rather than inferring it', () => {
    const r = compileSubjectData('Ada Lovelace', {
      ...base, caseDecisions: [{ ...adaDecision, decidedAt: null }],
    });
    expect(r.caseDecisions[0].decidedAt).toBeNull();
  });

  it('presents a legacy_unmapped decision as the string actually recorded, uninterpreted', () => {
    const r = compileSubjectData('Ada Lovelace', {
      ...base,
      caseDecisions: [{ ...adaDecision, outcome: LEGACY_UNMAPPED, outcomeSourceText: 'First written warning issued' }],
    });
    expect(r.caseDecisions[0].outcome).toBeNull();
    expect(r.caseDecisions[0].recordedAs).toBe('First written warning issued');
    // and it must not be read as one of the real sanctions
    expect(DECISION_OUTCOMES).not.toContain(r.caseDecisions[0].recordedAs);
  });

  it('marks a superseded decision as superseded, so the chain is legible', () => {
    const appeal = {
      ...adaDecision, id: 'd2', decisionType: 'appeal', outcome: 'No further action',
      appealEffect: 'overturned', supersedesDecisionId: 'd1', outcomeNotes: null,
    };
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [adaDecision, appeal] });
    const byId = Object.fromEntries(r.caseDecisions.map((d, i) => [i, d]));
    expect(r.caseDecisions).toHaveLength(2);
    expect(byId[0].superseded).toBe(true);
    expect(byId[1].superseded).toBe(false);
    expect(byId[1].appealEffect).toBe('overturned');
  });

  it('records the identity basis as the case, matching the other case-derived categories', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, caseDecisions: [adaDecision] });
    expect(r.identityBasisByCollection.caseDecisions).toBe('case_id');
    // and it sits with the other case-derived collections, not the name-keyed ones
    expect(r.identityBasisByCollection.allegations).toBe('case_id');
  });

  it('tolerates the absent input, so an older caller cannot crash the compile', () => {
    const r = compileSubjectData('Ada Lovelace', base);
    expect(r.caseDecisions).toEqual([]);
  });
});
