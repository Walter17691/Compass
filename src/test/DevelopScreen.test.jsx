import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevelopScreen } from '../screens/DevelopScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the case-info fields (including the
// date field, which uses the shared DateInput component that didn't
// forward id at all), the per-question self/manager assessment
// textareas, the agreed-outcome select, the development-plan textarea,
// and the per-objective notes field all had either no htmlFor/id
// association or no label at all. Had no test coverage at all before
// this.
const noop = () => {};
const config = {
  selfAssessmentPrompts: ['How do you feel your first weeks have gone?'],
  managerPrompts: ['Overall performance against expectations'],
  objectives: [{ label: 'Role competency', desc: 'Meets the core requirements of the role' }],
  outcomeOptions: ['Pass — probation complete', 'Extend — additional review'],
};
const devSession = {
  type: 'Probation Review',
  config,
  caseInfo: { employee: '', date: '', manager: '', email: '', role: '', department: '', reviewPeriod: '' },
  selfAssessment: {},
  managerAssessment: {},
  objectives: [{ label: 'Role competency', desc: 'Meets the core requirements of the role', rating: 3, progress: '', note: '' }],
  outcome: '', rating: '', devPlan: '', aiSummary: '',
};

const baseProps = {
  devSession,
  setDevSession: noop,
  devStep: 'self',
  setDevStep: noop,
  devAiProcessing: false,
  generateSmartObjectives: noop,
  generateDevSummary: noop,
  devSummary: '',
  saveDevMeetingToCase: noop,
  setScreen: noop,
  generateDevLetter: noop,
  devLetter: '',
};

describe('DevelopScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the case-info fields, including the DateInput-backed meeting date', () => {
    render(<DevelopScreen {...baseProps} />);
    expect(screen.getByLabelText(/Employee name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(screen.getByLabelText('Meeting date')).toBeInTheDocument();
  });

  it('labels each self-assessment question textarea', () => {
    render(<DevelopScreen {...baseProps} />);
    expect(screen.getByLabelText(/How do you feel your first weeks have gone/)).toBeInTheDocument();
  });

  it('labels each manager-assessment question, the outcome select, and the development plan', () => {
    render(<DevelopScreen {...baseProps} devStep="manager" />);
    expect(screen.getByLabelText(/Overall performance against expectations/)).toBeInTheDocument();
    expect(screen.getByLabelText('Agreed outcome')).toBeInTheDocument();
    expect(screen.getByLabelText('Development plan / actions')).toBeInTheDocument();
  });

  it('gives each objective note field an aria-label naming its objective', () => {
    render(<DevelopScreen {...baseProps} devStep="manager" />);
    expect(screen.getByLabelText('Notes on progress for Role competency')).toBeInTheDocument();
  });
});
