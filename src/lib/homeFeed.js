import { getCurrentRisk } from './caseStage';
import { requiresApproval, approvalActionLabel } from './approvals';
import { openReferrals } from './concernReferrals';

// Home Experience Redesign — a case with no activity in this many days
// surfaces as a gentle FOLLOW_UP nudge rather than an explicit deadline
// miss. Same threshold the old "Needs attention" aggregate line used.
export const STALE_DAYS = 14;

// Pure, deterministic "for you" prioritisation — no AI, no new legal
// calculations. Every input here is data Home already receives; this
// function only decides which existing fact becomes which row and in
// what order, so it can be unit-tested without rendering React at all.
//
// Priority tiers (rank, low = higher priority):
//   0 — overdue / urgent statutory items (dueSoon.overdue) + any
//       currently-HIGH-risk case not already surfaced by something else
//   1 — decisions needing the current user: pending approvals
//       (hrReviewRequests + requiresApproval), case next-steps
//       (getNextStep().action), concern referrals awaiting triage
//   3 — upcoming deadlines (dueSoon, not overdue, due in 1-14 days —
//       NOT today; today's items live in the Today rail only, never
//       duplicated into this feed)
//   4 — follow-up: cases with no activity in STALE_DAYS+ days
//
// A case that already produced a tier-0/1 row is never repeated lower
// down (usedCaseIds) — the same underlying case can still show two
// distinct DEADLINE rows in tier 3 if it genuinely has two different
// statutory deadlines outstanding (those are different facts), but never
// the same case twice for the same reason.
export function buildForYouFeed({
  cases = [], getCaseStage, getNextStep, dueSoon = [],
  concernReferrals = [], hrReviewRequests = [], isHR = false,
  now = Date.now(), staleDays = STALE_DAYS,
}) {
  const items = [];
  const usedCaseIds = new Set();
  const openCases = cases.filter(cs => getCaseStage(cs) !== 'closed');
  const caseById = new Map(cases.map(cs => [cs.id, cs]));

  // Tier 0 — overdue / urgent statutory deadlines.
  dueSoon.filter(d => d.overdue).forEach(d => {
    const screen = d.caseId ? null : deadlineCategoryScreen(d.category);
    items.push({
      id: `overdue:${d.key}`,
      type: 'ACTION_NEEDED',
      urgent: true,
      title: humanizeDeadlineTitle(d),
      subject: subjectWithCaseType(d.employeeName, d.caseId ? caseById.get(d.caseId) : null),
      timing: d.daysOverdue === 1 ? 'Overdue by 1 day' : `Overdue by ${d.daysOverdue} days`,
      caseId: d.caseId || null,
      screen,
      cta: ctaFor(d.caseId, screen),
      rank: 0,
    });
    if (d.caseId) usedCaseIds.add(d.caseId);
  });

  // Tier 0 (cont.) — HIGH risk cases not already covered above. Risk is
  // surfaced on whichever row a case already has where possible (via
  // riskByCaseId, applied to tier-1 items below); only a case with
  // genuinely no other row yet gets its own dedicated risk item.
  const highRiskCaseIds = new Set(openCases.filter(cs => getCurrentRisk(cs) === 'HIGH').map(cs => cs.id));

  // Tier 1 — decisions needing the current user.
  hrReviewRequests.filter(r => r.status === 'pending' && requiresApproval(r.step)).forEach(r => {
    const cs = r.case_id ? caseById.get(r.case_id) : null;
    if (cs && usedCaseIds.has(cs.id)) return;
    items.push({
      id: `approval:${r.id}`,
      type: 'APPROVAL',
      urgent: false,
      risk: cs && highRiskCaseIds.has(cs.id) ? 'HIGH' : null,
      title: approvalActionLabel(r.step) + ' awaiting your approval',
      subject: cs ? subjectWithCaseType(cs.employeeName, cs) : 'Unknown case',
      timing: r.requested_at ? relativeTime(r.requested_at, now) : null,
      caseId: r.case_id || null,
      cta: 'Review outcome →',
      rank: 1,
    });
    if (cs) usedCaseIds.add(cs.id);
  });

  openCases.forEach(cs => {
    if (usedCaseIds.has(cs.id)) return;
    const next = getNextStep(cs);
    if (!next?.action) return;
    items.push({
      id: `action:${cs.id}`,
      type: 'ACTION_NEEDED',
      urgent: false,
      risk: highRiskCaseIds.has(cs.id) ? 'HIGH' : null,
      title: next.label,
      subject: subjectWithCaseType(cs.employeeName, cs),
      timing: null,
      caseId: cs.id,
      cta: `${next.label} →`,
      rank: 1,
    });
    usedCaseIds.add(cs.id);
  });

  if (isHR) {
    const referrals = openReferrals(concernReferrals);
    if (referrals.length === 1) {
      items.push({
        id: `referral:${referrals[0].id}`, type: 'ACTION_NEEDED', urgent: false,
        title: 'Concern awaiting triage', subject: referrals[0].employeeName,
        timing: null, caseId: null, screen: 'concerns', cta: 'View concerns →', rank: 1,
      });
    } else if (referrals.length > 1) {
      items.push({
        id: 'referrals', type: 'ACTION_NEEDED', urgent: false,
        title: `${referrals.length} concerns awaiting triage`, subject: null,
        timing: null, caseId: null, screen: 'concerns', cta: 'View concerns →', rank: 1,
      });
    }
  }

  // Any HIGH-risk case that still hasn't produced a row of its own by now
  // (no overdue deadline, no pending approval, no next-step action) still
  // deserves a genuinely urgent slot — a live tribunal-risk case going
  // unmentioned would be a real regression, not just a missed nice-to-have.
  openCases.forEach(cs => {
    if (usedCaseIds.has(cs.id)) return;
    if (!highRiskCaseIds.has(cs.id)) return;
    items.push({
      id: `risk:${cs.id}`, type: 'ACTION_NEEDED', urgent: true, risk: 'HIGH',
      title: 'High risk — needs review', subject: subjectWithCaseType(cs.employeeName, cs),
      timing: null, caseId: cs.id, cta: 'Open case →', rank: 0,
    });
    usedCaseIds.add(cs.id);
  });

  // Tier 3 — upcoming deadlines, strictly 1-14 days out. daysLeft===0
  // (due today) is deliberately excluded here — that's the Today rail's
  // job, and showing it in both places would be the exact duplication
  // this redesign is meant to remove.
  dueSoon.filter(d => !d.overdue && d.daysLeft > 0 && d.daysLeft <= 14).forEach(d => {
    if (d.caseId && usedCaseIds.has(d.caseId)) return;
    const screen = d.caseId ? null : deadlineCategoryScreen(d.category);
    items.push({
      id: `upcoming:${d.key}`,
      type: 'DEADLINE',
      urgent: false,
      title: humanizeDeadlineTitle(d),
      subject: subjectWithCaseType(d.employeeName, d.caseId ? caseById.get(d.caseId) : null),
      timing: d.daysLeft === 1 ? 'Due tomorrow' : `Due in ${d.daysLeft} days`,
      caseId: d.caseId || null,
      screen,
      cta: ctaFor(d.caseId, screen),
      rank: 3,
    });
  });

  // Tier 4 — follow-up: quiet cases.
  openCases.forEach(cs => {
    if (usedCaseIds.has(cs.id)) return;
    const lastUpdated = cs.updatedAt || cs.createdAt;
    if (!lastUpdated) return;
    const quietDays = Math.floor((now - new Date(lastUpdated).getTime()) / (24 * 60 * 60 * 1000));
    if (quietDays < staleDays) return;
    items.push({
      id: `stale:${cs.id}`, type: 'FOLLOW_UP', urgent: false,
      title: 'No recent activity', subject: subjectWithCaseType(cs.employeeName, cs),
      timing: `${quietDays} days quiet`, caseId: cs.id, cta: 'Open case →', rank: 4,
    });
  });

  return items.sort((a, b) => a.rank - b.rank);
}

// Home UX Polish pass, §1 — computeDueSoon's own d.label strings (see
// lib/deadlines.js) are written for a shared audience: the overdue
// indicator popover, Settings, the digest email, this feed. Several
// carry parenthetical statutory citations ("(statutory: 1 calendar
// month)", "(ACAS-recommended: 5 working days)") or are flat field names
// with no urgency framing at all ("Investigation target completion
// date"). Rewriting deadlines.js itself would change that shared
// wording everywhere it's used; this is a display-only rewrite scoped to
// the For You feed, keyed on the exact same category/overdue/day-count
// facts already computed — no date, threshold, or calculation changes.
const DEADLINE_TITLE = {
  dsar: { overdue: () => 'DSAR response overdue', upcoming: () => 'DSAR response due' },
  wellbeing: { overdue: () => 'Wellbeing follow-up overdue', upcoming: () => 'Wellbeing follow-up due' },
  redundancy: { overdue: () => 'Redundancy consultation deadline passed', upcoming: () => 'Redundancy consultation deadline' },
  outcome: { overdue: () => 'Disciplinary outcome letter overdue', upcoming: () => 'Disciplinary outcome letter due' },
  appeal: { overdue: () => 'Appeal window overdue', upcoming: () => 'Appeal window closing soon' },
  investigation: { overdue: () => 'Investigation overrunning', upcoming: () => 'Investigation review due' },
  investigation_target: { overdue: (daysOverdue) => `Investigation target overdue by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`, upcoming: () => 'Investigation target due' },
  grievance: { overdue: () => 'Grievance acknowledgement overdue', upcoming: () => 'Grievance acknowledgement due' },
  signature: { overdue: () => 'Signature pending — consider chasing', upcoming: () => 'Signature pending' },
  fit_note: { overdue: () => 'Fit note review needed', upcoming: () => 'Fit note expiring' },
  probation: { overdue: () => 'Probation review overdue', upcoming: () => 'Probation review due' },
  oh_referral: { overdue: () => 'Occupational health report overdue', upcoming: () => 'Occupational health report due' },
  suspension: { overdue: () => 'Suspension review overdue', upcoming: () => 'Suspension review due' },
};

// Exported so the Today rail (HomeScreen.jsx) can use the exact same
// human wording for a due-today deadline that the feed itself uses for
// the same deadline on any other day — one humaniser, not two.
export function humanizeDeadlineTitle(d) {
  if (d.category === 'task') return d.label.replace(/^Task due: /, '');
  const entry = DEADLINE_TITLE[d.category];
  if (!entry) return d.label; // next_step and any future category keep their own already-human label
  return d.overdue ? entry.overdue(d.daysOverdue) : entry.upcoming(d.daysLeft);
}

// Non-case deadline categories (dsar/wellbeing/redundancy) route to their
// own screen rather than a case — there is no case to open.
function deadlineCategoryScreen(category) {
  if (category === 'dsar') return 'dsar';
  if (category === 'wellbeing') return 'wellbeing';
  if (category === 'redundancy') return 'redundancy';
  return null;
}

const SCREEN_CTA = { dsar: 'Open DSAR →', wellbeing: 'Open Wellbeing →', redundancy: 'Open Redundancy →' };

// Deadline rows don't carry a specific verb the way a next-step action
// does — the button always just opens whichever real destination the
// item points to, worded for that destination rather than a generic
// "Open" for everything.
function ctaFor(caseId, screen) {
  if (caseId) return 'Open case →';
  if (screen && SCREEN_CTA[screen]) return SCREEN_CTA[screen];
  return 'Open →';
}

// Home + Sidebar Product Experience pass, Part 6 — a subject line reads
// as "Sarah Jones · Disciplinary" when the row has a real case to point
// to, so an item is understandable without opening it. Uses only the
// case's own already-recorded caseType; never invents case information.
function subjectWithCaseType(employeeName, cs) {
  if (!employeeName) return null;
  return cs?.caseType ? `${employeeName} · ${cs.caseType}` : employeeName;
}

// Small presentational-only helper (minutes/hours/days) — deliberately
// separate from dateMath.daysBetween, which works in whole calendar days
// only and can't express "2 hours ago". Not a legal/statutory calculation.
export function relativeTime(dateInput, now = Date.now()) {
  const then = new Date(dateInput).getTime();
  if (isNaN(then)) return null;
  const diffMs = now - then;
  if (diffMs < 0) return null;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
