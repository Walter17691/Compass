import { describe, it, expect } from 'vitest';
import { classifyCaseResolutionType, computeInformalFormalSplit } from '../lib/orgIntelligence';

describe('classifyCaseResolutionType', () => {
  it('classifies a case with only Informal / 1-1 meetings as informal', () => {
    const cs = { meetings: [{ type: 'Informal / 1-1' }, { type: 'Informal / 1-1' }] };
    expect(classifyCaseResolutionType(cs)).toBe('informal');
  });

  it('classifies a case with any non-informal meeting as formal', () => {
    const cs = { meetings: [{ type: 'Informal / 1-1' }, { type: 'Investigation' }] };
    expect(classifyCaseResolutionType(cs)).toBe('formal');
  });

  it('returns null for a case with no meetings yet', () => {
    expect(classifyCaseResolutionType({ meetings: [] })).toBeNull();
    expect(classifyCaseResolutionType({})).toBeNull();
  });
});

describe('computeInformalFormalSplit', () => {
  it('tallies informal and formal cases, excluding cases with no meetings', () => {
    const cases = [
      { meetings: [{ type: 'Informal / 1-1' }] },
      { meetings: [{ type: 'Investigation' }] },
      { meetings: [{ type: 'Disciplinary' }] },
      { meetings: [] },
    ];
    expect(computeInformalFormalSplit(cases)).toEqual({ informal: 1, formal: 2 });
  });

  it('returns zero counts for no cases', () => {
    expect(computeInformalFormalSplit([])).toEqual({ informal: 0, formal: 0 });
  });
});
