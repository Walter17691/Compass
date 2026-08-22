import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PoliciesSection } from '../screens/settings/PoliciesSection.jsx';

// Phase 6.5 hardening (Batch 13) — the per-policy category select had no
// accessible name at all. Had no test coverage at all before this.
const noop = () => {};
const policies = [{ id: 'p1', name: 'Disciplinary Policy.pdf', size: '12kb', category: 'disciplinary', clauses: [] }];

describe('PoliciesSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('names the per-policy category select after the policy', () => {
    render(<PoliciesSection policies={policies} setPolicies={noop} policyFileRef={{ current: null }} handlePolicyUpload={noop} policyProcessing={false} lsSet={noop} changePolicyCategory={noop} />);
    expect(screen.getByLabelText('Category for Disciplinary Policy.pdf')).toBeInTheDocument();
  });
});
