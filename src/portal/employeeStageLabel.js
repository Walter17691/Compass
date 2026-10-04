// ER Journey Slice 1 — one employee-facing name for a case's stage.
//
// The portal showed two different things: PortalCaseList mapped the stage to a
// friendly label, while PortalCaseDetail printed the raw value, so an employee
// could be told "inv_report". Internal workflow ids are Compass's vocabulary,
// not the employee's.
//
// Kept separate from the HR-side stage ids deliberately: these are the words an
// employee reads about their own case, and they should be able to change without
// touching the process model.
export function employeeStageLabel(stage) {
  const labels = {
    open: "Open",
    intake: "Open",
    investigation: "Investigation",
    inv_report: "Awaiting next step",
    disciplinary: "Disciplinary",
    hearing: "Hearing",
    outcome: "Outcome issued",
    appeal: "Appeal",
    closed: "Closed",
  };
  return labels[stage] || "In progress";
}
