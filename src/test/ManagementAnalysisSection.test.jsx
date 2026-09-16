import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManagementAnalysisSection } from '../components/ManagementAnalysisSection.jsx';

// Insights Visual Upgrade, Phase 1 — verifies the wrapper collapses the
// AI-narrative panels by default (the review's core finding: a wall of
// AI text used to render, expanded, above the dashboard) and that
// toggling it does not touch its children's own content.
describe('ManagementAnalysisSection', () => {
  it('is collapsed by default, hiding its children', () => {
    render(<ManagementAnalysisSection><div>Executive brief content</div></ManagementAnalysisSection>);
    expect(screen.queryByText('Executive brief content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to reveal children on click, and can be collapsed again', async () => {
    const user = userEvent.setup();
    render(<ManagementAnalysisSection><div>Executive brief content</div></ManagementAnalysisSection>);
    const toggle = screen.getByRole('button', { name: /Show/ });
    await user.click(toggle);
    expect(screen.getByText('Executive brief content')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Hide/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Hide/ }));
    expect(screen.queryByText('Executive brief content')).not.toBeInTheDocument();
  });

  it('labels itself "Management analysis" and frames the content as supplementary, never a replacement', () => {
    render(<ManagementAnalysisSection><div>content</div></ManagementAnalysisSection>);
    expect(screen.getByText('Management analysis')).toBeInTheDocument();
    expect(screen.getByText(/always a supplement to it, never a replacement/)).toBeInTheDocument();
  });
});
