import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplatesSection } from '../screens/settings/TemplatesSection.jsx';

// Phase 6.5 hardening (Batch 13) — the template name field had a
// visual label with no htmlFor/id; the per-phase name field and the
// per-task name/owner/day-offset fields had no accessible name at all.
// Had no test coverage at all before this.
const noop = () => {};
const starterTemplates = [{
  id: 'tpl1', name: 'Standard Onboarding', createdAt: new Date().toISOString(),
  phases: [{ id: 'ph1', label: 'Week 1', tasks: [{ id: 't1', task: 'Send welcome email', owner: 'HR', day: 0 }] }],
}];

describe('TemplatesSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the template name, phase name, and per-task fields', () => {
    render(<TemplatesSection starterTemplates={starterTemplates} saveStarterTemplates={noop} leaverTemplates={[]} saveLeaverTemplates={noop} promptDialog={async () => null} confirmDialog={async () => false} />);
    expect(screen.getByLabelText('Template name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phase 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phase 1 task 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phase 1 task 1 owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Phase 1 task 1 day offset')).toBeInTheDocument();
  });
});
