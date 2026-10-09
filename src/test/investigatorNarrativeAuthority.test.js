import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  mayRecordInvestigationNarrative, mayRecordInvestigationConclusion, CASE_ROLE,
} from '../lib/investigationAuthority.js';

// ═══════════════════════════════════════════════════════════════════════════
// IR-REPORT-01b / B2 REVIEW — the narrative authority, in BOTH layers.
//
// The defect: `allegations.investigator_finding`, `.outstanding_uncertainty`
// and `.witness_evidence` had NO column-level rule. They were deliberately
// excluded from protect_allegations_finding_columns, so the only constraint was
// `allegations`' single FOR ALL policy delegating to `cases` — which admits
// every role that can write to the case. The UI predicate was the only real
// boundary, and it admitted the disciplinary officer by accident of origin.
//
// Measured on branch qlgspfzzfjepwzaryeoi: a user holding only
// case_access.role='disciplinary_officer' wrote witness_evidence successfully,
// and a level-1 legal_reviewer wrote investigator_finding successfully. With the
// guard in place both are refused 42501, and dropping the guard lets both
// through again — so it is the guard, not RLS and not another trigger, that
// enforces this.
//
// These tests pin the two layers and, more importantly, pin them TO EACH OTHER.
// ═══════════════════════════════════════════════════════════════════════════

const MIGRATION = 'supabase/investigator_narrative_authority_2026-10-08.sql';
const sql = () => readFileSync(MIGRATION, 'utf8');
const body = () => {
  const src = sql();
  const start = src.indexOf('create or replace function public.protect_allegations_investigator_narrative_columns');
  expect(start, 'the guard function moved or was renamed').toBeGreaterThan(-1);
  return src.slice(start);
};

// The case_access roles that exist in this product, so "which roles are
// admitted" is answered over the real vocabulary rather than two examples.
const ALL_CASE_ROLES = [
  'investigator', 'disciplinary_officer', 'appeal_manager', 'notetaker',
  'case_owner', 'approver', 'employee_manager', 'legal_reviewer', 'auditor',
];

describe('the UI predicate after the correction', () => {
  it('admits HR and the assigned investigator', () => {
    expect(mayRecordInvestigationNarrative({ isHR: true, caseRole: null })).toBe(true);
    expect(mayRecordInvestigationNarrative({ isHR: false, caseRole: CASE_ROLE.INVESTIGATOR })).toBe(true);
  });

  it('admits NOBODY else, across the whole case-role vocabulary', () => {
    const admitted = ALL_CASE_ROLES
      .filter(caseRole => mayRecordInvestigationNarrative({ isHR: false, caseRole }));
    expect(admitted).toEqual(['investigator']);
  });

  it('specifically excludes the disciplinary officer', () => {
    expect(mayRecordInvestigationNarrative({ isHR: false, caseRole: 'disciplinary_officer' })).toBe(false);
  });

  it('is now exactly the conclusion rule, for every input', () => {
    for (const isHR of [true, false]) {
      for (const caseRole of [...ALL_CASE_ROLES, null, undefined, '']) {
        expect(
          mayRecordInvestigationNarrative({ isHR, caseRole }),
          `narrative/conclusion disagree for isHR=${isHR} caseRole=${caseRole}`,
        ).toBe(mayRecordInvestigationConclusion({ isHR, caseRole }));
      }
    }
  });
});

describe('the migration that makes the database agree', () => {
  it('exists and creates the guard function and its trigger', () => {
    const src = sql();
    expect(src).toContain('create or replace function public.protect_allegations_investigator_narrative_columns()');
    expect(src).toContain('create trigger protect_allegations_investigator_narrative_trg');
  });

  it('fires on BOTH INSERT and UPDATE — an UPDATE-only rule is not a rule', () => {
    // The first cut was UPDATE-only. The UI could not exploit it, but a crafted
    // PostgREST INSERT could set narrative text at birth and bypass the whole
    // invariant. Measured on branch krnntwkvtqwvgwimxjko: with the trigger
    // reverted to UPDATE-only, a disciplinary officer's crafted INSERT
    // succeeded (mutant MUT-1 caught).
    const src = sql();
    const trg = src.slice(src.indexOf('create trigger protect_allegations_investigator_narrative_trg'));
    expect(trg).toMatch(/before\s+insert\s+or\s+update\s+on\s+public\.allegations/);
    expect(trg).toMatch(/for\s+each\s+row/);
  });

  it('does NOT restrict raising an issue — only initialising narrative CONTENT', () => {
    // Creating an issue is open to whoever can write to the case, and must
    // stay so. Only a value with actual content triggers the authority test,
    // which is why the UI's own creation path (all three columns defaulted to
    // '') passes untouched.
    const guard = body();
    expect(guard).toMatch(/tg_op = 'INSERT'/);
    expect(guard).toMatch(/coalesce\(btrim\(new\.investigator_finding\), ''\) <> ''/);
    expect(guard).toMatch(/coalesce\(btrim\(new\.outstanding_uncertainty\), ''\) <> ''/);
    expect(guard).toMatch(/coalesce\(btrim\(new\.witness_evidence\), ''\) <> ''/);
  });

  it('DERIVES the organisation from the parent case and never trusts the row', () => {
    // On INSERT this guard fires BEFORE sync_allegations_org_id_trigger
    // (measured firing order: protect_allegations_investigator_narrative_trg ->
    // stamp_allegations_created_by_trigger -> sync_allegations_org_id_trigger),
    // so new.org_id is still whatever the caller sent. Trusting it let a
    // multi-org adversary who is HR in another organisation nominate that org
    // and pass the HR test — mutant MUT-2, caught: with `v_org_id :=
    // new.org_id` the forged INSERT succeeded; with the derivation it is
    // refused 42501.
    const guard = body();
    expect(guard).toMatch(/select org_id into v_org_id from public\.cases where id = v_case_id/);
    expect(guard).toMatch(/om\.org_id = v_org_id/);
    // the caller-supplied column must not be read for authority on either path
    expect(guard).not.toMatch(/om\.org_id = new\.org_id/);
    expect(guard).not.toMatch(/om\.org_id = old\.org_id/);
  });

  it('refuses an allegation whose case does not resolve, rather than failing open', () => {
    const guard = body();
    expect(guard).toMatch(/if v_org_id is null then/);
    expect(guard).toMatch(/does not reference a real case/);
  });

  it('governs all three narrative columns and no others', () => {
    const guard = body();
    for (const col of ['investigator_finding', 'outstanding_uncertainty', 'witness_evidence']) {
      expect(guard, `${col} is not governed`).toContain(col);
    }
    // the decision columns belong to protect_allegations_finding_columns, and
    // this guard must not quietly annex them.
    //
    // EXECUTABLE LINES ONLY. The commentary legitimately NAMES other triggers
    // — the firing-order table names protect_allegations_investigation_conclusion_trigger
    // — and a prose mention is not an annexation. Asserting against the raw
    // text made documenting the trigger order impossible, which is how a
    // misleading comment survived in the first place.
    const code = guard.replace(/--[^\n]*/g, '');
    for (const col of ['decision_reasoning', 'decided_by', 'appeal_outcome', 'investigation_conclusion']) {
      expect(code, `${col} is not this guard's business`).not.toContain(col);
    }
  });

  it('exits early when no governed column changed — the whole-row upsert depends on it', () => {
    // src/App.jsx's saveAllegationToDB sends every column on every save, so a
    // disciplinary officer editing `status` also re-sends all three narratives
    // unchanged. Without this the DO could not record a decision at all.
    const guard = body();
    // Expressed as `v_touches := ... is distinct from ...` followed by
    // `if not v_touches then return new`, so both halves are asserted: the
    // comparison, and the early exit it feeds.
    expect(guard).toMatch(/new\.investigator_finding\s+is distinct from old\.investigator_finding/);
    expect(guard).toMatch(/new\.outstanding_uncertainty is distinct from old\.outstanding_uncertainty/);
    expect(guard).toMatch(/new\.witness_evidence\s+is distinct from old\.witness_evidence/);
    expect(guard).toMatch(/if not v_touches then\s*return new;/);
  });

  it('keeps the service_role escape hatch, matching every other guard here', () => {
    expect(body()).toMatch(/if auth\.role\(\) = 'service_role' then\s*return new;/);
  });

  it('tests authority with auth.role()/auth.uid(), never current_user', () => {
    // B1 shipped a guard whose current_user test was inert inside SECURITY
    // DEFINER, because current_user is always the owner there (NEW-49).
    const guard = body();
    expect(guard).not.toContain('current_user');
    expect(guard).toContain('auth.uid()');
  });

  it('is SECURITY DEFINER with a pinned search_path, and not callable as an RPC', () => {
    const src = sql();
    expect(body()).toContain('security definer');
    expect(body()).toMatch(/set search_path to 'public'/);
    expect(src).toContain('revoke all on function public.protect_allegations_investigator_narrative_columns() from anon, authenticated, public;');
  });

  it('reads the case from OLD on the update path, so a caller cannot redirect it', () => {
    const guard = body();
    expect(guard).toMatch(/v_case_id := old\.case_id/);
    expect(guard).toMatch(/ca\.case_id = v_case_id/);
  });

  it('weakens nothing: it drops no existing policy, trigger or function', () => {
    const src = sql().replace(/--[^\n]*/g, ' ');
    expect(src).not.toMatch(/\bdrop\s+(policy|trigger|function|table)\b/i);
    expect(src).not.toMatch(/\balter\s+policy\b/i);
  });
});

describe('the two layers admit the same principals', () => {
  // The invariant that matters, and the one the original defect broke: the UI
  // must never offer a write the database refuses, and the database must never
  // permit one the UI withholds.
  it('the SQL admits HR and the investigator, by the same tests the predicate uses', () => {
    const guard = body();
    expect(guard).toContain('public.is_hr_role(om.role)');
    expect(guard).toMatch(/ca\.role\s*=\s*'investigator'/);
  });

  it('the SQL names no role the predicate excludes', () => {
    const guard = body();
    const excluded = ALL_CASE_ROLES.filter(
      r => !mayRecordInvestigationNarrative({ isHR: false, caseRole: r }),
    );
    for (const role of excluded) {
      expect(guard, `the guard mentions ${role}, which the UI predicate refuses`)
        .not.toContain(`'${role}'`);
    }
  });

  it('the refusal message names the two principals a user can become', () => {
    // A 42501 the user cannot act on is a dead end; this one tells them who to
    // ask. Asserted because the message IS the remedy for a blocked user.
    const guard = body();
    expect(guard).toMatch(/Only HR or this case''s assigned investigator can record investigator findings/);
  });
});
