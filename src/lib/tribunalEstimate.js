// Indicative UK employment tribunal financial exposure estimate — NOT legal
// advice, and not a prediction of what a tribunal would actually award.
// Statutory caps below update every April in line with RPI; these are the
// last figures confirmed and should be checked against
// gov.uk/employment-tribunal-compensation-limits before being relied on.
const STATUTORY_WEEK_PAY_CAP = 700; // basic award week's-pay cap
const COMPENSATORY_AWARD_CAP = 115115; // ordinary unfair dismissal cap

// Discrimination and whistleblowing dismissals are not subject to the
// compensatory award cap (Equality Act 2010 / ERA 1996 s.124(1A)).
const UNCAPPED_CASE_TYPES = ["discrimination", "whistleblow"];

function basicAward({ weeklyPay, ageAtDismissal, yearsService }) {
  if (!weeklyPay || !yearsService) return 0;
  const cappedWeeklyPay = Math.min(weeklyPay, STATUTORY_WEEK_PAY_CAP);
  const cappedYears = Math.min(Math.floor(yearsService), 20);
  // The years counted toward the 20-year cap are the most RECENT years of
  // service (ERA 1996 s.119) — work backward from the dismissal date,
  // applying whichever age-band multiplier applied to the employee during
  // each of those years.
  let total = 0;
  for (let i = 0; i < cappedYears; i++) {
    const ageInThatYear = ageAtDismissal - i;
    const multiplier = ageInThatYear >= 41 ? 1.5 : ageInThatYear >= 22 ? 1 : 0.5;
    total += multiplier * cappedWeeklyPay;
  }
  return Math.round(total);
}

function compensatoryAwardRange({ weeklyPay, caseType }) {
  if (!weeklyPay) return { low: 0, high: 0, uncapped: false };
  const uncapped = UNCAPPED_CASE_TYPES.some(t => (caseType || "").toLowerCase().includes(t));
  const annualPay = weeklyPay * 52;
  // Actual compensatory awards depend heavily on facts a formula can't see
  // (mitigation, time to find new work, injury to feelings for
  // discrimination claims, etc.) — this is a bounding range, not a
  // prediction of the likely figure within it.
  const low = Math.round(annualPay * 0.15);
  const high = uncapped ? Math.round(annualPay * 1.5) : Math.round(Math.min(annualPay, COMPENSATORY_AWARD_CAP));
  return { low, high, uncapped };
}

// weeklyPay: gross £/week. ageAtDismissal: defaults to the statutory
// middle band (22-40, multiplier 1x) when not supplied. yearsService:
// complete years. caseType: free text, checked for discrimination/
// whistleblowing to determine whether the compensatory cap applies.
export function estimateExposure({ weeklyPay, ageAtDismissal, yearsService, caseType }) {
  if (!weeklyPay || weeklyPay <= 0) return null;
  const age = ageAtDismissal || 30; // mid-point of the 22-40 band when unknown
  const basic = basicAward({ weeklyPay, ageAtDismissal: age, yearsService: yearsService || 0 });
  const comp = compensatoryAwardRange({ weeklyPay, caseType });
  return {
    basicAward: basic,
    compensatoryLow: comp.low,
    compensatoryHigh: comp.high,
    compensatoryUncapped: comp.uncapped,
    totalLow: basic + comp.low,
    totalHigh: basic + comp.high,
    ageAssumed: !ageAtDismissal,
  };
}
