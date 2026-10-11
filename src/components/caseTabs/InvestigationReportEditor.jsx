import { useState, useRef, useEffect } from 'react';
import { COLOR, TYPE, BUTTON, RADIUS } from '../../styles/tokens';
import { REPORT_SECTIONS, composeReportBody, sectionHeadingCollisions } from '../../lib/reportDraftComposer';
import {
  DRAFT_STATE, READ_ONLY_REASON, describeDraftState, canConfirmRebase,
  AUTHORING_MODE, canSwitchToStructured, previewStructuredSplit,
} from '../../lib/reportDraftSession';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — THE DRAFT EDITOR.
//
// Seven fields in the order a reader needs them, a save that creates an
// immutable version, and a history that says who wrote each one. Everything
// else exists to keep one promise: THE INVESTIGATOR'S TEXT IS NEVER LOST AND
// NEVER SILENTLY CHANGED.
//
// ── THE TYPING BOUNDARY, AND WHY IT MOVED ────────────────────────────────
//
// This component owns the live text. Keystrokes land in LOCAL state, so the
// case view — a very large component — does not re-render per character, and
// the status reflects the change on the keystroke rather than on a blur.
//
// The first version of this used DraftTextarea, which commits on blur. That
// had two defects worth naming because the fix is the whole design here:
//
//   * THE STATUS LAGGED. "Unsaved changes" appeared only after leaving the
//     field, so an investigator typing for a minute was told there was
//     nothing to save.
//
//   * SAVING RELIED ON EVENT ORDER. Clicking Save blurs the textarea first in
//     every browser, so the commit happened to land before the click. That is
//     true and it is not a guarantee — it says nothing about keyboard
//     activation, about a save triggered while a field is still focused, or
//     about React's batching. A save that depends on event ordering to store
//     the right words is a save that will one day store the wrong ones.
//
// So: `liveRef` is updated synchronously on every edit, and Save hands
// `liveRef.current` to the parent, which commits it and sends it in the same
// synchronous step. There is no path by which the stored version differs from
// what was on screen when the button was pressed.
//
// The session is still synchronised — on blur, and on UNMOUNT — so navigating
// away or switching destinations cannot silently discard text. The unmount
// commit carries its own caseId, so a commit firing as the case changes
// cannot write one case's text into another's session.
//
// ── THE CONFLICT REVIEW ──────────────────────────────────────────────────
//
// A stale save is the one moment two people's work is in play, so it is the
// one moment this screen slows down. It does not offer a button until it can
// say WHICH version would be followed, WHO saved it and WHEN; it lets the
// investigator read that version; it states plainly that nothing will be
// merged; and if it cannot retrieve the newer version it fails closed and
// offers no confirmation at all.
//
// NOTHING HERE ADOPTS, SUBMITS, OR CHANGES THE CASE. Ask Compass is untouched
// and remains a separate advisory capability reached from its own panel.
// ─────────────────────────────────────────────────────────────────────────

const card = {
  background: COLOR.surface, border: `1px solid ${COLOR.border}`,
  borderRadius: 10, padding: "14px 16px", marginBottom: 12,
};
const heading = { ...TYPE.sectionHeading, color: COLOR.ink, margin: "0 0 8px" };
const quiet = { ...TYPE.body, color: COLOR.inkQuiet, margin: 0, lineHeight: 1.6 };
const metaRow = { ...TYPE.metadata, color: COLOR.inkFaint };

const field = {
  width: "100%", boxSizing: "border-box", resize: "vertical",
  fontFamily: TYPE.body.fontFamily, fontSize: TYPE.body.fontSize,
  lineHeight: 1.6, color: COLOR.ink, background: COLOR.surface,
  border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface,
  padding: "10px 12px",
};

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: COLOR.neutralChipBg, fg: COLOR.neutralChipText },
    violet: { bg: COLOR.purpleTint, fg: COLOR.purple },
    amber: { bg: COLOR.amberTint, fg: COLOR.amber },
    red: { bg: COLOR.redTint, fg: COLOR.red },
    green: { bg: COLOR.greenTint, fg: COLOR.green },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ ...TYPE.pill, background: t.bg, color: t.fg, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function StatePill({ state }) {
  switch (state) {
    case DRAFT_STATE.DIRTY: return <Pill tone="amber">Unsaved changes</Pill>;
    case DRAFT_STATE.SAVING: return <Pill tone="neutral">Saving</Pill>;
    case DRAFT_STATE.SAVED: return <Pill tone="green">Saved</Pill>;
    case DRAFT_STATE.STALE: return <Pill tone="red">Version conflict</Pill>;
    case DRAFT_STATE.NEEDS_HR_REASON: return <Pill tone="amber">Reason needed</Pill>;
    case DRAFT_STATE.ERROR: return <Pill tone="red">Not saved</Pill>;
    case DRAFT_STATE.READ_ONLY: return <Pill tone="neutral">Read only</Pill>;
    default: return <Pill tone="neutral">No unsaved changes</Pill>;
  }
}

function History({ versions, versionsLoading, versionsUnreadable, authorNameFor, fmtDate, onContinueFrom, canContinue, busyVersionId }) {
  if (versionsLoading) return <p style={quiet}>Loading the report history for this case&hellip;</p>;
  if (versionsUnreadable) {
    return (
      <p style={{ ...TYPE.body, color: COLOR.red, margin: 0, lineHeight: 1.6 }}>
        Compass could not read the saved versions for this case. This is not the same as there being none, and this
        list must not be relied on as a complete history until it loads.
      </p>
    );
  }
  if (!versions.length) return <p style={quiet}>No versions have been saved for this case yet.</p>;
  const latest = versions.reduce((a, v) => (a === null || (v.versionNo ?? -1) > (a.versionNo ?? -1) ? v : a), null);
  return (
    <>
      {[...versions].sort((a, b) => (b.versionNo ?? 0) - (a.versionNo ?? 0)).map(v => {
        const author = v.authorKind === 'system' ? 'System' : (authorNameFor(v.createdBy) || 'Unknown author');
        return (
          <div key={v.id} style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ ...TYPE.rowContext, color: COLOR.ink }}>Version {v.versionNo}</span>
              {latest && v.id === latest.id && <Pill tone="violet">Latest</Pill>}
              {v.adoptedAt && v.isCurrent && <Pill tone="violet">Adopted &middot; current</Pill>}
              {v.adoptedAt && !v.isCurrent && <Pill tone="neutral">Previously adopted</Pill>}
              {!v.adoptedAt && <Pill tone="neutral">Draft</Pill>}
              {v.adoptionBasis === 'hr_exception' && <Pill tone="amber">Adopted under HR exception</Pill>}
              {/* How it was written. Null is 'not recorded' — true of every
                  version saved before the column existed, and never guessed
                  from the text. */}
              <Pill tone="neutral">
                {v.authoringMode === AUTHORING_MODE.STRUCTURED ? 'Seven sections'
                  : v.authoringMode === AUTHORING_MODE.SINGLE ? 'One document'
                    : 'Mode not recorded'}
              </Pill>
            </div>
            <p style={{ ...metaRow, margin: "4px 0 0" }}>
              {author} &middot; {fmtDate(v.createdAt) || "date not recorded"}
            </p>
            {canContinue && (
              <button type="button" style={{ ...BUTTON.secondary, height: 32, padding: "0 12px", marginTop: 6 }}
                disabled={busyVersionId === v.id} onClick={() => onContinueFrom(v)}>
                {busyVersionId === v.id ? "Opening…" : "Continue from this version"}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

/** The stale-version review. Shown instead of a bare save button. */
function ConflictReview({ session, authorNameFor, fmtDate, onReviewLatestBody, onConfirmAndSave, saving }) {
  const c = session.conflict || { state: 'fetching' };

  if (c.state === 'fetching') {
    return (
      <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "10px 0 0", lineHeight: 1.6 }}>
        Looking up the newer version&hellip;
      </p>
    );
  }

  if (c.state === 'unavailable') {
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ ...TYPE.metadata, color: COLOR.red, margin: 0, lineHeight: 1.6 }}>
          Compass cannot read the newer version, so it will not offer to save on top of something it cannot show you.
          Your text is untouched. Reload the case once the history is readable, and nothing you have written will be
          lost in the meantime.
        </p>
      </div>
    );
  }

  const author = c.latest.authorKind === 'system' ? 'System' : (authorNameFor(c.latest.createdBy) || 'another user');
  const next = c.latest.versionNo + 1;

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 10 }}>
      <p style={{ ...TYPE.body, color: COLOR.ink, margin: "0 0 6px", lineHeight: 1.6 }}>
        <strong>Version {c.latest.versionNo}</strong> was saved by {author}
        {fmtDate(c.latest.createdAt) ? ` on ${fmtDate(c.latest.createdAt)}` : ''}.
      </p>
      <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "0 0 8px", lineHeight: 1.6 }}>
        Compass will not merge the two reports and will not replace either one. Both are kept. If you continue, your
        text is saved as version {next}, and version {c.latest.versionNo} stays in the history exactly as it was saved.
      </p>

      {c.bodyState === 'idle' && (
        <button type="button" style={{ ...BUTTON.secondary, height: 32, padding: "0 12px" }} onClick={onReviewLatestBody}>
          Read version {c.latest.versionNo}
        </button>
      )}
      {c.bodyState === 'fetching' && <p style={quiet}>Opening version {c.latest.versionNo}&hellip;</p>}
      {c.bodyState === 'unavailable' && (
        <p style={{ ...TYPE.metadata, color: COLOR.red, margin: 0, lineHeight: 1.6 }}>
          Compass could not open that version&rsquo;s text. Your own text is untouched.
        </p>
      )}
      {c.bodyState === 'ready' && (
        <div>
          <p style={{ ...TYPE.micro, color: COLOR.inkQuiet, margin: "0 0 4px" }}>
            VERSION {c.latest.versionNo}, AS SAVED &mdash; READ ONLY
          </p>
          <div style={{ ...field, background: COLOR.rail, whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto" }}>
            {c.body}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          style={{ ...BUTTON.primary, opacity: saving ? 0.5 : 1 }}
          disabled={saving || !canConfirmRebase(session)}
          onClick={onConfirmAndSave}
        >
          {saving ? "Saving…" : `Keep my text and save it as version ${next}`}
        </button>
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "6px 0 0", lineHeight: 1.6 }}>
          Compass checks again as it saves. If someone saves another version while you are reading this one, your save
          is refused rather than taking its place, and this review reopens against the newer version.
        </p>
      </div>
    </div>
  );
}

/**
 * How the report is written — an explicit, visible, reversible choice.
 *
 * NOT inferred, and never changed as a side effect of typing. Going to one
 * document is always available and always lossless: the text becomes exactly
 * what would have been saved, in the same order. Going the other way moves
 * content between boxes, so it asks first and shows the split it would make —
 * and when the text cannot be split without changing a byte, it says so
 * rather than hiding the option.
 */
function ModeChooser({ session, pendingSwitch, onRequestSwitch, onCancelSwitch, onConfirmSwitch }) {
  const isStructured = session.mode === AUTHORING_MODE.STRUCTURED;
  const canGoStructured = canSwitchToStructured(session);
  const preview = pendingSwitch === AUTHORING_MODE.STRUCTURED ? previewStructuredSplit(session) : null;

  const option = (mode, label, hint, enabled) => {
    const selected = session.mode === mode;
    return (
      <div
        key={mode}
        style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px',
          border: `1px solid ${selected ? COLOR.purple : COLOR.border}`,
          background: selected ? COLOR.purpleTint : COLOR.surface,
          borderRadius: RADIUS.surface, opacity: enabled ? 1 : 0.55, flex: '1 1 240px',
        }}
      >
        {/* The radio carries its own accessible name, so the option is
            operable and announced without depending on a <label> whose text
            is entirely dynamic — which jsx-a11y cannot verify statically and
            which a screen reader would read as the hint as well as the name. */}
        <input
          id={`report-authoring-mode-${mode}`}
          type="radio" name="report-authoring-mode" value={mode} checked={selected}
          aria-label={label}
          aria-describedby={`report-authoring-mode-${mode}-hint`}
          disabled={!enabled} onChange={() => onRequestSwitch(mode)}
          style={{ marginTop: 3, cursor: enabled ? 'pointer' : 'not-allowed' }}
        />
        <span>
          <span style={{ ...TYPE.rowContext, color: COLOR.ink, display: 'block' }}>{label}</span>
          <span id={`report-authoring-mode-${mode}-hint`} style={{ ...TYPE.metadata, color: COLOR.inkQuiet, lineHeight: 1.5 }}>{hint}</span>
        </span>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ ...TYPE.micro, color: COLOR.inkQuiet, margin: '0 0 6px' }}>HOW THIS REPORT IS WRITTEN</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {option(AUTHORING_MODE.STRUCTURED, 'Seven guided sections',
          'Matters, evidence, accounts, assessment, positions, uncertainties, summary.',
          isStructured || canGoStructured)}
        {option(AUTHORING_MODE.SINGLE, 'One document',
          'Write it your own way, in a single piece of text.', true)}
      </div>

      {!isStructured && !canGoStructured && (
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: '6px 0 0', lineHeight: 1.6 }}>
          Compass cannot split this text into the seven sections without changing where your words sit, so that option
          is unavailable for this report. Nothing is lost — it stays exactly as you wrote it.
        </p>
      )}

      {pendingSwitch === AUTHORING_MODE.SINGLE && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: RADIUS.surface, background: COLOR.rail, border: `1px solid ${COLOR.border}` }}>
          <p style={{ ...TYPE.body, color: COLOR.ink, margin: '0 0 6px', lineHeight: 1.6 }}>
            Switch to one document?
          </p>
          <p style={{ ...TYPE.metadata, color: COLOR.inkSoft, margin: '0 0 8px', lineHeight: 1.6 }}>
            Your seven sections become a single piece of text, in the same order, with the same words. Nothing is
            rewritten and nothing is removed. You can switch back.
          </p>
          <button type="button" style={{ ...BUTTON.primary, height: 36 }} onClick={onConfirmSwitch}>Switch to one document</button>
          <button type="button" style={{ ...BUTTON.secondary, height: 36, marginLeft: 8 }} onClick={onCancelSwitch}>Keep seven sections</button>
        </div>
      )}

      {pendingSwitch === AUTHORING_MODE.STRUCTURED && preview && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: RADIUS.surface, background: COLOR.rail, border: `1px solid ${COLOR.border}` }}>
          <p style={{ ...TYPE.body, color: COLOR.ink, margin: '0 0 6px', lineHeight: 1.6 }}>
            Switch to seven guided sections?
          </p>
          <p style={{ ...TYPE.metadata, color: COLOR.inkSoft, margin: '0 0 8px', lineHeight: 1.6 }}>
            Every word is kept, but your text will be split across the boxes below. This is exactly where each part
            would go. You can switch back.
          </p>
          <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 8 }}>
            {REPORT_SECTIONS.map(sec => (
              <div key={sec.id} style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: 6, marginTop: 6 }}>
                <p style={{ ...TYPE.micro, color: COLOR.inkQuiet, margin: 0 }}>{sec.label.toUpperCase()}</p>
                <p style={{ ...TYPE.metadata, color: (preview[sec.id] || '').trim() ? COLOR.inkSoft : COLOR.inkFaint, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>
                  {(preview[sec.id] || '').trim() || 'nothing would go here'}
                </p>
              </div>
            ))}
          </div>
          <button type="button" style={{ ...BUTTON.primary, height: 36 }} onClick={onConfirmSwitch}>Split into seven sections</button>
          <button type="button" style={{ ...BUTTON.secondary, height: 36, marginLeft: 8 }} onClick={onCancelSwitch}>Keep one document</button>
        </div>
      )}
    </div>
  );
}

export function InvestigationReportEditor({
  session,
  versions = [],
  versionsLoading = false,
  versionsUnreadable = false,
  authorNameFor = () => null,
  fmtDate = (d) => d || "",
  onCommitLive = () => {},
  onSave = () => {},
  onReviewLatestBody = () => {},
  onConfirmAndSave = () => {},
  onContinueFrom = () => {},
  onSwitchMode = () => {},
  busyVersionId = null,
}) {
  const caseId = session?.caseId ?? null;

  // ── THE LIVE TEXT ──────────────────────────────────────────────────────
  // Local, so typing is immediate and cheap. `liveRef` is updated
  // synchronously alongside it and is what Save reads, so the saved bytes
  // never depend on a render or an event having happened first.
  // Which switch the investigator has asked for but not yet confirmed.
  const [pendingSwitch, setPendingSwitch] = useState(null);
  const [live, setLive] = useState(() => ({
    sections: session?.sections || {},
    raw: session?.raw || '',
    hrReason: session?.hrReason || '',
  }));
  const liveRef = useRef(live);
  // Kept current in an effect, not during render: writing a ref while
  // rendering is impure and react-hooks/refs says so. Same shape as
  // DraftTextarea, which holds its own commit callback the same way.
  const commitRef = useRef(onCommitLive);
  useEffect(() => { commitRef.current = onCommitLive; });

  const apply = (patch) => {
    const next = { ...liveRef.current, ...patch };
    liveRef.current = next;
    setLive(next);
  };
  const setSection = (id, value) => apply({ sections: { ...liveRef.current.sections, [id]: value } });
  const commit = () => commitRef.current(caseId, liveRef.current);

  // COMMIT ON UNMOUNT. Switching destinations, collapsing the case or
  // navigating away all unmount this component without a blur, and the text
  // must survive all three. The caseId is captured, so a commit that fires as
  // the case changes writes into the session it belongs to.
  useEffect(() => () => { commitRef.current(caseId, liveRef.current); }, [caseId]);

  if (!session) return null;

  const readOnly = session.state === DRAFT_STATE.READ_ONLY;
  const liveBody = session.rawMode ? (live.raw || '') : composeReportBody(live.sections);
  const liveUnsaved = !readOnly && liveBody !== (session.savedBody || '');
  const liveReason = (live.hrReason || '').trim();
  // Computed from the LIVE text, so the warning appears as the line is typed
  // rather than after a save has already stored it. Meaningless in raw mode,
  // where there are no section boundaries to collide with.
  const headingCollisions = session.rawMode ? [] : sectionHeadingCollisions(live.sections);

  // ── Read-only, nothing written: explain and offer no boxes ─────────────
  if (readOnly && (session.savedBody || '').trim() === '' && liveBody.trim() === '') {
    return (
      <div style={card}>
        <h3 style={heading}>Write the investigation report</h3>
        <p style={quiet}>{describeDraftState(session)}</p>
        {session.readOnlyReason === READ_ONLY_REASON.NOT_ACTIVATED && (
          <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "8px 0 0", lineHeight: 1.6 }}>
            The existing &ldquo;Conclude investigation&rdquo; route is unchanged and remains the way to produce a report
            on this case.
          </p>
        )}
      </div>
    );
  }

  // ── Read-only but holding text: show it so it can be copied ────────────
  if (readOnly) {
    return (
      <div style={card}>
        <h3 style={heading}>Write the investigation report</h3>
        <p style={{ ...TYPE.body, color: COLOR.red, margin: "0 0 8px", lineHeight: 1.6 }}>
          {describeDraftState(session)}
        </p>
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "0 0 8px", lineHeight: 1.6 }}>
          Your text has not been lost and is shown below. Compass cannot store it, so copy anything you need before
          leaving this page.
        </p>
        <div style={{ ...field, background: COLOR.rail, whiteSpace: "pre-wrap", minHeight: 120 }}>
          {liveBody || session.savedBody}
        </div>
      </div>
    );
  }

  const saving = session.state === DRAFT_STATE.SAVING;
  const stale = session.state === DRAFT_STATE.STALE;
  const errored = session.state === DRAFT_STATE.ERROR;
  const needsReason = session.state === DRAFT_STATE.NEEDS_HR_REASON && liveReason === '';

  // The state the PILL shows: a transient state the investigator must act on
  // outranks the dirty flag; otherwise the live text decides, immediately.
  const held = [DRAFT_STATE.SAVING, DRAFT_STATE.STALE, DRAFT_STATE.ERROR].includes(session.state)
    || needsReason;
  const effectiveState = held ? session.state : (liveUnsaved ? DRAFT_STATE.DIRTY : session.state);

  // Saveable is computed from the LIVE text, not the session's, so the button
  // enables on the first keystroke.
  const saveable = session.canSave
    && !saving
    && Number.isInteger(session.baseVersion)
    && liveBody.trim() !== ''
    && (liveUnsaved || errored);

  return (
    <div>
      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
          <h3 style={{ ...heading, margin: 0 }}>Write the investigation report</h3>
          <StatePill state={effectiveState} />
          {session.baseVersion > 0 && <span style={metaRow}>Based on version {session.baseVersion}</span>}
        </div>

        <p style={{
          ...TYPE.body, margin: 0, lineHeight: 1.6,
          color: stale || errored ? COLOR.red : COLOR.inkSoft,
        }}>
          {held ? describeDraftState(session)
            : liveUnsaved ? 'Unsaved changes. Nothing is stored until you save a version.'
              : describeDraftState(session)}
        </p>

        {/* A conflict is a review, then a choice. Never a silent replacement. */}
        {stale && (
          <ConflictReview
            session={session} authorNameFor={authorNameFor} fmtDate={fmtDate}
            onReviewLatestBody={onReviewLatestBody}
            onConfirmAndSave={() => { commit(); onConfirmAndSave(caseId, liveRef.current); }}
            saving={saving}
          />
        )}

        {session.requiresHrReason && (
          <div style={{ marginTop: 10 }}>
            <label htmlFor="report-hr-reason" style={{ ...TYPE.micro, color: COLOR.inkQuiet, display: "block", marginBottom: 4 }}>
              WHY ARE YOU SAVING THIS RATHER THAN THE ASSIGNED INVESTIGATOR? (RECORDED IN THE CASE AUDIT TRAIL)
            </label>
            <textarea
              id="report-hr-reason"
              aria-label="Reason for saving as HR rather than the assigned investigator"
              rows={2}
              style={{ ...field, borderColor: needsReason ? COLOR.amber : COLOR.border }}
              value={live.hrReason}
              onChange={e => apply({ hrReason: e.target.value })}
              onBlur={commit}
            />
          </div>
        )}

        {!stale && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              style={{ ...BUTTON.primary, opacity: saveable ? 1 : 0.5, cursor: saveable ? "pointer" : "not-allowed" }}
              disabled={!saveable}
              // The live content is handed over explicitly. Nothing here waits
              // for a blur, and nothing reads the session's copy of the text.
              onClick={() => { commit(); onSave(caseId, liveRef.current); }}
            >
              {saving ? "Saving…" : session.retryable ? "Try saving again" : "Save a version"}
            </button>
            {liveUnsaved && !saving && (
              <span style={{ ...TYPE.metadata, color: COLOR.amber }}>Nothing is stored until you save.</span>
            )}
            {session.retryable && (
              <span style={{ ...TYPE.metadata, color: COLOR.inkQuiet }}>
                Trying again repeats the same request, so it cannot create a duplicate version.
              </span>
            )}
          </div>
        )}

        <ModeChooser
          session={session}
          pendingSwitch={pendingSwitch}
          onRequestSwitch={(m) => { commit(); setPendingSwitch(m); }}
          onCancelSwitch={() => setPendingSwitch(null)}
          onConfirmSwitch={() => { commit(); onSwitchMode(caseId, pendingSwitch, liveRef.current); setPendingSwitch(null); }}
        />

        {/* ── A HEADING THAT COMPASS WILL READ AS A SECTION BOUNDARY ──────
            Warned, never rewritten, and never a reason to refuse the save.
            The investigator's words are stored exactly as typed; what changes
            is where they reappear when the report is next opened. */}
        {headingCollisions.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 12, padding: "10px 12px", borderRadius: RADIUS.surface,
              background: COLOR.amberTint, border: `1px solid ${COLOR.amber}33`,
            }}
          >
            <p style={{ ...TYPE.micro, color: COLOR.amber, margin: "0 0 6px" }}>
              A HEADING YOU HAVE TYPED MATCHES A COMPASS SECTION
            </p>
            <ul style={{ ...TYPE.metadata, color: COLOR.inkSoft, margin: "0 0 6px", paddingLeft: 18, lineHeight: 1.6 }}>
              {headingCollisions.map((c, i) => (
                <li key={`${c.sectionId}-${i}`}>
                  <strong>{c.sectionLabel}</strong> contains the line &ldquo;{c.line}&rdquo;, which Compass reads as the
                  start of {c.selfReference ? 'this same section' : `“${c.headingLabel}”`}.
                </li>
              ))}
            </ul>
            <p style={{ ...TYPE.metadata, color: COLOR.inkSoft, margin: 0, lineHeight: 1.6 }}>
              You can save exactly as it is and every word will be kept — but when this report is reopened, the text
              after that line may appear in a different box, or the whole report may open as one block of text instead
              of seven sections. Changing the line, or removing the two hashes in front of it, avoids that.
            </p>
          </div>
        )}

        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "10px 0 0", lineHeight: 1.6 }}>
          Saving stores an immutable version. It does not adopt the report, submit it for HR review, change the case
          stage or alter the report already held on the case. An incomplete draft can be saved as often as you like.
        </p>
      </div>

      {session.rawMode ? (
        <div style={card}>
          <h3 style={heading}>Report text</h3>
          <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "0 0 8px", lineHeight: 1.6 }}>
            This report was not written with the sections below, so Compass is showing it exactly as it stands rather
            than redistributing it. Your wording is preserved as typed.
          </p>
          <textarea
            aria-label="Report text" rows={24} style={field}
            value={live.raw} onChange={e => apply({ raw: e.target.value })} onBlur={commit}
          />
        </div>
      ) : (
        REPORT_SECTIONS.map(s => (
          <div key={s.id} style={card}>
            <h3 style={heading}>{s.label}</h3>
            <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: "0 0 8px", lineHeight: 1.6 }}>{s.help}</p>
            <textarea
              id={`report-section-${s.id}`}
              aria-label={s.label}
              rows={s.id === 'summary' || s.id === 'assessment' ? 8 : 6}
              style={field}
              value={live.sections[s.id] ?? ''}
              onChange={e => setSection(s.id, e.target.value)}
              onBlur={commit}
            />
          </div>
        ))
      )}

      <div style={card}>
        <h3 style={heading}>Saved versions</h3>
        <History
          versions={versions} versionsLoading={versionsLoading} versionsUnreadable={versionsUnreadable}
          authorNameFor={authorNameFor} fmtDate={fmtDate} onContinueFrom={onContinueFrom}
          canContinue={!liveUnsaved} busyVersionId={busyVersionId}
        />
        {liveUnsaved && versions.length > 0 && (
          <p style={{ ...TYPE.metadata, color: COLOR.amber, margin: "10px 0 0", lineHeight: 1.6 }}>
            You have unsaved changes, so opening an earlier version is unavailable — it would replace what you have
            written. Save a version first, or clear your changes.
          </p>
        )}
      </div>
    </div>
  );
}
