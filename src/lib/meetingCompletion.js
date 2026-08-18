// Integrations & Workflow Automation (Phase 5, IP18, §12) — meeting
// completion automation. M9's own Meeting Quality Check already flags a
// still-pending evidence/witness/action mention as a gap before a
// meeting can end, but "Proceed anyway" was the only way past it —
// meetingEvidenceSuggestions/meetingActionSuggestions are pure session
// state (App.jsx), so anything left "pending" (never individually
// accepted or dismissed) was silently lost the moment the meeting saved
// and that state reset for the next one.
//
// This snapshots whatever's still pending onto the saved meeting record
// itself as unresolvedSuggestions, so it gets one more genuine,
// individual accept/dismiss chance from the Meetings tab — reusing the
// exact same task-creation shape App.jsx's own applyPendingMeetingSuggestions
// already uses for the "accepted during the meeting" case, not a second
// convention.
export function snapshotUnresolvedSuggestions(meetingEvidenceSuggestions, meetingActionSuggestions) {
  const evidence = (meetingEvidenceSuggestions || [])
    .filter(s => s.status === "pending")
    .map(s => ({ kind: s.kind === "witness" ? "witness" : "evidence", description: s.description }));
  const actions = (meetingActionSuggestions || [])
    .filter(s => s.status === "pending")
    .map(s => ({ kind: "action", description: s.description, suggestedOwner: s.suggestedOwner || "", suggestedDueDate: s.suggestedDueDate || "" }));
  return [...evidence, ...actions];
}

// The one place the actual task name/fields get decided for an accepted
// suggestion — shared so App.jsx's acceptSavedMeetingSuggestion and any
// future caller can't drift from applyPendingMeetingSuggestions' own
// wording for the same three kinds.
export function taskFieldsForSuggestion(suggestion) {
  if (suggestion.kind === "witness") return { name: "Interview " + suggestion.description + " as a potential witness" };
  if (suggestion.kind === "evidence") return { name: "Request " + suggestion.description };
  return { name: suggestion.description, owner: suggestion.suggestedOwner || "", dueDate: suggestion.suggestedDueDate || "" };
}
