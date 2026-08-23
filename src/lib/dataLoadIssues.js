// Phase 6.5 hardening (accessibility/UX reliability pass) — pure list
// management for App.jsx's dataLoadIssues state, pulled out so the exact
// dedup/removal behaviour behind the "couldn't load X" banner has direct
// unit coverage, rather than only being reachable through App.jsx's own
// (untested, by this codebase's own convention — it's the root
// orchestrator, not something this project unit-tests directly) render
// tree.

// Adds a label once, never duplicating it — a loader can fail on every
// retry attempt within the same batch without spamming the banner text
// with repeats of the same entity.
export function addLoadIssue(list, label) {
  const current = list || [];
  return current.includes(label) ? current : [...current, label];
}

// Removes a label if present, otherwise returns the same reference
// (avoids an unnecessary re-render when a loader that never had an
// issue calls this defensively on every success).
export function removeLoadIssue(list, label) {
  const current = list || [];
  return current.includes(label) ? current.filter(l => l !== label) : current;
}
