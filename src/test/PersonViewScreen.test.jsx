import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonViewScreen } from '../screens/PersonViewScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the job title, start date, and
// location fields on the employee-details edit form had visual labels
// with no htmlFor/id association. Had no test coverage at all before
// this.
const noop = () => {};

const baseProps = {
  activePerson: 'Sam Employee',
  cases: [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open', meetings: [] }],
  setScreen: noop,
  setMeetingSetup: noop,
  getEmployeeRecord: () => ({ jobTitle: '', startDate: '', location: '' }),
  editingEmployeeRecord: null,
  setEditingEmployeeRecord: noop,
  editJobTitle: '', setEditJobTitle: noop,
  editStartDate: '', setEditStartDate: noop,
  editLocation: '', setEditLocation: noop,
  locations: [{ id: 'l1', name: 'Manchester' }],
  upsertEmployeeRecord: noop,
  deleteEmployeeRecord: noop,
  confirmDialog: noop,
  showToast: noop,
  setActiveCaseId: noop,
  setActiveCaseStage: noop,
  getCaseStatus: () => 'active',
  fmtDate: d => d,
  setReviewOutput: noop,
  setMeetingType: noop,
  setCaseInfo: noop,
  employmentProfileLoading: false,
  setEmploymentProfileLoading: noop,
  employmentProfileOutput: '',
  setEmploymentProfileOutput: noop,
  getCaseStage: () => 'open',
  setLetterOutput: noop,
  org: {},
  user: {},
  promptDialog: async () => null,
};

describe('PersonViewScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the job title, start date, and location fields while editing', () => {
    render(<PersonViewScreen {...baseProps} editingEmployeeRecord={true} />);
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
  });
});
