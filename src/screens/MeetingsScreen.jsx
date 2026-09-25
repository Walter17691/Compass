import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { fetchDiscoverableMeetings, describeGatewayFailure } from '../lib/meetingTableGateway';
import { groupForDiscovery, DISCOVERY_GROUP, DISCOVERY_GROUP_LABEL } from '../lib/meetingDiscovery';
import { COLOR, TYPE, SPACE, RADIUS } from '../styles/tokens';

// Phase 4C.2 — the standalone meeting discovery surface.
//
// Deliberately calm and small. Not a dashboard: no counts presented as metrics,
// no analytics, no per-manager or per-employee comparison, no filters. Four
// headings that answer "what is coming up, what is waiting on me, what did I
// just do" — and nothing that turns a record of difficult conversations into a
// scoreboard.
//
// NO ACTION BUTTONS IN THIS PHASE, on purpose. The write paths (Start, Resume,
// Continue review) arrive in 4C.3+, and there is no standalone record viewer yet
// either. A live-looking button that does nothing was the exact Phase 3A
// "Review meeting record" defect; a greyed button with no explanation was the
// Phase 2.3 scheduling defect. So each row states its status plainly and one
// line at the top says when actions arrive. The read model already computes each
// row's potential action, so turning them on later is wiring, not redesign.

const STATUS_LABEL = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  review_draft: "Record in review",
  completed: "Completed",
  cancelled: "Cancelled",
};

// The one semantic colour, used sparingly: amber for "waiting on you". Nothing
// here is an alarm, so nothing gets a red or a filled background.
const statusTone = status =>
  status === "in_progress" || status === "review_draft" ? COLOR.amber : COLOR.inkSoft;

function MeetingRow({ entry, onAction }) {
  const when = entry.scheduledDate
    ? `${entry.scheduledDate}${entry.scheduledTime ? ` · ${entry.scheduledTime}` : ""}${entry.scheduledMethod ? ` · ${entry.scheduledMethod}` : ""}`
    : null;
  const action = entry.primaryAction;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.md,
                  padding: `${SPACE.md}px 0`, borderBottom: `1px solid ${COLOR.borderFaint}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.rowName, color: COLOR.ink }}>
          {entry.displayType}
          {entry.employeeName ? <span style={{ ...TYPE.rowContext, color: COLOR.inkSoft }}> · {entry.employeeName}</span> : null}
        </div>
        <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginTop: 2 }}>
          {when || (entry.startedAt ? `Started ${entry.startedAt.slice(0, 10)}` : "No date set")}
          {entry.manager ? ` · ${entry.manager}` : ""}
          {/* Provenance is shown because it is genuinely useful to the user —
              whether this conversation forms part of a formal case is a real
              fact about it, not an implementation detail. */}
          {entry.isStandalone ? " · Not linked to a case" : " · Part of a case"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0 }}>
        <div style={{ ...TYPE.metadata, color: statusTone(entry.status), whiteSpace: "nowrap" }}>
          {STATUS_LABEL[entry.status] || entry.status}
        </div>
        {/* One action, only when its destination actually exists. An action whose
            screen has not shipped renders nothing at all rather than a disabled
            control the user has to guess about. */}
        {action.enabled && (
          <button
            onClick={() => onAction?.(entry)}
            style={{ ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, color: COLOR.paper,
                     border: "none", borderRadius: RADIUS.button, padding: "7px 14px", cursor: "pointer",
                     whiteSpace: "nowrap" }}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ label, entries, onAction }) {
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: SPACE.xl }}>
      <div style={{ ...TYPE.sectionHeading, color: COLOR.ink, marginBottom: SPACE.xs }}>{label}</div>
      {entries.map(e => <MeetingRow key={`${e.storageHome}:${e.id}`} entry={e} onAction={onAction} />)}
    </div>
  );
}

export function MeetingsScreen({ orgId, client = supabase, onResume, onContinueReview }) {
  // The loaded result carries the org it was loaded FOR, so "loading" can be
  // derived rather than set. An earlier version reset state synchronously at the
  // top of the effect to clear stale rows on an org switch, which is exactly the
  // cascading-render pattern react-hooks/set-state-in-effect exists to catch —
  // and it would have shown the previous organisation's meetings for one frame
  // after switching. Comparing the result's own orgId to the current one fixes
  // both: no synchronous setState, and no stale frame.
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchDiscoverableMeetings(client, { orgId }).then(loaded => {
      if (!cancelled) setResult({ ...loaded, orgId });
    });
    return () => { cancelled = true; };
  }, [client, orgId]);

  const stale = !result || result.orgId !== orgId;
  const state = stale
    ? { status: "loading", meetings: [], reason: null }
    : result.ok
      ? { status: "ready", meetings: result.meetings, reason: null }
      : { status: "error", meetings: [], reason: result.reason };

  const grouped = groupForDiscovery(state.meetings);
  const total = state.meetings.length;

  // Routed by the entry's own primaryAction, and by its stable id — never by
  // employee name, type or date, and never by position in the list.
  const handleAction = entry => {
    if (entry.primaryAction.action === "resume") onResume?.(entry.id);
    if (entry.primaryAction.action === "continue_review") onContinueReview?.(entry.id);
  };
  // Only shown while something on screen genuinely has no action yet.
  const someRowHasNoAction = state.meetings.length > 0
    && Object.values(grouped).flat().some(e => !e.primaryAction.enabled);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: `${SPACE.xl}px ${SPACE.lg}px` }}>
      <div style={{ ...TYPE.pageTitle, color: COLOR.ink }}>Meetings</div>
      <div style={{ ...TYPE.body, color: COLOR.inkSoft, marginTop: SPACE.xs, marginBottom: SPACE.xl }}>
        Meetings that are not part of a formal case. Meetings held within a case stay on
        that case.
      </div>

      {state.status === "loading" && (
        <div style={{ ...TYPE.body, color: COLOR.inkQuiet }}>Loading…</div>
      )}

      {state.status === "error" && (
        <div style={{ ...TYPE.body, color: COLOR.inkSoft, background: COLOR.rail,
                      border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, padding: SPACE.lg }}>
          {describeGatewayFailure(state.reason)}
        </div>
      )}

      {/* The truthful empty state. It does NOT invite the user to create a
          standalone meeting, because they cannot yet — saying "create one" and
          offering no way to would be the same dishonesty Phase 4B removed from
          the New Meeting screen. */}
      {state.status === "ready" && total === 0 && (
        <div style={{ ...TYPE.body, color: COLOR.inkSoft, background: COLOR.rail,
                      border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, padding: SPACE.lg }}>
          <div style={{ ...TYPE.rowName, color: COLOR.ink, marginBottom: SPACE.xs }}>No standalone meetings yet</div>
          Informal one-to-ones, return-to-work conversations and early fact-finding will
          appear here once they can be held outside a case.
        </div>
      )}

      {state.status === "ready" && total > 0 && (
        <>
          {someRowHasNoAction && (
            <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginBottom: SPACE.lg }}>
              Opening a completed record from here arrives with the next update.
            </div>
          )}
          {/* Order follows the approved information hierarchy: Upcoming, then
              Needs your attention, then Recent. */}
          <Section label={DISCOVERY_GROUP_LABEL[DISCOVERY_GROUP.UPCOMING]} entries={grouped[DISCOVERY_GROUP.UPCOMING]} onAction={handleAction} />
          <Section label={DISCOVERY_GROUP_LABEL[DISCOVERY_GROUP.ATTENTION]} entries={grouped[DISCOVERY_GROUP.ATTENTION]} onAction={handleAction} />
          <Section label={DISCOVERY_GROUP_LABEL[DISCOVERY_GROUP.RECENT]} entries={grouped[DISCOVERY_GROUP.RECENT]} onAction={handleAction} />
          <Section label={DISCOVERY_GROUP_LABEL[DISCOVERY_GROUP.CANCELLED]} entries={grouped[DISCOVERY_GROUP.CANCELLED]} onAction={handleAction} />
        </>
      )}
    </div>
  );
}
