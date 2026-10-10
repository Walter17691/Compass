import { COLOR, TYPE } from '../../styles/tokens';
import { describeReportState } from '../../lib/investigationReportWorkspace';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-0 — THE INVESTIGATION REPORT WORKSPACE, READ ONLY.
//
// What the investigator has, gathered in one calm place, before anything can
// be written. Every future action — draft, save a version, adopt, submit to
// HR — is shown as a disabled step so the shape of the work is legible, and
// none of them does anything in this slice.
//
// THE DESIGN RULE HERE IS RESTRAINT. White surfaces, the ink scale for text,
// one violet accent used only to mark the adopted document and the current
// lifecycle position. No cream, no new accent colours, no category colours,
// Archivo throughout via TYPE. Amber and red appear only where the existing
// system already uses them — an unresolved question, a disputed note — and
// never decoratively.
//
// EMPTY IS A RESULT, NOT A GAP. Each section renders its own absence in
// words. A case with no matters, no interviews and no named subject is a
// legitimate investigation, and this view says so plainly instead of looking
// broken or implying something is missing that should be there.
// ─────────────────────────────────────────────────────────────────────────

const card = {
  background: COLOR.surface, border: `1px solid ${COLOR.border}`,
  borderRadius: 10, padding: "14px 16px", marginBottom: 12,
};
const heading = { ...TYPE.sectionHeading, color: COLOR.ink, margin: "0 0 8px" };
const quiet = { ...TYPE.body, color: COLOR.inkQuiet, margin: 0, lineHeight: 1.6 };
const metaRow = { ...TYPE.metadata, color: COLOR.inkFaint };

function Empty({ children }) {
  return <p style={quiet}>{children}</p>;
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: COLOR.neutralChipBg, fg: COLOR.neutralChipText },
    violet:  { bg: COLOR.purpleTint,    fg: COLOR.purple },
    amber:   { bg: COLOR.amberTint,     fg: COLOR.amber },
    red:     { bg: COLOR.redTint,       fg: COLOR.red },
    green:   { bg: COLOR.greenTint,     fg: COLOR.green },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ ...TYPE.pill, background: t.bg, color: t.fg, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** The lifecycle, shown so the work is legible. Every step is inert in B3.2-0. */
function Lifecycle({ steps, activeId }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      {steps.map((s, i) => {
        const isActive = s.id === activeId;
        return (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              aria-disabled="true"
              style={{
                ...TYPE.micro,
                color: isActive ? COLOR.purple : COLOR.inkQuiet,
                background: isActive ? COLOR.purpleTint : COLOR.rail,
                border: `1px solid ${isActive ? COLOR.purpleTint : COLOR.border}`,
                borderRadius: 999, padding: "4px 10px",
              }}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span style={{ color: COLOR.inkQuiet, fontSize: 11 }}>→</span>}
          </span>
        );
      })}
    </div>
  );
}

/**
 * `showHistory` is false when the B3.2-1 editor is rendered above this panel
 * and carries its own "Saved versions" list with author and timestamp on each
 * row. Suppressing it here rather than deleting it keeps this panel complete
 * on its own for every viewer who gets no editor.
 */
export function InvestigationReportTab({ model, fmtDate = (d) => d || "", showHistory = true }) {
  if (!model) {
    return (
      <div style={card}>
        <h3 style={heading}>Investigation report</h3>
        <Empty>No investigation report information is available for this case.</Empty>
      </div>
    );
  }

  const activeStep = model.currentAdopted ? "adopt" : (!model.versionsAbsent ? "save_version" : "draft");

  return (
    <div>
      {/* ── Where this case stands ───────────────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Investigation report</h3>
        <p style={{ ...TYPE.body, color: COLOR.inkSoft, margin: 0, lineHeight: 1.6 }}>
          {describeReportState(model)}
        </p>
        <Lifecycle steps={model.lifecycle} activeId={activeStep} />
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "10px 0 0", lineHeight: 1.6 }}>
          This is a read-only view. Writing, adopting and submitting a report are not yet available here —
          the existing &ldquo;Conclude investigation&rdquo; route is unchanged and remains the way to produce a report.
        </p>
      </div>

      {/* ── Subject ──────────────────────────────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Subject of the investigation</h3>
        {model.subjectAbsent
          ? <Empty>
              No employee is named on this case. An investigation can properly concern an incident, an event or a
              process rather than a named person, so this is recorded as it stands and nothing is assumed.
            </Empty>
          : <p style={{ ...TYPE.rowName, color: COLOR.ink, margin: 0 }}>{model.subject}</p>}
      </div>

      {/* ── Matters and the human's position on each ─────────────────── */}
      <div style={card}>
        <h3 style={heading}>Matters under investigation</h3>
        {model.mattersAbsent ? (
          <Empty>
            No matters have been recorded on this case yet. A report needs at least one matter, and each matter needs
            a position recorded by the investigator — Compass does not decide that.
          </Empty>
        ) : (
          <>
            <p style={{ ...metaRow, margin: "0 0 10px" }}>
              {model.positionsRecorded} of {model.matters.length} {model.matters.length === 1 ? "matter has" : "matters have"} a recorded position
              {model.positionsOutstanding > 0 && ` · ${model.positionsOutstanding} outstanding`}
            </p>
            {model.matters.map(m => (
              <div key={m.id} style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ ...TYPE.rowName, color: COLOR.ink }}>{m.title}</span>
                  {m.positionLabel
                    ? <Pill tone="violet">{m.positionLabel}</Pill>
                    : <Pill tone="amber">No position recorded</Pill>}
                </div>
                {m.description && <p style={{ ...TYPE.body, color: COLOR.inkSoft, margin: "6px 0 0" }}>{m.description}</p>}
                {m.positionMeaning && (
                  <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "6px 0 0", lineHeight: 1.6 }}>
                    {m.positionMeaning}
                  </p>
                )}
                {m.reasoning && (
                  <p style={{ ...TYPE.body, color: COLOR.inkSoft, margin: "6px 0 0" }}>
                    <span style={{ ...TYPE.micro, color: COLOR.inkQuiet }}>INVESTIGATOR&rsquo;S REASONING</span><br />
                    {m.reasoning}
                  </p>
                )}
                {m.outstandingUncertainty && (
                  <p style={{ ...TYPE.body, color: COLOR.inkSoft, margin: "6px 0 0" }}>
                    <span style={{ ...TYPE.micro, color: COLOR.inkQuiet }}>OUTSTANDING UNCERTAINTY</span><br />
                    {m.outstandingUncertainty}
                  </p>
                )}
                {m.evidence.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {m.evidence.map(ev => (
                      <Pill key={ev.id} tone={ev.stance === "supports" ? "green" : ev.stance === "contradicts" ? "red" : "neutral"}>
                        {ev.name}{ev.stance ? ` · ${ev.stance}` : " · stance not recorded"}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Interviews and their signature provenance ────────────────── */}
      <div style={card}>
        <h3 style={heading}>Investigation meetings</h3>
        {model.meetingsAbsent ? (
          <Empty>
            No investigation meetings are recorded on this case. An investigation can be completed through document
            review without an interview, so this is not treated as a gap.
          </Empty>
        ) : (
          model.investigationMeetings.map(m => (
            <div key={m.id} style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 8, marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ ...TYPE.rowContext, color: COLOR.ink }}>{m.type || "Investigation meeting"}</span>
              <span style={metaRow}>{fmtDate(m.date)}</span>
              {m.hasRecord ? <Pill tone="neutral">Record on file</Pill> : <Pill tone="amber">No record saved</Pill>}
              {m.signatureRequested
                ? <Pill tone={m.signatureStatus === "signed" ? "green" : "neutral"}>
                    {m.signatureStatus ? `Signature: ${m.signatureStatus}` : "Signature requested"}
                  </Pill>
                : <Pill tone="neutral">No signature requested</Pill>}
              {m.disputed && <Pill tone="red">Notes disputed</Pill>}
            </div>
          ))
        )}
      </div>

      {/* ── Disputes, raised separately because they change what a report may say ── */}
      {model.disputes.length > 0 && (
        <div style={card}>
          <h3 style={heading}>Disputed meeting notes</h3>
          {model.disputes.map(d => (
            <div key={d.id} style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 8, marginTop: 8 }}>
              <span style={{ ...TYPE.rowContext, color: COLOR.ink }}>{d.type || "Meeting"} · {fmtDate(d.date)}</span>
              {d.proposedCorrection && (
                <p style={{ ...TYPE.body, color: COLOR.inkSoft, margin: "4px 0 0" }}>
                  <span style={{ ...TYPE.micro, color: COLOR.inkQuiet }}>PROPOSED CORRECTION</span><br />
                  {d.proposedCorrection}
                </p>
              )}
              {d.resolution && <p style={{ ...metaRow, margin: "4px 0 0" }}>Resolution: {d.resolution}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Evidence not attached to a matter ────────────────────────── */}
      {model.unlinkedEvidence.length > 0 && (
        <div style={card}>
          <h3 style={heading}>Evidence not linked to a matter</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {model.unlinkedEvidence.map(ev => (
              <Pill key={ev.id} tone="neutral">{ev.name}{ev.type ? ` · ${ev.type}` : ""}</Pill>
            ))}
          </div>
        </div>
      )}

      {/* ── Unresolved questions ─────────────────────────────────────── */}
      {model.unresolvedQuestions.length > 0 && (
        <div style={card}>
          <h3 style={heading}>Unresolved questions</h3>
          {model.unresolvedQuestions.map(q => (
            <p key={q.id} style={{ ...TYPE.body, color: COLOR.inkSoft, margin: "4px 0 0" }}>{q.title}</p>
          ))}
        </div>
      )}

      {/* ── Report history ───────────────────────────────────────────── */}
      {showHistory && (
      <div style={card}>
        <h3 style={heading}>Report history</h3>
        {model.versionsLoading ? (
          <Empty>Loading the report history for this case&hellip;</Empty>
        ) : model.versionsUnreadable ? (
          <p style={{ ...TYPE.body, color: COLOR.red, margin: 0, lineHeight: 1.6 }}>
            Compass could not read the saved report versions for this case. This is not the same as there being none,
            and nothing below should be relied on as a complete history until it loads.
          </p>
        ) : model.versionsAbsent ? (
          model.legacyOnly ? (
            <Empty>
              This case holds an investigation report created before Compass recorded report versions. It is shown
              with the case documents as a legacy record. There is no version history, adoption record or structured
              set of matters behind it, and Compass has not invented any.
            </Empty>
          ) : (
            <Empty>No report versions have been saved for this case.</Empty>
          )
        ) : (
          model.versions.map(v => (
            <div key={v.id} style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 8, marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ ...TYPE.rowContext, color: COLOR.ink }}>Version {v.versionNo}</span>
              <span style={metaRow}>{fmtDate(v.createdAt)}</span>
              {v.authorKind === "system" && <Pill tone="neutral">System-authored</Pill>}
              {v.isCurrent && v.adoptedAt
                ? <Pill tone="violet">Adopted &middot; current</Pill>
                : v.adoptedAt
                  ? <Pill tone="neutral">Previously adopted{v.supersededAt ? " · replaced" : ""}</Pill>
                  : <Pill tone="neutral">Draft &middot; never adopted</Pill>}
              {v.adoptionBasis === "hr_exception" && <Pill tone="amber">Adopted under HR exception</Pill>}
            </div>
          ))
        )}
      </div>
      )}
    </div>
  );
}
