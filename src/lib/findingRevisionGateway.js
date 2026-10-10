// ─────────────────────────────────────────────────────────────────────────
// READING SUPERSEDED INVESTIGATOR NARRATIVES FOR A SUBJECT ACCESS REQUEST.
//
// IR-REPORT-01b/B2 created public.investigation_finding_revisions and wired a
// `findingRevisions` parameter into compileSubjectData. The B2 review found the
// gap this module closes: NOTHING FETCHED THE TABLE. The compiler compiled it,
// the classification claimed `dsar: included`, 21 tests passed — and not one
// row was ever read, because every test handed the compiler a fixture directly.
// A green suite certified an integration that did not exist.
//
// ┌─ WHY A LAZY GATEWAY AND NOT THE caseDecisions PATTERN ──────────────────┐
// │ The obvious move was to mirror loadCaseDecisions: org-wide state in      │
// │ App.jsx, loaded on every page load, threaded down as a prop. That is the │
// │ most recent analogous addition and it would have been defensible.        │
// │                                                                          │
// │ It is the wrong shape HERE, for a reason specific to this data. Case     │
// │ decisions are read by three screens; superseded investigator narratives  │
// │ are read by exactly ONE thing — this compiler — and by nothing in the    │
// │ product UI at all. Holding the previous and replacing text of every      │
// │ rewritten finding in org-wide React state, in every HR user's browser,   │
// │ on every page load, would create a standing exposure to serve a feature  │
// │ used a handful of times a year.                                          │
// │                                                                          │
// │ So this follows fetchDsarMeetings instead (src/lib/meetingTableGateway   │
// │ .js): fetched at compile time, held for the duration of the compile,     │
// │ never parked in global state. Same ordinary authenticated client, same   │
// │ ok/reason result shape, same rule that a failed read is reported rather  │
// │ than mistaken for an empty one.                                          │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THROUGH THE ORDINARY CLIENT, DELIBERATELY. Not through
// /api/portal/dsar-lookup, which uses the service role to reach tables the
// browser cannot. This table HAS a client-facing SELECT policy that reaches
// other people's rows (HR in the case's org, or the case's current
// investigator), so the browser can read exactly what the person compiling is
// entitled to read. Routing it through the service role would hand the compiler
// revisions on cases that person has no access to — including confidential
// cases they hold no case_access row for — and would make completeness a reason
// to widen access. The same argument fetchDsarMeetings makes for meetings.
//
// changed_by IS NOT SELECTED. The compiler withholds the acting user as an
// internal actor, so fetching it would mean pulling an identifier into the
// browser for the sole purpose of discarding it. actor_kind — whether a person
// or a system made the change — is selected, because that IS disclosed.
// ─────────────────────────────────────────────────────────────────────────

import { fetchAllPages } from './paginatedFetch.js';

export const REVISION_GATEWAY_FAILURE = Object.freeze({
  NO_CLIENT: 'no_client',
  NO_ORG: 'no_org',
  QUERY_FAILED: 'query_failed',
  TABLE_ABSENT: 'table_absent',
});

const REVISIONS_TABLE = 'investigation_finding_revisions';

// Ordered by `seq`, not `changed_at`. Two edits inside one transaction share a
// changed_at (now() is transaction_timestamp()), so changed_at cannot provide a
// total order and the migration added `seq` for exactly this reason. There is
// no created_at column on this table.
const DSAR_COLUMNS = 'id, org_id, case_id, allegation_id, field, previous_value, new_value, actor_kind, changed_at, seq';

/** PostgREST's code for "relation does not exist". */
const UNDEFINED_TABLE = '42P01';

function revisionRowToObject(row) {
  if (!row || typeof row !== 'object') return null;
  // A row with no primary key is not a row. This mattered the moment the
  // gateway started paginating: fetchAllPages concatenates each page, so a
  // malformed payload that is an OBJECT rather than an array (which the
  // previous single-shot code turned into []) would otherwise be concatenated
  // as one junk element and mapped into a revision made entirely of
  // undefineds. Garbage must not become data in a disclosure package.
  if (!row.id) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    caseId: row.case_id,
    allegationId: row.allegation_id || null,
    field: row.field || null,
    previousValue: row.previous_value ?? null,
    newValue: row.new_value ?? null,
    actorKind: row.actor_kind || null,
    changedAt: row.changed_at || null,
    seq: row.seq ?? null,
  };
}

/**
 * Fetch every revision row the compiling user may read in this organisation.
 *
 * Returns `{ ok: true, revisions }` or `{ ok: false, reason }`. Never throws and
 * never returns a partial success — the caller must be able to tell "none" from
 * "could not look", because a DSAR that conflates them certifies completeness
 * it does not have.
 *
 * TABLE_ABSENT is distinguished on purpose. The table is in
 * PENDING_PRODUCTION_SCHEMA until the B2 migration is applied, so before
 * deployment this query returns 42P01. That is a known, expected state rather
 * than a fault, and the caller reports it as "not yet available" instead of
 * raising a load error at every HR user. It is NOT swallowed: the disposition
 * still says completeness cannot be confirmed.
 */
export async function fetchDsarFindingRevisions(client, { orgId } = {}) {
  if (!client) return { ok: false, reason: REVISION_GATEWAY_FAILURE.NO_CLIENT };
  if (typeof orgId !== 'string' || orgId.trim() === '') {
    return { ok: false, reason: REVISION_GATEWAY_FAILURE.NO_ORG };
  }
  try {
    // PAGINATED. A plain .select() is capped by the server's own per-request
    // row limit and PostgREST returns the capped page as an ORDINARY SUCCESS —
    // no error, nothing to notice. For a subject access request that is the
    // worst available failure shape: a package that is short and looks
    // complete. src/lib/paginatedFetch.js exists for exactly this, says so in
    // its own header, and is what App.jsx already uses for cases, audit_log
    // and hr_review_requests.
    //
    // The `id` tiebreaker is not decoration. Paging applies a range window to
    // an ORDERED result, so the order has to be a TOTAL one or rows can repeat
    // or be skipped between pages. seq is unique in practice but nothing in
    // the schema enforces that — there is no unique index on it — so the
    // primary key settles it rather than an assumption about a sequence.
    //
    // A page failure returns the rows gathered so far ALONGSIDE the error;
    // those partial rows are discarded below, never returned as a short
    // success.
    const { data, error } = await fetchAllPages((from, to) => client
      .from(REVISIONS_TABLE)
      .select(DSAR_COLUMNS)
      .eq('org_id', orgId)
      .order('seq', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to));
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { ok: false, reason: REVISION_GATEWAY_FAILURE.TABLE_ABSENT };
      }
      console.error('Could not load investigation revision history for the subject access request:', error.message);
      return { ok: false, reason: REVISION_GATEWAY_FAILURE.QUERY_FAILED };
    }
    const rawRevisions = Array.isArray(data) ? data : [];
    const revisions = rawRevisions.map(revisionRowToObject).filter(Boolean);
      // DROPPED ROWS ARE REPORTED, NOT JUST DROPPED. The guard above rejects
      // a row with no primary key, which is right — garbage must not become
      // data in a disclosure package. But silently discarding it and still
      // answering ok:true would make a SHORT collection look complete, which
      // is the same defect pagination was added to close, arriving by another
      // door. The caller marks the package incomplete when this is non-zero.
    return { ok: true, revisions, droppedRows: rawRevisions.length - revisions.length };
  } catch (e) {
    console.error('Could not load investigation revision history for the subject access request:', e?.message || e);
    return { ok: false, reason: REVISION_GATEWAY_FAILURE.QUERY_FAILED };
  }
}
