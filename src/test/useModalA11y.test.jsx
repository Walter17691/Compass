import { describe, it, expect, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useModalA11y } from '../hooks/useModalA11y';

// A minimal stand-in for the real dialog shape every modal in the app
// shares (role="dialog", a container ref, 2+ focusable controls) —
// tests the hook against real DOM focus/keyboard behaviour rather than
// mocking it, since focus management is exactly the kind of thing that
// looks right in isolation but breaks against a real browser's actual
// tab order.
function TestModal({ onClose, active = true }) {
  const containerRef = useRef(null);
  useModalA11y(containerRef, onClose, active);
  return (
    <div role="dialog" aria-modal="true" ref={containerRef} tabIndex={-1}>
      <button>First</button>
      <button>Second</button>
      <button>Last</button>
    </div>
  );
}

function ToggleHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Opener</button>
      {open && <TestModal onClose={() => setOpen(false)} />}
    </div>
  );
}

describe('useModalA11y', () => {
  it('moves focus to the first focusable element inside the dialog on open', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);
    await user.click(screen.getByRole('button', { name: 'Opener' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
  });

  it('closes the modal on Escape, regardless of which control inside currently has focus', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);
    await user.click(screen.getByRole('button', { name: 'Opener' }));
    await user.click(screen.getByRole('button', { name: 'Second' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('traps Tab: wraps from the last focusable element back to the first', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);
    await user.click(screen.getByRole('button', { name: 'Opener' }));
    await user.click(screen.getByRole('button', { name: 'Last' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('traps Shift+Tab: wraps from the first focusable element back to the last', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);
    await user.click(screen.getByRole('button', { name: 'Opener' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('restores focus to whatever triggered the dialog once it closes', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);
    await user.click(screen.getByRole('button', { name: 'Opener' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Opener' })).toHaveFocus());
  });

  it('an inactive modal steals no focus and reacts to no key events', async () => {
    const onClose = vi.fn();
    render(
      <div>
        <button>Elsewhere</button>
        <TestModal onClose={onClose} active={false} />
      </div>
    );
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(elsewhere).toHaveFocus();
  });

  // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) — the
  // escape-key effect only re-subscribes when `active` changes, so it
  // used to close over whichever onClose was in scope at that point and
  // never pick up a later render's fresh closure — a caller whose
  // onClose reads live state (e.g. OutcomeModal's own "refuse to close
  // while a save is in flight" guard) would have Escape act on a stale,
  // already-outdated version of that check.
  it('always calls the latest onClose passed in, even when active never toggles to force a re-subscribe', async () => {
    const user = userEvent.setup();
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();
    function Harness() {
      const [useSecond, setUseSecond] = useState(false);
      const containerRef = useRef(null);
      useModalA11y(containerRef, useSecond ? secondOnClose : firstOnClose, true);
      return (
        <div role="dialog" aria-modal="true" ref={containerRef} tabIndex={-1}>
          <button onClick={() => setUseSecond(true)}>Switch onClose</button>
        </div>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Switch onClose' }));
    await user.keyboard('{Escape}');
    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).toHaveBeenCalledTimes(1);
  });
});
