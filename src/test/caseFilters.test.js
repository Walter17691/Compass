import { describe, it, expect } from 'vitest';
import { matchesCaseFilters } from '../lib/caseFilters';

const getCaseStage = cs => cs.stage || "intake";
const noFilters = { type:"", stage:"", status:"", locationId:"", from:"", to:"" };
const cs = { caseType:"misconduct", stage:"investigation", locationId:"loc1", dateReceived:"2026-08-05" };

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

  it('combines multiple active filters with AND', () => {
    const filters = { ...noFilters, type:"misconduct", locationId:"loc2" };
    expect(matchesCaseFilters(cs, filters, getCaseStage)).toBe(false);
  });
});
