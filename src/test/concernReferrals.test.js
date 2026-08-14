import { describe, it, expect } from 'vitest';
import {
  addConcernReferral, updateConcernReferral, setReferralStatus,
  openReferrals, referralStatusMeta, REFERRAL_STATUSES,
} from '../lib/concernReferrals';

describe('addConcernReferral', () => {
  it('adds a referral with the structured fields and a "new" status', () => {
    const result = addConcernReferral([], {
      employeeName: 'Jamie Lee', description: 'Repeated lateness this month.',
      concernType: 'attendance', discussedWithEmployee: true, submittedBy: 'user-1', submittedByName: 'Sam Manager',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      employeeName: 'Jamie Lee', description: 'Repeated lateness this month.',
      concernType: 'attendance', discussedWithEmployee: true, involvesSafetyOrWelfare: false,
      mayNeedFormalProcess: false, submittedBy: 'user-1', submittedByName: 'Sam Manager', status: 'new',
    });
    expect(result[0].id).toBeTruthy();
  });

  it('captures witnesses, the new immediateSafetyConcern question, and evidence description/files (Phase 4, MP4)', () => {
    const result = addConcernReferral([], {
      employeeName: 'Jamie Lee', description: 'Repeated lateness this month.',
      witnesses: 'Priya Shah, Tom Norton', immediateSafetyConcern: true,
      evidenceDescription: 'CCTV from the loading bay camera', evidenceFiles: [{ name: 'clip.mp4' }],
    });
    expect(result[0]).toMatchObject({
      witnesses: 'Priya Shah, Tom Norton', immediateSafetyConcern: true,
      evidenceDescription: 'CCTV from the loading bay camera', evidenceFiles: [{ name: 'clip.mp4' }],
    });
  });

  it('trims witnesses/evidenceDescription and defaults evidenceFiles to an empty array', () => {
    const result = addConcernReferral([], { employeeName: 'Jamie Lee', description: 'x', witnesses: '  Priya Shah  ', evidenceDescription: '  a note  ' });
    expect(result[0].witnesses).toBe('Priya Shah');
    expect(result[0].evidenceDescription).toBe('a note');
    expect(result[0].evidenceFiles).toEqual([]);
  });

  it('defaults concernType to other when not supplied', () => {
    const result = addConcernReferral([], { employeeName: 'Jamie Lee', description: 'x' });
    expect(result[0].concernType).toBe('other');
  });

  it('ignores a referral with a blank employee name', () => {
    expect(addConcernReferral([], { employeeName: '  ', description: 'x' })).toEqual([]);
  });

  it('ignores a referral with a blank description', () => {
    expect(addConcernReferral([], { employeeName: 'Jamie Lee', description: '   ' })).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [];
    addConcernReferral(original, { employeeName: 'Jamie Lee', description: 'x' });
    expect(original).toEqual([]);
  });
});

describe('updateConcernReferral / setReferralStatus', () => {
  const base = [{ id: 'ref1', employeeName: 'Jamie Lee', status: 'new' }];

  it('merges fields onto the matching referral only', () => {
    const result = updateConcernReferral(base, 'ref1', { hrNotes: 'Spoke to manager' });
    expect(result[0].hrNotes).toBe('Spoke to manager');
  });

  it('sets a valid status via the dedicated helper', () => {
    const result = setReferralStatus(base, 'ref1', 'handled_informally');
    expect(result[0].status).toBe('handled_informally');
  });

  it('ignores an unrecognised status', () => {
    const result = setReferralStatus(base, 'ref1', 'bogus_status');
    expect(result[0].status).toBe('new');
  });

  it('merges extra fields alongside the status change (e.g. linking a case)', () => {
    const result = setReferralStatus(base, 'ref1', 'case_opened', { linkedCaseId: 'case-99' });
    expect(result[0]).toMatchObject({ status: 'case_opened', linkedCaseId: 'case-99' });
  });

  it('leaves other referrals untouched', () => {
    const two = [...base, { id: 'ref2', status: 'new' }];
    const result = setReferralStatus(two, 'ref1', 'closed');
    expect(result[1].status).toBe('new');
  });
});

describe('openReferrals', () => {
  it('returns only referrals still in the "new" status', () => {
    const referrals = [
      { id: 'ref1', status: 'new' },
      { id: 'ref2', status: 'closed' },
      { id: 'ref3', status: 'more_info_requested' },
    ];
    expect(openReferrals(referrals).map(r => r.id)).toEqual(['ref1']);
  });
});

describe('referralStatusMeta', () => {
  it('returns metadata for a known status', () => {
    expect(referralStatusMeta('case_opened').label).toBe('Formal case opened');
  });

  it('falls back to the first status for an unknown value', () => {
    expect(referralStatusMeta('bogus').id).toBe(REFERRAL_STATUSES[0].id);
  });
});
