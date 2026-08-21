import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CasesScreen } from '../screens/CasesScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the six filter selects had no
// accessible name at all (only placeholder-style option text like "All
// types"); the per-row bulk-select checkbox had none either. Had no
// test coverage at all before this.
const noop = () => {};
const cases = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open', ownerId: 'u1' }];

describe('CasesScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels every filter select', () => {
    render(<CasesScreen cases={cases} locations={[{ id: 'l1', name: 'Manchester' }]} orgMembers={[{ user_id: 'u1', name: 'Alex' }]} setIntake={noop} setScreen={noop} getCaseStage={()=>"open"} setActiveCaseId={noop} setActiveCaseStage={noop} getNextStep={()=>null} getProceedingTitle={cs=>cs.employeeName} getCaseStatus={()=>"active"} saveCases={noop} confirmDialog={noop} showToast={noop} />);
    expect(screen.getByLabelText('Filter by case type')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by location')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument();
  });

  it('labels the per-case bulk-select checkbox with the case\'s own name', () => {
    render(<CasesScreen cases={cases} locations={[]} orgMembers={[]} setIntake={noop} setScreen={noop} getCaseStage={()=>"open"} setActiveCaseId={noop} setActiveCaseStage={noop} getNextStep={()=>null} getProceedingTitle={cs=>cs.employeeName} getCaseStatus={()=>"active"} saveCases={noop} confirmDialog={noop} showToast={noop} />);
    expect(screen.getByLabelText('Select Sam Employee')).toBeInTheDocument();
  });
});
