import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemesTab } from '../components/caseTabs/ThemesTab.jsx';

const cs = { id: 'c1' };
const organisationThemes = [
  { id: 't1', name: 'Rota changes', active: true },
  { id: 't2', name: 'Bullying', active: true },
  { id: 't3', name: 'Retired theme', active: false },
];

describe('ThemesTab', () => {
  it('shows an empty state and no themes applied', () => {
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={[]} suggestions={[]} suggesting={false} isHR={true} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    expect(screen.getByText('Themes (0)')).toBeInTheDocument();
    expect(screen.getByText('No themes applied to this case yet.')).toBeInTheDocument();
  });

  it('renders applied themes as chips, resolved from organisationThemes by id', () => {
    const caseThemes = [{ id: 'ct1', caseId: 'c1', themeId: 't1' }];
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={caseThemes} suggestions={[]} suggesting={false} isHR={true} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    expect(screen.getByText('Themes (1)')).toBeInTheDocument();
    expect(screen.getByText('Rota changes')).toBeInTheDocument();
  });

  it('calls onRemove with the case_themes row id when a chip is removed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const caseThemes = [{ id: 'ct1', caseId: 'c1', themeId: 't1' }];
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={caseThemes} suggestions={[]} suggesting={false} isHR={true} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={onRemove}/>);
    await user.click(screen.getByRole('button', { name: 'Remove Rota changes' }));
    expect(onRemove).toHaveBeenCalledWith('ct1');
  });

  it('calls onSuggest with the case when the Suggest themes button is clicked', async () => {
    const user = userEvent.setup();
    const onSuggest = vi.fn();
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={[]} suggestions={[]} suggesting={false} isHR={true} onSuggest={onSuggest} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    await user.click(screen.getByRole('button', { name: 'Suggest themes' }));
    expect(onSuggest).toHaveBeenCalledWith(cs);
  });

  it('shows a suggestion that matches an existing theme as confirmable by anyone', () => {
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={[]} suggestions={['Rota changes']} suggesting={false} isHR={false} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('disables confirming a brand-new suggested name for a non-HR user', () => {
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={[]} suggestions={['Workload']} suggesting={false} isHR={false} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByText(/ask HR to add it/)).toBeInTheDocument();
  });

  it('allows an HR user to confirm a brand-new suggested name', async () => {
    const user = userEvent.setup();
    const onConfirmSuggestion = vi.fn();
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={[]} suggestions={['Workload']} suggesting={false} isHR={true} onSuggest={()=>{}} onConfirmSuggestion={onConfirmSuggestion} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);
    expect(onConfirmSuggestion).toHaveBeenCalledWith(cs, 'Workload');
  });

  it('hides a suggestion that has already been applied as a theme', () => {
    const caseThemes = [{ id: 'ct1', caseId: 'c1', themeId: 't1' }];
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={caseThemes} suggestions={['Rota changes']} suggesting={false} isHR={true} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    expect(screen.queryByText('AI-suggested themes')).not.toBeInTheDocument();
  });

  it('excludes an already-applied or inactive theme from the "add existing" picker', () => {
    const caseThemes = [{ id: 'ct1', caseId: 'c1', themeId: 't1' }];
    render(<ThemesTab cs={cs} organisationThemes={organisationThemes} caseThemes={caseThemes} suggestions={[]} suggesting={false} isHR={true} onSuggest={()=>{}} onConfirmSuggestion={()=>{}} onDismissSuggestion={()=>{}} onAssignExisting={()=>{}} onRemove={()=>{}}/>);
    expect(screen.queryByRole('option', { name: 'Rota changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retired theme' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bullying' })).toBeInTheDocument();
  });
});
