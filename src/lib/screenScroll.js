import { useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// ENTERING A SCREEN PUTS YOU AT ITS TOP.
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ Human UAT: opening Review from the Meetings row — either "Review & send" │
// │ or "View notes" — landed the manager part-way down the meeting record    │
// │ rather than at the top of the Review workspace.                          │
// │                                                                         │
// │ Cause: there was no scroll reset ANYWHERE in the app. Compass is a       │
// │ single-document SPA that swaps a subtree on `screen`, and nothing ever    │
// │ touched the scroll position, so Review inherited however far down the    │
// │ Meetings tab the manager had scrolled.                                   │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHICH ELEMENT ACTUALLY SCROLLS — established by elimination, not assumed.
// When Review mounts, the previous screen unmounts, taking its own overflow
// containers with it. A scroll position can only persist on an element that
// SURVIVES the swap, and the only survivors are the App shell wrappers and the
// document. Both shell wrappers are `minHeight:100vh` with no `overflow`, so
// neither is a scroll container. Therefore the document is the scroller — which
// is also why ReviewScreen's `position:sticky; top:0` action bar works at all,
// since sticky resolves against the nearest scrolling ancestor.
//
// Both the window API and the scrolling element are reset, because engines
// disagree about which one answers: `document.scrollingElement` is <html> in
// standards mode and <body> in quirks mode, and a window.scrollTo that is a
// no-op in one environment must not leave the page where it was.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Put the document scroller back to the top.
 *
 * Returns true when at least one mechanism was available, so a caller — or a
 * test — can tell "reset" from "nothing to reset". Never throws: this runs
 * during navigation and must not be able to break it.
 */
export function scrollWorkspaceToTop(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w) return false;
  let reset = false;
  try {
    if (typeof w.scrollTo === 'function') { w.scrollTo(0, 0); reset = true; }
  } catch { /* a non-conforming scrollTo must not break navigation */ }
  const doc = w.document;
  if (doc) {
    for (const el of [doc.scrollingElement, doc.documentElement, doc.body]) {
      if (el && typeof el.scrollTop === 'number') { el.scrollTop = 0; reset = true; }
    }
  }
  return reset;
}

/**
 * Should entering `screen` reset the scroll position?
 *
 * Deliberately a allow-list of ONE. The brief asked for Review specifically,
 * and every other screen keeps the behaviour it has today — a UX fix found
 * during a Review retest is not a licence to change how every other
 * destination scrolls.
 *
 * Pure, so the rule is testable without a DOM.
 */
export function entryResetsScroll(screen, reviewScreen) {
  return !!screen && screen === reviewScreen;
}

// ─────────────────────────────────────────────────────────────────────────
// IR-SURF-01a — ENTERING A DOCUMENT STARTS AT THE DOCUMENT.
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ Human UAT: Meetings -> Investigation report -> View report opened PART    │
// │ WAY DOWN the report, because the manager had scrolled the Meetings tab    │
// │ before clicking.                                                        │
// │                                                                         │
// │ Root cause: the mechanism above already exists and works, but            │
// │ entryResetsScroll is an allow-list of exactly ONE screen — Review. UX-07  │
// │ scoped it that way deliberately ("every other screen keeps the behaviour  │
// │ it has today"). The document view was never added, so it inherited the    │
// │ document scroll position from whatever the manager was last reading.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHY A KEY AND NOT `screen === LETTER`. Genuine letters share that screen, and
// the brief requires letter behaviour to be provably unchanged. Keying on the
// screen alone would silently alter every letter too. The key below is null for
// a letter and never transitions, so letters cannot be affected by construction
// rather than by intention.
//
// NO TIMERS. The reset runs in the effect that fires when the key changes, which
// is the same commit that rendered the document — the same deterministic
// boundary useScrollToTopOnEnter already relies on. Nothing is deferred to a
// setTimeout, so there is no race to lose.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A stable identity for the internal document currently open, or null.
 *
 * Pure, so the rule is testable without a DOM. Returns null for anything that is
 * not an internal document on the document screen — which is what keeps genuine
 * letters out of this behaviour entirely.
 */
export function internalDocumentEntryKey({ screen, documentScreen, docType, internal } = {}) {
  if (!screen || !documentScreen || screen !== documentScreen) return null;
  if (!internal || !docType) return null;
  return `${documentScreen}:${docType}`;
}

/**
 * Put the reader at the top when a document is ENTERED.
 *
 * `entryKey` is the only dependency, and that is the whole design: it changes
 * when a document is opened and at no other time. Scrolling, typing, toggling a
 * panel, or any other state change leaves it identical, so none of them can drag
 * the reader back to the top mid-read. A falsy key does nothing at all.
 */
export function useScrollToTopOnDocumentEntry(entryKey) {
  useEffect(() => {
    if (!entryKey) return;
    scrollWorkspaceToTop();
  }, [entryKey]);
}

/**
 * The navigation boundary itself, as a hook, so App and its tests run THE SAME
 * code rather than two copies of it.
 *
 * `screen` is the only dependency. That is the whole design: React re-runs this
 * when the screen CHANGES and at no other time, so it is a navigation event and
 * never a render event. Editing the record, switching Summary/Advice/Ask,
 * approving a Compass proposal and saving while staying on Review all
 * re-render with `screen` unchanged, so none of them moves the reading
 * position.
 */
export function useScrollToTopOnEnter(screen, target) {
  useEffect(() => {
    if (!entryResetsScroll(screen, target)) return;
    scrollWorkspaceToTop();
    // `target` is a module constant at every call site; including it would not
    // change when this fires and would invite a render-time dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
}
