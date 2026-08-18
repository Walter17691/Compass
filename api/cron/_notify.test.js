import { describe, it, expect } from 'vitest';
import { payloadFor, testPayloadFor } from './_notify.js';

// Integrations & Workflow Automation (Phase 5, IP26, §16) — the whole
// point of this redesign is that nothing employee- or case-specific ever
// reaches a shared Slack/Teams channel, only a count. These tests assert
// the negative as much as the positive: no name, no deadline label,
// anywhere in the payload.
describe('payloadFor (Phase 5, IP26)', () => {
  it('slack payload carries only a count, never employee names or deadline labels', () => {
    const payload = payloadFor('slack', 3);
    const serialized = JSON.stringify(payload);
    expect(serialized).toContain('3 action');
    expect(serialized).not.toContain('Sarah Jones');
    expect(serialized).not.toContain('overdue)');
    expect(payload.text).toBe('Compass HR: 3 actions need attention');
  });

  it('teams payload carries only a count, never employee names or deadline labels', () => {
    const payload = payloadFor('teams', 1);
    expect(payload.title).toBe('1 action needs attention');
    expect(payload.text).not.toMatch(/\*\*/); // no markdown employee-name bolding left over from the old per-item lines
  });

  it('singular/plural wording is correct at the boundary', () => {
    expect(payloadFor('slack', 1).text).toBe('Compass HR: 1 action needs attention');
    expect(payloadFor('slack', 2).text).toBe('Compass HR: 2 actions need attention');
  });

  it('always links back to Compass rather than including any detail inline', () => {
    const slack = JSON.stringify(payloadFor('slack', 5));
    const teams = JSON.stringify(payloadFor('teams', 5));
    expect(slack).toContain('Open Compass');
    expect(teams).toContain('Open Compass');
  });
});

describe('testPayloadFor (Phase 5, IP26)', () => {
  it('sends a clearly-labelled test message rather than a fake count', () => {
    expect(JSON.stringify(testPayloadFor('slack'))).toContain('Test message');
    expect(JSON.stringify(testPayloadFor('teams'))).toContain('Test message');
  });

  it('the test payload never carries fake employee data', () => {
    expect(JSON.stringify(testPayloadFor('slack'))).not.toContain('employeeName');
  });
});
