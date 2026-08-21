import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgSwitcher } from '../components/OrgSwitcher.jsx';

// Phase 6.5 hardening (Batch 8) — had no test coverage at all.
describe('OrgSwitcher', () => {
  const orgs = [{ id: 'org1', name: 'Acme Ltd' }, { id: 'org2', name: 'Beta Co' }];

  it('renders nothing when there is no current org', () => {
    const { container } = render(<OrgSwitcher org={null} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current org name as the trigger button', () => {
    render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    expect(screen.getByRole('button', { name: /Switch organisation \(current: Acme Ltd\)/ })).toBeInTheDocument();
  });

  it('shows the dropdown indicator only when more than one org is available', () => {
    const { rerender } = render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    expect(screen.getByText('▾')).toBeInTheDocument();
    rerender(<OrgSwitcher org={orgs[0]} availableOrgs={[orgs[0]]} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    expect(screen.queryByText('▾')).not.toBeInTheDocument();
  });

  it('opens the org menu on click, listing every available org plus "Join another organisation"', async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Switch organisation/ }));
    const menu = screen.getByRole('menu', { name: 'Organisations' });
    expect(within(menu).getByText('Acme Ltd')).toBeInTheDocument();
    expect(within(menu).getByText('Beta Co')).toBeInTheDocument();
    expect(within(menu).getByText('+ Join another organisation')).toBeInTheDocument();
  });

  it('calls switchOrg with the clicked org id and closes the menu', async () => {
    const user = userEvent.setup();
    const switchOrg = vi.fn();
    render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={switchOrg} onJoinAnotherOrg={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: /Switch organisation/ }));
    await user.click(screen.getByText('Beta Co'));
    expect(switchOrg).toHaveBeenCalledWith('org2');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onJoinAnotherOrg and closes the menu', async () => {
    const user = userEvent.setup();
    const onJoinAnotherOrg = vi.fn();
    render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={onJoinAnotherOrg}/>);
    await user.click(screen.getByRole('button', { name: /Switch organisation/ }));
    await user.click(screen.getByText('+ Join another organisation'));
    expect(onJoinAnotherOrg).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: /Switch organisation/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on an outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>
      </div>
    );
    await user.click(screen.getByRole('button', { name: /Switch organisation/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not close the menu on a click inside it', async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher org={orgs[0]} availableOrgs={orgs} switchOrg={vi.fn()} onJoinAnotherOrg={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: /Switch organisation/ }));
    const menu = screen.getByRole('menu');
    await user.click(menu);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
