import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeTaxonomyManager } from '../components/ThemeTaxonomyManager.jsx';

const themes = [
  { id: 't1', name: 'Rota changes', description: 'Shift/rota disputes', active: true },
  { id: 't2', name: 'Bullying', description: '', active: false },
];

describe('ThemeTaxonomyManager', () => {
  it('shows an empty state for HR when no themes exist', () => {
    render(<ThemeTaxonomyManager organisationThemes={[]} isHR={true} onAdd={()=>{}} onUpdate={()=>{}}/>);
    expect(screen.getByText(/add the first one below/)).toBeInTheDocument();
  });

  it('lists themes sorted alphabetically, with descriptions where present', () => {
    render(<ThemeTaxonomyManager organisationThemes={themes} isHR={true} onAdd={()=>{}} onUpdate={()=>{}}/>);
    expect(screen.getByText('Bullying')).toBeInTheDocument();
    expect(screen.getByText('Rota changes')).toBeInTheDocument();
    expect(screen.getByText('Shift/rota disputes')).toBeInTheDocument();
  });

  it('hides add/deactivate controls for a non-HR user', () => {
    render(<ThemeTaxonomyManager organisationThemes={themes} isHR={false} onAdd={()=>{}} onUpdate={()=>{}}/>);
    expect(screen.queryByPlaceholderText('New theme name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deactivate|Reactivate/ })).not.toBeInTheDocument();
  });

  it('calls onAdd with the typed name and description, and clears the form', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ThemeTaxonomyManager organisationThemes={[]} isHR={true} onAdd={onAdd} onUpdate={()=>{}}/>);
    await user.type(screen.getByPlaceholderText('New theme name'), 'Workload');
    await user.type(screen.getByPlaceholderText('Description (optional)'), 'Excessive workload concerns');
    await user.click(screen.getByRole('button', { name: 'Add theme' }));
    expect(onAdd).toHaveBeenCalledWith('Workload', 'Excessive workload concerns');
    expect(screen.getByPlaceholderText('New theme name')).toHaveValue('');
  });

  it('disables Add theme until a name is entered', () => {
    render(<ThemeTaxonomyManager organisationThemes={[]} isHR={true} onAdd={()=>{}} onUpdate={()=>{}}/>);
    expect(screen.getByRole('button', { name: 'Add theme' })).toBeDisabled();
  });

  it('toggles a theme active/inactive via onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ThemeTaxonomyManager organisationThemes={themes} isHR={true} onAdd={()=>{}} onUpdate={onUpdate}/>);
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onUpdate).toHaveBeenCalledWith('t1', { active: false });
    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    expect(onUpdate).toHaveBeenCalledWith('t2', { active: true });
  });

  // Phase 6.5 hardening (Batch 13) — the new-theme name and description
  // fields relied on placeholder text alone, with no other accessible
  // name.
  it('labels the new theme name and description fields', () => {
    render(<ThemeTaxonomyManager organisationThemes={[]} isHR={true} onAdd={()=>{}} onUpdate={()=>{}}/>);
    expect(screen.getByLabelText('New theme name')).toBeInTheDocument();
    expect(screen.getByLabelText('Theme description')).toBeInTheDocument();
  });
});
