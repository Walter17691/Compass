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

import { isUkBankHoliday, DEFAULT_UK_JURISDICTION } from './ukBankHolidays.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Phase 6.5 hardening (closes Prompt 11 audit findings 3.10 and 3.11,
// MEDIUM) — two real, reproduced bugs in this parser:
//
// 3.11: the DD/MM/YYYY branch never validated its own numbers before
// building a Date, and JS's Date constructor silently rolls over an
// out-of-range day/month instead of rejecting it — "31/02/2026" (no such
// date) came back as 3 March. It also assumed every slash-separated
// 3-part string was DD/MM/YYYY, so a YYYY/MM/DD-shaped value like
// "2026/03/29" got read as day=2026, producing a nonsense 1934 date.
// Bounds-checked first, then round-tripped: the constructed date's own
// Y/M/D must match what was asked for, or it's rejected outright rather
// than silently guessed at.
//
// 3.10: a bare "YYYY-MM-DD" has no time-of-day meaning — every field
// this parses (a fit note end date, a DSAR due date, a last working
// day...) is a whole calendar date, not an instant. The native Date
// constructor parses a date-only ISO string as UTC midnight though, so
// reading it back via local fields (as deadlines.js's addDeadline does)
// silently rolled the date back a day for any timezone behind UTC.
// Parsed via the same local-field constructor as DD/MM/YYYY instead of
// ever routing a plain calendar date through a UTC instant.
//
// Parses "DD/MM/YYYY" (the UK format most of this app's date text fields
// use), a bare "YYYY-MM-DD", or anything else the Date constructor can
// parse (full ISO datetimes, existing Date objects) — a real instant
// (has a time component) is correctly UTC/offset-interpreted; only the
// no-time-component form gets the local-safe treatment above. Returns
// null — never NaN, never an Invalid Date — on anything unparseable, so
// every caller can guard with a plain `if (!d) return` instead of an
// isNaN check it might forget.
export function parseFlexDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    if (value.includes("/")) {
      const parts = value.split("/");
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts.map(Number);
        if (Number.isInteger(dd) && Number.isInteger(mm) && Number.isInteger(yyyy) && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          const d = new Date(yyyy, mm - 1, dd);
          if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
          return null; // plausible-looking but not a real calendar date (e.g. 31 Feb)
        }
        // Not a plausible DD/MM/YYYY (e.g. a YYYY/MM/DD-shaped value) —
        // fall through to the native parse below instead of guessing.
      }
    }
    const isoMatch = ISO_DATE_ONLY.exec(value);
    if (isoMatch) {
      const [, yyyy, mm, dd] = isoMatch.map(Number);
      const d = new Date(yyyy, mm - 1, dd);
      if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
      return null;
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

// Phase 7 (Controlled Beta Infrastructure Gate 1) — closes a real,
// reproduced bug: this used to skip Saturday/Sunday only, no UK bank
// holidays at all, while callers present the result as a concrete,
// dated fact ("ACAS: 5 working days", "appeal window closes"). Any
// 5-working-day window spanning a bank holiday came out early. Now also
// skips gazetted UK bank holidays for the given jurisdiction (default
// England & Wales — see ukBankHolidays.js's own header comment for why
// that's the default and not a universal assumption).
//
// Adds `days` working days (Mon-Fri, excluding bank holidays) to `date`,
// returning a Date (not a formatted string — callers that want en-GB
// display text format the return value themselves, same as dates.js's
// addCalendarMonth already does). Returns null for an unparseable input
// date, matching every other function in this module.
export function addWorkingDays(date, days, jurisdiction = DEFAULT_UK_JURISDICTION) {
  const d = parseFlexDate(date);
  if (!d) return null;
  const result = new Date(d);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6 && !isUkBankHoliday(result, jurisdiction)) added++;
  }
  return result;
}
