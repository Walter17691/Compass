import { useEffect, useLayoutEffect, useRef } from 'react';

// Phase 6.5 hardening (accessibility pass) — shared modal keyboard/focus
// behaviour, applied to every dialog in the app instead of each one
// re-implementing its own partial version. Before this, every modal only
// had an inline onKeyDown={Escape} handler on its own role="dialog" div
// (which only catches Escape when focus happens to be inside that div's
// subtree — jsx-a11y's no-noninteractive-element-interactions rightly
// flags this shape, since a plain div isn't a "listening" element by
// default) and NONE of them trapped Tab focus or moved focus into the
// dialog on open — a keyboard user could Tab straight through a modal
// into the page behind it, and a screen-reader user got no indication
// focus had moved into a dialog at all.
//
// `active` lets a component call this hook unconditionally (required by
// the rules of hooks) even when the modal it guards is only sometimes
// rendered — App.jsx's own inline modals are conditionally rendered
// blocks inside one large component, not separate components each with
// their own mount/unmount lifecycle, so the hook itself has to gate on
// whether the modal is currently showing rather than relying on
// mount/unmount to do it.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(containerRef, onClose, active = true) {
  const previouslyFocused = useRef(null);
  // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH,
  // exposed by OutcomeModal's own fix) — the escape-key effect below only
  // re-subscribes when `active` changes, so it closed over whichever
  // `onClose` was in scope at that point and never picked up a later
  // render's fresh closure. A caller whose onClose reads live state (e.g.
  // OutcomeModal's close() now checking `saving` to refuse to close mid-
  // write) would have Escape act on a stale, already-outdated version of
  // that check. Always kept current, read through the ref inside the
  // handler instead of the closed-over parameter. Updated in a layout
  // effect, not directly during render — React's own rules disallow
  // mutating a ref's .current while rendering (concurrent rendering can
  // re-render without committing); a layout effect still runs
  // synchronously after the DOM commit and strictly before the browser
  // can paint or the user can trigger a keydown, so there's no window
  // where the escape handler could read a stale value.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement;
    const container = containerRef.current;
    // No visibility filter (e.g. offsetParent !== null): every dialog in
    // this app is position:fixed, and offsetParent is null for a
    // position:fixed element in every browser regardless of whether it's
    // genuinely visible — that check would have silently emptied this
    // list for every real modal in the app, not just a jsdom quirk.
    // Content inside an open modal here is only ever conditionally
    // rendered, never CSS-hidden while still present, so nothing further
    // is needed.
    const focusables = () => container ? Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)) : [];
    // Focuses the first real control rather than the container itself
    // whenever one exists — landing on an actual field/button is more
    // useful to a keyboard/screen-reader user than landing on an inert
    // wrapper div; the container (tabIndex=-1) is only the fallback for
    // a dialog with no focusable content at all (rare, but possible for
    // a pure-message alertdialog).
    (focusables()[0] || container)?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // The element that opened this dialog may itself have since been
      // removed (e.g. the row it lived on was deleted as part of the
      // action the dialog confirmed) — .focus() on a detached element is
      // a silent no-op in every browser, never a throw, so no extra
      // guard is needed here.
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
