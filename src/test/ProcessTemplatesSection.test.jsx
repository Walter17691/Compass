import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessTemplatesSection } from '../screens/settings/ProcessTemplatesSection.jsx';

// Phase 6.5 hardening (Batch 9) — the "Target days per stage" number
// input has min="1" but isn't inside a <form>, so nothing actually
// blocks a directly-typed 0 or negative value from being saved as a
// real target — which ProcessChecklistPanel's own (now-fixed) truthy
// check used to render as a bare "0" instead of hiding the line. Save
// now clamps anything <= 0 to null. Had no test coverage at all before
// this.
describe('ProcessTemplatesSection', () => {
  it('saves a real positive target_days as a number', async () => {
    const user = userEvent.setup();
    const saveProcessTemplate = vi.fn();
    render(<ProcessTemplatesSection processTemplates={[]} saveProcessTemplate={saveProcessTemplate}/>);
    await user.click(screen.getByText('Misconduct'));
    await user.type(screen.getByLabelText('Target days per stage'), '10');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(saveProcessTemplate).toHaveBeenCalledWith('misconduct', expect.objectContaining({ target_days: 10 }));
  });

  it('clamps a typed 0 to null rather than saving a stray zero target', async () => {
    const user = userEvent.setup();
    const saveProcessTemplate = vi.fn();
    render(<ProcessTemplatesSection processTemplates={[]} saveProcessTemplate={saveProcessTemplate}/>);
    await user.click(screen.getByText('Misconduct'));
    await user.type(screen.getByLabelText('Target days per stage'), '0');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(saveProcessTemplate).toHaveBeenCalledWith('misconduct', expect.objectContaining({ target_days: null }));
  });

  it('saves null for an empty target_days field, unchanged from before', async () => {
    const user = userEvent.setup();
    const saveProcessTemplate = vi.fn();
    render(<ProcessTemplatesSection processTemplates={[]} saveProcessTemplate={saveProcessTemplate}/>);
    await user.click(screen.getByText('Misconduct'));
    // Touch a different field so Save becomes enabled without setting a target.
    await user.selectOptions(screen.getByLabelText('Linked policy'), 'disciplinary');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(saveProcessTemplate).toHaveBeenCalledWith('misconduct', expect.objectContaining({ target_days: null }));
  });
});
