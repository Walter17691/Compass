// Human UAT remediation, Batch 2, Part 4 — a meeting's actual start/end
// time was only ever captured as a bare HH:MM string
// (new Date().toLocaleTimeString), live in React state only, with no
// date component and no persisted structured field on the saved meeting
// record — the only trace of it surviving past the live session was
// whatever the AI happened to transcribe into the free-text "## Meeting
// Details" section it generates. App.jsx now captures the full ISO
// instant instead (still from the exact same moment — first genuine note
// typed, and "End meeting" clicked — not a new source of truth), so both
// the live display and the generated record can show a real UK
// date+time via this formatter, and the instant itself can be persisted
// as a genuine field on the meeting (App.jsx's saveMeetingToCaseImpl) —
// never substituted for, or confused with, the case's scheduled date
// (caseInfo.date/m.date) or the record's save time (m.savedAt).
export function fmtMeetingTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
