// Phase 6.5 hardening (P1, reliability review) — this module's own
// addWorkingDays was removed as a duplicate of dateMath.js's (the shared
// module dateMath.js's header comment already consolidated four other
// date implementations onto): this one didn't parse DD/MM/YYYY and had a
// real bug where 0 working days returned null instead of the same date.
// Working-day arithmetic now lives only in dateMath.js; this file keeps
// the two calendar helpers with no equivalent there.

// Warning-expiry remediation (Defect #12) — generalises the single-month
// logic below (still kept, calling this with months=1, so both share one
// implementation) to an arbitrary N, needed for warning_expires_at
// (outcome_issued_at + warning_duration_months). Deliberately a single
// direct jump to the target month, not N chained single-month calls:
// chaining re-clamps at every intermediate month and can land somewhere
// different from a genuine "N calendar months later" — e.g. 31 Jan + 2
// months chained (31 Jan -> 28 Feb -> 28 Mar) lands on 28 Mar, while a
// direct 2-month jump correctly lands on 31 Mar (Mar has 31 days, so
// nothing needed clamping). Same end-of-month clamp rule as
// addCalendarMonth: the corresponding day in the target month, or the
// last day of that month if the original day doesn't exist there.
export function addCalendarMonths(date, months) {
  const d = new Date(date);
  if(isNaN(d)) return null;
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth()+months, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  target.setDate(Math.min(day, daysInTargetMonth));
  return target;
}

// UK GDPR/DPA 2018 DSAR deadline: "one calendar month" from receipt (ICO
// guidance) — the corresponding date in the next month, or the last day
// of that month if the original date doesn't exist there (e.g. 31 Jan ->
// 28/29 Feb, not a rolled-over 2/3 March). Returns a Date, not a
// formatted string, since callers need both ISO (DB storage) and en-GB
// (display) forms.
export function addCalendarMonth(date) {
  return addCalendarMonths(date, 1);
}

// Formats a Date's LOCAL calendar date as "YYYY-MM-DD", for storing dates
// (not instants) in a Postgres `date` column. `date.toISOString()` is the
// wrong tool for this: it converts to UTC first, so a Date built from
// local midnight (as addCalendarMonth does) silently rolls back to the
// previous day for any timezone ahead of UTC (e.g. the UK during BST,
// UTC+1) — which is exactly the DSAR due-date case this exists for.
export function toISODateLocal(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
