import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  meetingSetupActions, isScheduledForLater, canSchedule, SETUP_ACTION,
} from '../lib/meetingSetupAction.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C1 — one obvious action in meeting setup.
//
// Traced before deciding anything: Schedule and Start are real lifecycle
// transitions ("scheduled" / "in_progress"); Prepare opens PrepScreen and
// changes no status at all, because preparation is metadata. That settles the
// hierarchy without inventing one.
//
// NOTE — this deliberately differs from the brief's example mapping. The brief
// suggested "unscheduled meeting → Schedule meeting". But with no date or time
// entered, Schedule is impossible: the screen's own rule requires both, and the
// control is disabled. Leading with an action the manager cannot take would be
// worse than the problem being fixed. So an empty form leads with Start, and
// Schedule takes the lead the moment a FUTURE date and time exist — which is
// the point at which starting now would contradict what they just typed.
// ─────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-02T10:00:00');

describe('Wave C1 — which setup action leads', () => {
  it('an empty form leads with Start, because Schedule is not yet possible', () => {
    const a = meetingSetupActions({}, { now: NOW });
    expect(a.primary.id).toBe(SETUP_ACTION.START);
    expect(a.secondary.find(s => s.id === SETUP_ACTION.SCHEDULE).enabled).toBe(false);
  });

  it('a FUTURE date and time makes Schedule the obvious act', () => {
    const a = meetingSetupActions({ date: '2026-10-09', time: '14:00' }, { now: NOW });
    expect(a.primary.id).toBe(SETUP_ACTION.SCHEDULE);
    expect(a.reason).toMatch(/arranges the meeting rather than starting it now/);
  });

  it('a past date and time does not — that is a meeting being recorded now', () => {
    const a = meetingSetupActions({ date: '2026-09-01', time: '14:00' }, { now: NOW });
    expect(a.primary.id).toBe(SETUP_ACTION.START);
  });

  it('a half-filled schedule never leads, because it cannot be acted on', () => {
    expect(meetingSetupActions({ date: '2026-10-09' }, { now: NOW }).primary.id).toBe(SETUP_ACTION.START);
    expect(meetingSetupActions({ time: '14:00' }, { now: NOW }).primary.id).toBe(SETUP_ACTION.START);
  });

  it('Prepare is NEVER the primary — it is not a lifecycle transition', () => {
    const cases = [{}, { date: '2026-10-09', time: '14:00' }, { date: '2026-09-01', time: '09:00' }];
    cases.forEach(c => expect(meetingSetupActions(c, { now: NOW }).primary.id).not.toBe(SETUP_ACTION.PREPARE));
  });

  it('every action survives — flexibility is subordinated, not removed', () => {
    const a = meetingSetupActions({ date: '2026-10-09', time: '14:00' }, { now: NOW });
    const ids = [a.primary.id, ...a.secondary.map(s => s.id)].sort();
    expect(ids).toEqual([SETUP_ACTION.PREPARE, SETUP_ACTION.SCHEDULE, SETUP_ACTION.START].sort());
  });

  it('there is exactly ONE primary, always', () => {
    [{}, { date: '2026-10-09', time: '14:00' }, { date: '2026-01-01', time: '00:00' }].forEach(c => {
      const a = meetingSetupActions(c, { now: NOW });
      expect(a.primary).toBeTruthy();
      expect(a.secondary).toHaveLength(2);
      expect(a.secondary.map(s => s.id)).not.toContain(a.primary.id);
    });
  });

  it('disabling the form disables every action without changing which leads', () => {
    const a = meetingSetupActions({ date: '2026-10-09', time: '14:00' }, { now: NOW, disabled: true });
    expect(a.primary.id).toBe(SETUP_ACTION.SCHEDULE);
    expect(a.primary.enabled).toBe(false);
    expect(a.secondary.every(s => !s.enabled)).toBe(true);
  });

  it('an unparseable date is treated as "not later", never guessed', () => {
    expect(isScheduledForLater({ date: 'not-a-date', time: '14:00' }, NOW)).toBe(false);
    expect(canSchedule({ date: 'not-a-date', time: '14:00' })).toBe(true);  // the screen's own rule
  });
});

describe('Wave C1 — the screen uses it, and starts nothing by itself', () => {
  const src = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');

  it('the setup screen derives its emphasis from the model', () => {
    expect(src).toContain('meetingSetupActions(meetingSetup, { disabled })');
    expect(src).toContain('actionStyle(SETUP_ACTION.SCHEDULE');
    expect(src).toContain('actionStyle(SETUP_ACTION.PREPARE');
    expect(src).toContain('actionStyle(SETUP_ACTION.START');
  });

  it('the lifecycle handlers are untouched — only styling moved', () => {
    // beginMeeting and the schedule path must still be called exactly as before.
    expect(src).toContain('await beginMeeting({');
    expect(src).toContain('setScreen(SCREENS.PREP)');
    expect(src).toContain('meetingId: null');   // still an explicit COLD start
  });

  it('the model itself transitions nothing', () => {
    // CODE, not prose: the module's own documentation names beginMeeting and
    // in_progress while explaining what it deliberately does NOT do.
    const code = readFileSync('src/lib/meetingSetupAction.js', 'utf8')
      .split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n');
    ['beginMeeting', 'supabase', 'insert(', 'update(', 'setScreen', 'in_progress']
      .forEach(bad => expect(code, bad).not.toContain(bad));
  });
});
