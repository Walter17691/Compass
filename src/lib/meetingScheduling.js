// Integrations & Workflow Automation (Phase 5, IP15, §9) — calendar
// scheduling UI. Pure helpers only; the actual API call
// (/api/calendar/create-event, IP3's real create-event primitive) lives
// in App.jsx alongside every other authedFetch call in this app.
//
// api/calendar/_google.js/_microsoft.js both take startISO/endISO as
// UTC ISO strings (see their own "UTC-only event timing" comment) — this
// is the one real caller that turns a UK user's local date/time picker
// input into that UTC form, via the browser's own timezone (new Date()
// interprets an unsuffixed date-time string as local time), which is
// the standard, correct behaviour for a UK-based user picking a time in
// their own calendar app.

export function buildEventTimes({ date, startTime, durationMinutes }) {
  if (!date || !startTime) return null;
  const start = new Date(`${date}T${startTime}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const minutes = Number(durationMinutes) > 0 ? Number(durationMinutes) : 60;
  const end = new Date(start.getTime() + minutes * 60000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// Comma/semicolon/newline-separated free-text attendees -> a clean
// array of the plausible-email-looking entries, silently dropping
// anything that isn't (a typo'd name with no @, say) rather than sending
// a malformed attendee to the calendar API.
export function parseAttendees(raw) {
  return (raw || "")
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

// IP16, §10 — attendee/role suggestions. org_members has no email column
// (see baseline_schema_2026-08-06.sql) — only the case's own employee
// email and the organiser's own signed-in email are ever real, known
// addresses this app can auto-add. A chair/investigator's role is still
// worth surfacing (ACAS Code expects a named chair, and — for an appeal
// specifically — someone not previously involved), just as a reminder
// to type their email in, not a fabricated address.
export function suggestAttendees(cs, { caseAccess = [], orgMembers = [], organiserEmail, meetingTypeId } = {}) {
  const emails = [];
  if (cs?.email) emails.push(cs.email);
  if (organiserEmail && !emails.includes(organiserEmail)) emails.push(organiserEmail);

  const roleNotes = [];
  if (cs?.manager) {
    const isAppeal = (meetingTypeId || "").startsWith("appeal-");
    roleNotes.push(isAppeal
      ? `Appeal chair: someone other than ${cs.manager} — ACAS Code recommends a manager not previously involved`
      : `Chair: ${cs.manager} — add their email above`);
  }
  const investigatorAccess = caseAccess.filter(a => a.caseId === cs?.id && a.role === "investigator");
  const currentInvestigator = investigatorAccess[investigatorAccess.length - 1];
  const investigatorName = currentInvestigator ? orgMembers.find(m => m.user_id === currentInvestigator.userId)?.name : null;
  if (investigatorName) roleNotes.push(`Investigator: ${investigatorName} — add their email above`);

  return { emails, roleNotes };
}

// IP16, §10 — policy notice-period violation flag. Looks for a clause
// like "5 working days' notice" or "48 hours notice" in the case-type-
// relevant policy (same CASE_TYPE_TO_POLICY_CATEGORY lookup
// lib/hearingPack.js already uses) and compares it against the actual
// gap between now and the proposed meeting time. A clause that doesn't
// match this pattern is silently skipped — never a guessed number.
const NOTICE_PATTERN = /(\d+)\s*(hour|working day|business day|day)s?\b[^.]{0,20}notice/i;
const UNIT_TO_HOURS = { hour: 1, day: 24, "working day": 24, "business day": 24 };

export function checkNoticePeriod(policyClauseTexts, { meetingISO, now = new Date() } = {}) {
  if (!meetingISO) return null;
  for (const text of policyClauseTexts || []) {
    const match = NOTICE_PATTERN.exec(text || "");
    if (!match) continue;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const requiredHours = value * (UNIT_TO_HOURS[unit] || 24);
    const actualHours = (new Date(meetingISO).getTime() - now.getTime()) / 3600000;
    return {
      requiredText: `${value} ${unit}${value > 1 ? "s" : ""}' notice`,
      requiredHours,
      actualHours,
      violated: actualHours < requiredHours,
      clauseText: text,
    };
  }
  return null;
}

// Integrations & Workflow Automation (Phase 5, IP17, §11) — automatic
// meeting workspace. Deliberately reuses the exact meeting-record shape
// every meeting on a case already has (id/type/date/manager/savedBy —
// see App.jsx's own saveMeetingToCase) rather than a parallel
// "scheduled meeting" entity: nextStep.js's own stage logic already
// treats a meeting with no `record` yet as "hasn't happened, offer Start
// meeting" (e.g. disciplinaryNextStep's `if(!lastInv?.record)` branch),
// so a scheduled-not-yet-held meeting already behaves correctly
// everywhere else in the app for free — MeetingsTab, buildCaseTimeline,
// nextStep — with no changes needed to any of them beyond
// buildCaseTimeline's own "held" vs "scheduled" wording (see its own
// comment). record stays null/undefined until the meeting is actually
// run through the live session.
export function buildScheduledMeetingEntry({ meetingTypeLabel, date, startISO, endISO, attendees, agenda, prepQuestions, manager, savedBy }) {
  return {
    id: crypto.randomUUID(),
    type: meetingTypeLabel,
    date,
    scheduledStartISO: startISO,
    scheduledEndISO: endISO,
    attendees: attendees || [],
    agenda: agenda || "",
    prepQuestions: prepQuestions || [],
    manager: manager || "",
    savedBy: savedBy || "HR Manager",
    savedAt: new Date().toISOString(),
    record: null,
  };
}
