import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  DECISION_OUTCOMES, LEGACY_UNMAPPED, DECISION_TYPE, APPEAL_EFFECT, COMMUNICATED_VIA,
  DECISION_REJECTED, isSelectableOutcome, isAuthoritativeCommunication,
  validateDecision, currentDecision, decisionChain,
} from '../lib/caseDecisions.js';
import { classificationFor, DATA_CLASS, DSAR_DISPOSITION, RETENTION } from '../lib/dataClassification.js';
import { classifyTable, ORG_SCOPED_TABLES, CASCADE_COVERED_TABLES } from '../lib/dataInventory.js';
import { DSAR_SUBJECT_SOURCES } from '../lib/dsarCompile.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.2 — authoritative decision history foundation.
//
// ADDITIVE AND BEHAVIOUR-PRESERVING. The whole point of this slice is that
// nothing reads the new table yet: cases.outcome is still the compatibility
// projection, Current Warnings still reads cases.*, OutcomeModal still writes
// cases.*, and the appeal workflow is untouched. The last describe block in this
// file asserts each of those, because "additive" is a claim that needs proving.
// ─────────────────────────────────────────────────────────────────────────

const migration = () => readFileSync('supabase/case_decisions_2026-10-03.sql', 'utf8');
const stripSql = t => t.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
// Comments are prose, not behaviour. Asserting against un-stripped source is
// how a file that merely DESCRIBES a removed call reads as still making it.
const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

// ── the domain boundary: legacy_unmapped is not a sanction anyone may choose ──
describe('D4.2 — legacy_unmapped cannot be chosen as an outcome', () => {
  it('is refused by the domain boundary', () => {
    const r = validateDecision({ outcome: LEGACY_UNMAPPED, decidedAt: '2026-10-03T00:00:00Z' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(DECISION_REJECTED.LEGACY_MARKER_NOT_SELECTABLE);
  });

  it('is not one of the selectable outcomes', () => {
    expect(isSelectableOutcome(LEGACY_UNMAPPED)).toBe(false);
    expect(DECISION_OUTCOMES).not.toContain(LEGACY_UNMAPPED);
  });

  it('is ALSO refused by the database trigger — two locks, not one', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/legacy_unmapped is a historical marker and cannot be chosen/);
  });

  it('the database still permits it for the privileged backfill path', () => {
    // Otherwise the historical row could not be represented at all, and the one
    // stray value would have to be normalised — which is the thing D4.1
    // forbade.
    const sql = stripSql(migration());
    expect(sql).toMatch(/if not privileged then/);
    expect(sql).toMatch(/'legacy_unmapped'\n\s*\)\);|'legacy_unmapped'/);
  });

  it('a legacy row must carry its original string, and a normal row must not', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/case_decisions_legacy_provenance check \(\s*\(outcome = 'legacy_unmapped' and outcome_source_text is not null\)/);
    expect(sql).toMatch(/or \(outcome <> 'legacy_unmapped' and outcome_source_text is null\)/);
  });

  it('preserves the exact stray value, unnormalised', () => {
    // "First written warning issued" — traced in D4.1 to the CSV template's own
    // worked example. It is NOT silently read as a first written warning.
    expect(migration()).toContain('First written warning issued');
    expect(DECISION_OUTCOMES).not.toContain('First written warning issued');
  });

  it('the BACKFILL maps an out-of-vocabulary value to legacy_unmapped, never to a real sanction', () => {
    // A mutation that changed the backfill's else-branch from 'legacy_unmapped'
    // to 'First written warning' survived the assertion above, because that one
    // only checked the stray string still appeared SOMEWHERE in the file — and
    // it did, in a comment. This asserts the branch itself: an unrecognised
    // outcome becomes the marker, and the original is carried across verbatim.
    const sql = stripSql(migration());
    const insertBlock = sql.slice(sql.indexOf('insert into public.case_decisions'));
    expect(insertBlock).toMatch(/then c\.outcome else 'legacy_unmapped' end,/);
    expect(insertBlock).toMatch(/then null else c\.outcome end,/);
    // and it must NOT map an unknown value onto any real sanction
    for (const real of DECISION_OUTCOMES) {
      expect(insertBlock, `the else-branch must not resolve to ${real}`)
        .not.toMatch(new RegExp(`else '${real.replace(/[()]/g, '\\$&')}' end`));
    }
  });
});

// ── the six-value vocabulary ──
describe('D4.2 — the outcome vocabulary is the one OutcomeModal offers', () => {
  it('matches OutcomeModal\'s own option list exactly', () => {
    const modal = readFileSync('src/screens/OutcomeModal.jsx', 'utf8');
    const options = [...modal.matchAll(/<option value="([^"]+)">/g)].map(m => m[1]).filter(Boolean);
    expect([...options].sort()).toEqual([...DECISION_OUTCOMES].sort());
  });

  it('has six values, and the DB CHECK carries the same six plus the legacy marker', () => {
    expect(DECISION_OUTCOMES).toHaveLength(6);
    const sql = stripSql(migration());
    for (const outcome of DECISION_OUTCOMES) expect(sql, outcome).toContain(`'${outcome}'`);
    expect(sql).toContain("'legacy_unmapped'");
  });

  it('rejects anything outside it', () => {
    for (const bad of ['Verbal warning', 'First written warning issued', '', null, 'dismissal']) {
      expect(validateDecision({ outcome: bad, decidedAt: 'x' }).ok, String(bad)).toBe(false);
    }
  });
});

// ── decision shape ──
describe('D4.2 — a decision must be shaped like one', () => {
  const base = { outcome: 'First written warning', decidedAt: '2026-10-03T00:00:00Z' };

  it('accepts a well-formed original', () => {
    expect(validateDecision(base).ok).toBe(true);
  });

  it('requires decided_at on a NEW decision', () => {
    expect(validateDecision({ ...base, decidedAt: null }).reason).toBe(DECISION_REJECTED.MISSING_DECIDED_AT);
  });

  it('refuses an original that supersedes something', () => {
    expect(validateDecision({ ...base, supersedesDecisionId: 'd1' }).reason)
      .toBe(DECISION_REJECTED.ORIGINAL_CANNOT_SUPERSEDE);
  });

  it('refuses an appeal with no predecessor', () => {
    expect(validateDecision({ ...base, decisionType: DECISION_TYPE.APPEAL, appealEffect: APPEAL_EFFECT.VARIED }).reason)
      .toBe(DECISION_REJECTED.APPEAL_WITHOUT_PREDECESSOR);
  });

  it('refuses an appeal with no effect', () => {
    expect(validateDecision({ ...base, decisionType: DECISION_TYPE.APPEAL, supersedesDecisionId: 'd1' }).reason)
      .toBe(DECISION_REJECTED.APPEAL_WITHOUT_EFFECT);
  });

  it('refuses self-supersession', () => {
    expect(validateDecision({
      ...base, id: 'd1', decisionType: DECISION_TYPE.APPEAL,
      supersedesDecisionId: 'd1', appealEffect: APPEAL_EFFECT.VARIED,
    }).reason).toBe(DECISION_REJECTED.SELF_SUPERSEDING);
  });

  it('accepts a well-formed appeal that VARIES the sanction — the shape D4 needs', () => {
    // final_written_warning -> appeal varied -> first_written_warning, with the
    // original preserved as a separate row. This is what cases.outcome alone can
    // never express.
    const r = validateDecision({
      decisionType: DECISION_TYPE.APPEAL, outcome: 'First written warning',
      appealEffect: APPEAL_EFFECT.VARIED, supersedesDecisionId: 'original-1',
      decidedAt: '2026-10-03T00:00:00Z',
    });
    expect(r.ok).toBe(true);
  });
});

// ── communication is not recording ──
describe('D4.2 — communication must be authoritative', () => {
  it('accepts only signature_request', () => {
    expect(isAuthoritativeCommunication(COMMUNICATED_VIA.SIGNATURE_REQUEST)).toBe(true);
    expect(Object.values(COMMUNICATED_VIA)).toEqual(['signature_request']);
  });

  it('REJECTS tracked_send — the mechanism does not exist', () => {
    // letterTracking is populated nowhere in the product; dsarCaseDisclosure.js
    // says so itself, and the only writes are `letterTracking: {}`.
    expect(isAuthoritativeCommunication('tracked_send')).toBe(false);
    const disclosure = readFileSync('src/lib/dsarCaseDisclosure.js', 'utf8');
    expect(disclosure).toMatch(/letterTracking is populated nowhere/);
  });

  it('REJECTS approval, saving and drafting as communication', () => {
    for (const via of ['letter_approved', 'letterApprovedAt', 'saved', 'downloaded', 'letter_output']) {
      expect(isAuthoritativeCommunication(via), via).toBe(false);
      expect(validateDecision({
        outcome: 'Demotion', decidedAt: 'x', communicatedAt: 'y', communicatedVia: via,
      }).reason).toBe(DECISION_REJECTED.COMMUNICATION_NOT_AUTHORITATIVE);
    }
  });

  it('requires a time and a mechanism together, or neither', () => {
    expect(validateDecision({ outcome: 'Demotion', decidedAt: 'x', communicatedAt: 'y' }).reason)
      .toBe(DECISION_REJECTED.COMMUNICATION_INCOMPLETE);
    expect(validateDecision({ outcome: 'Demotion', decidedAt: 'x', communicatedVia: 'signature_request' }).reason)
      .toBe(DECISION_REJECTED.COMMUNICATION_INCOMPLETE);
    expect(validateDecision({ outcome: 'Demotion', decidedAt: 'x' }).ok).toBe(true);
  });

  it('the DB constraint carries only the one value', () => {
    expect(stripSql(migration()))
      .toMatch(/case_decisions_communicated_via_valid\s*\n?\s*check \(communicated_via is null or communicated_via in \('signature_request'\)\)/);
  });
});

// ── the current head ──
describe('D4.2 — exactly one current decision', () => {
  const original = { id: 'a', decisionType: 'original', supersedesDecisionId: null };
  const appeal = { id: 'b', decisionType: 'appeal', supersedesDecisionId: 'a' };
  const second = { id: 'c', decisionType: 'appeal', supersedesDecisionId: 'b' };

  it('the head is the decision nobody supersedes', () => {
    expect(currentDecision([original]).decision.id).toBe('a');
    expect(currentDecision([original, appeal]).decision.id).toBe('b');
    expect(currentDecision([original, appeal, second]).decision.id).toBe('c');
  });

  it('reports ambiguity rather than picking one', () => {
    // Two heads are a database-level impossibility, so if rows ever arrive in
    // this shape the caller must be told, not handed a coin-flip.
    const rival = { id: 'c', decisionType: 'appeal', supersedesDecisionId: 'a' };
    const { decision, heads } = currentDecision([original, appeal, rival]);
    expect(heads).toBe(2);
    expect(decision).toBeNull();
  });

  it('the chain is oldest-first and preserves the original', () => {
    expect(decisionChain([second, original, appeal]).map(d => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('two partial unique indexes make a second head unrepresentable', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/create unique index case_decisions_one_successor_idx[\s\S]*?where supersedes_decision_id is not null/);
    expect(sql).toMatch(/create unique index case_decisions_one_original_per_case_idx[\s\S]*?where decision_type = 'original'/);
  });
});

// ── the migration's structural guarantees ──
describe('D4.2 — structural guarantees in the schema', () => {
  it('uses the same-org COMPOSITE case FK, never a bare case_id', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/foreign key \(case_id, org_id\) references public\.cases\(id, org_id\)/);
    // the forbidden shape must not appear
    expect(sql).not.toMatch(/foreign key \(case_id\) references public\.cases\(id\)/);
    expect(sql).not.toMatch(/case_id uuid not null references public\.cases/);
  });

  it('requires org_id NOT NULL, closing the MATCH SIMPLE gap on the nullable parent', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/org_id uuid not null/);
    expect(migration()).toMatch(/MATCH SIMPLE/);
  });

  it('adds cases_id_org_key and does not touch outcome data', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/add constraint cases_id_org_key unique \(id, org_id\)/);
    // the only thing done to cases is adding that constraint
    expect(sql).not.toMatch(/update public\.cases/);
    expect(sql).not.toMatch(/alter column org_id set not null/);
  });

  it('supersession integrity is a COMPOSITE self-FK, not a loose uuid', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/foreign key \(supersedes_decision_id, org_id, case_id\)\s*\n?\s*references public\.case_decisions\(id, org_id, case_id\)/);
    expect(sql).toMatch(/check \(supersedes_decision_id is distinct from id\)/);
  });

  it('RLS inherits case access and does NOT use bare org membership', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/exists \(\s*\n?\s*select 1 from public\.cases c\s*\n?\s*where c\.id = case_decisions\.case_id/);
    // the anti-pattern this slice was told to avoid
    expect(sql).not.toMatch(/org_id in \(select my_org_ids\(\)\)/);
    expect(sql).not.toMatch(/org_id in \(\s*select/);
  });

  it('write authority mirrors protect_case_hr_only_columns exactly', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/public\.is_hr_role\(m\.role\)/);
    expect(sql).toMatch(/ca\.role = 'disciplinary_officer'/);
  });

  it('grants NO update and NO delete policy — append-only by RLS', () => {
    const sql = stripSql(migration());
    expect(sql).not.toMatch(/create policy[^;]*for update/i);
    expect(sql).not.toMatch(/create policy[^;]*for delete/i);
    expect(sql).toMatch(/for select/);
    expect(sql).toMatch(/for insert/);
  });

  it('the append-only trigger blocks UPDATE and DELETE and forces provenance', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/Decision history cannot be deleted/);
    expect(sql).toMatch(/A recorded decision cannot be changed/);
    expect(sql).toMatch(/new\.decided_by := auth\.uid\(\)/);
    expect(sql).toMatch(/A new decision must record when it was decided/);
  });

  it('keeps a privileged path open so backfill and rollback remain possible', () => {
    expect(stripSql(migration())).toMatch(/coalesce\(auth\.role\(\), ''\) = 'service_role'/);
    expect(stripSql(migration())).toMatch(/current_user in \('postgres', 'supabase_admin'\)/);
  });

  it('documents a complete rollback', () => {
    const sql = migration();
    for (const step of ['drop trigger if exists case_decisions_append_only_trg',
      'drop function if exists public.case_decisions_append_only_guard',
      'drop table if exists public.case_decisions',
      'drop constraint if exists cases_id_org_key']) {
      expect(sql, step).toContain(step);
    }
  });
});

// ── the backfill invents nothing ──
describe('D4.2 — the backfill copies or leaves NULL, never infers', () => {
  const sql = () => stripSql(migration());

  it('copies decided_at from outcome_issued_at ONLY, with no fallback', () => {
    expect(sql()).toMatch(/c\.outcome_issued_at/);
    // no now(), no coalesce to a date, no created_at substitution
    expect(sql()).not.toMatch(/coalesce\(c\.outcome_issued_at/);
    const insertBlock = sql().slice(sql().indexOf('insert into public.case_decisions'), sql().indexOf('alter table public.case_decisions'));
    expect(insertBlock).not.toMatch(/now\(\)/);
  });

  it('copies decided_by from disciplinary_decided_by ONLY', () => {
    expect(sql()).toMatch(/c\.disciplinary_decided_by/);
    expect(sql()).not.toMatch(/coalesce\(c\.disciplinary_decided_by/);
  });

  it('never manufactures warning expiry or duration', () => {
    expect(sql()).toMatch(/c\.warning_duration_months,/);
    expect(sql()).toMatch(/c\.warning_expires_at,/);
    const insertBlock = sql().slice(sql().indexOf('insert into public.case_decisions'));
    expect(insertBlock).not.toMatch(/interval/);
    expect(insertBlock).not.toMatch(/\+ \d+ month/);
  });

  it('writes only original decisions, and no appeal rows', () => {
    const insertBlock = sql().slice(sql().indexOf('insert into public.case_decisions'));
    expect(insertBlock).toMatch(/'original'/);
    expect(insertBlock).not.toMatch(/'appeal'/);
  });

  it('does NOT create appeal rows from the 37 not_upheld allegation records', () => {
    expect(sql()).not.toMatch(/from public\.allegations/);
    expect(migration()).toMatch(/not_upheld means the original stands/);
  });

  it('leaves communication NULL for every historical row', () => {
    const insertBlock = sql().slice(sql().indexOf('insert into public.case_decisions'));
    expect(insertBlock).not.toMatch(/communicated_at.*savedAt|letterApprovedAt/);
  });
});

// ── governance (NEW-44) ──
describe('D4.2 — governance registration', () => {
  it('is classified for deletion as cascade-covered, not added to the deletion ORDER', () => {
    expect(classifyTable('case_decisions')).toBe('cascade_covered');
    expect(CASCADE_COVERED_TABLES).toContain('case_decisions');
    expect(ORG_SCOPED_TABLES).not.toContain('case_decisions');
  });

  it('carries a full governance classification', () => {
    const meta = classificationFor('case_decisions');
    expect(meta.dataClass).toBe(DATA_CLASS.CUSTOMER);
    expect(meta.orgScoped).toBe(true);
    expect(meta.personRelated).toBe(true);
    expect(meta.caseRelated).toBe(true);
    expect(meta.retention).toBe(RETENTION.NOT_ENFORCED);
  });

  // D4.3 DISCHARGED THIS. The obligation was `included_not_wired` with defect
  // 'D4.3' for exactly as long as nothing read the table. It flipped to
  // `included` only once compileSubjectData genuinely compiled it — which is
  // why the second half of this test is the one that matters: the disposition
  // and the manifest have to agree, so the flip cannot be a bare edit to a
  // classification file.
  it('its DSAR obligation is now discharged, not merely declared', () => {
    const meta = classificationFor('case_decisions');
    expect(meta.dsar).toBe(DSAR_DISPOSITION.INCLUDED);
    expect(meta.dsarDefect).toBeFalsy();
    expect(Object.values(DSAR_SUBJECT_SOURCES)).toContain('case_decisions');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3 INVERTED THE BLOCK THAT USED TO LIVE HERE.
//
// D4.2 asserted the negative — Current Warnings still read cases.*, the modal
// still wrote cases.*, nothing touched the new table — because "additive" is a
// claim that needs proving, and the holding pattern had to be enforced rather
// than trusted.
//
// D4.3 is the wave that owns the cutover, so those assertions are now false BY
// DESIGN. They are inverted rather than deleted: each one still asserts
// something, and what it asserts is the stronger property. The negative
// "nothing reads the table" has become the positive "the decision is the
// authority and the projection is maintained with it" — plus the invariant that
// outlives both waves, that there is never more than ONE writable truth.
// ─────────────────────────────────────────────────────────────────────────
describe('D4.3 — the cutover happened, and only one writable truth exists', () => {
  it('Current Warnings now reads the decision head, not cases.outcome', () => {
    const employeeFile = readFileSync('src/lib/employeeFile.js', 'utf8');
    expect(employeeFile).toContain('export function deriveCurrentWarnings');
    // resolved through the decision chain's head, not the case's projection
    expect(employeeFile).toMatch(/currentDecision\(/);
    expect(employeeFile).toMatch(/isWarningOutcome\(head\.outcome\)/);
    expect(employeeFile).toContain('caseDecisions');
  });

  it('caseStage and nextStep still read cases.outcome — the projection is for readers', () => {
    // UNCHANGED BY D4.3, AND DELIBERATELY SO. The whole purpose of keeping
    // cases.* as a transactionally maintained projection is that existing
    // readers do not have to be rewritten to resolve a chain. Stage and next
    // step are the proof that the compatibility half of the contract is real.
    expect(readFileSync('src/lib/caseStage.js', 'utf8')).not.toContain('case_decisions');
    expect(readFileSync('src/lib/nextStep.js', 'utf8')).not.toContain('case_decisions');
  });

  it('OutcomeModal issues through the RPC and writes no case field itself', () => {
    const raw = readFileSync('src/screens/OutcomeModal.jsx', 'utf8');
    expect(raw).toContain('recordCaseDecision');
    // COMMENTS STRIPPED BEFORE ASSERTING. The file still SAYS "saveCases" four
    // times, in comments explaining what it no longer does — and an assertion
    // that reads prose as if it were code is the single most repeated mistake in
    // this engagement. The claim is about executable code, so strip to code.
    const code = stripJs(raw);
    expect(code).not.toContain('saveCases');
    expect(code).not.toMatch(/outcomeIssuedAt\s*:/);
    expect(code).not.toMatch(/warningExpiresAt\s*:/);
    expect(code).not.toMatch(/disciplinaryDecidedBy\s*:/);
  });

  it('the appeal workflow is STILL untouched — D4.3 writes no appeal state', () => {
    // The appeal model is a later wave and D4.3 is forbidden from beginning it.
    // appeal_effect exists on a decision row but nothing in the appeal path
    // writes a decision, and the appeal derivation is unchanged.
    const employeeFile = readFileSync('src/lib/employeeFile.js', 'utf8');
    expect(employeeFile).toContain('export function appealEffectOnCase');
    expect(employeeFile).toMatch(/appealOutcomeMeta\(a\.appealOutcome\)/);
    const cutover = readFileSync('supabase/case_decision_cutover_2026-10-03.sql', 'utf8');
    expect(stripSql(cutover)).not.toMatch(/update public\.appeals|insert into public\.appeals/);
  });

  it('NO dual write exists — the projection is only ever written beside the decision', () => {
    // The point D4.2 made with "nothing touches the table" is now made the
    // other way round: the ONLY place cases' six outcome columns are written is
    // inside record_case_decision, in the same transaction as the decision row.
    // No client file writes them, so there is no second writable truth.
    // THE MODAL AND THE WRITE WRAPPER MUST NOT NAME THESE COLUMNS AT ALL.
    for (const file of ['src/screens/OutcomeModal.jsx', 'src/lib/caseDecisionWrites.js']) {
      const src = stripJs(readFileSync(file, 'utf8'));
      expect(src, `${file} must not write the outcome projection directly`)
        .not.toMatch(/outcome_issued_at|warning_expires_at|disciplinary_decided_by/);
    }

    // APP.JSX IS DIFFERENT, AND BLUNTLY FORBIDDING THE NAMES THERE WOULD BE A
    // FALSE ASSERTION. saveCaseToDB's payload still carries the six columns and
    // must keep carrying them: it is a whole-row update, and every value is read
    // straight back from the row it loaded (mapCaseRow maps all six), so the
    // write is an exact echo. `is distinct from` in protect_case_hr_only_columns
    // therefore sees no change and the guard never fires on an ordinary edit.
    // Verified against production rather than reasoned about: 0 of 2,960 cases
    // hold outcome IS NULL (2,823 hold ''), which is exactly what the client's
    // `|| ""` produces, and outcome_notes is NULL on all 2,960 against the
    // client's `|| null`. A stale echo cannot slip through either, because
    // saveCaseToDB is a conditional update on updated_at and the RPC bumps it.
    //
    // What MUST hold is that App.jsx never MANUFACTURES provenance: each of the
    // three provenance columns may only ever be a pass-through of the loaded
    // case object, never a computed timestamp or a user id.
    const app = stripJs(readFileSync('src/App.jsx', 'utf8'));
    for (const [col, prop] of [
      ['outcome_issued_at', 'outcomeIssuedAt'],
      ['warning_expires_at', 'warningExpiresAt'],
      ['disciplinary_decided_by', 'disciplinaryDecidedBy'],
    ]) {
      // every assignment of the column is `col: caseObj.<prop> || null`
      const assignments = app.match(new RegExp(`${col}\\s*:[^,\n]*`, 'g')) || [];
      for (const a of assignments) {
        expect(a, `${col} must be an echo, never manufactured`)
          .toMatch(new RegExp(`${col}\\s*:\\s*caseObj\\.${prop}\\s*\\|\\|\\s*null`));
      }
      expect(assignments.length, `${col} is written in exactly one place`).toBe(1);
      // and the client never derives them
      expect(app).not.toMatch(new RegExp(`${prop}\\s*:\\s*new Date\\(`));
      expect(app).not.toMatch(new RegExp(`${prop}\\s*:\\s*(currentUserId|user\\?\\.id|session)`));
    }
    const sql = stripSql(readFileSync('supabase/case_decision_cutover_2026-10-03.sql', 'utf8'));
    const updates = sql.match(/update public\.cases/g) || [];
    expect(updates.length, 'exactly one projection write, inside the RPC').toBe(1);
  });

  it('no trigger copies cases.outcome into the new table, or the reverse', () => {
    // A consistency trigger was considered and rejected: it would be a dual
    // write introduced silently, and D4.3 owns the cutover.
    const sql = stripSql(migration());
    expect(sql).not.toMatch(/create trigger[^;]*on public\.cases/);
    expect(sql).not.toMatch(/update public\.cases/);
  });
});
