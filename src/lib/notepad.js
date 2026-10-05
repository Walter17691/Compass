import { CAPTURE_CHANNEL } from './noteCapture';
import { SPEAKERS } from '../constants';

// ─────────────────────────────────────────────────────────────────────────
// UX-06 — THE NOTEPAD IS WHERE THE MANAGER WORKS. COMPASS ASSISTS AROUND IT.
//
// ┌─ HOW THE CHAT COMPOSER HAPPENED ────────────────────────────────────────┐
// │ Before Wave C3 the main area was explicitly a Notepad: aria-label        │
// │ "Notepad", one full-height central textarea, the manager typing straight  │
// │ into the workspace. But the captured notes were never RENDERED — you      │
// │ typed into a void and the only evidence was a counter.                   │
// │                                                                         │
// │ C3 fixed exactly that, correctly, by giving the main area to the captured │
// │ conversation. The typing surface was demoted to a two-row composer with   │
// │ its own border and background at the foot of the screen — and that strip  │
// │ reads as a message bar. Taking ordinary meeting notes started to feel     │
// │ like sending messages to Compass.                                        │
// │                                                                         │
// │ Neither design was wrong about its own problem. This module supports      │
// │ having both: a continuous notepad whose final line is the live capture    │
// │ surface, with every committed line still visible above it.               │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NOTHING HERE TOUCHES THE CAPTURE MODEL. The canonical path is unchanged —
// one Enter still calls the same addUtterance, which still mints one captureId,
// stamps the channel, and reconciles attribution by identity. This file decides
// only what the notepad SHOWS and where it scrolls.
// ─────────────────────────────────────────────────────────────────────────

// How close to the bottom still counts as "following the latest note".
//
// Generous enough that a stray wheel nudge does not strand the manager away
// from the live line, tight enough that deliberately scrolling up to re-read an
// earlier note is respected.
export const FOLLOW_SLACK_PX = 96;

/**
 * Should the notepad jump to the newest note?
 *
 * The old behaviour was unconditional `scrollTop = scrollHeight` on every
 * capture, which yanked the page back down while the manager was reading
 * something earlier — tolerable for a chat log, wrong for a notepad they are
 * working in.
 *
 * Defaults to TRUE for unusable metrics and for content that does not overflow:
 * the failure mode of following is a small jump, the failure mode of NOT
 * following is a manager typing into a line they cannot see.
 */
export function shouldFollowLatest(metrics) {
  const { scrollTop, scrollHeight, clientHeight } = metrics || {};
  if (![scrollTop, scrollHeight, clientHeight].every(n => typeof n === 'number' && Number.isFinite(n))) return true;
  if (scrollHeight <= clientHeight) return true;
  return (scrollHeight - clientHeight - scrollTop) <= FOLLOW_SLACK_PX;
}

// A one-word note of where a line came from, shown ONLY where it changes how
// the line should be read.
//
// Typed notes are the default and carry no marker — a badge on every line would
// be clutter, and provenance existing is not a reason to display it. Speech and
// imported transcript DO change the evidential character of a line (they carry
// the speaker's own words), and the record generator already treats them
// differently, so the manager should be able to see which is which.
export const SOURCE_LABEL = Object.freeze({
  [CAPTURE_CHANNEL.SPEECH_MIC]: 'heard',
  [CAPTURE_CHANNEL.SPEECH_SCREEN]: 'heard',
  [CAPTURE_CHANNEL.IMPORT]: 'imported',
});

// Speaker values that are not an attribution and must never be printed as one.
// '...' is the optimistic placeholder before attribution returns; SPEAKERS.NOTE
// is the deliberate neutral; 'You' is a legacy value the old row already hid.
const NON_ATTRIBUTIONS = new Set(['...', SPEAKERS.NOTE, 'You', '']);

/**
 * What metadata a committed line should show, given the line before it.
 *
 * CONTENT FIRST, METADATA SECOND. The timestamp is always available, because
 * chronology is part of what makes this a record. The speaker appears only when
 * it CHANGES — repeating the chair's name on every line of a meeting the chair
 * is minuting is noise, and worse, it reads as though the chair said each thing
 * rather than wrote it down.
 */
export function noteMeta(entry, previous) {
  const speaker = typeof entry?.speaker === 'string' ? entry.speaker.trim() : '';
  const prev = typeof previous?.speaker === 'string' ? previous.speaker.trim() : '';
  const showSpeaker = !NON_ATTRIBUTIONS.has(speaker) && speaker !== prev;
  return {
    ts: entry?.ts || '',
    speaker: showSpeaker ? speaker : null,
    source: SOURCE_LABEL[entry?.channel] || null,
    pending: !!entry?.pending,
  };
}

/** The newest committed line, for the screen-reader announcement. */
export function latestCommitted(transcript) {
  const list = Array.isArray(transcript) ? transcript : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const u = list[i];
    if (u && !u.pending && String(u.text || '').trim()) return u;
  }
  return null;
}

/**
 * Should a click land focus in the live line?
 *
 * Only when the click was on the notepad's own blank area. A click that landed
 * on a committed line is the manager selecting text to read or copy, and
 * stealing focus from that would make the record impossible to quote from.
 */
export function clickShouldFocusLiveLine(target, container) {
  if (!target) return false;
  if (container && target === container) return true;
  // The inner column carries data-notepad-blank, so the space beside and below
  // the notes counts as page too.
  return target.dataset ? target.dataset.notepadBlank === 'true' : false;
}
