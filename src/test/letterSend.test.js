import { describe, it, expect } from 'vitest';
import { buildSentLetterEvidenceItem, findTaskToCompleteForSentLetter, buildLetterSubject, matchReplyToSentLetters } from '../lib/letterSend.js';

describe('buildLetterSubject (Phase 5, IP14)', () => {
  it('uses the correspondence type label for a known IP12 type', () => {
    expect(buildLetterSubject({ type: 'witness-invitation', employeeName: 'Sarah Jones' })).toBe('Witness invitation - Sarah Jones');
  });

  it('falls back to "<meetingType> Outcome Letter - <employee>" for other types', () => {
    expect(buildLetterSubject({ type: 'outcome', meetingType: 'Disciplinary', employeeName: 'Sarah Jones' })).toBe('Disciplinary Outcome Letter - Sarah Jones');
  });

  it('defaults employee/meetingType when missing', () => {
    expect(buildLetterSubject({ type: 'outcome' })).toBe('Meeting Outcome Letter - Employee');
  });
});

describe('buildSentLetterEvidenceItem (Phase 5, IP13)', () => {
  it('builds an analysable text/plain evidence item tagged as a sent letter', () => {
    const item = buildSentLetterEvidenceItem({ type: 'witness-invitation', subject: 'Witness invitation - Sarah Jones', recipient: 'sarah@company.com', body: 'Dear Sarah...', addedBy: 'Jo' });
    expect(item).toMatchObject({ name: 'Sent: Witness invitation', type: 'text/plain', addedBy: 'Jo', source: 'sent_letter', subject: 'Witness invitation - Sarah Jones', recipient: 'sarah@company.com' });
    expect(item.record).toContain('Sent to: sarah@company.com');
    expect(item.record).toContain('Dear Sarah...');
    expect(item.dataUrl).toMatch(/^data:text\/plain;base64,/);
    expect(item.size).toBe(new Blob([item.record]).size);
  });

  it('falls back to a generic label for an unknown type', () => {
    const item = buildSentLetterEvidenceItem({ type: 'outcome', recipient: 'x@y.com', body: 'text' });
    expect(item.name).toBe('Sent: Letter');
  });

  it('defaults addedBy to "HR Manager" when omitted', () => {
    const item = buildSentLetterEvidenceItem({ type: 'evidence-request', recipient: 'x@y.com', body: 'text' });
    expect(item.addedBy).toBe('HR Manager');
  });

  // Phase 5, IP27/IP31 — a letter sent for acknowledgement (App.jsx's
  // sendLetterForAcknowledgement) carries a real signId; a plain "Send
  // from Compass" email (sendLetterCoordinated) never does.
  it('stamps signId/signStatus when a letter was sent for acknowledgement', () => {
    const item = buildSentLetterEvidenceItem({ type: 'outcome', recipient: 'x@y.com', body: 'text', signId: 'sign-1' });
    expect(item.signId).toBe('sign-1');
    expect(item.signStatus).toBe('sent');
  });

  it('omits signId/signStatus entirely for a plain email send', () => {
    const item = buildSentLetterEvidenceItem({ type: 'outcome', recipient: 'x@y.com', body: 'text' });
    expect(item.signId).toBeUndefined();
    expect(item.signStatus).toBeUndefined();
  });
});

describe('findTaskToCompleteForSentLetter (Phase 5, IP13)', () => {
  const caseTasks = [
    { id: 't1', caseId: 'c1', name: 'Evidence request', status: 'open' },
    { id: 't2', caseId: 'c1', name: 'evidence request', status: 'done' },
    { id: 't3', caseId: 'c2', name: 'Evidence request', status: 'open' },
    { id: 't4', caseId: 'c1', name: 'Chase something unrelated', status: 'open' },
  ];

  it('finds an open task matching the correspondence type label, case-insensitively', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c1', 'evidence-request')).toMatchObject({ id: 't1' });
  });

  it('ignores a matching task that is already done', () => {
    const tasks = caseTasks.filter(t => t.id !== 't1');
    expect(findTaskToCompleteForSentLetter(tasks, 'c1', 'evidence-request')).toBeNull();
  });

  it('ignores a matching task belonging to a different case', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c3', 'evidence-request')).toBeNull();
  });

  it('returns null when the letter type has no known label', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c1', 'outcome')).toBeNull();
  });

  it('returns null when nothing matches by name', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c1', 'oh-consent-request')).toBeNull();
  });
});

describe('matchReplyToSentLetters (Phase 5, IP14)', () => {
  const sentItems = [
    { name: 'Sent: Witness invitation', subject: 'Witness invitation - Sarah Jones', recipient: 'sarah@company.com', date: '01/08/2026' },
    { name: 'Sent: Evidence request', subject: 'Evidence request - Sarah Jones', recipient: 'sarah@company.com', date: '05/08/2026' },
  ];

  it('matches a reply whose subject echoes the sent subject and sender matches the recipient', () => {
    const match = matchReplyToSentLetters({ subject: 'RE: Witness invitation - Sarah Jones', from: 'sarah@company.com' }, sentItems);
    expect(match).toMatchObject({ name: 'Sent: Witness invitation' });
  });

  it('strips repeated Re:/Fwd: prefixes', () => {
    const match = matchReplyToSentLetters({ subject: 'Fwd: Re: Re: Evidence request - Sarah Jones', from: 'sarah@company.com' }, sentItems);
    expect(match).toMatchObject({ name: 'Sent: Evidence request' });
  });

  it('does not match when the sender is someone other than who the letter was sent to', () => {
    const match = matchReplyToSentLetters({ subject: 'RE: Witness invitation - Sarah Jones', from: 'someone.else@company.com' }, sentItems);
    expect(match).toBeNull();
  });

  it('does not match an unrelated subject', () => {
    const match = matchReplyToSentLetters({ subject: 'RE: Lunch on Friday?', from: 'sarah@company.com' }, sentItems);
    expect(match).toBeNull();
  });

  it('returns the most recently sent match when more than one letter was sent to the same person', () => {
    const items = [
      { name: 'Sent: Evidence request (first)', subject: 'Evidence request - Sarah Jones', recipient: 'sarah@company.com', date: '01/08/2026' },
      { name: 'Sent: Evidence request (second)', subject: 'Evidence request - Sarah Jones', recipient: 'sarah@company.com', date: '10/08/2026' },
    ];
    const match = matchReplyToSentLetters({ subject: 'RE: Evidence request - Sarah Jones', from: 'sarah@company.com' }, items);
    expect(match.name).toBe('Sent: Evidence request (second)');
  });

  it('handles missing message fields or an empty sent-items list gracefully', () => {
    expect(matchReplyToSentLetters({}, sentItems)).toBeNull();
    expect(matchReplyToSentLetters(null, sentItems)).toBeNull();
    expect(matchReplyToSentLetters({ subject: 'RE: Witness invitation - Sarah Jones', from: 'sarah@company.com' }, [])).toBeNull();
  });
});
