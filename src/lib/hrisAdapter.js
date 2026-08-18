// Integrations & Workflow Automation (Phase 5, IP19, §14) — HRIS
// adapter interface + reference stub. No specific HRIS platform
// (Workday, BambooHR, ...) is named in the spec, and none has a working
// API this app can actually call yet — per the spec's own instruction
// not to hard-code an integration with no real API behind it, this is
// the modular contract a future real connector would implement, plus one
// reference stub satisfying it with clearly-fake example data. The
// existing CSV import (EmployeeRecordsSection.jsx) remains the
// genuinely working fallback path — nothing here replaces or wires into
// it, and this file is never called from any UI button.
//
// The canonical field set below is deliberately richer than the current
// employee_records table (name/job_title/start_date/location only — see
// baseline_schema_2026-08-06.sql). IP20's employee data sync is where
// that schema actually grows to hold these fields with point-in-time
// accuracy; this phase stops at defining the shape a real sync would
// produce.
export const HRIS_EMPLOYEE_FIELDS = [
  "name", "employeeNumber", "jobTitle", "site", "department", "manager",
  "startDate", "status", "workingPattern", "probationEndDate", "reportsTo",
];

// Every real adapter implements fetchEmployees() returning an array of
// RAW provider-shaped records, and normalize(raw) turning one of those
// into the canonical shape above. Kept as two separate functions (not
// one combined call) so a real adapter's own field-name quirks — Workday
// calling it "worker_id", BambooHR calling it "employeeId" — stay
// isolated inside that one adapter's normalize(), never smeared across
// every caller of fetchNormalizedEmployees().
export function createHrisAdapter({ id, name, fetchEmployees, normalize }) {
  if (!id || !name || typeof fetchEmployees !== "function" || typeof normalize !== "function") {
    throw new Error("createHrisAdapter requires id, name, fetchEmployees(), and normalize()");
  }
  return {
    id,
    name,
    async fetchNormalizedEmployees() {
      const raw = await fetchEmployees();
      return (raw || []).map(normalize);
    },
  };
}

// Reference stub — a working example of the contract above, not a real
// vendor connection. Returns a small, obviously-fake dataset (note the
// "Example"-prefixed values) so nobody mistakes this for live data if
// it's ever called directly, e.g. from a future adapter's own test.
export const exampleStubAdapter = createHrisAdapter({
  id: "example-stub",
  name: "Example HRIS (stub — not a real connection)",
  fetchEmployees: async () => ([
    {
      full_name: "Jordan Example", emp_no: "EX-001", title: "Example Job Title",
      office: "Example Office", dept: "Example Department", reports_to_name: "Alex Example",
      hire_date: "2026-01-01", employment_status: "active", hours_pattern: "full_time",
      probation_end: "2026-04-01",
    },
  ]),
  normalize: (raw) => ({
    name: raw.full_name || "",
    employeeNumber: raw.emp_no || "",
    jobTitle: raw.title || "",
    site: raw.office || "",
    department: raw.dept || "",
    manager: raw.reports_to_name || "",
    startDate: raw.hire_date || "",
    status: raw.employment_status || "",
    workingPattern: raw.hours_pattern || "",
    probationEndDate: raw.probation_end || "",
    reportsTo: raw.reports_to_name || "",
  }),
});
