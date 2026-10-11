import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────
// B3.2 — PERSISTENT AUTHORING MODE, MIGRATION BOUNDARY.
//
// Follows src/test/reportVersionDraftBoundaryB321.test.js, which guards the
// migration before this one: assert the ARTIFACT says what it must, and let
// the rolled-back probes in the wave report prove the database behaves that
// way. Both halves are required; neither is sufficient.
//
// THE ASSERTION THAT MATTERS MOST IS THE DROP. CREATE OR REPLACE cannot add a
// parameter — it creates a SECOND function, and the existing six-argument
// call then raises 42725 'is not unique'. Proven on the live database, not
// assumed. A migration that replaced in place would break every save the
// moment it landed, and because activation is off nobody would notice until
// UAT. So the drop is tested by name, and so is the regrant that must follow
// it, because DROP takes the function's ACL with it.
// ─────────────────────────────────────────────────────────────────────────

const FILE = 'supabase/report_authoring_mode_2026-10-11.sql';
const raw = () => readFileSync(FILE, 'utf8');
// Comments are prose, not behaviour. This file DESCRIBES the overload hazard
// it avoids, so an un-stripped assertion would read the description as code.
const sql = () => raw().split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

function saveRpcBody() {
  const s = sql();
  const start = s.indexOf('create function public.save_investigation_report_version');
  expect(start, 'the save RPC must be created, not replaced').toBeGreaterThan(-1);
  const end = s.indexOf('$function$;', start);
  expect(end).toBeGreaterThan(start);
  return s.slice(start, end);
}

describe('B3.2 — the overload hazard is avoided, not walked into', () => {
  it('DROPS the six-argument signature by name', () => {
    expect(sql()).toMatch(
      /drop function if exists public\.save_investigation_report_version\(uuid, text, uuid, integer, text, text\);/,
    );
  });

  it('CREATEs the seven-argument function rather than replacing in place', () => {
    const s = sql();
    expect(s).toMatch(/create function public\.save_investigation_report_version\(/);
    // A `create or replace` of the save RPC would leave both signatures live.
    expect(s).not.toMatch(/create or replace function public\.save_investigation_report_version/);
  });

  it('drops BEFORE it creates, so the two never coexist', () => {
    const s = sql();
    expect(s.indexOf('drop function if exists public.save_investigation_report_version'))
      .toBeLessThan(s.indexOf('create function public.save_investigation_report_version'));
  });

  it('reissues the grants, because DROP takes the ACL with it', () => {
    const s = sql();
    expect(s).toMatch(/grant execute on function public\.save_investigation_report_version\(uuid, text, uuid, integer, text, text, text\) to authenticated;/);
    expect(s).toMatch(/revoke all on function public\.save_investigation_report_version\([^)]*\) from public;/);
    expect(s).toMatch(/revoke all on function public\.save_investigation_report_version\([^)]*\) from anon;/);
    expect(s).not.toMatch(/grant execute on function public\.save_investigation_report_version\([^)]*\) to service_role/);
  });

  it('is one transaction, so a failed drift check applies nothing', () => {
    const code = sql().split('\n').map(l => l.trim());
    expect(code.filter(l => l === 'begin;')).toHaveLength(1);
    expect(code.filter(l => l === 'commit;')).toHaveLength(1);
    expect(code.indexOf('begin;')).toBeLessThan(code.indexOf('commit;'));
  });
});

describe('B3.2 — every new version states how it was written', () => {
  it('adds a NULLABLE column, so "not recorded" stays sayable about the past', () => {
    const s = sql();
    expect(s).toMatch(/add column if not exists authoring_mode text;/);
    expect(s).not.toMatch(/authoring_mode text not null/i);
    expect(s).not.toMatch(/alter column authoring_mode set not null/i);
  });

  it('constrains the value when present, to exactly the two the product knows', () => {
    expect(sql()).toMatch(
      /check \(authoring_mode is null\s*\n?\s*or authoring_mode in \('structured_sections', 'single_document'\)\)/,
    );
  });

  it('…but the RPC refuses missing, null, blank and unrecognised modes', () => {
    const body = saveRpcBody();
    // blank is folded into null before the check, so one test covers both
    expect(body).toMatch(/v_mode text := nullif\(btrim\(coalesce\(p_authoring_mode, ''\)\), ''\)/);
    expect(body).toMatch(/if v_mode is null then/);
    expect(body).toMatch(/must state how the report was written/);
    expect(body).toMatch(/if v_mode not in \('structured_sections', 'single_document'\) then/);
    expect(body).toMatch(/Unknown authoring mode/);
  });

  it('infers nothing and defaults nothing on the server', () => {
    const body = saveRpcBody();
    // No server-side fallback to a mode, and no reading of the body to guess.
    expect(body).not.toMatch(/coalesce\(p_authoring_mode, 'structured_sections'\)/);
    expect(body).not.toMatch(/v_mode := 'structured_sections'/);
    expect(body).not.toMatch(/v_mode := 'single_document'/);
  });

  it('keeps DEFAULT NULL on the parameter so an old six-key call is refused honestly', () => {
    // Without the default the call would not resolve at all, and the client
    // would report "Compass is finishing an update" for a provenance defect.
    expect(saveRpcBody()).toMatch(/p_authoring_mode text default null/);
  });

  it('writes the mode onto the row', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/\(org_id, case_id, body, source, request_id, request_digest, authoring_mode\)/);
    expect(body).toMatch(/p_request_id, v_digest, v_mode\)/);
  });
});

describe('B3.2 — idempotency still cannot be fooled', () => {
  it('the digest covers the authoring mode', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/v_digest := encode\(sha256\(convert_to\(jsonb_build_object\(/);
    for (const key of ["'case_id'", "'actor'", "'body'", "'source'", "'base'", "'reason'", "'mode'"]) {
      expect(body, `the digest must cover ${key}`).toContain(key);
    }
  });

  it('the replay comparison names the mode explicitly, for a precise refusal', () => {
    expect(saveRpcBody()).toMatch(/v_existing\.authoring_mode is distinct from v_mode/);
  });

  it('keeps the established order: authority → replay → staleness → insert → audit', () => {
    const body = saveRpcBody();
    const authority = body.indexOf('into v_is_investigator, v_is_hr');
    const replay = body.indexOf('where request_id = p_request_id');
    const stale = body.indexOf('coalesce(max(version_no), 0)');
    const insert = body.indexOf('insert into public.investigation_report_versions');
    const audit = body.indexOf('insert into public.audit_log');
    expect(authority).toBeGreaterThan(-1);
    expect(authority).toBeLessThan(replay);
    expect(replay).toBeLessThan(stale);
    expect(stale).toBeLessThan(insert);
    expect(insert).toBeLessThan(audit);
  });

  it('still locks the case before it decides anything', () => {
    const body = saveRpcBody();
    expect(body.indexOf('for update')).toBeLessThan(body.indexOf('into v_is_investigator, v_is_hr'));
  });
});

describe('B3.2 — the recorded mode is immutable', () => {
  it('is listed in the immutability guard, beside the other protected columns', () => {
    const s = sql();
    expect(s).toMatch(/new\.authoring_mode is distinct from old\.authoring_mode/);
    // and the ones it must not displace
    for (const kept of [
      /new\.body is distinct from old\.body/,
      /new\.created_by is distinct from old\.created_by/,
      /new\.request_id is distinct from old\.request_id/,
      /new\.request_digest is distinct from old\.request_digest/,
      /cannot be un-adopted or re-attributed/,
      /A superseded adoption cannot be altered/,
      /cannot be deleted/,
    ]) {
      expect(s, String(kept)).toMatch(kept);
    }
  });
});

describe('B3.2 — the audit says how, and says when it changed', () => {
  it('records the mode in the detail', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/written as /);
    expect(body).toMatch(/seven guided sections/);
    expect(body).toMatch(/one document/);
  });

  it('names a transition from the previous version, rather than leaving it to be inferred', () => {
    const body = saveRpcBody();
    expect(body).toMatch(/select authoring_mode into v_prev_mode/);
    expect(body).toMatch(/v_prev_mode is not null and v_prev_mode is distinct from v_mode/);
    expect(body).toMatch(/changed from /);
  });

  it('adds no new reserved action, so log_audit_event is untouched', () => {
    expect(sql()).not.toMatch(/create or replace function public\.log_audit_event/);
  });
});

describe('B3.2 — the blast radius is exactly the two functions and one column', () => {
  it('does not touch the adoption RPC, the author guard or the numbering trigger', () => {
    const s = sql();
    expect(s).not.toMatch(/function public\.adopt_investigation_report_version/);
    expect(s).not.toMatch(/function public\.investigation_report_versions_author_guard/);
    expect(s).not.toMatch(/function public\.assign_investigation_report_version_no/);
  });

  it('changes no policy, no grant on the table, and no trigger', () => {
    const s = sql();
    expect(s).not.toMatch(/create policy|drop policy|alter policy/i);
    expect(s).not.toMatch(/(grant|revoke)[^;]*on public\.investigation_report_versions/i);
    expect(s).not.toMatch(/create trigger|drop trigger/i);
  });

  it('creates and drops no table, and writes no row', () => {
    const s = sql();
    for (const forbidden of [
      /create table/i, /drop table/i, /truncate/i, /drop column/i,
      /\binsert into public\.investigation_report_versions\b(?![\s\S]{0,400}returning \* into v_row)/,
      /update public\.cases/i, /delete from/i,
    ]) {
      expect(s, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('refuses to apply against function bodies it was not written for', () => {
    const s = sql();
    expect(s).toMatch(/\$guard\$/);
    for (const md5 of [
      'afc33c77086466f514513e8dee00531a',   // save RPC, being replaced
      'fcbaf3bcd9dd26469a5d141d4b2962d1',   // immutability guard, being replaced
      'c25056999f07a5d789a1ec0034e9204e',   // author guard, depended on
      'fc76a8f6adb17d4f40c2e988143062d0',   // version numbering, depended on
      '2a4134eda9d7049d774852e8d41f3e3e',   // log_audit_event, depended on
    ]) {
      expect(s, `drift guard must pin ${md5}`).toContain(md5);
    }
    expect(s).toMatch(/raise exception 'DRIFT/);
  });

  it('documents a rollback, and says when it stops being safe', () => {
    // Rollback is only clean while no version records a mode. The prose is
    // the artefact's own record of that, and the probe proved the part that
    // is easy to miss: the two replaced bodies do not come back on their own.
    const r = raw();
    expect(r).toMatch(/ROLLBACK — VALID ONLY WHILE investigation_report_versions IS EMPTY/);
    expect(r).toMatch(/drop constraint investigation_report_versions_authoring_mode_valid/);
    expect(r).toMatch(/drop column authoring_mode/);
    expect(r).toMatch(/re-run the PRE-MIGRATION definitions/);
    expect(r).toMatch(/ROLLBACK DESTROYS PROVENANCE/);
  });
});
