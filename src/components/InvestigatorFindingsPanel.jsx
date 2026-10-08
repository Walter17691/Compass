import { useState } from 'react';
import { COLOR, TYPE, FONT, RADIUS } from '../styles/tokens';
import { EVIDENCE_STANCES, evidenceForAllegation } from '../lib/allegations';
import { conclusionLabel } from '../lib/investigationConclusion';
import { InvestigationConclusionField } from './InvestigationConclusionField';
import { DraftTextarea } from './DraftTextarea';

// ─────────────────────────────────────────────────────────────────────────
// THE ASSIGNED INVESTIGATOR'S OWN FINDINGS WORKSPACE.
//
// ┌─ THE DEFECT THIS CLOSES (IR-REPORT-01a) ────────────────────────────────┐
// │ CaseViewScreen returns InvestigatorChecklistView for the assigned        │
// │ investigator (CaseViewScreen.jsx:805) BEFORE AllegationsPanel renders    │
// │ (:1495), and that view contained none of the investigator's own fields.  │
// │ So the person conducting the investigation could:                        │
// │                                                                         │
// │   * read the issues, read the evidence, interview people, and            │
// │   * press "Submit investigation", generating a formal report             │
// │                                                                         │
// │ while having NOWHERE to record a single finding, uncertainty or          │
// │ conclusion of their own. Step 6 of their checklist is literally          │
// │ "Complete the investigation" and was an empty card. The database granted │
// │ them the authority, canRecordInvestigation granted it, and the only      │
// │ editor in the app sat behind a return statement they never reached.      │
// │                                                                         │
// │ The report that resulted had no investigator content in it at all, which │
// │ is why the AI's own analysis had to fill the document.                   │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NO SECOND STORE. Every field here is the SAME column AllegationsPanel writes
// — investigator_finding, outstanding_uncertainty, witness_evidence, and the
// conclusion via the one existing writer (investigationConclusionWrite). This
// is a second DOOR onto one record, never a second record. The conclusion
// control is the existing InvestigationConclusionField, unmodified, so its
// progressive disclosure, its mandatory reasoning and its copy cannot drift
// from HR's view of the same thing.
//
// MINIMISATION. InvestigatorChecklistView's prop contract is a deliberate
// within-case boundary ("don't widen this beyond what an investigator should
// see"). So this panel takes callbacks, not the cases array, and takes only
// the org members actually named by a conclusion on this case rather than the
// whole org directory.
//
// PROGRESSIVE DISCLOSURE. One line per issue, expanded on click; a single
// issue opens by default because clicking to reveal the only thing on screen
// is friction, not focus. No readiness score, no signal feed, no quality
// checklist — the pre-submission gate already has those and shows them at the
// one moment they are actionable.
// ─────────────────────────────────────────────────────────────────────────

const labelStyle = { ...TYPE.micro, color: COLOR.inkSoft, display: "block", marginBottom: 5 };
const inputStyle = {
  width: "100%", fontSize: 13, border: `1px solid ${COLOR.borderStrong}`, borderRadius: 6,
  padding: "8px 10px", color: COLOR.ink, background: COLOR.surface, outline: "none",
  fontFamily: FONT.sans, boxSizing: "border-box",
};

/** What is still missing on this issue, in the investigator's own terms. */
function issueProgress(issue) {
  const hasAssessment = !!(issue.investigatorFinding || "").trim();
  const hasConclusion = !!issue.investigationConclusion;
  return {
    hasAssessment,
    hasConclusion,
    // Deliberately states the absence rather than scoring it. "Not recorded" is
    // the truthful value and the investigator's next action; a percentage would
    // imply Compass knows how much work the issue needs.
    summary: hasConclusion
      ? `Conclusion: ${conclusionLabel(issue.investigationConclusion)}`
      : hasAssessment ? "Assessment recorded · conclusion not recorded"
                      : "Assessment not recorded",
  };
}

function Chip({ children, tone = "neutral" }) {
  const palette = tone === "done"
    ? { bg: COLOR.greenTint, fg: COLOR.green }
    : { bg: COLOR.neutralChipBg, fg: COLOR.neutralChipText };
  return (
    <span style={{ ...TYPE.micro, color: palette.fg, background: palette.bg,
                   borderRadius: RADIUS.pill, padding: "2px 9px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function ReadOnly({ label, value, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ fontSize: 13, color: value ? COLOR.ink : COLOR.inkQuiet, padding: "8px 10px",
                    background: COLOR.surface, border: `1px solid ${COLOR.borderStrong}`, borderRadius: 6 }}>
        {value || placeholder}
      </div>
    </div>
  );
}

export function InvestigatorFindingsPanel({
  issues = [],
  evidence = [],
  canRecordNarrative = false,
  canRecordConclusion = false,
  onPatchIssue,
  onRecordConclusion,
  onSetEvidenceStance,
  onCreateIssue,
  conclusionAuthors = [],
  fmtDate,
}) {
  const [expandedId, setExpandedId] = useState(issues.length === 1 ? issues[0].id : null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const unlinked = evidence.filter(ev => !ev.allegationId);

  const submitNew = () => {
    const title = newTitle.trim();
    if (!title) return;
    // Title only is enough. An issue is not required to name an employee, and
    // nothing here asks for one: an investigation may begin as an incident or
    // a fact-finding exercise before any individual is identified.
    onCreateIssue?.({ title, description: newDescription.trim() });
    setNewTitle("");
    setNewDescription("");
    setShowNew(false);
  };

  return (
    <div>
      {/* Neutral by default. These rows are "the specific issues under
          investigation" — which is how the product has always described them —
          and calling every one an allegation would assert an accusation the
          record may not contain. */}
      <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginBottom: 10, lineHeight: 1.5 }}>
        Record what you found on each issue. Your assessment and conclusion are yours — Compass does not write them for you.
      </div>

      {issues.length === 0 && (
        <div style={{ ...TYPE.rowContext, color: COLOR.inkQuiet, marginBottom: 10 }}>
          No issues under investigation have been recorded on this case yet.
        </div>
      )}

      {issues.map(issue => {
        const open = expandedId === issue.id;
        const progress = issueProgress(issue);
        const linked = evidenceForAllegation(evidence, issue.id);
        return (
          <div key={issue.id}
            style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface,
                     marginBottom: 10, background: COLOR.surface, overflow: "hidden" }}>
            <button type="button"
              onClick={() => setExpandedId(open ? null : issue.id)}
              aria-expanded={open}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none",
                       padding: "12px 14px", cursor: "pointer", fontFamily: FONT.sans,
                       display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...TYPE.rowName, color: COLOR.ink, display: "block" }}>{issue.title}</span>
                <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet, display: "block", marginTop: 3 }}>
                  {progress.summary}
                </span>
              </span>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {progress.hasConclusion && <Chip tone="done">Concluded</Chip>}
                <span style={{ ...TYPE.metadata, color: COLOR.purple }}>{open ? "Close" : "Open"}</span>
              </span>
            </button>

            {open && (
              <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLOR.borderFaint}` }}>
                {issue.description && (
                  <div style={{ ...TYPE.rowContext, color: COLOR.inkSoft, margin: "12px 0 14px", lineHeight: 1.55 }}>
                    {issue.description}
                  </div>
                )}

                {/* ── EVIDENCE, AND WHAT IT ACTUALLY SHOWS ────────────────────
                    The stance is the investigator's own classification, so it
                    belongs here. Linking no longer presumes "supports" — see
                    linkEvidenceToAllegation, whose own documented default is
                    neutral and is now the only thing deciding it. */}
                <div style={{ ...TYPE.micro, color: COLOR.inkSoft, marginBottom: 8 }}>
                  Linked evidence ({linked.length})
                </div>
                {linked.map(ev => (
                  <div key={ev.id}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                             borderBottom: `1px solid ${COLOR.borderFaint}` }}>
                    <span style={{ fontSize: 12, color: COLOR.ink, flex: 1, minWidth: 0 }}>{ev.name}</span>
                    {canRecordNarrative ? (
                      <select aria-label={`How this evidence relates to the issue: ${ev.name}`}
                        value={ev.stance || "neutral"}
                        onChange={e => onSetEvidenceStance?.(issue.id, ev.id, e.target.value)}
                        style={{ fontSize: 11, border: `1px solid ${COLOR.border}`, borderRadius: 4,
                                 padding: "2px 6px", color: COLOR.inkSoft, fontFamily: FONT.sans }}>
                        {EVIDENCE_STANCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ ...TYPE.micro, color: COLOR.inkQuiet }}>
                        {EVIDENCE_STANCES.find(s => s.id === (ev.stance || "neutral"))?.label}
                      </span>
                    )}
                  </div>
                ))}
                {linked.length === 0 && (
                  <div style={{ ...TYPE.metadata, color: COLOR.inkQuiet, paddingBottom: 4 }}>
                    Nothing linked to this issue yet.
                  </div>
                )}
                {canRecordNarrative && unlinked.length > 0 && (
                  <div style={{ marginTop: 10, marginBottom: 14 }}>
                    <select aria-label="Link evidence to this issue" defaultValue=""
                      onChange={e => {
                        const evId = e.target.value;
                        if (!evId) return;
                        // No stance argument: the classification starts
                        // unasserted and the investigator sets it above.
                        onSetEvidenceStance?.(issue.id, evId, undefined);
                        e.target.value = "";
                      }}
                      style={{ ...inputStyle, fontSize: 12 }}>
                      <option value="" disabled>Link evidence to this issue…</option>
                      {unlinked.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ height: 14 }} />

                {canRecordNarrative ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <label htmlFor={`inv-assessment-${issue.id}`} style={labelStyle}>
                        Your assessment of this issue
                      </label>
                      <DraftTextarea id={`inv-assessment-${issue.id}`} rows={3}
                        style={{ ...inputStyle, resize: "vertical" }}
                        value={issue.investigatorFinding || ""}
                        placeholder="What did your investigation find on this issue, and what is it based on?"
                        onCommit={v => onPatchIssue?.(issue.id, { investigatorFinding: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label htmlFor={`inv-uncertainty-${issue.id}`} style={labelStyle}>
                        What remains uncertain
                      </label>
                      <DraftTextarea id={`inv-uncertainty-${issue.id}`} rows={2}
                        style={{ ...inputStyle, resize: "vertical" }}
                        value={issue.outstandingUncertainty || ""}
                        placeholder="Anything you could not establish, or that is still disputed?"
                        onCommit={v => onPatchIssue?.(issue.id, { outstandingUncertainty: v })} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label htmlFor={`inv-witness-${issue.id}`} style={labelStyle}>
                        Witness evidence summary
                      </label>
                      <DraftTextarea id={`inv-witness-${issue.id}`} rows={2}
                        style={{ ...inputStyle, resize: "vertical" }}
                        value={issue.witnessEvidence || ""}
                        placeholder="What did witnesses say about this issue?"
                        onCommit={v => onPatchIssue?.(issue.id, { witnessEvidence: v })} />
                    </div>
                  </>
                ) : (
                  <>
                    <ReadOnly label="Your assessment of this issue" value={issue.investigatorFinding} placeholder="Not recorded" />
                    <ReadOnly label="What remains uncertain" value={issue.outstandingUncertainty} placeholder="None recorded" />
                    <ReadOnly label="Witness evidence summary" value={issue.witnessEvidence} placeholder="Not recorded" />
                  </>
                )}

                {/* The existing control, unmodified — same progressive
                    disclosure, same mandatory reasoning, same writer, same
                    server-assigned attribution. canRecordConclusion is the
                    NARROWER authority that mirrors the database trigger. */}
                <InvestigationConclusionField
                  allegation={issue}
                  canRecord={canRecordConclusion}
                  onRecord={(conclusion, reasoning) => onRecordConclusion?.(issue.id, conclusion, reasoning)}
                  fmtDate={fmtDate}
                  orgMembers={conclusionAuthors}
                />
              </div>
            )}
          </div>
        );
      })}

      {canRecordNarrative && onCreateIssue && (
        showNew ? (
          <div style={{ border: `1px solid ${COLOR.purple}`, borderRadius: RADIUS.surface,
                        padding: 14, background: COLOR.surface }}>
            <label htmlFor="inv-new-issue-title" style={labelStyle}>Issue under investigation</label>
            <input id="inv-new-issue-title" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="Short description of the incident, concern or issue"
              style={{ ...inputStyle, marginBottom: 10 }} />
            <label htmlFor="inv-new-issue-detail" style={labelStyle}>Detail (optional)</label>
            <textarea id="inv-new-issue-detail" rows={2} value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="What is being looked into, and over what period?"
              style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={submitNew} disabled={!newTitle.trim()}
                style={{ ...TYPE.button, background: newTitle.trim() ? COLOR.purple : COLOR.border,
                         border: "none", borderRadius: 6, padding: "7px 13px", color: COLOR.surface,
                         cursor: newTitle.trim() ? "pointer" : "default", fontFamily: FONT.sans }}>
                Add issue
              </button>
              <button type="button" onClick={() => setShowNew(false)}
                style={{ ...TYPE.button, background: "none", border: `1px solid ${COLOR.border}`,
                         borderRadius: 6, padding: "7px 13px", color: COLOR.inkSoft,
                         cursor: "pointer", fontFamily: FONT.sans }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNew(true)}
            style={{ ...TYPE.button, background: "none", border: `1px solid ${COLOR.purple}`,
                     borderRadius: 6, padding: "7px 13px", color: COLOR.purple,
                     cursor: "pointer", fontFamily: FONT.sans }}>
            Record an issue under investigation
          </button>
        )
      )}
    </div>
  );
}
