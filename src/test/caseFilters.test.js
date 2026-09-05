import { describe, it, expect } from 'vitest';
import { matchesCaseFilters } from '../lib/caseFilters';

const getCaseStage = cs => cs.stage || "intake";
const noFilters = { type:"", stage:"", status:"", locationId:"", from:"", to:"" };
const cs = { caseType:"misconduct", stage:"investigation", locationId:"loc1", dateReceived:"2026-08-05", ownerId:"user1", priority:"high" };

describe('matchesCaseFilters', () => {
  it('matches everything when no filters are set', () => {
    expect(matchesCaseFilters(cs, noFilters, getCaseStage)).toBe(true);
  });

  it('filters by case type', () => {
    expect(matchesCaseFilters(cs, { ...noFilters, type:"misconduct" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, type:"grievance" }, getCaseStage)).toBe(false);
  });

  it('filters by derived stage, not the raw stage field', () => {
    const legacyCase = { ...cs, stage: null }; // getCaseStage would infer something from meetings in real use
    expect(matchesCaseFilters(cs, { ...noFilters, stage:"investigation" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(legacyCase, { ...noFilters, stage:"investigation" }, getCaseStage)).toBe(false);
  });

  it('filters by status active/closed via getCaseStage', () => {
    const closedCase = { ...cs, stage:"closed" };
    expect(matchesCaseFilters(cs, { ...noFilters, status:"active" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, status:"closed" }, getCaseStage)).toBe(false);
    expect(matchesCaseFilters(closedCase, { ...noFilters, status:"closed" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(closedCase, { ...noFilters, status:"active" }, getCaseStage)).toBe(false);
  });

  it('filters by location', () => {
    expect(matchesCaseFilters(cs, { ...noFilters, locationId:"loc1" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, locationId:"loc2" }, getCaseStage)).toBe(false);
  });

  it('filters by date-opened range, excluding cases with no dateReceived when a range is set', () => {
    expect(matchesCaseFilters(cs, { ...noFilters, from:"2026-08-01" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, from:"2026-08-06" }, getCaseStage)).toBe(false);
    expect(matchesCaseFilters(cs, { ...noFilters, to:"2026-08-10" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, to:"2026-08-01" }, getCaseStage)).toBe(false);
    expect(matchesCaseFilters({ ...cs, dateReceived:null }, { ...noFilters, from:"2026-08-01" }, getCaseStage)).toBe(false);
  });

  it('filters by owner', () => {
    expect(matchesCaseFilters(cs, { ...noFilters, ownerId:"user1" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, ownerId:"user2" }, getCaseStage)).toBe(false);
  });

  it('filters by priority, treating a missing priority as normal', () => {
    expect(matchesCaseFilters(cs, { ...noFilters, priority:"high" }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, priority:"low" }, getCaseStage)).toBe(false);
    expect(matchesCaseFilters({ ...cs, priority:undefined }, { ...noFilters, priority:"normal" }, getCaseStage)).toBe(true);
  });

  it('combines multiple active filters with AND', () => {
    const filters = { ...noFilters, type:"misconduct", locationId:"loc2" };
    expect(matchesCaseFilters(cs, filters, getCaseStage)).toBe(false);
  });
});

// Insights Phase 3 (Emerging Patterns drill-down) — createdFrom/createdTo
// are a deliberately SEPARATE pair from from/to above: bound to
// cases.createdAt (case creation), never to dateReceived. This suite
// exists specifically to prove the two never cross-contaminate, and that
// a case with a null dateReceived (the "+ New meeting" quick-start shape)
// is still correctly included in a creation-date drill-down.
describe('matchesCaseFilters — createdFrom/createdTo (Insights Phase 3)', () => {
  const created = { ...cs, createdAt: '2026-08-05T12:00:00.000Z' };

  it('includes a case created inside the range', () => {
    expect(matchesCaseFilters(created, { ...noFilters, createdFrom: '2026-08-01T00:00:00.000Z', createdTo: '2026-08-10T00:00:00.000Z' }, getCaseStage)).toBe(true);
  });

  it('excludes a case created before the range', () => {
    expect(matchesCaseFilters(created, { ...noFilters, createdFrom: '2026-08-06T00:00:00.000Z' }, getCaseStage)).toBe(false);
  });

  it('excludes a case created after the range', () => {
    expect(matchesCaseFilters(created, { ...noFilters, createdTo: '2026-08-01T00:00:00.000Z' }, getCaseStage)).toBe(false);
  });

  it('includes a case created exactly at the createdFrom boundary (inclusive lower bound)', () => {
    expect(matchesCaseFilters(created, { ...noFilters, createdFrom: '2026-08-05T12:00:00.000Z' }, getCaseStage)).toBe(true);
  });

  it('excludes a case created exactly at the createdTo boundary (exclusive upper bound)', () => {
    expect(matchesCaseFilters(created, { ...noFilters, createdTo: '2026-08-05T12:00:00.000Z' }, getCaseStage)).toBe(false);
  });

  it('excludes a case with a missing createdAt rather than assuming it is in range', () => {
    expect(matchesCaseFilters({ ...cs, createdAt: null }, { ...noFilters, createdFrom: '2026-08-01T00:00:00.000Z' }, getCaseStage)).toBe(false);
  });

  it('does NOT require dateReceived — a "+ New meeting" quick-start case (createdAt set, dateReceived null) is still included', () => {
    const quickStartCase = { caseType: 'misconduct', stage: 'investigation', dateReceived: null, createdAt: '2026-08-05T12:00:00.000Z' };
    expect(matchesCaseFilters(quickStartCase, { ...noFilters, createdFrom: '2026-08-01T00:00:00.000Z', createdTo: '2026-08-10T00:00:00.000Z' }, getCaseStage)).toBe(true);
  });

  it('createdFrom/createdTo do not affect the existing dateReceived-based from/to filter', () => {
    // A case whose dateReceived is OUTSIDE the from/to range must still be
    // excluded by from/to even when createdFrom/createdTo would include it —
    // the two must not be aliased or merged.
    const mismatched = { caseType: 'misconduct', stage: 'investigation', dateReceived: '2026-01-01', createdAt: '2026-08-05T12:00:00.000Z' };
    expect(matchesCaseFilters(mismatched, { ...noFilters, from: '2026-08-01', createdFrom: '2026-08-01T00:00:00.000Z' }, getCaseStage)).toBe(false);
  });

  it('the existing from/to filter still matches on dateReceived, confirmed unchanged by this change', () => {
    expect(matchesCaseFilters(cs, { ...noFilters, from: '2026-08-01' }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(cs, { ...noFilters, from: '2026-08-06' }, getCaseStage)).toBe(false);
  });

  it('composes correctly with an existing type filter (Signal 2 case-type + creation-date drill-down)', () => {
    const grievanceCase = { ...created, caseType: 'grievance' };
    expect(matchesCaseFilters(grievanceCase, { ...noFilters, type: 'grievance', createdFrom: '2026-08-01T00:00:00.000Z', createdTo: '2026-08-10T00:00:00.000Z' }, getCaseStage)).toBe(true);
    expect(matchesCaseFilters(grievanceCase, { ...noFilters, type: 'misconduct', createdFrom: '2026-08-01T00:00:00.000Z', createdTo: '2026-08-10T00:00:00.000Z' }, getCaseStage)).toBe(false);
  });
});
