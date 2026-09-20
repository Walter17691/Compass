import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isPrepPackComplete, missingPrepSections, REQUIRED_PREP_SECTIONS } from '../lib/prepPackCompletion.js';

// Issue C (Human UAT) — the live prep pack ran out of output budget and
// stopped mid-bullet at "· Right to", with Risk Flags never generated, yet
// the UI showed PREP PACK READY and enabled Start meeting. An incomplete
// pack must fail closed.
const FULL_PACK = REQUIRED_PREP_SECTIONS.map(s => `## ${s}\n- something\n`).join('\n');
// The shape of the real truncated pack: cut off part-way through, so the
// trailing sections never appeared at all.
const TRUNCATED_PACK = FULL_PACK.split('## Closing Points')[0] + '## Closing Points\n- Right to';

describe('prep pack completion — provider signal is authoritative (C2, C3)', () => {
  it('C3a. a complete pack with a clean provider completion is ready', () => {
    expect(isPrepPackComplete({ text: FULL_PACK, truncated: false })).toBe(true);
  });

  it('C3b. the provider truncation signal alone fails the pack, even if all sections are present', () => {
    expect(isPrepPackComplete({ text: FULL_PACK, truncated: true })).toBe(false);
  });

  it('C3c. the provider signal is PRIMARY — truncated:true overrides a structurally perfect pack', () => {
    expect(missingPrepSections(FULL_PACK)).toEqual([]);
    expect(isPrepPackComplete({ text: FULL_PACK, truncated: true })).toBe(false);
  });

  it('C3d. the structural check is a secondary net when no completion event arrived', () => {
    expect(isPrepPackComplete({ text: TRUNCATED_PACK, truncated: false })).toBe(false);
    expect(missingPrepSections(TRUNCATED_PACK)).toContain('Risk Flags');
    expect(missingPrepSections(TRUNCATED_PACK)).toContain('Legal Checklist');
  });

  it('C3e. requires exactly the nine prompt sections, in the prompt order', () => {
    expect([...REQUIRED_PREP_SECTIONS]).toEqual([
      'Objectives', 'Agenda', 'Opening Script', 'Evidence to Explore', 'Unanswered Issues',
      'Potential Inconsistencies', 'Closing Points', 'Legal Checklist', 'Risk Flags',
    ]);
  });

  it('C3f. does NOT reintroduce a narrative "Key Questions" section', () => {
    expect(REQUIRED_PREP_SECTIONS).not.toContain('Key Questions');
    const withoutKeyQuestions = FULL_PACK;
    expect(isPrepPackComplete({ text: withoutKeyQuestions, truncated: false })).toBe(true);
  });

  it('C3g. tolerates heading case and trailing punctuation rather than failing a good pack', () => {
    const noisy = REQUIRED_PREP_SECTIONS.map(s => `## ${s.toUpperCase()}:\n- x\n`).join('\n');
    expect(isPrepPackComplete({ text: noisy, truncated: false })).toBe(true);
  });

  it('C3h. an empty or missing narrative is never treated as ready', () => {
    expect(isPrepPackComplete({ text: '', truncated: false })).toBe(false);
    expect(isPrepPackComplete({ text: null, truncated: false })).toBe(false);
    expect(isPrepPackComplete({ text: undefined, truncated: undefined })).toBe(false);
  });

  it('C3i. checks section PRESENCE only — it is not a content validator', () => {
    // Sections with no bullets at all still pass: judging the quality of the
    // model's prose is explicitly not this function's job.
    const bare = REQUIRED_PREP_SECTIONS.map(s => `## ${s}`).join('\n');
    expect(isPrepPackComplete({ text: bare, truncated: false })).toBe(true);
  });

  it('C3j. "None identified from the supplied case context." is an acceptable section body', () => {
    const withNones = FULL_PACK
      .replace('## Legal Checklist\n- something', '## Legal Checklist\nNone identified from the supplied case context.')
      .replace('## Risk Flags\n- something', '## Risk Flags\nNone identified from the supplied case context.');
    expect(isPrepPackComplete({ text: withNones, truncated: false })).toBe(true);
  });

  it('C3k. the completion helpers are pure', () => {
    const text = FULL_PACK;
    const before = REQUIRED_PREP_SECTIONS.join('|');
    missingPrepSections(text);
    isPrepPackComplete({ text, truncated: true });
    expect(REQUIRED_PREP_SECTIONS.join('|')).toBe(before);
    expect(Object.isFrozen(REQUIRED_PREP_SECTIONS)).toBe(true);
  });
});

describe('handlePrepare fails closed on an incomplete pack (C2)', () => {
  const app = readFileSync('src/App.jsx', 'utf8');

  it('C2a. passes a completion callback to the narrative streamClaude call', () => {
    expect(app).toContain('({ truncated })=>{ prepTruncated = truncated; }');
  });

  it('C2b. keeps the output budget at 2048 — the fix is not "more tokens"', () => {
    const call = app.slice(app.indexOf('let prepTruncated'), app.indexOf('generatePrepQuestions(carriedContext'));
    expect(call).toContain('2048');
    expect(call).not.toMatch(/\b(3400|4096|8192)\b/);
  });

  it('C2c. clears the narrative and the questions rather than showing a partial pack', () => {
    const guard = app.slice(app.indexOf('if(!isPrepPackComplete'), app.indexOf('} catch(e) {', app.indexOf('if(!isPrepPackComplete')));
    expect(guard).toContain('setPrepNotes("")');
    expect(guard).toContain('setPrepQuestions([])');
  });

  it('C2d. shows a plain regenerate message and never a raw provider error', () => {
    const guard = app.slice(app.indexOf('if(!isPrepPackComplete'), app.indexOf('} catch(e) {', app.indexOf('if(!isPrepPackComplete')));
    expect(guard).toContain("The prep pack didn't finish generating. Please regenerate it.");
    expect(guard).not.toMatch(/stopReason|max_tokens|API |status/);
  });

  it('C2e. the failure path persists nothing, mutates no case and writes no audit event', () => {
    const guard = app.slice(app.indexOf('if(!isPrepPackComplete'), app.indexOf('} catch(e) {', app.indexOf('if(!isPrepPackComplete')));
    expect(guard).not.toMatch(/supabase|insert\(|update\(|logAudit|auditEvent|saveMeeting/i);
  });
});

describe('PrepScreen cannot present an incomplete pack as ready (C2)', () => {
  const screen = readFileSync('src/screens/PrepScreen.jsx', 'utf8');

  it('C2f. PREP PACK READY and Start meeting are both gated on prepNotes being present', () => {
    const block = screen.slice(screen.indexOf('{prepNotes&&('));
    const end = block.indexOf('Start meeting');
    expect(end).toBeGreaterThan(-1);
    expect(block.slice(0, end)).toContain('Prep pack ready');
    // No independent "ready" flag that could drift out of step with the text.
    expect(screen).not.toMatch(/prepPackReady|isPrepReady/);
  });
});

describe('a failed prep generation also fails closed (C2)', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  const catchBlock = app.slice(app.indexOf('console.error("Prep pack generation failed:"'), app.indexOf('setAiProcessing(false)', app.indexOf('console.error("Prep pack generation failed:"')));

  it('C2g. clears partially streamed text when generation throws mid-stream', () => {
    expect(catchBlock).toContain('setPrepNotes("")');
    expect(catchBlock).toContain('setPrepQuestions([])');
  });

  it('C2h. still shows a safe message, never the raw provider error', () => {
    expect(catchBlock).toContain('Compass AI is temporarily unavailable');
    expect(catchBlock).not.toMatch(/e\.message|String\(e\)|\$\{e\}/);
  });
});
