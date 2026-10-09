// ─────────────────────────────────────────────────────────────────────────
// READING SAVED INVESTIGATION REPORT VERSIONS FOR A SUBJECT ACCESS REQUEST.
//
// B3.1 created public.investigation_report_versions and deliberately left it
// unwired: classified INCLUDED_NOT_WIRED with dsarDefect 'B3.4', because an
// investigation report is a document ABOUT the subject and its saved versions
// are disclosable personal data on the same footing as the report itself —
// but the compiler did not read them, and saying so plainly was the honest
// position until it did. This module is B3.4, the thing that closes it.
//
// It follows findingRevisionGateway.js deliberately and almost exactly. That
// module exists because the B2 review found investigation_finding_revisions
// listed in the manifest, classified dsar: included, covered by 21 passing
// tests — and FETCHED BY NOTHING, since every test handed the compiler a
// fixture directly. A green suite certified an integration that did not exist.
// The same trap is open here, so the same three things close it: a gateway
// that actually queries, a compiler that consumes it, and a wiring test that
// asserts the screen calls the gateway.
//
// FETCHED AT COMPILE TIME, NOT HELD IN GLOBAL STATE. Nothing in the product UI
// reads this table today — B3.2 will add an investigator workspace, but that
// reads one case at a time. Parking every saved report body for the whole
// organisation in every HR user's browser on every page load would be a
// standing exposure to serve a feature used a handful of times a year. Same
// shape as fetchDsarMeetings and fetchDsarFindingRevisions: fetched for the
// duration of the compile, never parked.
//
// THROUGH THE ORDINARY CLIENT, DELIBERATELY. Not through
// /api/portal/dsar-lookup, which uses the service role. service_role carries
// rolbypassrls, so routing this through it would hand the compiler report
// versions from cases the person compiling has no access to — including
// confidential cases they hold no case_access row for — and would make
// completeness a reason to widen access. This table has a client-facing SELECT
// policy (HR in the case's org, or the case's assigned investigator), so the
// browser reads exactly what that person is already entitled to read.
//
// created_by AND adopted_by ARE NOT SELECTED. The compiler withholds internal
// actors — changed_by on revisions, decided_by on case_decisions — so pulling
// the identifiers into the browser purely to discard them would be worse than
// not asking. author_kind and adoption_basis ARE selected, because whether a
// person or a system authored a document about the subject, and on what basis
// it became the official one, is the subject's own information.
//
// THE BODY IS SELECTED BUT NEVER DISCLOSED. It is read so that superseded and
// draft wording can be scanned for third-party mentions on the same terms as
// the live text, and so the compiler can report whether there is anything to
// review. compileSubjectData does not reproduce it. That is the same bargain
// B2 struck for previous_value/new_value, and the same treatment
// cases.investigationReport itself already gets via CASE_REVIEW_REQUIRED.
// ─────────────────────────────────────────────────────────────────────────

import { fetchAllPages } from './paginatedFetch.js';

export const REPORT_VERSION_GATEWAY_FAILURE = Object.freeze({
  NO_CLIENT: 'no_client',
  NO_ORG: 'no_org',
  QUERY_FAILED: 'query_failed',
  TABLE_ABSENT: 'table_absent',
});

const VERSIONS_TABLE = 'investigation_report_versions';

// Ordered by (case_id, version_no). version_no is assigned by a trigger holding
// a row lock on the parent case, so it is a true total order within a case —
// created_at is not, since two rows written in one transaction share it.
const DSAR_COLUMNS = [
  'id', 'org_id', 'case_id', 'version_no', 'body', 'source',
  'created_at', 'author_kind',
  'adopted_at', 'adoption_basis', 'adoption_reason',
  'is_current', 'superseded_at', 'superseded_by_version_id',
].join(', ');

/** PostgREST's code for "relation does not exist". */
const UNDEFINED_TABLE = '42P01';

function versionRowToObject(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orgId: row.org_id,
    caseId: row.case_id,
    versionNo: row.version_no ?? null,
    body: row.body ?? null,
    source: row.source || null,
    createdAt: row.created_at || null,
    authorKind: row.author_kind || null,
    adoptedAt: row.adopted_at || null,
    adoptionBasis: row.adoption_basis || null,
    adoptionReason: row.adoption_reason ?? null,
    isCurrent: !!row.is_current,
    supersededAt: row.superseded_at || null,
    supersededByVersionId: row.superseded_by_version_id || null,
  };
}

/**
 * Fetch every saved report version the compiling user may read in this org.
 *
 * Returns `{ ok: true, versions }` or `{ ok: false, reason }`. Never throws and
 * never returns a partial success — the caller must be able to tell "none" from
 * "could not look", because a package that conflates them certifies a
 * completeness it does not have.
 *
 * TABLE_ABSENT is kept distinct for the same reason B2 kept it: it is a known
 * state (a database without the B3.1 migration) rather than a fault, so it is
 * reported as not-yet-available instead of raising a load error at every HR
 * user. It is NOT swallowed — the disposition still says completeness cannot
 * be confirmed.
 */
export async function fetchDsarReportVersions(client, { orgId } = {}) {
  if (!client) return { ok: false, reason: REPORT_VERSION_GATEWAY_FAILURE.NO_CLIENT };
  if (typeof orgId !== 'string' || orgId.trim() === '') {
    return { ok: false, reason: REPORT_VERSION_GATEWAY_FAILURE.NO_ORG };
  }
  try {
    // PAGINATED, and that is not optional here. A plain .select() is capped by
    // the server's own per-request row limit, and PostgREST returns the capped
    // page as an ordinary success — no error, no indication that rows were
    // left behind. For a subject access request that is the worst possible
    // failure shape: a package that is short and looks complete.
    //
    // src/lib/paginatedFetch.js already exists for exactly this and is what
    // App.jsx uses for cases, audit_log and hr_review_requests. Its own
    // comment makes the point that settles it — it stops on a genuinely empty
    // page rather than on `data.length < pageSize`, "the server's own
    // per-request cap could be lower than pageSize, which would make that
    // comparison true while real rows remain".
    //
    // A page failure returns the rows gathered so far ALONGSIDE the error.
    // Those partial rows are discarded below rather than returned: a partial
    // read is reported as a failed read, never as a short success.
    const { data, error } = await fetchAllPages((from, to) => client
      .from(VERSIONS_TABLE)
      .select(DSAR_COLUMNS)
      .eq('org_id', orgId)
      .order('case_id', { ascending: true })
      .order('version_no', { ascending: true })
      .range(from, to));
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { ok: false, reason: REPORT_VERSION_GATEWAY_FAILURE.TABLE_ABSENT };
      }
      console.error('Could not load investigation report versions for the subject access request:', error.message);
      return { ok: false, reason: REPORT_VERSION_GATEWAY_FAILURE.QUERY_FAILED };
    }
    return {
      ok: true,
      versions: (Array.isArray(data) ? data : []).map(versionRowToObject).filter(Boolean),
    };
  } catch (e) {
    console.error('Could not load investigation report versions for the subject access request:', e?.message || e);
    return { ok: false, reason: REPORT_VERSION_GATEWAY_FAILURE.QUERY_FAILED };
  }
}

// ── THE FIVE STATES, NAMED ────────────────────────────────────────────────
//
// A reviewer deciding disclosure needs to know WHICH of these a row is, and
// the distinctions are not interchangeable: the current official document, a
// document that was once official and has been replaced, and a draft that was
// never adopted at all carry different weight entirely.
//
// UNEXPECTED exists because the schema permits a shape the adoption RPC never
// produces (adopted, not current, not superseded). Rather than mis-file it as
// a draft or silently drop it, it is named, so a reviewer sees that Compass
// could not classify it instead of being told something false.
export const REPORT_VERSION_STATE = Object.freeze({
  CURRENT_ADOPTED: 'current_adopted',
  HISTORICALLY_ADOPTED: 'historically_adopted',
  DRAFT: 'draft',
  UNEXPECTED: 'unexpected',
});

/**
 * Classify one version row. Pure, total, and never throws on a malformed row.
 */
export function classifyReportVersion(v) {
  if (!v || typeof v !== 'object') return REPORT_VERSION_STATE.UNEXPECTED;
  const adopted = !!v.adoptedAt;
  if (!adopted) return REPORT_VERSION_STATE.DRAFT;
  if (v.isCurrent) return REPORT_VERSION_STATE.CURRENT_ADOPTED;
  if (v.supersededAt) return REPORT_VERSION_STATE.HISTORICALLY_ADOPTED;
  return REPORT_VERSION_STATE.UNEXPECTED;
}
