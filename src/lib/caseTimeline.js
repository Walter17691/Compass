// Pure merge of a case's scattered event sources into one chronological
// list. Nothing here is a new source of truth — meetings and allegations
// already live on the case/allegations array, and audit_log already
// records everything else (status toggles, reassignment, confidentiality
// changes) once a call site threads case_id through audit(). This just
// reads all of it and produces one sorted view.
//
// Allegation lifecycle events (added/status changed/removed) are
// deliberately read from the allegations array itself, not from
// audit_log — audit() also logs those same events (see App.jsx's
// createAllegation/changeAllegationStatus/deleteAllegation) so entries
// whose action starts with "Allegation" are excluded from the audit
// source below to avoid showing the same moment twice.
//
// Integrations & Workflow Automation (Phase 5, IP11, §4) — a saved email
// (evidence.source === "email", see lib/emailIngestion.js) gets the same
// treatment: a dedicated "email" entry read from cs.evidence itself,
// with a real linkTo back to the Evidence tab, so "Email saved to case"
// audit_log entries are excluded here too rather than showing twice.
//
// IP13, §7 — a letter sent via the send-from-Compass coordinated
// workflow (evidence.source === "sent_letter", lib/letterSend.js) gets
// the same treatment again, reusing the existing "letter" entry type
// (already used for "Letter drafted") rather than inventing a fourth —
// "Letter sent" audit_log entries are excluded here for the same
// duplicate-avoidance reason.
//
// Human UAT remediation, Batch 2, Part 2/13 — a generated hearing pack
// (evidence.source === "hearing_pack", lib/hearingPack.js's
// buildHearingPackEvidenceItem) gets its own "document" entry type for
// the same reason again; "Hearing pack generated" audit_log entries are
// excluded here too.
//
// Phase 8 adds: a stable `key` per entry (so overrides survive a
// regenerated timeline), `allegationId` where an entry is genuinely tied
// to one specific allegation (only the allegation source itself — a
// meeting or letter isn't modelled as allegation-scoped anywhere else in
// the app, so this deliberately doesn't invent that relationship), and
// application of `overrides` (excluded/edits/relevance, all keyed by
// entry key) — the case's `timeline_overrides` column, applied here
// rather than duplicated per caller.

import { parseFlexDate } from './dateMath.js';

// Phase 6.5 hardening (closes independent audit finding 3.3) — was raw
// `new Date(dateStr)` on strings guaranteed to be UK-format (DD/MM/YYYY,
// the app's own real writers never produce ISO). new Date("25/08/2026")
// is Invalid Date, caught here, but silently sorted to epoch-0 — above
// "Case opened," so a letter with an unparseable date looked like it
// predated the case. Worse: new Date("05/03/2026") parses as a
// valid-looking but WRONG date (3 May, US month/day order) for any
// day-of-month <= 12 — a silently mis-sorted entry with no error to
// notice, since the displayed date text elsewhere is unaffected, only
// this sort order is wrong. parseFlexDate already exists and correctly
// handles DD/MM/YYYY; an entry it still can't parse now sorts LAST
// (Infinity), not first — a hearing pack handed to a disciplinary panel
// should never show an unparseable-date item as predating the case.
function toTime(dateStr) {
  const d = parseFlexDate(dateStr);
  return d ? d.getTime() : Infinity;
}

function rawEntries(cs, allegations, auditLog) {
  const entries = [];

  if (cs.dateReceived) {
    entries.push({ key: "case-opened", date: cs.dateReceived, type: "case", description: `Case opened${cs.caseType ? " — " + cs.caseType : ""}`, actor: cs.createdByName || null, linkTo: null, allegationId: null });
  }

  (cs.meetings || []).forEach(m => {
    // IP17, §11 — a meeting created by the automatic scheduling workspace
    // (lib/meetingScheduling.js's buildScheduledMeetingEntry) has no
    // record yet; nextStep.js already treats that as "hasn't happened",
    // so the timeline should say so too rather than claiming it was held.
    entries.push({ key: `meeting-${m.id}`, date: m.date, type: "meeting", description: `${m.type || "Meeting"} ${m.record ? "held" : "scheduled"}`, actor: m.manager || m.savedBy || null, linkTo: { kind: "meeting", id: m.id }, allegationId: null });
    if (m.letterOutput) {
      entries.push({ key: `letter-${m.id}`, date: m.savedAt || m.date, type: "letter", description: "Letter drafted", actor: m.savedBy || null, linkTo: { kind: "meeting", id: m.id }, allegationId: null });
    }
  });

  if (cs.investigationReport) {
    entries.push({ key: "report", date: cs.investigationReportDate || cs.dateReceived, type: "report", description: "Investigation report generated", actor: null, linkTo: { kind: "report" }, allegationId: null });
  }

  if (cs.outcome) {
    entries.push({ key: "outcome", date: cs.outcomeDate || cs.dateReceived, type: "outcome", description: `Outcome issued: ${cs.outcome}`, actor: null, linkTo: { kind: "outcome" }, allegationId: null });
  }

  (allegations || []).filter(a => a.caseId === cs.id).forEach(a => {
    entries.push({ key: `allegation-${a.id}`, date: a.createdAt, type: "allegation", description: `Allegation added: ${a.title}`, actor: null, linkTo: { kind: "allegation", id: a.id }, allegationId: a.id });
  });

  (cs.evidence || []).forEach((ev, index) => {
    // Phase 6.5 hardening (structural remediation, Prompt 12 — Task/
    // Entity Identity invariant) — buildEmailEvidenceItem/
    // buildSentLetterEvidenceItem now stamp a real ev.id at creation, so
    // this entry's key (and the persisted excluded/edit/relevance
    // overrides keyed by it) stays attached to the right evidence item
    // even if something earlier in the array is later added or removed.
    // The `?? index` fallback only matters for evidence saved before this
    // fix shipped, which has no ev.id at all.
    const stableId = ev.id ?? index;
    if (ev.source === "email") {
      entries.push({ key: `evidence-email-${stableId}`, date: ev.date, type: "email", description: `Email saved: ${ev.name}`, actor: ev.addedBy || null, linkTo: { kind: "evidence", id: stableId }, allegationId: null });
    } else if (ev.source === "sent_letter") {
      entries.push({ key: `evidence-sent-${stableId}`, date: ev.date, type: "letter", description: `Letter sent: ${ev.name}`, actor: ev.addedBy || null, linkTo: { kind: "evidence", id: stableId }, allegationId: null });
    } else if (ev.source === "hearing_pack") {
      entries.push({ key: `evidence-hearingpack-${stableId}`, date: ev.date, type: "document", description: `Hearing pack generated: ${ev.name}`, actor: ev.addedBy || null, linkTo: { kind: "evidence", id: stableId }, allegationId: null });
    }
  });

  (auditLog || [])
    // Human UAT remediation, Batch 2, Part 14 — "Letter drafted" is
    // audited (App.jsx's handleLetter) purely so it can reach the
    // Activity bell for someone who navigated away mid-generation, not
    // to duplicate the "Letter drafted" entry this file already builds
    // from the saved meeting record's own letterOutput above — a draft
    // can be regenerated several times before being sent, and every
    // regeneration would otherwise add its own Timeline entry.
    .filter(e => e.caseId === cs.id && !(e.action || "").startsWith("Allegation") && e.action !== "Email saved to case" && e.action !== "Letter sent" && e.action !== "Hearing pack generated" && e.action !== "Letter drafted")
    .forEach(e => {
      // Phase 6.5 hardening (structural remediation, Prompt 12 — Task/
      // Entity Identity invariant) — e.id is the row's own real database
      // id (App.jsx's loadAuditLog already preserves it), stable
      // regardless of array position; the previous ${e.ts}-${i} key
      // shifted for every entry after a new audit row arrived earlier in
      // the (created_at desc) list, silently repointing any persisted
      // override onto the wrong entry.
      entries.push({ key: `audit-${e.id}`, date: e.ts, type: "audit", description: e.detail ? `${e.action} — ${e.detail}` : e.action, actor: e.user || null, linkTo: null, allegationId: null });
    });

  return entries;
}

// Phase 6.5 hardening (closes Prompt 11 audit finding 4.8, MEDIUM) —
// audit_log only reliably carried case_id from this point on (live-
// verified against the real table: the last case-scoped action —
// "Meeting saved" — recorded with no case_id was 2026-08-21T13:41; every
// one since has it). Older rows with case_id null stay permanently
// invisible to rawEntries' own `e.caseId === cs.id` filter above, with no
// reliable case-identifying data left on them to backfill from — a
// speculative backfill risks silently attributing the wrong history to
// the wrong case, worse than the current honest gap. Rather than that,
// any case whose own history predates this cutoff gets an explicit
// caveat wherever the timeline is shown (TimelinePanel, the hearing
// pack's Chronology section) instead of presenting a silently incomplete
// history as complete.
const AUDIT_CASE_ID_RELIABLE_FROM = new Date("2026-08-21T13:41:23.763Z").getTime();

export function mayHaveIncompleteAuditHistory(cs) {
  const opened = parseFlexDate(cs?.dateReceived);
  return !!opened && opened.getTime() < AUDIT_CASE_ID_RELIABLE_FROM;
}

export function buildCaseTimeline(cs, allegations, auditLog, overrides = {}) {
  const excluded = new Set(overrides.excluded || []);
  const edits = overrides.edits || {};
  const relevance = overrides.relevance || {};

  return rawEntries(cs, allegations, auditLog)
    .filter(e => !excluded.has(e.key))
    .map(e => ({ ...e, description: edits[e.key] || e.description, relevance: relevance[e.key] || null }))
    .sort((a, b) => toTime(a.date) - toTime(b.date));
}
