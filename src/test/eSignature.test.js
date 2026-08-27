import { describe, it, expect } from 'vitest';
import { ESIGNATURE_STATUS, isTerminalStatus, computeExpiresAt, isExpired, effectiveStatus, signatureStatusLabel, documentTypeLabel, terminalAt, isPastPublicViewWindow } from '../lib/eSignature.js';

describe('isTerminalStatus (Phase 5, IP27)', () => {
  it('treats signed/acknowledged/declined/expired as terminal', () => {
    expect(isTerminalStatus('signed')).toBe(true);
    expect(isTerminalStatus('acknowledged')).toBe(true);
    expect(isTerminalStatus('declined')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
  });

  it('treats sent/opened as non-terminal', () => {
    expect(isTerminalStatus('sent')).toBe(false);
    expect(isTerminalStatus('opened')).toBe(false);
  });
});

describe('computeExpiresAt / isExpired (Phase 5, IP27)', () => {
  it('computes a 7-day expiry by default', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(computeExpiresAt(from)).toBe('2026-01-08T00:00:00.000Z');
  });

  it('supports a custom expiry window', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(computeExpiresAt(from, 14)).toBe('2026-01-15T00:00:00.000Z');
  });

  it('isExpired is false with no expiresAt at all', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });

  it('isExpired compares against now correctly on both sides', () => {
    const expiresAt = '2026-01-08T00:00:00.000Z';
    expect(isExpired(expiresAt, new Date('2026-01-07T00:00:00.000Z'))).toBe(false);
    expect(isExpired(expiresAt, new Date('2026-01-09T00:00:00.000Z'))).toBe(true);
  });
});

describe('effectiveStatus (Phase 5, IP27)', () => {
  it('returns null for a missing request', () => {
    expect(effectiveStatus(null)).toBeNull();
  });

  it('returns a terminal status as-is, ignoring expiry', () => {
    const request = { status: 'signed', expires_at: '2020-01-01T00:00:00.000Z' };
    expect(effectiveStatus(request, new Date('2026-01-01'))).toBe('signed');
  });

  it('returns "expired" for a non-terminal request past its expiry', () => {
    const request = { status: 'sent', expires_at: '2026-01-01T00:00:00.000Z' };
    expect(effectiveStatus(request, new Date('2026-02-01'))).toBe(ESIGNATURE_STATUS.EXPIRED);
  });

  it('returns the stored status for a non-terminal, non-expired request', () => {
    const request = { status: 'opened', expires_at: '2027-01-01T00:00:00.000Z' };
    expect(effectiveStatus(request, new Date('2026-01-01'))).toBe('opened');
  });

  it('defaults to "sent" when status is missing but not expired', () => {
    expect(effectiveStatus({ expires_at: '2027-01-01T00:00:00.000Z' }, new Date('2026-01-01'))).toBe(ESIGNATURE_STATUS.SENT);
  });
});

describe('signatureStatusLabel / documentTypeLabel (Phase 5, IP27)', () => {
  it('labels every known status', () => {
    expect(signatureStatusLabel('sent')).toBe('Sent');
    expect(signatureStatusLabel('opened')).toBe('Opened');
    expect(signatureStatusLabel('signed')).toBe('Signed');
    expect(signatureStatusLabel('acknowledged')).toBe('Acknowledged');
    expect(signatureStatusLabel('declined')).toBe('Declined');
    expect(signatureStatusLabel('expired')).toBe('Expired');
  });

  it('falls back to the raw value for an unknown status', () => {
    expect(signatureStatusLabel('mystery')).toBe('mystery');
  });

  it('labels every known document type', () => {
    expect(documentTypeLabel('meeting_record')).toBe('Meeting record');
    expect(documentTypeLabel('outcome_letter')).toBe('Outcome letter');
    expect(documentTypeLabel('adjustment_record')).toBe('Agreed adjustments');
    expect(documentTypeLabel('consultation_record')).toBe('Consultation record');
  });

  it('falls back to a generic label for an unknown document type', () => {
    expect(documentTypeLabel('mystery')).toBe('Document');
    expect(documentTypeLabel(undefined)).toBe('Document');
  });
});

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.10, MEDIUM)
describe('terminalAt / isPastPublicViewWindow (Prompt 11 audit, 2.10)', () => {
  it('terminalAt reads signed_at for signed/acknowledged, declined_at for declined, expires_at for expired', () => {
    expect(terminalAt({ status: 'signed', signed_at: 's1' })).toBe('s1');
    expect(terminalAt({ status: 'acknowledged', signed_at: 's2' })).toBe('s2');
    expect(terminalAt({ status: 'declined', declined_at: 'd1' })).toBe('d1');
    expect(terminalAt({ status: 'expired', expires_at: 'e1' })).toBe('e1');
  });

  it('terminalAt returns null for a non-terminal or missing request', () => {
    expect(terminalAt(null)).toBeNull();
    expect(terminalAt({ status: 'sent' })).toBeNull();
    expect(terminalAt({ status: 'opened' })).toBeNull();
  });

  it('isPastPublicViewWindow is false with no terminal timestamp at all', () => {
    expect(isPastPublicViewWindow({ status: 'sent' })).toBe(false);
  });

  it('isPastPublicViewWindow is false within the 30-day window, true beyond it', () => {
    const request = { status: 'signed', signed_at: '2026-01-01T00:00:00.000Z' };
    expect(isPastPublicViewWindow(request, new Date('2026-01-20T00:00:00.000Z'))).toBe(false);
    expect(isPastPublicViewWindow(request, new Date('2026-03-01T00:00:00.000Z'))).toBe(true);
  });
});
