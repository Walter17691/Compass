import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — INVESTIGATOR REPORT DRAFT SAVING BOUNDARY.
//
// Before this slice, `authenticated` held a direct INSERT grant AND a
// permissive INSERT policy on investigation_report_versions, so a draft could
// be written straight to the table — bypassing the staleness check and the
// audit event that make saved versions trustworthy. Two saves from the same
// base version both succeeded, silently, and neither produced an audit row.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. The boundary is privileges, RLS and
// plpgsql, none of which is observable from JavaScript. So this file asserts
// the ARTIFACT says what it must, and the live rolled-back probes in the wave
// report prove the database behaves that way — as the real `authenticated`
// role, never as postgres. Both halves are required; neither is sufficient.
// This is the same division of labour as
// src/test/decisionInsertBoundaryD43b.test.js, which guards the equivalent
// boundary on case_decisions.
//
// THE ORDERING TEST BELOW IS NOT COSMETIC. An earlier draft of the save RPC
// compared the request before it checked the caller, which let an
// investigator whose case access had been REVOKED replay their old
// request_id and receive the stored row back — including adopted_by,
// adoption_basis and the HR-authored adoption_reason. A new save raised 42501
// and SELECT returned zero rows under RLS, so the replay path was the only
// way in and it bypassed both. "Authority precedes replay" is a security
// property, and it is asserted here by position so that reordering the
// function cannot quietly reintroduce the leak.
// ─────────────────────────────────────────────────────────────────────────

const FILE = 'supabase/investigation_report_draft_saving_2026-10-10.sql';
const raw = () => readFileSync(FILE, 'utf8');
// Comments are prose, not behaviour. This file DESCRIBES the bypass it closes
// and the leak it fixed, so an un-stripped assertion would read the
// description as the code.
const sql = () => raw()
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n');

function saveRpcBody() {
  const s = sql();
  const start = s.indexOf('create or replace function public.save_investigation_report_version');
  expect(start, 'the save RPC must be defined').toBeGreaterThan(-1);
  const end = s.indexOf('$function$;', start);
  expect(end, 'the save RPC must be terminated').toBeGreaterThan(start);
  return s.slice(start, end);
}

describe('B3.2-1 — no direct application INSERT path survives', () => {
  it('revokes the direct INSERT grant from anon and authenticated', () => {
    expect(sql()).toMatch(
      /revoke insert on public\.investigation_report_versions from anon, authenticated;/,
    );
  });

  it('drops the permissive INSERT policy', () => {
    expect(sql()).toMatch(
      /drop policy if exists "HR or the assigned investigator may save a report version"\s+on public\.investigation_report_versions;/,
    );
  });

  it('replaces it with a RESTRICTIVE false policy, so adding a permissive one cannot re-open it', () => {
    // PERMISSIVE policies are ORed, so a dropped one is undone by anyone
    // adding another. RESTRICTIVE is ANDed: re-opening has to be a deliberate
    // act of dropping this policy by name. Same reasoning, and the same
    // shape, as "Decisions are created only through record_case_decision".
    const s = sql();
    expect(s).toMatch(/create policy "Report versions are created only through save_investigation_report_version"/);
    expect(s).toMatch(/as restrictive for insert/);
    expect(s).toMatch(/with check \(false\)/);
  });

  it('leaves RLS enabled — the slice never disables or forces it off', () => {
    expect(sql()).not.toMatch(/disable row level security/i);
    expect(sql()).not.toMatch(/no force row level security/i);
  });

  it('does not weaken the SELECT policy, which is how the product and DSAR read versions', () => {
    const s = sql();
    expect(s).not.toMatch(/policy[^;]*for select/i);
    expect(s).not.toMatch(/drop policy[^;]*visible to HR and the current investigator/i);
    expect(s).not.toMatch(/revoke select/i);
  });

  it('keeps the save RPC reachable from the client, and only from a signed-in client', () => {
    const s = sql();
    expect(s).toMatch(/grant execute on function public\.save_investigation_report_version\([^)]*\) to authenticated;/);
    expect(s).toMatch(/revoke all on function public\.save_investigation_report_version\([^)]*\) from anon;/);
    expect(s).toMatch(/revoke all on function public\.save_investigation_report_version\([^)]*\) from public;/);
    // service_role is deliberately never granted: automation cannot author.
    expect(s).not.toMatch(/grant execute on function public\.save_investigation_report_version\([^)]*\) to service_role/);
  });

  it('defines the RPC as SECURITY DEFINER with a pinned search_path', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path to 'public'/);
  });
});

describe('B3.2-1 — the save RPC keeps its authority protections', () => {
  it('refuses an unauthenticated or service-role author', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/coalesce\(auth\.role\(\), ''\) = 'service_role'/);
    expect(body).toMatch(/v_actor uuid := case when v_privileged then null else auth\.uid\(\) end/);
    expect(body).toMatch(/if v_actor is null then/);
    expect(body).toMatch(/cannot author a report/);
  });

  it('requires the assigned investigator, or HR with a written reason', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/from public\.case_access ca[\s\S]*ca\.role = 'investigator'/);
    expect(body).toMatch(/public\.is_hr_role\(om\.role\)/);
    expect(body).toMatch(/if not v_is_investigator then/);
    expect(body).toMatch(/requires a written reason/);
    // Blank-but-present is not a reason.
    expect(body).toMatch(/v_reason text := nullif\(btrim\(coalesce\(p_hr_reason, ''\)\), ''\)/);
  });

  it('scopes authority to the case being written, not merely to the organisation', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/ca\.case_id = p_case_id and ca\.user_id = v_actor/);
    // HR is org-scoped by design, but org_id comes from the LOCKED case row,
    // never from the caller — which is what makes cross-tenant impossible.
    expect(body).toMatch(/om\.org_id = v_case\.org_id/);
    expect(body).not.toMatch(/p_org_id/);
  });
});

describe('B3.2-1 — authority is established BEFORE the stored row is read', () => {
  it('checks the caller before looking up the request, so a replay cannot leak to a revoked user', () => {
    const body = saveRpcBody();
    const authority = body.indexOf('into v_is_investigator, v_is_hr');
    const replay = body.indexOf('where request_id = p_request_id');
    const replayReturn = body.indexOf('return v_existing');
    expect(authority, 'the authority predicate must exist').toBeGreaterThan(-1);
    expect(replay, 'the replay lookup must exist').toBeGreaterThan(-1);
    expect(replayReturn, 'the replay must return the stored row').toBeGreaterThan(-1);
    expect(authority, 'AUTHORITY MUST PRECEDE THE REPLAY LOOKUP').toBeLessThan(replay);
    expect(authority, 'AUTHORITY MUST PRECEDE RETURNING A STORED ROW').toBeLessThan(replayReturn);
  });

  it('still checks the replay before staleness, so a genuine retry is not read as a conflict', () => {
    const body = saveRpcBody();
    const replay = body.indexOf('where request_id = p_request_id');
    const stale = body.indexOf('coalesce(max(version_no), 0)');
    expect(stale, 'the staleness read must exist').toBeGreaterThan(-1);
    expect(replay, 'REPLAY MUST PRECEDE STALENESS').toBeLessThan(stale);
  });

  it('takes the case lock before reading anything it decides on', () => {
    const body = saveRpcBody();
    const lock = body.indexOf('for update');
    const authority = body.indexOf('into v_is_investigator, v_is_hr');
    const stale = body.indexOf('coalesce(max(version_no), 0)');
    expect(lock, 'the case must be locked').toBeGreaterThan(-1);
    expect(lock).toBeLessThan(authority);
    expect(lock).toBeLessThan(stale);
  });
});

describe('B3.2-1 — concurrency and idempotency', () => {
  it('requires an explicit expected base version and refuses a stale save', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/if p_expected_base_version is null then/);
    expect(body).toMatch(/STALE_EDITOR/);
    expect(body).toMatch(/errcode = '40001'/);
  });

  it('compares every field of a replayed request, including the HR reason via the digest', () => {
    const body = saveRpcBody();
    for (const field of [
      /v_existing\.case_id is distinct from p_case_id/,
      /v_existing\.created_by is distinct from v_actor/,
      /v_existing\.body is distinct from p_body/,
      /v_existing\.source is distinct from p_source/,
      /\(v_existing\.version_no - 1\) is distinct from p_expected_base_version/,
      /v_existing\.request_digest is distinct from v_digest/,
    ]) {
      expect(body, String(field)).toMatch(field);
    }
  });

  it('binds the request identifier to the whole request with a digest over all six inputs', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/v_digest := encode\(sha256\(convert_to\(jsonb_build_object\(/);
    for (const key of ["'case_id'", "'actor'", "'body'", "'source'", "'base'", "'reason'"]) {
      expect(body, `the digest must cover ${key}`).toContain(key);
    }
  });

  it('stores both request columns on the inserted row', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/\(org_id, case_id, body, source, request_id, request_digest\)/);
    expect(body).toMatch(/p_request_id, v_digest\)/);
  });

  it('gives the request columns a database uniqueness guarantee and protects them from mutation', () => {
    const s = sql();
    expect(s).toMatch(/add column if not exists request_id uuid;/);
    expect(s).toMatch(/add column if not exists request_digest text;/);
    expect(s).toMatch(/create unique index if not exists investigation_report_versions_request_id_unique\s+on public\.investigation_report_versions \(request_id\)\s+where request_id is not null;/);
    // The immutability guard enumerates protected columns by name, so a new
    // column is unprotected on UPDATE unless it is listed.
    expect(s).toMatch(/new\.request_id is distinct from old\.request_id/);
    expect(s).toMatch(/new\.request_digest is distinct from old\.request_digest/);
  });

  it('rejects an explicit null source without coercing it, and never coalesces at the insert', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/p_source text default 'edited'/);
    expect(body).toMatch(/coalesce\(p_source, ''\) not in \('generated', 'edited'\)/);
    // The validation above makes p_source non-null, so the insert must use it
    // directly — a coalesce there would be unreachable code implying a
    // default that cannot apply.
    expect(body).not.toMatch(/coalesce\(p_source, 'edited'\)/);
  });
});

describe('B3.2-1 — every successful save is attributable, and nothing else is logged', () => {
  it('writes the audit row itself rather than through the generic RPC', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/insert into public\.audit_log \(org_id, user_id, user_name, action, detail, case_id\)/);
    expect(body).toMatch(/'Investigation report draft saved'/);
    expect(body).toMatch(/'Investigation report draft saved under HR exception'/);
    // Attribution is the authenticated actor, not the definer.
    expect(body).toMatch(/v_case\.org_id, v_actor, coalesce\(v_member\.name, 'Unknown'\)/);
  });

  it('records the HR exception reason in the audit detail', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/saved by HR rather than the assigned investigator\. Reason: ' \|\| v_reason/);
  });

  it('reserves both new actions so they cannot be forged through log_audit_event', () => {
    const s = sql();
    const start = s.indexOf('create or replace function public.log_audit_event');
    expect(start).toBeGreaterThan(-1);
    const reserved = s.slice(start);
    expect(reserved).toMatch(/'Investigation report draft saved',/);
    expect(reserved).toMatch(/'Investigation report draft saved under HR exception'/);
    expect(reserved).toMatch(/can only be logged by its own authoritative function/);
    // The pre-existing reserved actions must survive the replacement.
    for (const kept of [
      /'Case deleted',/, /'Outcome issued',/, /'Investigation report adopted',/,
      /'Investigation report adopted under HR exception',/,
      /'Investigation conclusion recorded',/, /'Employee created',/,
    ]) {
      expect(reserved, String(kept)).toMatch(kept);
    }
  });

  it('writes the audit row only after the version row, so a refused save logs nothing', () => {
    const body = saveRpcBody();
    const insertVersion = body.indexOf('insert into public.investigation_report_versions');
    const insertAudit = body.indexOf('insert into public.audit_log');
    expect(insertVersion).toBeGreaterThan(-1);
    expect(insertAudit).toBeGreaterThan(insertVersion);
    // And the replay returns before reaching either.
    expect(body.indexOf('return v_existing')).toBeLessThan(insertVersion);
  });
});

describe('B3.2-1 — a draft save is an append, and nothing more', () => {
  it('never adopts, never touches the case, and never submits an HR review', () => {
    const s = sql();
    for (const forbidden of [
      /adopt_investigation_report_version/,
      /update public\.cases/i,
      /investigation_report\s*=/,
      /\bstage\s*=\s*'/,
      /hr_review_requests/,
      /adopted_at\s*=/, /adopted_by\s*=/, /is_current\s*=\s*true/,
    ]) {
      expect(s, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('creates and drops no table, and removes no column', () => {
    const s = sql();
    for (const forbidden of [
      /create table/i, /drop table/i, /truncate/i,
      /drop column/i, /alter column/i,
      /delete from public\.investigation_report_versions/i,
      /update public\.investigation_report_versions/i,
    ]) {
      expect(s, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('leaves the author guard and the version-numbering trigger alone', () => {
    const s = sql();
    expect(s).not.toMatch(/create or replace function public\.investigation_report_versions_author_guard/);
    expect(s).not.toMatch(/create or replace function public\.assign_investigation_report_version_no/);
    expect(s).not.toMatch(/create trigger/i);
    expect(s).not.toMatch(/drop trigger/i);
  });

  it('refuses to apply against function bodies it was not written for', () => {
    // The drift guard runs INSIDE the applying transaction, so the check
    // cannot pass and then apply against something that changed in between.
    const s = sql();
    expect(s).toMatch(/\$guard\$/);
    for (const md5 of [
      '5356124b433a41d6b7d9e4d09c0114eb',   // log_audit_event
      '04282636a542e6e6c255e42d4e8de657',   // immutability guard
      'c25056999f07a5d789a1ec0034e9204e',   // author guard
      'fc76a8f6adb17d4f40c2e988143062d0',   // version numbering
    ]) {
      expect(s, `drift guard must pin ${md5}`).toContain(md5);
    }
    expect(s).toMatch(/raise exception 'DRIFT/);
  });

  it('is one transaction, so a failed drift check applies nothing', () => {
    const code = sql().split('\n').map(l => l.trim());
    expect(code.filter(l => l === 'begin;')).toHaveLength(1);
    expect(code.filter(l => l === 'commit;')).toHaveLength(1);
    expect(code.indexOf('begin;')).toBeLessThan(code.indexOf('commit;'));
  });

  it('defines each function exactly once, so no later definition silently wins', () => {
    const s = sql();
    for (const fn of [
      'public.save_investigation_report_version',
      'public.log_audit_event',
      'public.investigation_report_versions_immutability_guard',
    ]) {
      const matches = s.match(new RegExp(`create or replace function ${fn.replace('.', '\\.')}`, 'g')) || [];
      expect(matches, `${fn} must be defined exactly once`).toHaveLength(1);
    }
  });
});

describe('B3.2-1 — the adoption and DSAR paths are untouched', () => {
  it('does not redefine the adoption RPC, whose capability is structural', () => {
    expect(sql()).not.toMatch(/function public\.adopt_investigation_report_version/);
  });

  it('preserves the adoption and supersession clauses of the immutability guard', () => {
    // §3 replaces this function to add the two request columns. Everything
    // else it protects must survive that replacement.
    const s = sql();
    const start = s.indexOf('create or replace function public.investigation_report_versions_immutability_guard');
    const guard = s.slice(start, s.indexOf('$function$;', start));
    for (const kept of [
      /new\.body is distinct from old\.body/,
      /new\.version_no is distinct from old\.version_no/,
      /new\.created_by is distinct from old\.created_by/,
      /new\.author_kind is distinct from old\.author_kind/,
      /cannot be un-adopted or re-attributed/,
      /A superseded adoption cannot be altered/,
      /cannot be deleted/,
    ]) {
      expect(guard, String(kept)).toMatch(kept);
    }
  });

  it('adds no column the DSAR gateway reads, because both reads select explicit lists', async () => {
    // request_id and request_digest are technical integrity metadata, not
    // information about the subject. The guarantee that they stay out of a
    // subject access response is that the gateway names its columns.
    const gateway = readFileSync('src/lib/reportVersionGateway.js', 'utf8');
    expect(gateway).not.toMatch(/\.select\(\s*'\*'\s*\)/);
    expect(gateway).not.toMatch(/request_id/);
    expect(gateway).not.toMatch(/request_digest/);
  });

  it('leaves the recorded two-policy RLS posture correct, because the deny replaces the permit', () => {
    // One permissive INSERT policy out, one restrictive INSERT policy in, so
    // the count this codebase records for the table does not move. If a
    // future change drops the policy WITHOUT replacing it, this assertion and
    // RECORDED_RLS_2026_10_03 must both be revisited together.
    const s = sql();
    const drops = (s.match(/drop policy/g) || []).length;
    const creates = (s.match(/create policy/g) || []).length;
    expect(drops, 'exactly one policy is dropped').toBe(1);
    expect(creates, 'exactly one policy is created').toBe(1);
  });
});
