// Integrations & Workflow Automation (Phase 5, IP20, §14 cont.) —
// employee data sync with historical accuracy. HRIS-sourced changes
// (manager, site, status, ...) should propagate forward into an
// employee's CURRENT record, but a past meeting must keep showing who
// was actually in post at the time it happened, not whoever's in post
// now. caseInfo.manager already got stamped onto every meeting
// incidentally (App.jsx's saveMeetingToCase) — this formalises that into
// a real, complete point-in-time snapshot rather than just the one
// field, captured once at save time and never touched again afterward.

export function buildEmployeeSnapshot(employeeRecord) {
  if (!employeeRecord) return null;
  return {
    jobTitle: employeeRecord.jobTitle || null,
    site: employeeRecord.location || null,
    department: employeeRecord.department || null,
    manager: employeeRecord.manager || null,
    status: employeeRecord.status || null,
    workingPattern: employeeRecord.workingPattern || null,
    capturedAt: new Date().toISOString(),
  };
}

// Merges normalized HRIS records (lib/hrisAdapter.js's own canonical
// output shape) into the existing employee_records array — updates
// CURRENT metadata only, matched by name (the same convention the
// existing CSV import already uses, App.jsx's handleEmployeeCsvImport).
// Never touches a past meeting's own buildEmployeeSnapshot above — that
// separation is what keeps historical accuracy: this can freely update
// "who Sarah's manager is now" without silently rewriting "who chaired
// Sarah's meeting on 3 March."
export function mergeHrisEmployeesIntoRecords(existingRecords, hrisEmployees) {
  const merged = [...(existingRecords || [])];
  (hrisEmployees || []).forEach(emp => {
    const name = emp?.name?.trim();
    if (!name) return;
    const record = {
      name,
      jobTitle: emp.jobTitle || "",
      startDate: emp.startDate || "",
      location: emp.site || "",
      employeeNumber: emp.employeeNumber || "",
      department: emp.department || "",
      manager: emp.manager || "",
      status: emp.status || "",
      workingPattern: emp.workingPattern || "",
      probationEndDate: emp.probationEndDate || "",
    };
    const idx = merged.findIndex(m => m.name === name);
    if (idx >= 0) merged[idx] = { ...merged[idx], ...record };
    else merged.push(record);
  });
  return merged;
}
