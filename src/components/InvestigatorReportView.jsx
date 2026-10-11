import { COLOR, TYPE, FONT } from '../styles/tokens';
import { InvestigationReportWorkspacePanel } from './caseTabs/InvestigationReportWorkspacePanel';

// ─────────────────────────────────────────────────────────────────────────
// B3.2 — THE ASSIGNED INVESTIGATOR'S INVESTIGATION REPORT.
//
// Live UAT found that the investigator — the person the report workspace was
// built for — could not reach it at all. CaseViewScreen returns
// InvestigatorChecklistView from an early return at line ~1201, before the
// case workspace's destination map exists, so neither the "Investigation
// report" chip nor ?tab=inv_report could resolve for them. The editor was
// reachable only by HR, who would have had to save under an HR exception.
//
// This is the investigator's second view, NOT a tabbed workspace. The
// checklist remains their main guided experience and is untouched; this is
// one destination they step into and back out of. It deliberately reuses the
// checklist's own frame — same rail background, same 640px column, same
// "← Cases" control in the same place — so moving between the two reads as
// one experience rather than as arriving in HR's product.
//
// WHAT THIS VIEW DOES NOT DO. It does not explain why saving is unavailable.
// That sentence belongs to the editor, which owns the draft state and can
// distinguish "not activated" from "no authority" from "history unreadable";
// a second copy here would be a second thing to keep true. It introduces no
// adoption and no HR Review submission control: the intended lifecycle is
// save draft → adopt → submit the adopted version → independent HR decision,
// and nothing in this release may short-circuit it.
// ─────────────────────────────────────────────────────────────────────────

export function InvestigatorReportView({
  cs,
  onBackToChecklist,
  setScreen,
  screens,
  reportPanelProps,
}) {
  const linkButton = {
    background: 'none', border: 'none', color: COLOR.inkSoft, ...TYPE.rowContext,
    cursor: 'pointer', fontFamily: FONT.sans, padding: 0,
  };

  return (
    <div style={{ minHeight: '100vh', background: COLOR.rail, fontFamily: FONT.sans }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setScreen(screens.CASES)} style={linkButton}>← Cases</button>
        </div>

        {/* Case identity, in the checklist's own treatment and order — same
            micro name line, same h2 — so stepping between the two reads as
            one screen changing, not as arriving somewhere else. An
            investigator can hold more than one case, and the report is where
            writing about the wrong person would be hardest to notice. */}
        {/* "Your investigation report", not "Investigation report". The
            read-only case record further down the page is an
            InvestigationReportTab, whose own card heading is already
            "Investigation report" — and that heading is HR's too, so it is
            not ours to rename. Two identical headings on one screen is a
            poor landmark list and an ambiguous thing to say out loud, so the
            PAGE title is the one that moves. "Your" is the voice the
            checklist already uses next door ("Record your findings and
            conclusion") and is accurate: this is the report the
            investigator authors, as distinct from the record beneath it. */}
        <div style={{ ...TYPE.micro, color: COLOR.inkQuiet }}>{cs?.employeeName}</div>
        <h2 style={{ ...TYPE.pageTitle, fontSize: 24, color: COLOR.ink, margin: '2px 0 6px' }}>Your investigation report</h2>
        <p style={{ ...TYPE.rowContext, color: COLOR.inkSoft, margin: '0 0 8px' }}>
          Write up what you found. Your findings and conclusion stay on the checklist — this is the report itself.
        </p>

        <button type="button" onClick={onBackToChecklist} style={{ ...linkButton, margin: '0 0 24px' }}>
          ← Back to the investigation checklist
        </button>

        <InvestigationReportWorkspacePanel {...reportPanelProps} />
      </div>
    </div>
  );
}
