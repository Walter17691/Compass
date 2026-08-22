import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalAssistantScreen } from '../screens/GlobalAssistantScreen.jsx';
import { SCREENS } from '../constants.js';

const baseProps = {
  chatHistory: [{ role: 'user', content: 'Why are grievances increasing?' }, { role: 'assistant', content: 'Grievance cases have increased.' }],
  chatInput: '', setChatInput: () => {}, chatProcessing: false, sendChat: () => {},
  setActiveCaseId: () => {}, setActiveCaseStage: () => {},
};

// Organisational ER Intelligence (Phase 6, OP20, §20)
describe('GlobalAssistantScreen', () => {
  it('shows a "View in Insights" button when insightsTab is set, and navigates there on click', async () => {
    const user = userEvent.setup();
    const setScreen = vi.fn();
    const setInsightsSection = vi.fn();
    render(<GlobalAssistantScreen {...baseProps} setScreen={setScreen} insightsTab="trends" setInsightsSection={setInsightsSection}/>);
    const btn = screen.getByRole('button', { name: 'View in Insights →' });
    await user.click(btn);
    expect(setInsightsSection).toHaveBeenCalledWith('trends');
    expect(setScreen).toHaveBeenCalledWith(SCREENS.INSIGHTS);
  });

  it('hides the "View in Insights" button when insightsTab is not set', () => {
    render(<GlobalAssistantScreen {...baseProps} setScreen={()=>{}} insightsTab={null} setInsightsSection={()=>{}}/>);
    expect(screen.queryByRole('button', { name: 'View in Insights →' })).not.toBeInTheDocument();
  });

  it('hides the button while the assistant is still processing', () => {
    render(<GlobalAssistantScreen {...baseProps} chatProcessing={true} setScreen={()=>{}} insightsTab="overview" setInsightsSection={()=>{}}/>);
    expect(screen.queryByRole('button', { name: 'View in Insights →' })).not.toBeInTheDocument();
  });

  it('shows both the case and Insights buttons together when both are set', () => {
    render(<GlobalAssistantScreen {...baseProps} setScreen={()=>{}} caseRef="c1" insightsTab="overview" setInsightsSection={()=>{}}/>);
    expect(screen.getByRole('button', { name: 'Open this case →' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View in Insights →' })).toBeInTheDocument();
  });

  // Phase 6.5 hardening (Batch 13) — the chat input relied on placeholder
  // text alone, with no other accessible name.
  it('labels the chat input', () => {
    render(<GlobalAssistantScreen {...baseProps} />);
    expect(screen.getByLabelText('Ask Compass')).toBeInTheDocument();
  });
});
