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

// One history entry, in words a manager reads rather than a type id. The entry
// already carries a human typeLabel from its own domain; this only decides how
// the two halves read together, and never invents a label the domain did not give.
function historyLabel(e) {
  const type = e?.typeLabel || "Record";
  const title = (e?.title || "").trim();
  if (e?.kind === "employment_event") return title ? `${type} — ${title}` : type;
  return title ? `${type} — ${title}` : type;
}

// A pending employment change, described by what it will do. `label` and
// `newValue` are exactly the fields upcomingChanges() produces — a location change
// carries no newValue (it has a location id instead), so it reads as the change
// alone and the destination stays in History rather than being half-guessed here.
function comingUpLabel(c) {
  const type = c?.label || "Employment change";
  const to = (c?.newValue || "").trim();
  return to ? `${type} — ${to}` : type;
}

export function EmployeeFileOverview({ file, onOpenCase, onGoToTab, onReconcile }) {
  const [showDetails, setShowDetails] = useState(false);
  const { openProcesses, currentProcess, hasMultipleOpen, attention, recentActivity,
          employmentDetails, isEmpty, showUnattributedNotice, currentWarnings = [],
          pendingChanges = [] } = file;

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

      {/* ── Current warnings ───────────────────────────────────────────────
          Placed after attention and before recent activity: it is standing
          context about the employee's record, not a task, so it should not
          compete with what the user has to DO — but it must be seen before they
          scroll into history.

          Deliberately NOT an alert. No red, no banner, no icon, no "risk"
          language. A live warning is an ordinary, factual part of an employment
          record, and dressing it as an emergency would both mislead and make the
          page shout. The section simply does not render when there is nothing
          live — no "no warnings", no green reassurance card. */}
      {currentWarnings.length > 0 && (
        <Section title={currentWarnings.length === 1 ? "Current warning" : "Current warnings"}>
          <div style={{ display: "grid", gap: SPACE.sm }}>
            {currentWarnings.map(w => (
              <Panel key={w.caseId}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                              gap: SPACE.lg, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ ...TYPE.rowName, color: COLOR.ink, overflowWrap: "anywhere" }}>{w.type}</div>
                    {/* The RECORDED expiry, never recomputed from the duration. */}
                    <div style={{ ...TYPE.rowContext, color: COLOR.inkFaint, marginTop: 2 }}>
                      {`Issued ${formatWhen(w.issuedAt)} · Expires ${formatWhen(w.expiresAt)}`}
                    </div>
                    <div style={{ ...TYPE.metadata, color: COLOR.inkQuiet, marginTop: 2 }}>{w.processLabel}</div>
                  </div>
                  <button type="button" onClick={() => onOpenCase(w.caseId)}
                    style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: `1px solid ${COLOR.borderStrong}`,
                             borderRadius: RADIUS.button, padding: "7px 12px", color: COLOR.purple,
                             cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
                    View case
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      )}

      {/* ── Coming up — Wave A ───────────────────────────────────────────────
          Only future-dated employment changes, and only real ones: E1.7's
          effective-dated truth, which excludes cancelled events by construction
          and never applies a change early. Nothing renders when there is nothing
          coming.

          Placed after attention and before history because it is neither a task
          nor the past — it is what the manager should not be surprised by. */}
      {pendingChanges.length > 0 && (
        <Section title="Coming up">
          <ul style={{ listStyle: "none", margin: 0, padding: 0,
                       border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
            {pendingChanges.map((c, i) => (
              <li key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                                      gap: SPACE.md, padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface,
                                      borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}`, flexWrap: "wrap" }}>
                <span style={{ ...TYPE.rowContext, color: COLOR.ink, minWidth: 0 }}>{comingUpLabel(c)}</span>
                <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet, flexShrink: 0 }}>
                  {formatWhen(c.effectiveDate)}
                </span>
              </li>
            ))}
          </ul>
          {/* Edit and Cancel live with the change itself, in History, rather than
              being duplicated here — one place to act on it. */}
          <button type="button" onClick={() => onGoToTab("activity")}
            style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0, marginTop: SPACE.sm,
                     color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
            Manage upcoming changes
          </button>
        </Section>
      )}

      {/* ── Recent history — Wave A ──────────────────────────────────────────
          A slice of the SAME authoritative projection the History tab renders.
          This used to be a separately assembled list that knew about cases and
          meetings but not about conversations or employment changes, so the two
          surfaces disagreed about the same person.

          The link used to target "timeline", which has not been a tab id since
          E1.6 — so it set an invalid tab, fell back to Overview, and did nothing
          at all. It now goes to the real tab. */}
      {recentActivity.length > 0 && (
        <Section
          title="Recent history"
          action={
            <button type="button" onClick={() => onGoToTab("activity")}
              style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                       color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
              View full history
            </button>
          }>
          <ul style={{ listStyle: "none", margin: 0, padding: 0,
                       border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
            {recentActivity.map((e, i) => (
              <li key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                                      gap: SPACE.md, padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface,
                                      borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}`, flexWrap: "wrap" }}>
                <span style={{ ...TYPE.rowContext, color: COLOR.ink, minWidth: 0 }}>{historyLabel(e)}</span>
                <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet, flexShrink: 0 }}>{formatWhen(e.occurredAt)}</span>
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
