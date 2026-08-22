import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RedundancyScreen } from '../screens/RedundancyScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the collective-consultation fields had
// visual labels with no htmlFor/id; the per-criterion, per-employee
// consultation-notes, and per-employee redundancy-pay fields had either no
// label at all or one not scoped to the right repeated row. Had no test
// coverage at all before this.
const noop = () => {};

const baseProps = {
  setActiveRedundancy: noop,
  setRedundancyStep: noop,
  redundancyAiOutput: '',
  setRedundancyAiOutput: noop,
  redundancyCases: [],
  createRedundancyCase: noop,
  updateRedundancyCase: noop,
  scoreEmployee: noop,
  generateRedundancyLetter: noop,
  isMobile: false,
  getRedundancyAiAdvice: noop,
  redundancyAiProcessing: false,
  startOffboarding: noop,
  promptDialog: async () => null,
};

const collectiveRedundancy = {
  id: 'r1',
  type: 'collective',
  reason: 'Site closure',
  poolDescription: 'All Leeds warehouse staff',
  createdAt: new Date().toISOString(),
  createdBy: 'Alex',
  collectiveInfo: {},
  selectionCriteria: [{ id: 'c1', criterion: 'Skills', weight: 50, description: '' }],
  atRiskEmployees: [{ id: 'e1', name: 'Sam Employee', selected: true, consultationNotes: '', redundancyPay: '' }],
};

describe('RedundancyScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the collective-consultation setup fields', () => {
    render(<RedundancyScreen {...baseProps} activeRedundancy={collectiveRedundancy} redundancyStep="setup" />);
    expect(screen.getByLabelText('Number of redundancies')).toBeInTheDocument();
    expect(screen.getByLabelText('HR1 form submitted to BEIS')).toBeInTheDocument();
    expect(screen.getByLabelText('Employee representatives elected')).toBeInTheDocument();
    expect(screen.getByLabelText('Consultation start date')).toBeInTheDocument();
  });

  it('labels each selection criterion\'s name, weight, and description fields', () => {
    render(<RedundancyScreen {...baseProps} activeRedundancy={collectiveRedundancy} redundancyStep="pool" />);
    expect(screen.getByLabelText('Criterion 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Criterion 1 weight percentage')).toBeInTheDocument();
    expect(screen.getByLabelText('Criterion 1 description')).toBeInTheDocument();
  });

  it('labels the per-employee consultation notes field', () => {
    render(<RedundancyScreen {...baseProps} activeRedundancy={collectiveRedundancy} redundancyStep="consultation" />);
    expect(screen.getByLabelText('Consultation notes for Sam Employee')).toBeInTheDocument();
  });

  it('labels the per-employee redundancy pay field', () => {
    render(<RedundancyScreen {...baseProps} activeRedundancy={collectiveRedundancy} redundancyStep="outcome" />);
    expect(screen.getByLabelText('Statutory redundancy pay')).toBeInTheDocument();
  });
});
