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

export const MEETINGS_TABLE = "meetings";

export const DISCOVERY_COLUMNS = [
  "id", "org_id", "case_id", "meeting_type_id", "status",
  "employee_name", "manager", "chair_user_id",
  "schedule", "started_at", "ended_at",
  "created_by", "created_at", "updated_at", "linked_at", "linked_by",
].join(", ");

export const GATEWAY_FAILURE = Object.freeze({
  NO_ORG: "no_org",
  NO_CLIENT: "no_client",
  QUERY_FAILED: "query_failed",
});

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
    const { data, error } = await client
      .from(MEETINGS_TABLE)
      .select(DISCOVERY_COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) {
      // The message is logged for an operator, never surfaced verbatim — a
      // database error string can name tables, columns and constraints.
      console.error("Could not load standalone meetings:", error.message);
      return { ok: false, reason: GATEWAY_FAILURE.QUERY_FAILED };
    }
    return { ok: true, meetings: (Array.isArray(data) ? data : []).map(meetingRowToObject).filter(Boolean) };
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
