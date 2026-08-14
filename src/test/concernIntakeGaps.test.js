import { describe, it, expect } from 'vitest';
import { computeConcernIntakeGaps } from '../lib/concernIntakeGaps.js';

describe('computeConcernIntakeGaps', () => {
  it('returns nothing for a blank description — no gap-hunting on an empty form', () => {
    expect(computeConcernIntakeGaps({ description: '' })).toEqual([]);
    expect(computeConcernIntakeGaps({})).toEqual([]);
  });

  it('flags evidence mentioned in the description with no evidence description or files given', () => {
    const gaps = computeConcernIntakeGaps({ description: 'There is CCTV footage of the incident in the corridor near the loading bay.' });
    expect(gaps).toContain('You mentioned evidence in what happened — what kind is it, and where can HR find it?');
  });

  it('does not flag evidence once an evidence description has been given', () => {
    const gaps = computeConcernIntakeGaps({ description: 'There is CCTV footage of the incident.', evidenceDescription: 'Corridor camera near the loading bay.' });
    expect(gaps).not.toContain('You mentioned evidence in what happened — what kind is it, and where can HR find it?');
  });

  it('does not flag evidence once at least one file has been attached', () => {
    const gaps = computeConcernIntakeGaps({ description: 'There is CCTV footage of the incident.', evidenceFiles: [{ name: 'clip.mp4' }] });
    expect(gaps).not.toContain('You mentioned evidence in what happened — what kind is it, and where can HR find it?');
  });

  it('flags a witness mentioned in the description with no witness names given', () => {
    const gaps = computeConcernIntakeGaps({ description: 'Two colleagues witnessed the argument outside the warehouse this morning.' });
    expect(gaps).toContain('You mentioned someone else may have seen or heard this — who, so HR knows who else to ask?');
  });

  it('does not flag witnesses once names have been given', () => {
    const gaps = computeConcernIntakeGaps({ description: 'A colleague witnessed the argument.', witnesses: 'Priya Shah' });
    expect(gaps).not.toContain('You mentioned someone else may have seen or heard this — who, so HR knows who else to ask?');
  });

  it('flags a description under the minimum length', () => {
    const gaps = computeConcernIntakeGaps({ description: 'He was rude to me.' });
    expect(gaps).toContain('A little more detail would help HR review this — when did it happen, and what exactly was said or done?');
  });

  it('does not flag length once the description is long enough', () => {
    const gaps = computeConcernIntakeGaps({ description: 'On 5 August, during the afternoon shift, the employee raised their voice and swore at me in front of the team.' });
    expect(gaps).not.toContain('A little more detail would help HR review this — when did it happen, and what exactly was said or done?');
  });

  it('can return more than one gap at once', () => {
    const gaps = computeConcernIntakeGaps({ description: 'Saw email.' });
    expect(gaps.length).toBeGreaterThanOrEqual(2);
  });
});
