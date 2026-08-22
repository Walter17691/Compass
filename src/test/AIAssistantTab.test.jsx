import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIAssistantTab } from '../components/caseTabs/AIAssistantTab.jsx';

// Phase 6.5 hardening (Batch 13) — the chat input relied on placeholder
// text alone, with no other accessible name. Had no test coverage at
// all before this.
const noop = () => {};
const cs = { id: 'c1', employeeName: 'Sam Employee' };

describe('AIAssistantTab — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the chat input', () => {
    render(<AIAssistantTab cs={cs} chatHistory={[]} chatInput="" setChatInput={noop} chatProcessing={false} sendChat={noop} overview="" overviewLoading={false} generateOverview={noop} overviewSources={[]} onAskWhy={noop} />);
    expect(screen.getByLabelText('Ask about this case')).toBeInTheDocument();
  });
});
