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
/**
 * The precise instant of an evidential event, for a signed record.
 *
 * ┌─ WHY THIS EXISTS ──────────────────────────────────────────────────────┐
 * │ The manager's signed copy rendered signed_at through fmtDate, which is   │
 * │ toLocaleDateString — so "2026-10-06T21:04:03.484Z" became "06/10/2026"   │
 * │ and the TIME was silently dropped. The employee's own confirmation page   │
 * │ showed "6 October 2026, 22:04" from the SAME field, so the two screens    │
 * │ disagreed about what Compass knew. For an electronic signature the        │
 * │ precise instant is the evidence.                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * TIMEZONE: the viewer's own, via toLocaleString — which is Compass's existing
 * de facto convention everywhere (fmtMeetingTime, fmtDate, public/sign.html all
 * do this). There is NO organisation-level timezone setting in the product, so
 * none is invented here. 21:04Z renders as 22:04 for a UK viewer in BST, which
 * is exactly what the employee saw.
 *
 * Same en-GB options as public/sign.html, so the manager's copy and the
 * participant's confirmation state the same instant in the same words.
 */
export function fmtSignatureInstant(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} at ${time}`;
}

export function fmtMeetingTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
