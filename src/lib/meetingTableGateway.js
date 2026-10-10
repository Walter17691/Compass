// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — reading public.meetings. Phase 4C.2.
//
// The only module that talks to the standalone meeting table. The Supabase
// client is injected rather than imported, so this is testable without a network
// and so there is exactly one place to audit when asking "what does discovery
// actually fetch?"
//
// ┌─ METADATA ONLY, DELIBERATELY ──────────────────────────────────────────┐
// │ DISCOVERY_COLUMNS excludes record, transcript, summary, risk,            │
// │ review_draft and advisor_notes. Discovery needs to tell you a meeting    │
// │ EXISTS and what state it is in; it does not need the verbatim transcript │
// │ of a welfare conversation. Not fetching content is a smaller exposure    │
// │ than fetching it and choosing not to render it, and it means a future    │
// │ rendering bug cannot leak what was never sent. Content is loaded by the  │
// │ surface that genuinely needs it, when it needs it.                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// RLS IS THE ACCESS BOUNDARY. The org filter below is a SCOPE filter, not a
// security one: Compass shows one organisation at a time, so a user who belongs
// to two orgs should see the one they are currently in. If that filter were
// removed the query would still be safe — it would just show both orgs. The
// security tests prove the boundary by impersonating real users against the real
// policies, not by inspecting this file.
// ─────────────────────────────────────────────────────────────────────────

import { meetingRowToObject } from './standaloneMeetings.js';

import { fetchAllPages } from './paginatedFetch.js';

export const MEETINGS_TABLE = "meetings";

export const DISCOVERY_COLUMNS = [
  "id", "org_id", "case_id", "meeting_type_id", "status",
  // E2 canonical parentage. Discovery needs it to answer "whose meeting is
  // this?" without matching a name — and `witness` is included because a surface
  // must be able to tell a witness interview apart from an employee's own
  // meeting BEFORE deciding where to show it.
  "subject_kind", "employee_id", "witness",
  "employee_name", "manager", "chair_user_id",
  "schedule", "started_at", "ended_at",
  "created_by", "created_at", "updated_at", "linked_at", "linked_by",
].join(", ");

export const GATEWAY_FAILURE = Object.freeze({
  NO_ORG: "no_org",
  NO_CLIENT: "no_client",
  QUERY_FAILED: "query_failed",
});

// ── DSAR. Phase E2A ────────────────────────────────────────────────────────
//
// The ONE content-bearing read, and it exists for one reason: a subject access
// request must disclose the employee's own meeting content, and discovery
// deliberately cannot see it.
//
// ┌─ WHY THIS IS NOT THE PRIVILEGED SERVER PATH ────────────────────────────┐
// │ DsarScreen already calls /api/portal/dsar-lookup, which uses the service │
// │ role to reach tables the browser cannot (signing_requests has RLS         │
// │ enabled and zero policies). Meetings are NOT routed through it.           │
// │                                                                          │
// │ This read goes through the ordinary authenticated client, so E2's meeting │
// │ policies apply unchanged and the compiler can only ever be handed rows    │
// │ the person compiling the DSAR is already entitled to read. Completeness   │
// │ is not a reason to widen access.                                          │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Scoped to the organisation rather than to the subject on purpose. The compiler
// needs both halves: the subject's OWN meetings, and the authorised meetings that
// are not theirs — because a witness interview naming the subject is a
// third-party mention for a human to weigh, exactly as another person's case
// record already is. Handing over only the subject's rows would silently drop
// that, which is the disclosure gap E2 was careful to avoid.
export const DSAR_COLUMNS = [
  "id", "org_id", "case_id", "meeting_type_id", "status",
  "subject_kind", "employee_id", "witness", "employee_name",
  "schedule", "started_at", "ended_at", "created_by", "created_at", "updated_at",
  // Content. Classified for disclosure by lib/dsarCompile.js — advisor notes and
  // the internal half of a record are fetched so they can be deliberately
  // WITHHELD by a rule that can be read and tested, rather than never fetched
  // and therefore never reasoned about.
  "record", "transcript", "summary", "advisor_notes", "review_draft",
].join(", ");

export async function fetchDsarMeetings(client, { orgId } = {}) {
  if (!client) return { ok: false, reason: GATEWAY_FAILURE.NO_CLIENT };
  if (typeof orgId !== "string" || orgId.trim() === "") {
    return { ok: false, reason: GATEWAY_FAILURE.NO_ORG };
  }
  try {
    // PAGINATED. A plain .select() is capped by the server's own per-request
    // row limit, and PostgREST hands the capped page back as an ORDINARY
    // SUCCESS — no error, no signal. For a subject access request that is the
    // worst available failure shape: a package that is short and looks
    // complete. src/lib/paginatedFetch.js exists for this and says so in its
    // own header; App.jsx already uses it for cases, audit_log and
    // hr_review_requests.
    //
    // This query had NO ordering at all, which paging cannot tolerate: a range
    // window over an unordered result can repeat or skip rows between pages.
    // Ordering by the primary key gives a total order, and it is the key
    // rather than a timestamp because created_at is not unique.
    //
    // A page failure returns the rows gathered so far ALONGSIDE the error.
    // They are discarded below — a partial read is reported as a failed read,
    // never as a short success, which is the rule this module already states
    // for fetchDiscoverableMeetings ("you have no meetings" and "we could not
    // check" are different facts).
    const { data, error } = await fetchAllPages((from, to) => client
      .from(MEETINGS_TABLE)
      .select(DSAR_COLUMNS)
      .eq("org_id", orgId)
      .order("id", { ascending: true })
      .range(from, to));
    if (error) {
      console.error("Could not load meetings for the subject access request:", error.message);
      return { ok: false, reason: GATEWAY_FAILURE.QUERY_FAILED };
    }
    const rawMeetings = Array.isArray(data) ? data : [];
    const meetings = rawMeetings.filter(r => r && typeof r === 'object' && r.id).map(meetingRowToObject).filter(Boolean);
      // DROPPED ROWS ARE REPORTED, NOT JUST DROPPED. The guard above rejects
      // a row with no primary key, which is right — garbage must not become
      // data in a disclosure package. But silently discarding it and still
      // answering ok:true would make a SHORT collection look complete, which
      // is the same defect pagination was added to close, arriving by another
      // door. The caller marks the package incomplete when this is non-zero.
    return { ok: true, meetings, droppedRows: rawMeetings.length - meetings.length };
  } catch (e) {
    console.error("Could not load meetings for the subject access request:", e?.message || e);
    return { ok: false, reason: GATEWAY_FAILURE.QUERY_FAILED };
  }
}

// Every standalone/table-resident meeting the caller is authorised to see in the
// given organisation, already mapped to meeting objects carrying their
// storageHome.
//
// Returns a discriminated result rather than throwing, and never an empty array
// on failure — "you have no meetings" and "we could not check" are different
// facts, and a surface that renders the first when the second is true tells the
// user something false.
export async function fetchDiscoverableMeetings(client, { orgId } = {}) {
  if (!client) return { ok: false, reason: GATEWAY_FAILURE.NO_CLIENT };
  if (typeof orgId !== "string" || orgId.trim() === "") {
    return { ok: false, reason: GATEWAY_FAILURE.NO_ORG };
  }
  try {
    // Paginated on the same terms. This one is not a DSAR path — it feeds
    // meeting discovery in the product — but it is the same defect in the same
    // file, and a meeting silently missing from a list is still a meeting
    // silently missing. The id tiebreaker makes created_at's ordering total,
    // since two meetings can share a created_at and a range window over a
    // non-total order can repeat or skip rows.
    const { data, error } = await fetchAllPages((from, to) => client
      .from(MEETINGS_TABLE)
      .select(DISCOVERY_COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to));
    if (error) {
      // The message is logged for an operator, never surfaced verbatim — a
      // database error string can name tables, columns and constraints.
      console.error("Could not load standalone meetings:", error.message);
      return { ok: false, reason: GATEWAY_FAILURE.QUERY_FAILED };
    }
    return { ok: true, meetings: (Array.isArray(data) ? data : []).filter(r => r && typeof r === 'object' && r.id).map(meetingRowToObject).filter(Boolean) };
  } catch (e) {
    console.error("Could not load standalone meetings:", e?.message || e);
    return { ok: false, reason: GATEWAY_FAILURE.QUERY_FAILED };
  }
}

// What to tell the user when the load failed. Never leaks whether a meeting, or
// another organisation, exists.
export function describeGatewayFailure(reason) {
  switch (reason) {
    case GATEWAY_FAILURE.NO_ORG:
      return "Select an organisation to see its meetings.";
    case GATEWAY_FAILURE.NO_CLIENT:
    case GATEWAY_FAILURE.QUERY_FAILED:
    default:
      return "Couldn't load meetings just now. Try again in a moment.";
  }
}
