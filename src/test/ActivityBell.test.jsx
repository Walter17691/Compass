import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityBell } from '../components/ActivityBell.jsx';

// Phase 6.5 hardening — had no test coverage at all.
// Phase 7.5C — the popover used to be hard-positioned top:"calc(100% +
// 6px)", left:0 with no awareness of where the trigger actually sits,
// which is exactly what let it render off the bottom of the viewport from
// its real position in the sidebar's footer. These tests mock the
// trigger's real bounding box (jsdom itself always reports zeros) to prove
// the popover flips to stay on-screen from that specific position, not
// just that a menu renders somewhere.
describe('ActivityBell', () => {
  const auditLog = [
    { id: 'a1', action: 'Case opened', detail: 'E2E Case 1', user: 'Alex', ts: '2026-08-01T10:00:00Z' },
    { id: 'a2', action: 'Session started', user: 'Alex', ts: '2026-08-01T09:00:00Z' },
  ];

  afterEach(() => {
    window.innerWidth = 1024;
    window.innerHeight = 768;
  });

  it('shows an unread count badge and opens the activity menu on click', async () => {
    const user = userEvent.setup();
    render(<ActivityBell auditLog={auditLog} orgId="org1"/>);
    expect(screen.getByText('1')).toBeInTheDocument(); // "Session started" is filtered out
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Activity/ }));
    const menu = screen.getByRole('menu', { name: 'Recent activity' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByText('Case opened')).toBeInTheDocument();
  });

  it('closes on Escape and on an outside click, same as before', async () => {
    const user = userEvent.setup();
    render(<div><div data-testid="outside">Outside</div><ActivityBell auditLog={auditLog} orgId="org1"/></div>);
    await user.click(screen.getByRole('button', { name: /Activity/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Activity/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens upward, not downward, when the trigger sits near the bottom of the viewport (sidebar footer position)', async () => {
    window.innerWidth = 1024;
    window.innerHeight = 768;
    const user = userEvent.setup();
    render(<ActivityBell auditLog={auditLog} orgId="org1"/>);
    const trigger = screen.getByRole('button', { name: /Activity/ });
    // The real sidebar renders this button ~40px from the bottom of a
    // height:100vh footer — mock the same geometry jsdom can't lay out itself.
    trigger.getBoundingClientRect = () => ({ top: 728, bottom: 748, left: 20, right: 60, width: 40, height: 20 });
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Recent activity' });
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.bottom).not.toBe('');
    expect(menu.style.top).toBe('');
  });

  it('right-aligns instead of overflowing when the trigger sits near the right edge of the viewport', async () => {
    window.innerWidth = 400;
    window.innerHeight = 900;
    const user = userEvent.setup();
    render(<ActivityBell auditLog={auditLog} orgId="org1"/>);
    const trigger = screen.getByRole('button', { name: /Activity/ });
    trigger.getBoundingClientRect = () => ({ top: 10, bottom: 40, left: 360, right: 396, width: 36, height: 30 });
    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Recent activity' });
    expect(menu.style.right).not.toBe('');
    expect(menu.style.left).toBe('');
  });
});
