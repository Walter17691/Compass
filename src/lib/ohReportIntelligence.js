// Integrations & Workflow Automation (Phase 5, IP23, §19) — reuses the
// documentIngestion.js/analyseEvidenceDocument finding-approval pattern
// (App.jsx), sourced from an uploaded OH report evidence item instead of
// a generic document, extracting the spec's own worked fields:
// recommended adjustments, restrictions, further information needed, and
// a suggested review date. HR must accept each finding before anything
// is created from it — Compass never acts on an OH report's contents
// itself, and never makes or implies the underlying medical judgement.

export const OH_FINDING_TYPES = ["adjustment", "restriction", "further_information", "review_date"];

export const OH_REPORT_SYSTEM_PROMPT = "You are Compass, an Employee Relations copilot analysing an Occupational Health report just uploaded as evidence on an HR case. Read its actual content — you are given the real file, not just its name — and extract findings for HR to review and decide on; never act on them yourself, and never state or imply a medical diagnosis. Only include a finding where the report's actual content clearly supports it — never invent a generic one just to have something to report. Valid finding types: \"adjustment\" (a reasonable adjustment the report recommends — give a short description), \"restriction\" (a limitation or restriction on duties the report identifies — give a short description), \"further_information\" (something the report says is still needed or unclear, or a recommended follow-up action), \"review_date\" (a suggested date or timeframe by which the situation should be reviewed — give an ISO date YYYY-MM-DD if the report gives or implies one). Respond ONLY with valid JSON, no other text: [{\"type\":\"adjustment\",\"description\":\"...\",\"reasoning\":\"...\"}] or [{\"type\":\"restriction\",\"description\":\"...\",\"reasoning\":\"...\"}] or [{\"type\":\"further_information\",\"description\":\"...\",\"reasoning\":\"...\"}] or [{\"type\":\"review_date\",\"date\":\"YYYY-MM-DD\",\"reasoning\":\"...\"}]";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Drops anything with an unrecognized type, and a review_date finding
// with no valid date — an AI-suggested review date with no actual date
// attached isn't actionable, so it's not worth surfacing as a finding.
export function buildOhFindings(parsed) {
  return (Array.isArray(parsed) ? parsed : [])
    .filter(f => OH_FINDING_TYPES.includes(f?.type) && (f.type !== "review_date" || ISO_DATE.test(f.date || "")))
    .map((f, i) => ({ ...f, id: `oh_finding_${Date.now()}_${i}`, status: "open" }));
}

// The three task-shaped finding types map onto createCaseTask (App.jsx)
// exactly like acceptDocumentFinding's witness/action findings already
// do — null for review_date, which writes into ohProcess.reviewDate
// instead (see App.jsx's acceptOhFinding), not a task.
export function ohFindingTaskName(finding) {
  if (finding.type === "adjustment") return `Consider adjustment: ${finding.description}`;
  if (finding.type === "restriction") return `Account for restriction: ${finding.description}`;
  if (finding.type === "further_information") return `Follow up with OH: ${finding.description}`;
  return null;
}
