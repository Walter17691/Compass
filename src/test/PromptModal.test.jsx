import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PromptModal } from '../components/PromptModal.jsx';

// Phase 6.5 hardening (Batch 13) — each dynamic field's visual label
// had no htmlFor/id association. Had no test coverage at all before
// this.
const fields = [
  { key: 'reason', label: 'Reason for redundancy', placeholder: 'e.g. restructure', required: true },
  { key: 'pool', label: 'Selection pool', placeholder: 'e.g. all Marketing Executives' },
];

describe('PromptModal — field labelling (Phase 6.5, Batch 13)', () => {
  it('associates each field with its own visible label', () => {
    render(<PromptModal title="Start redundancy" fields={fields} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText(/Reason for redundancy/)).toBeInTheDocument();
    expect(screen.getByLabelText('Selection pool')).toBeInTheDocument();
  });
});
