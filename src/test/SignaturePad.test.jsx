import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignaturePad } from '../components/SignaturePad.jsx';

// Phase 6.5 hardening (Batch 8) — had no test coverage at all. jsdom has
// no real canvas 2D context implementation, so HTMLCanvasElement's
// getContext/toDataURL are mocked here — without this the component's
// own mode-switch effect (ctx.fillStyle = ...) throws immediately on
// mount, since getContext('2d') returns null in plain jsdom.
function mockCanvasContext() {
  return {
    fillStyle: '', fillRect: vi.fn(), strokeStyle: '', lineWidth: 0, lineCap: '',
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  };
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext());
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mockdata');
});

describe('SignaturePad', () => {
  it('defaults to draw mode, showing the canvas and Clear button', () => {
    render(<SignaturePad onSave={vi.fn()} onClose={vi.fn()}/>);
    expect(screen.getByText('Draw your signature above')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type your name')).not.toBeInTheDocument();
  });

  it('switches to type mode, showing the text input instead of the canvas', async () => {
    const user = userEvent.setup();
    render(<SignaturePad onSave={vi.fn()} onClose={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Type' }));
    expect(screen.getByPlaceholderText('Type your name')).toBeInTheDocument();
    expect(screen.queryByText('Draw your signature above')).not.toBeInTheDocument();
  });

  it('does not call onSave when Apply is clicked with nothing drawn', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} onClose={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Apply signature' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with the canvas data URL once a stroke has been drawn', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} onClose={vi.fn()}/>);
    const canvas = container.querySelector('canvas');
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);
    await user.click(screen.getByRole('button', { name: 'Apply signature' }));
    expect(onSave).toHaveBeenCalledWith({ type: 'draw', data: 'data:image/png;base64,mockdata' });
  });

  it('Clear resets the drawn state, so Apply becomes a no-op again', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} onClose={vi.fn()}/>);
    const canvas = container.querySelector('canvas');
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Apply signature' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave when Apply is clicked with empty or whitespace-only typed text', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} onClose={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Type' }));
    await user.type(screen.getByPlaceholderText('Type your name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Apply signature' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with the trimmed typed name', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} onClose={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Type' }));
    await user.type(screen.getByPlaceholderText('Type your name'), '  Jane Doe  ');
    await user.click(screen.getByRole('button', { name: 'Apply signature' }));
    expect(onSave).toHaveBeenCalledWith({ type: 'typed', data: 'Jane Doe' });
  });

  it('shows a live preview of the typed signature', async () => {
    const user = userEvent.setup();
    render(<SignaturePad onSave={vi.fn()} onClose={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Type' }));
    await user.type(screen.getByPlaceholderText('Type your name'), 'Jane Doe');
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SignaturePad onSave={vi.fn()} onClose={onClose}/>);
    await user.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Skip is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SignaturePad onSave={vi.fn()} onClose={onClose}/>);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Phase 6.5 hardening (Batch 13) — the typed-name field relied on
  // placeholder text alone, with no other accessible name.
  it('labels the typed-name field in type mode', async () => {
    const user = userEvent.setup();
    render(<SignaturePad onSave={vi.fn()} onClose={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Type' }));
    expect(screen.getByLabelText('Type your name')).toBeInTheDocument();
  });
});
