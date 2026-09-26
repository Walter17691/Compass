import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WellbeingScreen } from '../screens/WellbeingScreen.jsx';

// Phase 6.5 hardening (Batch 13) — every field on the "Add wellbeing
// note" form had a visual label with no htmlFor/id association,
// including the two DateInput-backed date fields. Had no test coverage
// at all before this.
const noop = () => {};
const wellbeingForm = { employeeName: '', type: 'chat', date: '', manager: '', content: '', supportOffered: '', followUpDate: '' };

const baseProps = {
  wellbeingNotes: [],
  activeWellbeing: null,
  wellbeingView: 'new',
  setActiveWellbeing: noop,
  setWellbeingView: noop,
  toggleFollowUpDone: noop,
  wellbeingForm,
  setWellbeingForm: noop,
  addWellbeingNote: noop,
};

describe('WellbeingScreen — identity is the employee UUID (Phase E0.7)', () => {
  const JOHN_A = { id: 'u-a', name: 'John Smith' };
  const JOHN_B = { id: 'u-b', name: 'John Smith' };
  const notes = [
    { id: 'n1', employeeId: 'u-a', employeeName: 'John Smith', type: 'chat', createdAt: '2026-01-01' },
    { id: 'n2', employeeId: 'u-b', employeeName: 'John Smith', type: 'eap', createdAt: '2026-01-02' },
    { id: 'n3', employeeId: null, employeeName: 'John Smith', type: 'crisis', createdAt: '2026-01-03' },
  ];

  it('lists two same-named employees as TWO separate people', () => {
    render(<WellbeingScreen {...baseProps} wellbeingView="list" wellbeingNotes={notes}
      employeeRecords={[JOHN_A, JOHN_B]} />);
    // Two rows, one note each — not one row with three notes.
    expect(screen.getAllByText('John Smith')).toHaveLength(2);
    expect(screen.getAllByText('1 note')).toHaveLength(2);
  });

  it('shows only the selected employee\'s own notes', () => {
    // Each note carries a distinct `date`, which is rendered on the note card and
    // nowhere else — unlike the type label, which also appears in the static
    // support-resources list further down the page.
    const dated = [
      { id: 'n1', employeeId: 'u-a', employeeName: 'John Smith', type: 'chat', date: '01/01/2026', createdAt: '2026-01-01' },
      { id: 'n2', employeeId: 'u-b', employeeName: 'John Smith', type: 'chat', date: '02/02/2026', createdAt: '2026-01-02' },
      { id: 'n3', employeeId: null, employeeName: 'John Smith', type: 'chat', date: '03/03/2026', createdAt: '2026-01-03' },
    ];
    render(<WellbeingScreen {...baseProps} wellbeingView="employee" activeWellbeing="u-a"
      wellbeingNotes={dated} employeeRecords={[JOHN_A, JOHN_B]} />);
    expect(screen.getByText('01/01/2026')).toBeInTheDocument();
    // The same-named colleague's note, and the legacy note, are both absent.
    expect(screen.queryByText('02/02/2026')).not.toBeInTheDocument();
    expect(screen.queryByText('03/03/2026')).not.toBeInTheDocument();
  });

  it('the heading resolves the LABEL from the roster by uuid', () => {
    const renamed = [{ id: 'u-a', name: 'Joan Smith-Marsh' }];
    render(<WellbeingScreen {...baseProps} wellbeingView="employee" activeWellbeing="u-a"
      wellbeingNotes={[{ id: 'n1', employeeId: 'u-a', employeeName: 'John Smith', type: 'chat', date: '01/01/2026' }]}
      employeeRecords={renamed} />);
    // The roster is the current name; the note keeps its point-in-time snapshot.
    // Appears more than once (sidebar row + heading), which is why this is
    // getAllByText — the property under test is that the ROSTER name is used at
    // all, not the stale 'John Smith' stored on the note.
    expect(screen.getAllByText('Joan Smith-Marsh').length).toBeGreaterThan(0);
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
  });

  it('DISCLOSES legacy notes without attaching them to anyone', () => {
    // Behavioural rather than a source-string check: a source assertion still
    // passes when the block is rendered behind `{false&&(...)}`, which is exactly
    // how a mutation slipped past an earlier version of this test.
    render(<WellbeingScreen {...baseProps} wellbeingView="list" wellbeingNotes={notes}
      employeeRecords={[JOHN_A, JOHN_B]} />);
    expect(screen.getByText(/not linked to an employee record/)).toBeInTheDocument();
  });

  it('says nothing about legacy notes when there are none', () => {
    render(<WellbeingScreen {...baseProps} wellbeingView="list"
      wellbeingNotes={[notes[0]]} employeeRecords={[JOHN_A]} />);
    expect(screen.queryByText(/not linked to an employee record/)).not.toBeInTheDocument();
  });
});

describe('WellbeingScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels every field on the add-note form', () => {
    render(<WellbeingScreen {...baseProps} />);
    // Phase E0.6 — free-text "Employee name" became a roster selector labelled
    // "Employee *". The field is still labelled, which is what this test is for.
    expect(screen.getByLabelText(/Employee \*/)).toBeInTheDocument();
    expect(screen.getByLabelText('Note type')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('HR manager')).toBeInTheDocument();
    expect(screen.getByLabelText(/Conversation notes/)).toBeInTheDocument();
    expect(screen.getByLabelText('Support offered')).toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up date')).toBeInTheDocument();
  });
});
