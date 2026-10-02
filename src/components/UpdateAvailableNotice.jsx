import { useState } from 'react';
import { COLOR, TYPE, FONT, RADIUS, BUTTON } from '../styles/tokens';

// A quiet line, not a modal and not a blocker. The whole point is that the
// human decides when to take the new build — including "not now, I am chairing
// a hearing".
export function UpdateAvailableNotice({ stale, onReload, meetingInProgress = false }) {
  const [dismissed, setDismissed] = useState(false);
  if (!stale || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        // Out of flow deliberately: the app shell is a flex row (sidebar +
        // content) and a block child would become a third column. Fixed keeps
        // this additive — no existing layout moves because of it. Below the
        // modal layer (z 1900) so a dialog still wins.
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1500,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 14px', background: COLOR.purpleTint,
        borderBottom: `1px solid ${COLOR.border}`, fontFamily: FONT.sans,
        boxShadow: '0 1px 3px rgba(15,18,36,0.08)',
      }}
    >
      <span style={{ ...TYPE.body, color: COLOR.ink, flex: 1, minWidth: 220 }}>
        A newer version of Compass is available.{' '}
        {meetingInProgress
          ? 'Finish this meeting first — captured notes are saved as you go, but anything typed and not yet entered would be lost.'
          : 'Reload to pick it up.'}
      </span>
      <button
        onClick={onReload}
        style={{
          ...(meetingInProgress ? BUTTON.secondary : BUTTON.primary),
          height: 34, padding: '0 14px', fontSize: 13,
        }}
      >
        Reload
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        style={{
          ...BUTTON.tertiary, color: COLOR.inkFaint, fontSize: 18,
          lineHeight: 1, padding: '0 4px', borderRadius: RADIUS.button,
        }}
      >
        ×
      </button>
    </div>
  );
}
