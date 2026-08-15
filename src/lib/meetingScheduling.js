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
