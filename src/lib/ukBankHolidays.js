// Phase 7 (Controlled Beta Infrastructure Gate 1) — UK bank-holiday-aware
// working-day calculation.
//
// WHY THIS EXISTS: dateMath.js's addWorkingDays used to skip Saturday/
// Sunday only. Compass surfaces UI statements like "ACAS: 5 working days"
// as a computed, dated fact ("Employee appeal window closes..."). Any
// 5-working-day window spanning a bank holiday was silently wrong — one
// or more days early — which is exactly the shape of bug that could lead
// HR to believe an appeal window had closed when, under real ACAS-guided
// practice, it hadn't yet.
//
// WHICH CALENDAR: the UK has three distinct bank-holiday calendars —
// England & Wales, Scotland, and Northern Ireland — that genuinely
// differ (Scotland: 2 January instead of Boxing Day's neighbour, St
// Andrew's Day, no Easter Monday; Northern Ireland: St Patrick's Day,
// Battle of the Boyne/Orangemen's Day). The ACAS Code of Practice on
// disciplinary and grievance procedures itself covers Great Britain
// (England, Wales, Scotland) — Northern Ireland has its own, separate
// Labour Relations Agency Code — but Compass's own UI copy just says
// "ACAS", not "ACAS (GB only)", so this deliberately still offers an NI
// calendar for the working-day arithmetic itself (an NI-based org still
// has real bank holidays to skip) without this module taking a position
// on which statutory/quasi-statutory code applies — that's a legal
// question for the org, not something to encode here.
//
// SOURCE: the exact published dataset from https://www.gov.uk/bank-holidays.json
// (HM Government's own machine-readable bank holiday list), fetched and
// spot-verified against an independent source (gov.scot's own
// announcement of the 15 June 2026 Scotland World Cup bank holiday —
// confirmed real, not a fabricated entry) before being hardcoded here.
// Covers 2019-2028; gov.uk itself does not publish further ahead than
// this because some holidays (state occasions, one-off civic holidays)
// are only ever announced 1-2 years in advance.
//
// OUT-OF-RANGE YEARS: rather than silently treating every day in an
// un-tabulated year as a working day (which would just reintroduce this
// exact bug for anyone using Compass in 2029+), a deterministic fallback
// computes the predictable fixed-date and Easter-derived holidays
// (Good Friday, Easter Monday where applicable, New Year's Day, early
// May/Spring/Summer bank holidays, Christmas Day, Boxing Day, weekend
// substitution) using a verified Easter-date algorithm. It cannot predict
// one-off holidays no government has announced yet (there is no way it
// could) — this is a documented, honest limitation, not a silent gap.

export const UK_JURISDICTIONS = [
  { id: "england-and-wales", label: "England & Wales" },
  { id: "scotland", label: "Scotland" },
  { id: "northern-ireland", label: "Northern Ireland" },
];

export const DEFAULT_UK_JURISDICTION = "england-and-wales";

export function isValidUkJurisdiction(id) {
  return UK_JURISDICTIONS.some(j => j.id === id);
}

// { "england-and-wales": Set("2026-04-03", ...), ... } — built once below
// from BANK_HOLIDAY_EVENTS, YYYY-MM-DD keys (local calendar date, no
// time-of-day/timezone ambiguity — a bank holiday is a whole day).
const BANK_HOLIDAY_EVENTS = {
  "england-and-wales": [
    "2019-01-01","2019-04-19","2019-04-22","2019-05-06","2019-05-27","2019-08-26","2019-12-25","2019-12-26",
    "2020-01-01","2020-04-10","2020-04-13","2020-05-08","2020-05-25","2020-08-31","2020-12-25","2020-12-28",
    "2021-01-01","2021-04-02","2021-04-05","2021-05-03","2021-05-31","2021-08-30","2021-12-27","2021-12-28",
    "2022-01-03","2022-04-15","2022-04-18","2022-05-02","2022-06-02","2022-06-03","2022-08-29","2022-09-19","2022-12-26","2022-12-27",
    "2023-01-02","2023-04-07","2023-04-10","2023-05-01","2023-05-08","2023-05-29","2023-08-28","2023-12-25","2023-12-26",
    "2024-01-01","2024-03-29","2024-04-01","2024-05-06","2024-05-27","2024-08-26","2024-12-25","2024-12-26",
    "2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26","2025-08-25","2025-12-25","2025-12-26",
    "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28",
    "2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28",
    "2028-01-03","2028-04-14","2028-04-17","2028-05-01","2028-05-29","2028-08-28","2028-12-25","2028-12-26",
  ],
  "scotland": [
    "2019-01-01","2019-01-02","2019-04-19","2019-05-06","2019-05-27","2019-08-05","2019-12-02","2019-12-25","2019-12-26",
    "2020-01-01","2020-01-02","2020-04-10","2020-05-08","2020-05-25","2020-08-03","2020-11-30","2020-12-25","2020-12-28",
    "2021-01-01","2021-01-04","2021-04-02","2021-05-03","2021-05-31","2021-08-02","2021-11-30","2021-12-27","2021-12-28",
    "2022-01-03","2022-01-04","2022-04-15","2022-05-02","2022-06-02","2022-06-03","2022-08-01","2022-09-19","2022-11-30","2022-12-26","2022-12-27",
    "2023-01-02","2023-01-03","2023-04-07","2023-05-01","2023-05-08","2023-05-29","2023-08-07","2023-11-30","2023-12-25","2023-12-26",
    "2024-01-01","2024-01-02","2024-03-29","2024-05-06","2024-05-27","2024-08-05","2024-12-02","2024-12-25","2024-12-26",
    "2025-01-01","2025-01-02","2025-04-18","2025-05-05","2025-05-26","2025-08-04","2025-12-01","2025-12-25","2025-12-26",
    "2026-01-01","2026-01-02","2026-04-03","2026-05-04","2026-05-25","2026-06-15","2026-08-03","2026-11-30","2026-12-25","2026-12-28",
    "2027-01-01","2027-01-04","2027-03-26","2027-05-03","2027-05-31","2027-08-02","2027-11-30","2027-12-27","2027-12-28",
    "2028-01-03","2028-01-04","2028-04-14","2028-05-01","2028-05-29","2028-08-07","2028-11-30","2028-12-25","2028-12-26",
  ],
  "northern-ireland": [
    "2019-01-01","2019-03-18","2019-04-19","2019-04-22","2019-05-06","2019-05-27","2019-07-12","2019-08-26","2019-12-25","2019-12-26",
    "2020-01-01","2020-03-17","2020-04-10","2020-04-13","2020-05-08","2020-05-25","2020-07-13","2020-08-31","2020-12-25","2020-12-28",
    "2021-01-01","2021-03-17","2021-04-02","2021-04-05","2021-05-03","2021-05-31","2021-07-12","2021-08-30","2021-12-27","2021-12-28",
    "2022-01-03","2022-03-17","2022-04-15","2022-04-18","2022-05-02","2022-06-02","2022-06-03","2022-07-12","2022-08-29","2022-09-19","2022-12-26","2022-12-27",
    "2023-01-02","2023-03-17","2023-04-07","2023-04-10","2023-05-01","2023-05-08","2023-05-29","2023-07-12","2023-08-28","2023-12-25","2023-12-26",
    "2024-01-01","2024-03-18","2024-03-29","2024-04-01","2024-05-06","2024-05-27","2024-07-12","2024-08-26","2024-12-25","2024-12-26",
    "2025-01-01","2025-03-17","2025-04-18","2025-04-21","2025-05-05","2025-05-26","2025-07-14","2025-08-25","2025-12-25","2025-12-26",
    "2026-01-01","2026-03-17","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-07-13","2026-08-31","2026-12-25","2026-12-28",
    "2027-01-01","2027-03-17","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-07-12","2027-08-30","2027-12-27","2027-12-28",
    "2028-01-03","2028-03-17","2028-04-14","2028-04-17","2028-05-01","2028-05-29","2028-07-12","2028-08-28","2028-12-25","2028-12-26",
  ],
};

const TABULATED_MIN_YEAR = 2019;
const TABULATED_MAX_YEAR = 2028;

const BANK_HOLIDAY_SETS = Object.fromEntries(
  Object.entries(BANK_HOLIDAY_EVENTS).map(([jurisdiction, dates]) => [jurisdiction, new Set(dates)])
);

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

// Meeus/Jones/Butcher Gregorian algorithm — the standard, widely-verified
// method for computing the date of Easter Sunday for any Gregorian-
// calendar year. Used only for the out-of-table fallback below.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// UK fixed-date bank holidays are substituted to the next working day
// (skipping both weekends AND any other bank holiday already claiming
// that day) when they fall on a Saturday or Sunday — the real rule
// gov.uk's own published list already applies, replicated here only for
// years outside the tabulated range above.
function substituteIfWeekend(date, alreadyClaimed) {
  let d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6 || alreadyClaimed.has(isoDateFromDate(d))) {
    d = addDays(d, 1);
  }
  return d;
}

function isoDateFromDate(d) {
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Deliberately conservative: only the holidays that are genuinely
// predictable a year (or decades) in advance. One-off civic/state
// holidays (a jubilee, a state funeral, a coronation, a one-off
// tournament holiday) cannot be predicted and are not invented here —
// see this file's own header comment.
function computeFallbackHolidays(year, jurisdiction) {
  const dates = new Set();
  const claim = (d) => dates.add(isoDateFromDate(d));

  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);
  claim(goodFriday);
  if (jurisdiction !== "scotland") claim(easterMonday); // Scotland doesn't bank-holiday Easter Monday

  // New Year's Day (+ Scotland's 2 January), substituted off weekends.
  const newYear = substituteIfWeekend(new Date(year, 0, 1), dates);
  claim(newYear);
  if (jurisdiction === "scotland") {
    let jan2 = substituteIfWeekend(new Date(year, 0, 2), dates);
    claim(jan2);
  }

  // Early May bank holiday — first Monday in May.
  let earlyMay = new Date(year, 4, 1);
  while (earlyMay.getDay() !== 1) earlyMay = addDays(earlyMay, 1);
  claim(earlyMay);

  // Spring bank holiday — last Monday in May.
  let springBH = new Date(year, 4, 31);
  while (springBH.getDay() !== 1) springBH = addDays(springBH, -1);
  claim(springBH);

  // Summer bank holiday — last Monday in August (E&W, NI); first Monday
  // in August (Scotland).
  if (jurisdiction === "scotland") {
    let summerBH = new Date(year, 7, 1);
    while (summerBH.getDay() !== 1) summerBH = addDays(summerBH, 1);
    claim(summerBH);
  } else {
    let summerBH = new Date(year, 7, 31);
    while (summerBH.getDay() !== 1) summerBH = addDays(summerBH, -1);
    claim(summerBH);
  }

  if (jurisdiction === "scotland") {
    claim(substituteIfWeekend(new Date(year, 10, 30), dates)); // St Andrew's Day
  }
  if (jurisdiction === "northern-ireland") {
    claim(substituteIfWeekend(new Date(year, 2, 17), dates)); // St Patrick's Day
    claim(substituteIfWeekend(new Date(year, 6, 12), dates)); // Battle of the Boyne
  }

  // Christmas Day / Boxing Day — both substituted off weekends, and off
  // each other if they'd otherwise collide (e.g. Christmas Day substitutes
  // onto what would have been Boxing Day's slot).
  const christmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  const claimedSoFar = new Set(dates);
  const christmasSub = substituteIfWeekend(christmas, claimedSoFar);
  claim(christmasSub);
  const boxingSub = substituteIfWeekend(boxing, new Set([...claimedSoFar, isoDateFromDate(christmasSub)]));
  claim(boxingSub);

  return dates;
}

const fallbackCache = new Map(); // `${jurisdiction}:${year}` -> Set

function fallbackHolidaySet(jurisdiction, year) {
  const key = `${jurisdiction}:${year}`;
  if (!fallbackCache.has(key)) fallbackCache.set(key, computeFallbackHolidays(year, jurisdiction));
  return fallbackCache.get(key);
}

// Returns true if `date` (a real Date) is a UK bank holiday in the given
// jurisdiction. Defaults to England & Wales — the largest UK jurisdiction
// by working population, and the one the ACAS Code of Practice's own
// "working days" guidance is most commonly applied under — but this is a
// documented default, not a hardcoded assumption baked into the
// arithmetic itself; every caller can (and, per an org's own configured
// jurisdiction, should) pass a different one.
export function isUkBankHoliday(date, jurisdiction = DEFAULT_UK_JURISDICTION) {
  if (!date || isNaN(date.getTime())) return false;
  const j = isValidUkJurisdiction(jurisdiction) ? jurisdiction : DEFAULT_UK_JURISDICTION;
  const key = isoDateFromDate(date);
  const year = date.getFullYear();
  if (year >= TABULATED_MIN_YEAR && year <= TABULATED_MAX_YEAR) {
    return BANK_HOLIDAY_SETS[j].has(key);
  }
  return fallbackHolidaySet(j, year).has(key);
}
