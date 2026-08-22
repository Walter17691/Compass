import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChecklistScreen } from '../screens/checklist/ChecklistScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the new-instance form fields
// (including the DateInput-backed start-date field) had visual labels
// with no htmlFor/id; the per-task owner select, per-task note field,
// and per-phase "add task" field had no accessible name at all. Had no
// test coverage at all before this.
const noop = () => {};
const templates = [{ id: 'tpl1', name: 'Standard Onboarding' }];
const form = { name: '', role: '', department: '', manager: '', email: '', startDate: '', templateId: 'tpl1' };

const baseProps = {
  title: 'Onboarding', subtitle: '',
  active: null, setActive: noop, view: 'new', setView: noop, form, setForm: noop, templates,
  createInstance: noop, instances: [], aiCustomise: noop, aiProcessing: false,
  toggleTask: noop, updateTaskNote: noop, addTask: noop, removeTask: noop, reassignTaskOwner: noop,
  dateFieldKey: 'startDate', dateFieldLabel: 'Start date',
  createButtonLabel: 'Create', createDisabled: false,
  addButtonLabel: '+ New', allButtonLabel: 'All',
  emptyTitle: 'No checklists', emptySubtitle: '', emptyButtonLabel: '+ New',
  ownerColors: { HR: '#7C5CFC' },
  listSecondaryLine: () => '',
  sidebarLine1: () => '',
  sidebarLine2: () => '',
};

describe('ChecklistScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the new-instance form fields, including the DateInput-backed date field', () => {
    render(<ChecklistScreen {...baseProps} />);
    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(screen.getByLabelText(/Start date/)).toBeInTheDocument();
    expect(screen.getByLabelText('Template')).toBeInTheDocument();
  });

  it('gives the per-task owner select, note field, and add-task field an accessible name', () => {
    const active = {
      id: 'i1', name: 'Sam Employee', role: '', department: '',
      tasks: [{ id: 'task1', task: 'Send welcome email', owner: 'HR', note: '', done: false, phaseLabel: 'Week 1' }],
    };
    render(<ChecklistScreen {...baseProps} active={active} view="instance" />);
    expect(screen.getByLabelText('Owner for Send welcome email')).toBeInTheDocument();
    expect(screen.getByLabelText('Note for Send welcome email')).toBeInTheDocument();
    expect(screen.getByLabelText('Add task to Week 1')).toBeInTheDocument();
  });
});
