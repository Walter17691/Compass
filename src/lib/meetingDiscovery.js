// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — meeting discovery read model. Phase 4C.2.
//
// Answers one question: "which meetings should this person be shown, and under
// which heading?"
//
// It does NOT answer "what state is this meeting in?" (meetingLifecycle.js),
// "where does it live?" (meetingStore.js), "may this write proceed?"
// (meetingWrites.js), or "may this person see it?" — that last one is
// deliberately NOT here. RLS is the access boundary. This module shapes rows the
// database has already decided the caller may read.
//
// ┌─ WHY PRESENTATION MUST NOT BE THE SECURITY BOUNDARY ───────────────────┐
// │ There is no creator/chair/HR filter anywhere in this file, and a test    │
// │ asserts its absence. If discovery filtered by `createdBy === me`, then   │
// │ the day someone adds a legitimate new reader (an investigator grant, a   │
// │ delegated HR view) they would have to remember to widen a client-side    │
// │ predicate too — and if they forgot the other way round, the UI would     │
// │ hide rows the database was willing to serve while looking correct.       │
// │ One boundary, in the database. This file only sorts and labels.          │
// └────────────────────────────────────────────────────────────────────────┘
//
// A read model MAY normalise for presentation. It must never blur provenance:
// every entry carries its authoritative storageHome, so an action can always be
// routed to the store that actually owns the meeting.
// ─────────────────────────────────────────────────────────────────────────

import { MEETING_STATUS, declaredStatus, scheduleInstant } from './meetingLifecycle.js';
import { MEETING_HOME, meetingHome } from './meetingStore.js';
import { MEETING_TYPES } from '../constants.js';

// The information hierarchy, and nothing more. No dashboards, no counts-as-
// metrics, no league tables — a meeting is either coming up, waiting on you,
// recently done, or cancelled.
export const DISCOVERY_GROUP = Object.freeze({
  UPCOMING: "upcoming",
  ATTENTION: "attention",
  RECENT: "recent",
  CANCELLED: "cancelled",
});

export const DISCOVERY_GROUP_LABEL = Object.freeze({
  [DISCOVERY_GROUP.UPCOMING]: "Upcoming",
  [DISCOVERY_GROUP.ATTENTION]: "Needs your attention",
  [DISCOVERY_GROUP.RECENT]: "Recent",
  [DISCOVERY_GROUP.CANCELLED]: "Cancelled",
});

// Status → heading. Uses the declared lifecycle vocabulary only; no sixth state
// is invented and nothing is inferred from content. A meeting with no declared
// status (every legacy embedded row) returns null rather than being guessed into
// a bucket — which is what keeps 884 historical meetings out of a surface that
// is about the new lifecycle.
export function discoveryGroupFor(meeting) {
  switch (declaredStatus(meeting)) {
    case MEETING_STATUS.SCHEDULED:    return DISCOVERY_GROUP.UPCOMING;
    case MEETING_STATUS.IN_PROGRESS:  return DISCOVERY_GROUP.ATTENTION;
    case MEETING_STATUS.REVIEW_DRAFT: return DISCOVERY_GROUP.ATTENTION;
    case MEETING_STATUS.COMPLETED:    return DISCOVERY_GROUP.RECENT;
    case MEETING_STATUS.CANCELLED:    return DISCOVERY_GROUP.CANCELLED;
    default: return null;
  }
}

// The human label for a registry id. Derived at read time, never persisted —
// embedded meetings store the label in `m.type` and that legacy shape is
// deliberately not inherited by public.meetings (see 4C.1).
export function displayTypeFor(meetingTypeId, fallbackLabel = null) {
  const entry = MEETING_TYPES.find(t => t.id === meetingTypeId);
  return entry?.label || fallbackLabel || "Meeting";
}

// What a user could do with this meeting, by status.
//
// `enabled` is separate from `action` on purpose: every entry reports its
// eventual action, and only the ones whose destination exists are offered. A
// button that looks live and does nothing was the exact failure of the Phase 3A
// "Review meeting record" CTA, and a greyed control with no reason was the
// failure of the Phase 2.3 scheduling UAT — so the surface renders only what is
// real and names the state plainly for the rest.
//
// Which actions actually exist today. An explicit allow-list rather than a
// boolean, because "is this a write?" was never the right question: `view_record`
// is read-only but there is still no standalone record viewer (4C.4), so treating
// read-only as available would have rendered a button that goes nowhere. Each
// action is enabled the moment its destination exists, one entry at a time.
export const ACTIVATED_ACTIONS = Object.freeze(["resume", "continue_review"]);

export function potentialActionFor(meeting, { enabledActions = ACTIVATED_ACTIONS } = {}) {
  const status = declaredStatus(meeting);
  const plan = {
    [MEETING_STATUS.SCHEDULED]:    { action: "start",           label: "Start" },
    [MEETING_STATUS.IN_PROGRESS]:  { action: "resume",          label: "Resume" },
    [MEETING_STATUS.REVIEW_DRAFT]: { action: "continue_review", label: "Continue review" },
    [MEETING_STATUS.COMPLETED]:    { action: "view_record",     label: "View record" },
    [MEETING_STATUS.CANCELLED]:    { action: "view_record",     label: "View record" },
  }[status] || { action: "open", label: "Open" };
  return { ...plan, enabled: (Array.isArray(enabledActions) ? enabledActions : []).includes(plan.action) };
}

// One normalised entry. Every field the discovery contract requires, and the
// provenance that lets an action find the right store.
export function toDiscoveryEntry(meeting, { enabledActions = ACTIVATED_ACTIONS } = {}) {
  if (!meeting || typeof meeting !== "object" || Array.isArray(meeting)) return null;
  const home = meetingHome(meeting);
  const status = declaredStatus(meeting);
  const schedule = meeting.schedule && typeof meeting.schedule === "object" ? meeting.schedule : null;
  return {
    id: meeting.id ?? null,
    // Explicit, never inferred from a name or a label.
    storageHome: home,
    isStandalone: (meeting.caseId ?? null) === null,
    caseId: meeting.caseId ?? null,
    meetingTypeId: meeting.meetingTypeId ?? null,
    displayType: displayTypeFor(meeting.meetingTypeId, meeting.type ?? null),
    employeeName: meeting.employeeName ?? null,
    manager: meeting.manager ?? null,
    chairUserId: meeting.chairUserId ?? null,
    status,
    group: discoveryGroupFor(meeting),
    scheduledDate: schedule?.date ?? null,
    scheduledTime: schedule?.time ?? null,
    scheduledMethod: schedule?.method ?? null,
    scheduledAt: scheduleInstant(meeting),
    startedAt: meeting.startedAt ?? null,
    endedAt: meeting.endedAt ?? null,
    createdAt: meeting.createdAt ?? null,
    updatedAt: meeting.updatedAt ?? null,
    linkedAt: meeting.linkedAt ?? null,
    primaryAction: potentialActionFor(meeting, { enabledActions }),
  };
}

// The instant a group sorts by. Upcoming sorts by when it is due, ascending;
// everything else by the most recent thing that happened to it, descending.
function sortInstant(entry) {
  if (entry.group === DISCOVERY_GROUP.UPCOMING) return entry.scheduledAt;
  const candidates = [entry.endedAt, entry.startedAt, entry.updatedAt, entry.createdAt]
    .map(v => Date.parse(v || ""))
    .filter(n => !Number.isNaN(n));
  return candidates.length ? Math.max(...candidates) : NaN;
}

// Group and order for display. Returns every group, always, so a surface can
// render a truthful empty state per section rather than hiding a heading and
// leaving the user unsure whether it was checked.
export function groupForDiscovery(meetings, { enabledActions = ACTIVATED_ACTIONS } = {}) {
  const entries = (Array.isArray(meetings) ? meetings : [])
    .map(m => toDiscoveryEntry(m, { enabledActions }))
    .filter(e => e && e.id && e.group);

  const bucket = group => entries
    .filter(e => e.group === group)
    .map((e, index) => ({ e, index, at: sortInstant(e) }))
    .sort((a, b) => {
      // Undated entries sort last in both directions rather than being treated
      // as the epoch — an unstamped row must not outrank one that recorded a
      // real instant, the same rule scheduledMeetingsFor already applies.
      const av = Number.isNaN(a.at) ? Infinity : a.at;
      const bv = Number.isNaN(b.at) ? Infinity : b.at;
      if (av === Infinity && bv === Infinity) return a.index - b.index;
      if (av === Infinity) return 1;
      if (bv === Infinity) return -1;
      // Two meetings can legitimately share an instant — the same batch of
      // updates, the same scheduled slot. Fall back to input order so the list
      // is deterministic rather than dependent on sort implementation.
      const byTime = group === DISCOVERY_GROUP.UPCOMING ? av - bv : bv - av;
      return byTime || a.index - b.index;
    })
    .map(x => x.e);

  return {
    [DISCOVERY_GROUP.UPCOMING]: bucket(DISCOVERY_GROUP.UPCOMING),
    [DISCOVERY_GROUP.ATTENTION]: bucket(DISCOVERY_GROUP.ATTENTION),
    [DISCOVERY_GROUP.RECENT]: bucket(DISCOVERY_GROUP.RECENT),
    [DISCOVERY_GROUP.CANCELLED]: bucket(DISCOVERY_GROUP.CANCELLED),
  };
}

// ── The reopen contract ────────────────────────────────────────────────────
//
// Resolution is by STABLE MEETING ID plus authoritative storage home, and by
// nothing else. Not employee name, not meeting label, not "the current case",
// not array position — every one of those produced a real defect earlier in this
// engagement, and the label/name route is especially dangerous now that two
// stores exist: a table meeting and an embedded meeting can legitimately share
// an employee, a type and a date.
//
// Returns null when the id is not in the caller's own authorised set. That is
// the same answer for "no such meeting", "it belongs to another organisation"
// and "you cannot access it" — deliberately indistinguishable, so a failed
// lookup cannot be used to probe whether another tenant's meeting exists.
export function resolveMeetingRef(meetings, { id, storageHome = null } = {}) {
  if (typeof id !== "string" || id.trim() === "") return null;
  const list = Array.isArray(meetings) ? meetings : [];
  const matches = list.filter(m => m && m.id === id
    && (storageHome === null || meetingHome(m) === storageHome));
  // Ambiguity is refused rather than resolved by position. Two authoritative
  // homes means a duplicate id is conceivable (854 legacy ids are bare
  // millisecond timestamps), and silently picking one would be a guess about
  // which record a user is looking at.
  if (matches.length !== 1) return null;
  return matches[0];
}

// A route descriptor for a meeting, carrying provenance so the destination never
// has to re-derive which store owns it.
export function meetingRouteFor(entry) {
  if (!entry?.id) return null;
  return {
    meetingId: entry.id,
    storageHome: entry.storageHome,
    // Present only for a case-linked meeting; never invented for a standalone
    // one, so a route can't imply a parent that does not exist.
    ...(entry.caseId ? { caseId: entry.caseId } : {}),
  };
}

export const IS_TABLE_HOME = MEETING_HOME.TABLE;
