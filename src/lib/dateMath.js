// Phase 6.5 hardening (Cluster 3) — one shared date-parsing/date-math
// module. Before this, four separate modules parsed or diffed dates
// their own way: guardrails.js and appealReview.js each had a byte-
// identical private parseFlexDate; automationRules.js, deadlines.js, and
// impactTracking.js each had their own daysSince/day-diff with three
// different rounding and failure behaviours (one of them returns NaN on
// a bad date instead of null, defeating every caller's own guard).
// case_tasks.due_date and several meeting/next-step fields are stored as
// UK-format "DD/MM/YYYY" text, not ISO — every consumer needs to handle
// both.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parses "DD/MM/YYYY" (the UK format most of this app's date text fields
// use) or anything the Date constructor can parse (ISO strings, existing
// Date objects). Returns null — never NaN, never an Invalid Date — on
// anything unparseable, so every caller can guard with a plain `if
// (!d) return` instead of an isNaN check it might forget.
export function parseFlexDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts.map(Number);
      const d = new Date(yyyy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Whole-calendar-day difference, b minus a (positive when b is later),
// DST-safe. A plain (b - a) / MS_PER_DAY on two local-midnight Date
// objects is NOT safe across a DST transition — a local calendar day is
// 23 or 25 hours long on the transition day itself, so the millisecond
// difference between two local midnights isn't always an exact multiple
// of 24h, which silently produces an off-by-one day count. Normalising
// both to a UTC timestamp built from the same Y/M/D fields sidesteps
// this entirely, since UTC has no DST.
export function daysBetween(a, b) {
  const da = a instanceof Date ? a : parseFlexDate(a);
  const db = b instanceof Date ? b : parseFlexDate(b);
  if (!da || isNaN(da.getTime()) || !db || isNaN(db.getTime())) return null;
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

// Days since `dateIso`, as of `now` (defaults to the real current time).
// null on an unparseable date — the specific bug this replaces
// (impactTracking.js's own version) returned NaN instead, which silently
// defeats a caller's `if (days === null)` guard and can render "…in the
// NaN days before…".
export function daysSince(dateIso, now = new Date()) {
  return daysBetween(dateIso, now);
}

// Adds `days` working days (Mon-Fri) to `date`, returning a Date (not a
// formatted string — callers that want en-GB display text format the
// return value themselves, same as dates.js's addCalendarMonth already
// does). Returns null for an unparseable input date, matching every
// other function in this module.
export function addWorkingDays(date, days) {
  const d = parseFlexDate(date);
  if (!d) return null;
  const result = new Date(d);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}
