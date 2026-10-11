import { InvestigationReportEditor } from './InvestigationReportEditor';
import { InvestigationReportTab } from './InvestigationReportTab';
import { DRAFT_STATE } from '../../lib/reportDraftSession';

// ─────────────────────────────────────────────────────────────────────────
// B3.2 — ONE INVESTIGATION REPORT WORKSPACE, TWO PLACES IT IS REACHED FROM.
//
// HR arrives through the case workspace's `inv_report` destination; the
// assigned investigator arrives from their checklist, which is a different
// screen entirely (CaseViewScreen returns InvestigatorChecklistView from an
// early return, long before the destination map is built). Both must see the
// SAME report.
//
// That is the whole reason this file exists rather than the composition being
// written out twice. Two copies of "editor, then read-only workspace, with
// history suppressed under these conditions" would drift — and the failure
// mode of drift here is not cosmetic: HR and the investigator would be
// looking at different renderings of the same document while discussing it.
// A props contract they both go through makes that impossible by
// construction, and a test asserts both call sites render this component.
//
// It owns NO state. Every value is passed in, so the draft session stays
// owned by CaseViewScreen where it is keyed by case id, and this panel cannot
// become a second place where "which case is this?" is decided.
//
// The editor leads, because the seven sections ARE the structure the
// investigator works through. The read-only workspace follows as the record
// they are writing about, with its own history suppressed when the editor is
// already showing one with authors.
// ─────────────────────────────────────────────────────────────────────────

export function InvestigationReportWorkspacePanel({
  caseId,
  session,
  versions = [],
  versionsLoading = false,
  versionsUnreadable = false,
  authorNameFor,
  fmtDate,
  busyVersionId = null,
  onCommitLive,
  onSave,
  onReviewLatestBody,
  onConfirmAndSave,
  onContinueFrom,
  onSwitchMode,
  reportWorkspace,
}) {
  return (
    <>
      <InvestigationReportEditor
        // Keyed by case, so the editor's live local text is created fresh per
        // case and can never carry across to another. The key lives HERE, not
        // at the call sites, so neither can forget it.
        key={caseId}
        session={session}
        versions={versions}
        versionsLoading={versionsLoading}
        versionsUnreadable={versionsUnreadable}
        authorNameFor={authorNameFor}
        fmtDate={fmtDate}
        busyVersionId={busyVersionId}
        onCommitLive={onCommitLive}
        onSave={onSave}
        onReviewLatestBody={onReviewLatestBody}
        onConfirmAndSave={onConfirmAndSave}
        onContinueFrom={onContinueFrom}
        onSwitchMode={onSwitchMode}
      />
      <InvestigationReportTab
        model={reportWorkspace}
        fmtDate={fmtDate}
        showHistory={!session || session.state === DRAFT_STATE.READ_ONLY}
      />
    </>
  );
}
