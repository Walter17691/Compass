// Pure predicate behind the Cases list's filter bar (src/screens/CasesScreen.jsx)
// — extracted so the filtering logic itself is unit-testable without
// mounting the screen. getCaseStage is passed in rather than imported to
// avoid a circular dependency with caseStage.js's own test fixtures.
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
  if (filters.from && (!cs.dateReceived || cs.dateReceived < filters.from)) return false;
  if (filters.to && (!cs.dateReceived || cs.dateReceived > filters.to)) return false;
  return true;
}
