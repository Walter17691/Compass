import { useMemo } from 'react';
import { SCREENS } from '../constants';
import { COLOR, SPACE, TYPE } from '../styles/tokens';
import { buildEmployeeFile, EMPLOYEE_FILE_TABS, isEmployeeFileTab } from '../lib/employeeFile';
import { EmployeeFileHeader, EmployeeFileTabs } from './employeeFile/EmployeeFileHeader';
import { EmployeeFileOverview } from './employeeFile/EmployeeFileOverview';
import { ProcessesTabPanel, DocumentsTabPanel } from './employeeFile/EmployeeFileTabs';
import { EmployeeActivityPanel } from './employeeFile/EmployeeActivityPanel';
import { EmployeeDetailsEdit } from './employeeFile/EmployeeDetailsEdit';

// ─────────────────────────────────────────────────────────────────────────
// THE EMPLOYEE FILE. Phase E1.
//
// This REPLACES Person View rather than sitting beside it. Two competing
// employee-detail surfaces would immediately diverge, and the old one was built
// on name identity — keeping it would have kept a route into the defect E0.7
// closed.
//
// ┌─ WHAT THIS SCREEN IS ───────────────────────────────────────────────────┐
// │ A composition surface over objects the viewer is ALREADY authorised to   │
// │ see. It is not a permission boundary and must never become one: "I can   │
// │ open John Smith" implies nothing about his wellbeing notes, his          │
// │ confidential case or his DSAR.                                          │
// │                                                                         │
// │ Categories the viewer cannot access are OMITTED, not disabled. A greyed  │
// │ "Wellbeing (no access)" panel discloses that confidential records exist. │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NO "Start meeting" ACTION, deliberately. The product model is
// meeting → employee with an optional case, but E2 has not built it: meeting
// creation cannot yet receive a canonical employee_id, so an Employee File
// button would produce a name-only or wrongly-parented meeting. Creating
// identity debt for the convenience of one button is how the 2,939 name-only
// records happened. It returns with E2.
// ─────────────────────────────────────────────────────────────────────────

export function EmployeeFileScreen({
  employeeId,
  employeeRecords = [],
  cases = [],
  wellbeingNotes = [],
  concernReferrals = [],
  dsarRequests = [],
  dueSoon = [],
  // Allegations carry the appeal outcome; they arrive already RLS-filtered by
  // case, exactly like every other collection here.
  allegations = [],
  isHR = false,
  role = null,
  activeTab = "overview",
  setActiveTab,
  setScreen,
  setActiveCaseId,
  setActiveCaseStage,
  onNewCase,
  onReconcile,
  fmtDate,
  // The per-employee edit flow, carried over from Person View — it was the only
  // one in the product. Opened as a focused mode, never as a form on Overview.
  editing = false, setEditing,
  locations = [],
  editJobTitle, setEditJobTitle, editStartDate, setEditStartDate,
  canAssignLocation = false, onSetEmployeeLocation,
  onSaveEmployee, onDeleteEmployee,
  // Phase E1.6 — activities arrive already RLS-filtered, exactly like every
  // other collection here. This screen composes; it never authorises.
  employeeActivities = [], employeeActivityRecords = [],
  onCreateActivity, onAddActivityRecord, onResolveConcern, activityBusy = false,
}) {
  const file = useMemo(
    () => buildEmployeeFile(employeeId, { employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests, dueSoon, allegations, employeeActivities, employeeActivityRecords }, { isHR, role }),
    [employeeId, employeeRecords, cases, wellbeingNotes, concernReferrals, dsarRequests, dueSoon, allegations, employeeActivities, employeeActivityRecords, isHR, role]
  );

  const tab = isEmployeeFileTab(activeTab) ? activeTab : "overview";

  const openCase = caseId => {
    if (!caseId) return;
    setActiveCaseId(caseId);
    setActiveCaseStage?.("investigation");
    setScreen(SCREENS.CASE_VIEW);
  };

  // A uuid that resolves to nobody is a real state — a stale deep link, or a
  // roster row deleted since the URL was shared. It gets a plain explanation
  // rather than a blank screen or a crash.
  if (!file.employee) {
    return (
      <div style={{ minHeight: "100vh", background: COLOR.paper }}>
        <EmployeeFileHeader employee={null} onBack={() => setScreen(SCREENS.PEOPLE)} />
        <div style={{ maxWidth: 960, margin: "0 auto", padding: `${SPACE.xl}px ${SPACE.xl}px` }}>
          <p style={{ ...TYPE.rowContext, color: COLOR.inkFaint, margin: 0 }}>
            This employee record is no longer available. It may have been removed, or the link may be out of date.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLOR.paper }}>
      <EmployeeFileHeader
        employee={file.employee}
        onBack={() => setScreen(SCREENS.PEOPLE)}
        // One primary action. "New case" is safe: cases carry a canonical
        // employee_id, so the employee is preselected and the user is taken
        // through the EXISTING case-creation flow — this screen never creates a
        // case itself, and never bypasses its required fields.
        primaryAction={file.viewer.canCreateCase && onNewCase
          ? { label: "New case", onClick: () => onNewCase(file.employee.id) }
          : null}
        secondaryActions={file.viewer.canEditEmployee && setEditing && !editing
          ? [{ label: "Edit details", onClick: () => {
                setEditJobTitle?.(file.employee.jobTitle || "");
                setEditStartDate?.(file.employee.startDate || "");
                setEditing(true);
              } }]
          : []}
      />

      {!editing && <EmployeeFileTabs tabs={EMPLOYEE_FILE_TABS} active={tab} onSelect={setActiveTab} />}

      {editing ? (
        <main style={{ maxWidth: 960, margin: "0 auto", padding: `${SPACE.xl}px ${SPACE.xl}px ${SPACE.xxxl}px` }}>
          <EmployeeDetailsEdit
            employee={file.employee}
            locations={locations}
            jobTitle={editJobTitle} setJobTitle={setEditJobTitle}
            startDate={editStartDate} setStartDate={setEditStartDate}
            canAssignLocation={canAssignLocation}
            onSetLocation={(locationId) => onSetEmployeeLocation?.(file.employee.id, locationId)}
            onSave={() => onSaveEmployee?.(file.employee)}
            onDelete={() => onDeleteEmployee?.(file.employee)}
            onCancel={() => setEditing(false)}
          />
        </main>
      ) : (
      <main id={`emp-panel-${tab}`} role="tabpanel" aria-labelledby={`emp-tab-${tab}`} tabIndex={-1}
        style={{ maxWidth: 960, margin: "0 auto", padding: `${SPACE.xl}px ${SPACE.xl}px ${SPACE.xxxl}px` }}>
        {tab === "overview" && (
          <EmployeeFileOverview file={file} onOpenCase={openCase} onGoToTab={setActiveTab} onReconcile={onReconcile} />
        )}
        {/* Phase E1.6 — Activity replaces the separate Timeline and Meetings tabs.
            Both were chronological views of the same history; this is that history
            in one place, with employee activities alongside the process milestones
            and case meetings that were already safely available. */}
        {tab === "activity" && (
          <EmployeeActivityPanel
            file={file}
            onCreateActivity={onCreateActivity}
            onAddRecord={onAddActivityRecord}
            onResolveConcern={onResolveConcern}
            onOpenCase={openCase}
            fmtDate={fmtDate}
            busy={activityBusy}
          />
        )}
        {tab === "processes" && <ProcessesTabPanel file={file} onOpenCase={openCase} fmtDate={fmtDate} />}
        {tab === "documents" && <DocumentsTabPanel file={file} onOpenCase={openCase} />}
      </main>
      )}
    </div>
  );
}
