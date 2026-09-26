import { useState } from 'react';
import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// Overview. Phase E1.
//
// The intelligence belongs in the system, not on the screen. Compass already
// knows the process; the user should see what is happening, what needs doing,
// and what they can do about it — not every lifecycle state it took to work
// that out.
//
// Progressive disclosure, top to bottom:
//   what is happening → needs attention → recent activity → employment details
//
// A section that has nothing to say renders NOTHING. No zero-count cards, no
// empty warning panels, no "no data" tiles. A calm screen is one where every
// visible thing is a fact worth reading.
// ─────────────────────────────────────────────────────────────────────────

export function Section({ title, children, action }) {
  return (
    <section style={{ marginBottom: SPACE.xxl }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.md, marginBottom: SPACE.md }}>
        <h2 style={{ ...TYPE.sectionHeading, color: COLOR.ink, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Panel({ children, tone = "plain" }) {
  // Found in visual verification, not by a unit test: an amber TINT used as a
  // border is invisible at 1px, so attention items rendered identically to
  // ordinary content and the section carried no weight at all.
  //
  // A left accent bar reads immediately without shouting. Colour is never the
  // only signal — the section heading already says "Needs your attention" — so
  // this stays legible to a colour-blind reader and in greyscale.
  const attention = tone === "attention";
  return (
    <div style={{
      background: attention ? COLOR.amberTint : COLOR.surface,
      border: `1px solid ${attention ? "#EADFC4" : COLOR.border}`,
      borderLeft: attention ? `3px solid ${COLOR.amber}` : `1px solid ${COLOR.border}`,
      borderRadius: RADIUS.card,
      padding: `${SPACE.lg}px ${SPACE.lg}px`,
    }}>
      {children}
    </div>
  );
}

function ProcessBlock({ process, onOpenCase, compact = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  gap: SPACE.lg, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 260px" }}>
        <div style={{ ...TYPE.rowName, color: COLOR.ink }}>{process.label}</div>
        <div style={{ ...TYPE.rowContext, color: COLOR.inkFaint, marginTop: 2 }}>{process.position}</div>
        {/* The next step is the one piece of workflow the user needs. It comes
            from the same deterministic function the case view uses, so Employee
            File cannot disagree with Case View about what happens next. */}
        {!compact && process.next && (
          <div style={{ marginTop: SPACE.md }}>
            <div style={{ ...TYPE.metadata, color: COLOR.inkQuiet }}>Next</div>
            <div style={{ ...TYPE.rowContext, color: COLOR.ink, marginTop: 2 }}>{process.next.label}</div>
          </div>
        )}
      </div>
      <button type="button" onClick={() => onOpenCase(process.caseId)}
        style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: `1px solid ${COLOR.borderStrong}`,
                 borderRadius: RADIUS.button, padding: "7px 12px", color: COLOR.purple,
                 cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
        Open case
      </button>
    </div>
  );
}

export function EmployeeFileOverview({ file, onOpenCase, onGoToTab, onReconcile }) {
  const [showDetails, setShowDetails] = useState(false);
  const { openProcesses, currentProcess, hasMultipleOpen, attention, recentActivity,
          employmentDetails, isEmpty, showUnattributedNotice } = file;

  // ── The empty file is a first-class state, not a failure ─────────────────
  if (isEmpty) {
    return (
      <div>
        <Panel>
          <div style={{ ...TYPE.rowName, color: COLOR.ink }}>No recorded activity yet.</div>
          <p style={{ ...TYPE.rowContext, color: COLOR.inkFaint, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6, maxWidth: 520 }}>
            This employee does not currently have any cases or other recorded HR activity in Compass.
          </p>
        </Panel>
        {/* Organisation-level migration information — deliberately NOT phrased
            as "this person has older records", because Compass does not know
            that and saying so would be an assertion it has not earned. */}
        {showUnattributedNotice && (
          <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, marginTop: SPACE.lg, lineHeight: 1.6, maxWidth: 560 }}>
            Some older organisation records have not yet been linked to a canonical employee.{" "}
            {onReconcile && (
              <button type="button" onClick={onReconcile}
                style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                         color: COLOR.purple, textDecoration: "underline", cursor: "pointer", fontFamily: FONT.sans }}>
                Review identity reconciliation
              </button>
            )}
          </p>
        )}
        {employmentDetails.length > 0 && (
          <div style={{ marginTop: SPACE.xxl }}>
            <EmploymentDetails details={employmentDetails} open={showDetails} onToggle={() => setShowDetails(v => !v)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ── What is happening ─────────────────────────────────────────────── */}
      {currentProcess && (
        <Section title="What is happening">
          <Panel><ProcessBlock process={currentProcess} onOpenCase={onOpenCase} /></Panel>
        </Section>
      )}

      {/* An employee may legitimately have several separate open processes. They
          are counted and listed, never merged: a disciplinary and a flexible
          working request are two processes, not one bigger case. */}
      {hasMultipleOpen && (
        <Section
          title={`${openProcesses.length} open processes`}
          action={
            <button type="button" onClick={() => onGoToTab("processes")}
              style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                       color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
              View all
            </button>
          }>
          <div style={{ display: "grid", gap: SPACE.sm }}>
            {openProcesses.map(p => (
              <Panel key={p.caseId}><ProcessBlock process={p} onOpenCase={onOpenCase} /></Panel>
            ))}
          </div>
        </Section>
      )}

      {/* ── Needs your attention ──────────────────────────────────────────── */}
      {attention.length > 0 && (
        <Section title="Needs your attention">
          <div style={{ display: "grid", gap: SPACE.sm }}>
            {attention.map(a => (
              <Panel key={a.id} tone="attention">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: SPACE.md, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...TYPE.rowContext, color: COLOR.ink }}>{a.label}</div>
                    {a.context && <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginTop: 2 }}>{a.context}</div>}
                  </div>
                  <button type="button" onClick={() => onOpenCase(a.caseId)}
                    style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: `1px solid ${COLOR.borderStrong}`,
                             borderRadius: RADIUS.button, padding: "6px 12px", color: COLOR.purple,
                             cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
                    Open case
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      )}

      {/* ── Recent activity — a bounded preview, not the E5 timeline ──────── */}
      {recentActivity.length > 0 && (
        <Section
          title="Recent activity"
          action={
            <button type="button" onClick={() => onGoToTab("timeline")}
              style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                       color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
              View timeline
            </button>
          }>
          <ul style={{ listStyle: "none", margin: 0, padding: 0,
                       border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
            {recentActivity.map((e, i) => (
              <li key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                                      gap: SPACE.md, padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface,
                                      borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}`, flexWrap: "wrap" }}>
                <span style={{ ...TYPE.rowContext, color: COLOR.ink, minWidth: 0 }}>{e.label}</span>
                <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet, flexShrink: 0 }}>{formatWhen(e.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {employmentDetails.length > 0 && (
        <EmploymentDetails details={employmentDetails} open={showDetails} onToggle={() => setShowDetails(v => !v)} />
      )}

      {showUnattributedNotice && (
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, marginTop: SPACE.xl, lineHeight: 1.6, maxWidth: 560 }}>
          Some older organisation records have not yet been linked to a canonical employee.{" "}
          {onReconcile && (
            <button type="button" onClick={onReconcile}
              style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                       color: COLOR.purple, textDecoration: "underline", cursor: "pointer", fontFamily: FONT.sans }}>
              Review identity reconciliation
            </button>
          )}
        </p>
      )}
    </div>
  );
}

// Progressively disclosed: the header already carries the identifying metadata,
// so the full list is a detail the user asks for rather than a wall they scroll
// past. Read-only here — editing stays in its existing flow, because an Overview
// that is also a form is neither.
function EmploymentDetails({ details, open, onToggle }) {
  return (
    <section style={{ marginBottom: SPACE.xl }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ ...TYPE.sectionHeading, color: COLOR.ink, background: "none", border: "none", padding: 0,
                 cursor: "pointer", fontFamily: FONT.sans, display: "flex", alignItems: "center", gap: SPACE.sm }}>
        Employment details
        <span aria-hidden="true" style={{ ...TYPE.metadata, color: COLOR.inkQuiet, fontWeight: 500 }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <dl style={{ margin: `${SPACE.md}px 0 0`, display: "grid",
                     gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: `${SPACE.md}px ${SPACE.xl}px` }}>
          {details.map(d => (
            <div key={d.label}>
              <dt style={{ ...TYPE.metadata, color: COLOR.inkQuiet }}>{d.label}</dt>
              <dd style={{ ...TYPE.rowContext, color: COLOR.ink, margin: "2px 0 0", overflowWrap: "anywhere" }}>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function formatWhen(at) {
  if (!at) return "";
  const d = new Date(at);
  if (isNaN(d)) return String(at);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
