import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../../styles/tokens';
import { Section } from './EmployeeFileOverview';

// ─────────────────────────────────────────────────────────────────────────
// The four non-Overview tabs. Phase E1.
//
// Two are functional (Cases & processes, Documents-through-cases) and two are
// deliberate shells (Timeline, Meetings). The shells say what they will hold and
// why they are not holding it yet — a tab that quietly shows a partial list is
// worse than one that admits its scope, because the user cannot tell the
// difference between "nothing happened" and "Compass cannot see it".
// ─────────────────────────────────────────────────────────────────────────

function Shell({ title, body, note }) {
  return (
    <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card,
                  padding: `${SPACE.xl}px ${SPACE.lg}px`, maxWidth: 620 }}>
      <div style={{ ...TYPE.rowName, color: COLOR.ink }}>{title}</div>
      <p style={{ ...TYPE.rowContext, color: COLOR.inkFaint, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>{body}</p>
      {note && <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `${SPACE.md}px 0 0`, lineHeight: 1.6 }}>{note}</p>}
    </div>
  );
}

function CaseRow({ process, onOpenCase, fmtDate }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.lg,
                  padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <div style={{ ...TYPE.rowName, color: COLOR.ink }}>{process.label}</div>
        <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginTop: 2 }}>
          {[process.position,
            process.openedAt ? `Opened ${fmtDate ? fmtDate(process.openedAt) : String(process.openedAt).slice(0, 10)}` : null,
            process.owner ? `Owner ${process.owner}` : null,
          ].filter(Boolean).join(" · ")}
        </div>
        {process.open && process.next?.label && (
          <div style={{ ...TYPE.metadata, color: COLOR.inkSoft, marginTop: SPACE.xs }}>Next: {process.next.label}</div>
        )}
      </div>
      <button type="button" onClick={() => onOpenCase(process.caseId)}
        style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: `1px solid ${COLOR.borderStrong}`,
                 borderRadius: RADIUS.button, padding: "6px 12px", color: COLOR.purple,
                 cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
        Open case
      </button>
    </div>
  );
}

function CaseList({ processes, onOpenCase, fmtDate }) {
  return (
    <div style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
      {processes.map((p, i) => (
        <div key={p.caseId} style={{ borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}` }}>
          <CaseRow process={p} onOpenCase={onOpenCase} fmtDate={fmtDate} />
        </div>
      ))}
    </div>
  );
}

// ── Cases & processes — fully functional, because cases carry employee_id ───
//
// Each case stays its own process. They are grouped only by whether they are
// still running, which is the one distinction a reader actually needs.
export function ProcessesTabPanel({ file, onOpenCase, fmtDate }) {
  const { openProcesses, closedProcesses } = file;
  if (!openProcesses.length && !closedProcesses.length) {
    return <Shell title="No cases yet" body="No HR process has been recorded against this employee." />;
  }
  return (
    <div>
      {openProcesses.length > 0 && (
        <Section title={openProcesses.length === 1 ? "Open" : `Open · ${openProcesses.length}`}>
          <CaseList processes={openProcesses} onOpenCase={onOpenCase} fmtDate={fmtDate} />
        </Section>
      )}
      {closedProcesses.length > 0 && (
        <Section title={closedProcesses.length === 1 ? "Closed" : `Closed · ${closedProcesses.length}`}>
          <CaseList processes={closedProcesses} onOpenCase={onOpenCase} fmtDate={fmtDate} />
        </Section>
      )}
    </div>
  );
}

// ── Meetings — case meetings only, scoped honestly ──────────────────────────
//
// Meeting identity belongs to E2: public.meetings has no employee reference, so
// a meeting held outside a case cannot be attributed to this person, and
// matching one by the name written on it is the inference this whole programme
// removed. What CAN be shown safely is meetings reached through a case whose
// employee_id is canonical — authoritative parentage, not a guess — and the tab
// says that is what it is showing.
export function MeetingsTabPanel({ file, onOpenCase, fmtDate }) {
  const meetings = [];
  file.context.cases.forEach(cs => {
    (cs.meetings || []).forEach(m => {
      if (!m || !m.id) return;
      meetings.push({ ...m, caseId: cs.id, caseLabel: file.processes.find(p => p.caseId === cs.id)?.label || "Case" });
    });
  });
  meetings.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return (
    <div>
      {meetings.length > 0 ? (
        <Section title={`Case meetings · ${meetings.length}`}>
          <div style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
            {meetings.map((m, i) => (
              <div key={`${m.caseId}:${m.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SPACE.md,
                         padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface, flexWrap: "wrap",
                         borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...TYPE.rowContext, color: COLOR.ink }}>{m.type || "Meeting"}</div>
                  <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginTop: 2 }}>{m.caseLabel}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0 }}>
                  <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet }}>
                    {m.date ? (fmtDate ? fmtDate(m.date) : m.date) : ""}
                  </span>
                  <button type="button" onClick={() => onOpenCase(m.caseId)}
                    style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                             color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
                    Open case
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <Shell
          title="No case meetings recorded"
          body="Meetings held as part of one of this employee's cases will appear here."
        />
      )}
      {/* Stated regardless of whether the list is empty, so the tab is never
          mistaken for a complete meeting history. */}
      <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, marginTop: SPACE.lg, lineHeight: 1.6, maxWidth: 620 }}>
        This shows meetings held as part of a case. Meetings held outside a case are not shown yet —
        Compass cannot yet confirm which employee record they belong to, and will not attribute one by name.
      </p>
    </div>
  );
}

// ── Timeline — a deliberate shell ───────────────────────────────────────────
//
// E5 owns the employment timeline. Overview already carries a bounded recent-
// activity preview from canonical relationships; duplicating it here at greater
// length would imply completeness this cannot have while meetings, documents and
// legacy history are all outstanding.
export function TimelineTabPanel({ file, onGoToTab }) {
  const count = file.recentActivity.length;
  return (
    <div>
      <Shell
        title="Employment timeline"
        body="This will bring together everything recorded about this employee's employment — cases, meetings, documents and outcomes — in one chronological view."
        note="Not built yet. A short preview of recent canonical activity is on the Overview tab."
      />
      {count > 0 && (
        <button type="button" onClick={() => onGoToTab("overview")}
          style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: "none", padding: `${SPACE.md}px 0 0`,
                   color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
          See recent activity on Overview
        </button>
      )}
    </div>
  );
}

// ── Documents — reached through cases, not stored here ──────────────────────
//
// Read-only pointers to evidence and letters that already live on this
// employee's canonical cases. Nothing is copied, moved, re-categorised or
// stored: E3 owns employee documents, and creating a second home for them now
// would be exactly the duplicate source of truth this programme keeps refusing.
export function DocumentsTabPanel({ file, onOpenCase }) {
  const groups = file.context.cases.map(cs => {
    const label = file.processes.find(p => p.caseId === cs.id)?.label || "Case";
    const items = [];
    (cs.evidence || []).forEach(ev => {
      if (ev && (ev.name || ev.type)) items.push({ id: `ev:${cs.id}:${ev.id || ev.name}`, name: ev.name || ev.type, kind: ev.type || "Evidence" });
    });
    (cs.meetings || []).forEach(m => {
      if (m?.letterOutput) items.push({ id: `letter:${cs.id}:${m.id}`, name: `${m.type || "Meeting"} letter`, kind: "Letter" });
    });
    return { caseId: cs.id, label, items };
  }).filter(g => g.items.length > 0);

  if (!groups.length) {
    return (
      <div>
        <Shell
          title="No documents on this employee's cases"
          body="Evidence and letters saved to one of this employee's cases will be listed here."
          note="Employee-level documents are not part of Compass yet — documents currently belong to the case they were produced in."
        />
      </div>
    );
  }

  return (
    <div>
      {groups.map(g => (
        <Section
          key={g.caseId}
          title={g.label}
          action={
            <button type="button" onClick={() => onOpenCase(g.caseId)}
              style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                       color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
              Open case
            </button>
          }>
          <ul style={{ listStyle: "none", margin: 0, padding: 0,
                       border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
            {g.items.map((it, i) => (
              <li key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                                       gap: SPACE.md, padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface,
                                       borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}`, flexWrap: "wrap" }}>
                <span style={{ ...TYPE.rowContext, color: COLOR.ink, minWidth: 0, overflowWrap: "anywhere" }}>{it.name}</span>
                <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet, flexShrink: 0 }}>{it.kind}</span>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, marginTop: SPACE.lg, lineHeight: 1.6, maxWidth: 620 }}>
        These documents belong to the case they were produced in. Open the case to view or download them.
      </p>
    </div>
  );
}
