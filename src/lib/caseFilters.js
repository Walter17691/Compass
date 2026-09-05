// Pure predicate behind the Cases list's filter bar (src/screens/CasesScreen.jsx)
// — extracted so the filtering logic itself is unit-testable without
// mounting the screen. getCaseStage is passed in rather than imported to
// avoid a circular dependency with caseStage.js's own test fixtures.
import { parseFlexDate } from './dateMath.js';

export function matchesCaseFilters(cs, filters, getCaseStage) {
  if (filters.type && cs.caseType !== filters.type) return false;
  if (filters.stage && getCaseStage(cs) !== filters.stage) return false;
  if (filters.status) {
    const closed = getCaseStage(cs) === "closed";
    if (filters.status === "active" && closed) return false;
    if (filters.status === "closed" && !closed) return false;
  }
  if (filters.locationId && cs.locationId !== filters.locationId) return false;
  if (filters.ownerId && cs.ownerId !== filters.ownerId) return false;
  if (filters.priority && (cs.priority || "normal") !== filters.priority) return false;
  // from/to are the pre-existing, user-facing "date received" range —
  // an HR-entered business date (when the complaint/referral came in),
  // deliberately distinct from createdAt below. Unchanged by Phase 3.
  if (filters.from && (!cs.dateReceived || cs.dateReceived < filters.from)) return false;
  if (filters.to && (!cs.dateReceived || cs.dateReceived > filters.to)) return false;
  // Insights Phase 3 (Emerging Patterns drill-down) — createdFrom/createdTo
  // are a SEPARATE, deep-link-only pair bound to cases.createdAt (case
  // creation), never to dateReceived. This distinction is load-bearing:
  // the "+ New meeting" quick-start flow (App.jsx's saveMeetingToCase)
  // creates cases with createdAt set but dateReceived left null, so
  // reusing the dateReceived-based from/to above for a creation-date
  // drill-down would silently exclude exactly the cases the underlying
  // Emerging Patterns trend signal already counted — displayed count and
  // drill-down count would disagree. ISO instant boundaries, half-open
  // (>= from, < to), matching computeOverallVolumeTrend's own window
  // semantics in src/lib/trendDetection.js exactly, so a case missing or
  // unparseable createdAt is excluded rather than assumed in-range.
  if (filters.createdFrom || filters.createdTo) {
    const created = parseFlexDate(cs.createdAt);
    if (!created) return false;
    if (filters.createdFrom && created.getTime() < new Date(filters.createdFrom).getTime()) return false;
    if (filters.createdTo && created.getTime() >= new Date(filters.createdTo).getTime()) return false;
  }
  return true;
}
