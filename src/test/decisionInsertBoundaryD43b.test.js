import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3b — AUTHORITATIVE DECISION INSERT BOUNDARY (NEW-50).
//
// D4.3 closed the cases.* projection but left the authoritative table itself
// open: the D4.2 INSERT policy let any HR member of the case's organisation
// INSERT a decision row directly, producing decision history with no
// projection, no correlated audit event, no required approval request, and a
// caller-chosen decided_at. That became load-bearing the moment Current
// Warnings and DSAR started trusting the table.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. The boundary is RLS plus a trigger,
// and neither is observable from JavaScript. So this file asserts the ARTIFACT
// says what it must, and the live adversarial probes in the wave report prove
// the database behaves that way — as the real `authenticated` role, never as
// postgres. Both halves are required; neither is sufficient.
// ─────────────────────────────────────────────────────────────────────────

const FILE = 'supabase/decision_insert_boundary_2026-10-03.sql';
const raw = () => readFileSync(FILE, 'utf8');
// Comments are prose, not behaviour. This file DESCRIBES the bypass it closes,
// so an un-stripped assertion would read the description as the code.
const sql = () => raw().split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

function guardBody() {
  const s = sql();
  const start = s.indexOf('function public.case_decisions_append_only_guard()');
  expect(start, 'the guard must be redefined').toBeGreaterThan(-1);
  return s.slice(start, s.indexOf('$$;', start));
}

describe('D4.3b — no application INSERT path survives', () => {
  it('removes the permissive HR/disciplinary-officer INSERT policy', () => {
    expect(sql()).toMatch(/drop policy if exists "Only HR or the case's disciplinary officer may record a decisio"\s+on public\.case_decisions;/);
  });

  it('replaces it with a RESTRICTIVE false policy, so adding a permissive one cannot re-open it', () => {
    // PERMISSIVE policies are ORed, so a `false` permissive policy would be
    // defeated by anyone adding another. RESTRICTIVE is ANDed: re-opening has
    // to be deliberate, which is the property worth having.
    const s = sql();
    expect(s).toMatch(/create policy "Decisions are created only through record_case_decision"/);
    expect(s).toMatch(/as restrictive for insert/);
    expect(s).toMatch(/with check \(false\)/);
  });

  it('does not weaken the SELECT policy, which is how the product reads decisions', () => {
    // The cutover made Current Warnings and DSAR depend on reading this table.
    // A slice about INSERT must not touch read access.
    expect(sql()).not.toMatch(/policy[^;]*for select/i);
    expect(sql()).not.toMatch(/drop policy[^;]*visible with the case/i);
  });

  it('changes no table, column or row — it is a boundary slice only', () => {
    const s = sql();
    for (const forbidden of [
      /create table/i, /alter table/i, /drop table/i,
      /\binsert into public\.case_decisions\b/i,
      /\bupdate public\.case_decisions\b/i,
      /\bdelete from public\.case_decisions\b/i,
    ]) {
      expect(s, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('does not touch the authoritative RPC, whose capability is structural', () => {
    // record_case_decision is SECURITY DEFINER owned by the table owner, so it
    // bypasses RLS and needs no grant from this migration. Redefining it here
    // would be an unrelated change to a deployed security-critical function.
    expect(sql()).not.toMatch(/function public\.record_case_decision/);
  });
});

describe('D4.3b — the trigger is the independent second lock', () => {
  it('requires the controlled operation to have run, for THIS case', () => {
    const body = guardBody();
    expect(body).toMatch(/v_marker := nullif\(current_setting\('compass\.recording_case_decision', true\), ''\)/);
    expect(body).toMatch(/if v_marker is null or v_marker <> new\.case_id::text then/);
    expect(body).toMatch(/errcode = '42501'/);
  });

  it('fails closed on an absent or mismatched marker', () => {
    const body = guardBody();
    // nullif collapses '' to null and null is refused, so "no marker" and
    // "empty marker" land in the same branch rather than one slipping through.
    const check = body.slice(body.indexOf('v_marker := nullif'));
    expect(check).toMatch(/v_marker is null/);
    expect(check).toMatch(/v_marker <> new\.case_id::text/);
  });

  it('FORCES decided_at rather than merely requiring it — the back-dating hole', () => {
    // D4.2's guard only asked that decided_at be present, which let a direct
    // insert date a sanction to 1999. Assignment removes the caller's choice.
    const body = guardBody();
    expect(body).toMatch(/new\.decided_at := now\(\)/);
    expect(body).not.toMatch(/if new\.decided_at is null then/);
  });

  it('still forces decided_by to the caller', () => {
    expect(guardBody()).toMatch(/new\.decided_by := auth\.uid\(\)/);
  });

  it('still refuses legacy_unmapped for an application write', () => {
    expect(guardBody()).toMatch(/new\.outcome = 'legacy_unmapped'/);
  });

  it('keeps UPDATE and DELETE append-only', () => {
    const body = guardBody();
    expect(body).toMatch(/if tg_op = 'DELETE' then[\s\S]*?cannot be deleted/);
    expect(body).toMatch(/if tg_op = 'UPDATE' then[\s\S]*?cannot be changed/);
  });

  it('tests privilege on auth.role() only — never current_user (NEW-49)', () => {
    const body = guardBody();
    expect(body).toMatch(/privileged boolean := coalesce\(auth\.role\(\), ''\) = 'service_role';/);
    expect(body).not.toContain('current_user');
    expect(body).not.toContain('supabase_admin');
  });

  it('does not expose any callable helper that sets the marker', () => {
    // A function in `public` that set this GUC would be reachable through
    // PostgREST and would hand the boundary away.
    const s = sql();
    const setters = [...s.matchAll(/set_config\('compass\.recording_case_decision'/g)];
    expect(setters.length, 'this migration must not set the marker anywhere').toBe(0);
    expect(s).not.toMatch(/create (or replace )?function[^$]*set_config\('compass\./);
  });
});

describe('D4.3b — service and migration capability is deliberate, not habitual', () => {
  it('documents why the service_role path is required and what still constrains it', () => {
    const prose = raw();
    expect(prose).toMatch(/WHY REQUIRED/);
    expect(prose).toMatch(/WHICH CONTROLS STILL APPLY/);
    expect(prose).toMatch(/WHY ORDINARY CALLERS CANNOT REACH IT/);
  });

  it('states that a SQL-editor migration is NOT privileged and must opt in', () => {
    // The honest consequence of fixing NEW-49: migrations stopped being
    // privileged by accident, so opting in has to be a visible line.
    const prose = raw();
    expect(prose).toMatch(/auth\.role\(\) NULL and is therefore NOT\s*--\s*privileged/);
    expect(prose).toMatch(/set_config\('request\.jwt\.claims', '\{"role":"service_role"\}', true\)/);
  });

  it('carries a complete rollback that names what rolling back reinstates', () => {
    const prose = raw();
    expect(prose).toMatch(/ROLLBACK/);
    expect(prose).toMatch(/Rolling back reinstates NEW-50/);
  });
});

describe('D4.3b — the historical corpus is out of scope and stays that way', () => {
  it('records the pre-migration baseline WITH its digest expression', () => {
    const prose = raw();
    expect(prose).toMatch(/ba45de6c8fdfd76abd81f15533f7b6a2/);
    expect(prose).toMatch(/4b80939135bbbae89770fe6e49230dca/);
    // a digest without its expression is not evidence — the D4.3 lesson
    expect(prose).toMatch(/md5\(string_agg\(id::text\|\|':'\|\|outcome, ',' order by id\)\)/);
  });

  it('promises no repair of the 135 unknown historical dates, and writes no row', () => {
    const prose = raw();
    expect(prose).toMatch(/135 historical rows whose decided_at is genuinely unknown are NOT touched/);
    expect(sql()).not.toMatch(/update public\.case_decisions/);
  });
});

describe('D4.3b — the governance record', () => {
  const register = () => readFileSync('docs/release-1-defect-register.md', 'utf8');

  it('files NEW-50 with an accurate description', () => {
    const r = register();
    expect(r).toMatch(/### NEW-50/);
    expect(r).toMatch(/NEW-50[\s\S]{0,4000}?record_case_decision/);
  });

  it('does NOT describe NEW-50 as cross-tenant, because the evidence says otherwise', () => {
    // The policy always required same-org membership, and a wrong-org HR direct
    // INSERT was refused 42501 while seeing 0 rows. Overstating it would be as
    // wrong as understating it.
    const r = register();
    const entry = r.slice(r.indexOf('### NEW-50'), r.indexOf('### NEW-50') + 4000);
    expect(entry).toMatch(/not a (cross-tenant|tenancy)/i);
  });

  it('marks NEW-49 resolved, since D4.3 fixed it and production proved it', () => {
    const r = register();
    const entry = r.slice(r.indexOf('### NEW-49'), r.indexOf('### NEW-49') + 3000);
    expect(entry).not.toMatch(/—\s*OPEN\s*$/m);
    expect(entry).toMatch(/RESOLVED/);
  });
});
