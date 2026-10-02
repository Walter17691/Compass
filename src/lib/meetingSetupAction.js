// ─────────────────────────────────────────────────────────────────────────
// WAVE C1 — one obvious action when setting a meeting up.
//
// The setup screen offered three controls of equal width: Schedule, Prepare and
// Start meeting. "Start meeting" was the filled primary in every state —
// including after the manager had just typed a date and time for next Tuesday,
// where starting it now contradicts the thing they had only just entered.
//
// ┌─ WHAT EACH ONE ACTUALLY DOES, TRACED ───────────────────────────────────┐
// │ Schedule   requires date AND time; creates a meeting with declared       │
// │            status "scheduled". A real lifecycle transition.              │
// │ Start      calls beginMeeting; the meeting becomes "in_progress"         │
// │            immediately. A real lifecycle transition.                     │
// │ Prepare    opens PrepScreen. Preparation is METADATA, not a lifecycle    │
// │            status — nothing about the meeting's state changes.           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// So two of the three are transitions and one is not, which settles the
// hierarchy: Prepare is never the primary action, because it does not move the
// meeting anywhere. Between the two that do, the manager's own input decides —
// a future date and time means they are arranging a meeting, not holding one.
//
// This module changes no lifecycle behaviour and starts nothing. It decides
// which control is emphasised; every control remains available.
// ─────────────────────────────────────────────────────────────────────────

export const SETUP_ACTION = Object.freeze({
  START: "start",
  SCHEDULE: "schedule",
  PREPARE: "prepare",
});

const LABEL = Object.freeze({
  [SETUP_ACTION.START]: "Start meeting",
  [SETUP_ACTION.SCHEDULE]: "Schedule meeting",
  [SETUP_ACTION.PREPARE]: "Prepare",
});

// A date and time the manager has entered that is still ahead of us. Parsed
// leniently because the form holds strings; an unparseable pair is treated as
// "not scheduled for later" rather than guessing a moment.
export function isScheduledForLater({ date, time } = {}, now = new Date()) {
  if (!date || !time) return false;
  const when = new Date(`${date}T${time}`);
  if (isNaN(when.getTime())) return false;
  return when.getTime() > now.getTime();
}

// `canSchedule` mirrors the screen's own existing rule: a date AND a time.
export function canSchedule({ date, time } = {}) {
  return Boolean(date && time);
}

// The primary is the action that matches what the manager has told us they are
// doing. Everything else stays reachable as a secondary.
export function meetingSetupActions(setup = {}, { now = new Date(), disabled = false } = {}) {
  const scheduleReady = canSchedule(setup);
  const later = isScheduledForLater(setup, now);

  // Arranging something for later → Schedule is the obvious act. Starting it
  // now would ignore the date they just entered.
  const primaryId = later ? SETUP_ACTION.SCHEDULE : SETUP_ACTION.START;

  const all = [
    { id: SETUP_ACTION.SCHEDULE, label: LABEL[SETUP_ACTION.SCHEDULE], enabled: !disabled && scheduleReady },
    { id: SETUP_ACTION.START,    label: LABEL[SETUP_ACTION.START],    enabled: !disabled },
    // Preparation is not a transition, so it is never promoted.
    { id: SETUP_ACTION.PREPARE,  label: LABEL[SETUP_ACTION.PREPARE],  enabled: !disabled },
  ];

  return {
    primary: all.find(a => a.id === primaryId),
    secondary: all.filter(a => a.id !== primaryId),
    // Why this one leads, so the screen can say so rather than leave the manager
    // wondering why the emphasis moved.
    reason: later
      ? "A date and time are set, so this arranges the meeting rather than starting it now."
      : null,
  };
}
