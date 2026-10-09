import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDsarFindingRevisions, REVISION_GATEWAY_FAILURE } from '../lib/findingRevisionGateway.js';

// ─────────────────────────────────────────────────────────────────────────
// The read path for superseded investigator narratives.
//
// Tested at this level because the gateway owns three decisions that the
// screen above it cannot see: WHICH COLUMNS leave the database, whether a
// failure is distinguishable from an empty result, and whether the
// pre-migration "table does not exist" state is treated as a fault.
// ─────────────────────────────────────────────────────────────────────────

/** A minimal stand-in for the supabase query builder, capturing what was asked for. */
function stubClient(result) {
  const calls = { table: null, columns: null, eq: null, order: null };
  const builder = {
    select(columns) { calls.columns = columns; return builder; },
    eq(col, val) { calls.eq = [col, val]; return builder; },
    order(col, opts) { calls.order = [col, opts]; return Promise.resolve(result); },
  };
  return {
    calls,
    from(table) { calls.table = table; return builder; },
  };
}

const ROW = {
  id: 'rev-1', org_id: 'org-1', case_id: 'c1', allegation_id: 'alg_1',
  field: 'investigator_finding',
  previous_value: 'old wording', new_value: 'new wording',
  actor_kind: 'user', changed_at: '2026-07-01T09:00:00Z', seq: 41,
};

describe('fetchDsarFindingRevisions — refusing to guess', () => {
  it('returns NO_CLIENT rather than throwing when handed no client', async () => {
    const r = await fetchDsarFindingRevisions(null, { orgId: 'org-1' });
    expect(r).toEqual({ ok: false, reason: REVISION_GATEWAY_FAILURE.NO_CLIENT });
  });

  it('returns NO_ORG for a missing, blank or non-string organisation', async () => {
    const client = stubClient({ data: [ROW], error: null });
    for (const orgId of [undefined, null, '', '   ', 42, {}]) {
      const r = await fetchDsarFindingRevisions(client, { orgId });
      expect(r).toEqual({ ok: false, reason: REVISION_GATEWAY_FAILURE.NO_ORG });
    }
    // and it never reached the database to find out
    expect(client.calls.table).toBeNull();
  });

  it('survives being called with no options object at all', async () => {
    const r = await fetchDsarFindingRevisions(stubClient({ data: [], error: null }));
    expect(r.ok).toBe(false);
  });
});

describe('fetchDsarFindingRevisions — the query it actually issues', () => {
  let client;
  beforeEach(() => { client = stubClient({ data: [ROW], error: null }); });

  it('reads the revision table, scoped to the organisation', async () => {
    await fetchDsarFindingRevisions(client, { orgId: 'org-1' });
    expect(client.calls.table).toBe('investigation_finding_revisions');
    expect(client.calls.eq).toEqual(['org_id', 'org-1']);
  });

  it('orders by seq, which is the only total order available', async () => {
    // changed_at is transaction_timestamp(), so two edits in one transaction
    // share it. There is no created_at column on this table.
    await fetchDsarFindingRevisions(client, { orgId: 'org-1' });
    expect(client.calls.order).toEqual(['seq', { ascending: true }]);
  });

  it('does NOT fetch changed_by — the actor is withheld, so it is never pulled', async () => {
    // Data minimisation rather than fetch-then-discard: compileSubjectData
    // withholds the acting user, so bringing the identifier into the browser
    // would serve no purpose it could not also leak.
    await fetchDsarFindingRevisions(client, { orgId: 'org-1' });
    expect(client.calls.columns).not.toContain('changed_by');
  });

  it('DOES fetch actor_kind, which is disclosed', async () => {
    await fetchDsarFindingRevisions(client, { orgId: 'org-1' });
    expect(client.calls.columns).toContain('actor_kind');
  });

  it('fetches exactly the columns the compiler consumes, and nothing else', async () => {
    await fetchDsarFindingRevisions(client, { orgId: 'org-1' });
    const columns = client.calls.columns.split(',').map(c => c.trim()).sort();
    expect(columns).toEqual([
      'actor_kind', 'allegation_id', 'case_id', 'changed_at', 'field',
      'id', 'new_value', 'org_id', 'previous_value', 'seq',
    ]);
  });
});

describe('fetchDsarFindingRevisions — mapping into what the compiler reads', () => {
  it('remaps snake_case columns to the camelCase the compiler expects', async () => {
    // A snake_case object would give caseId === undefined, subjectCaseIds would
    // not match it, and the package would silently contain nothing.
    const r = await fetchDsarFindingRevisions(stubClient({ data: [ROW], error: null }), { orgId: 'org-1' });
    expect(r.ok).toBe(true);
    expect(r.revisions[0]).toEqual({
      id: 'rev-1', orgId: 'org-1', caseId: 'c1', allegationId: 'alg_1',
      field: 'investigator_finding',
      previousValue: 'old wording', newValue: 'new wording',
      actorKind: 'user', changedAt: '2026-07-01T09:00:00Z', seq: 41,
    });
  });

  it('preserves a null on either side of a change rather than coercing it', async () => {
    const firstDraft = { ...ROW, previous_value: null };
    const cleared = { ...ROW, id: 'rev-2', new_value: null, seq: 42 };
    const r = await fetchDsarFindingRevisions(
      stubClient({ data: [firstDraft, cleared], error: null }), { orgId: 'org-1' },
    );
    expect(r.revisions[0].previousValue).toBeNull();
    expect(r.revisions[0].newValue).toBe('new wording');
    expect(r.revisions[1].previousValue).toBe('old wording');
    expect(r.revisions[1].newValue).toBeNull();
  });

  it('does not lose a legitimately empty string', async () => {
    const r = await fetchDsarFindingRevisions(
      stubClient({ data: [{ ...ROW, previous_value: '' }], error: null }), { orgId: 'org-1' },
    );
    expect(r.revisions[0].previousValue).toBe('');
  });

  it('returns an empty list, successfully, when nothing has been rewritten', async () => {
    const r = await fetchDsarFindingRevisions(stubClient({ data: [], error: null }), { orgId: 'org-1' });
    expect(r).toEqual({ ok: true, revisions: [] });
  });

  it('tolerates a null row or a non-array payload', async () => {
    const withNulls = await fetchDsarFindingRevisions(
      stubClient({ data: [null, ROW, 'nonsense'], error: null }), { orgId: 'org-1' },
    );
    expect(withNulls.revisions).toHaveLength(1);
    const notAnArray = await fetchDsarFindingRevisions(
      stubClient({ data: { nope: true }, error: null }), { orgId: 'org-1' },
    );
    expect(notAnArray).toEqual({ ok: true, revisions: [] });
  });
});

describe('fetchDsarFindingRevisions — a failure is never an empty history', () => {
  it('distinguishes the pre-migration absent table from a real fault', async () => {
    // The table is in PENDING_PRODUCTION_SCHEMA until B2 is deployed, so 42P01
    // is an expected state. It is still NOT success — the caller reports that
    // completeness cannot be confirmed.
    const r = await fetchDsarFindingRevisions(
      stubClient({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
      { orgId: 'org-1' },
    );
    expect(r).toEqual({ ok: false, reason: REVISION_GATEWAY_FAILURE.TABLE_ABSENT });
    expect(r.ok).toBe(false);
  });

  it('reports any other query error as QUERY_FAILED', async () => {
    const r = await fetchDsarFindingRevisions(
      stubClient({ data: null, error: { code: '42501', message: 'permission denied' } }),
      { orgId: 'org-1' },
    );
    expect(r).toEqual({ ok: false, reason: REVISION_GATEWAY_FAILURE.QUERY_FAILED });
  });

  it('never returns rows alongside a failure', async () => {
    const r = await fetchDsarFindingRevisions(
      stubClient({ data: [ROW], error: { code: '42501', message: 'permission denied' } }),
      { orgId: 'org-1' },
    );
    expect(r.ok).toBe(false);
    expect(r.revisions).toBeUndefined();
  });

  it('converts a thrown exception into a failure rather than propagating it', async () => {
    const throwing = { from() { throw new Error('network down'); } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await fetchDsarFindingRevisions(throwing, { orgId: 'org-1' });
      expect(r).toEqual({ ok: false, reason: REVISION_GATEWAY_FAILURE.QUERY_FAILED });
    } finally {
      spy.mockRestore();
    }
  });
});
