import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import {
  ROLE, conversationTurns, appendQuestion, appendReply, appendFailure,
  withoutTrailingFailure, lastQuestion, turnsForModel, askThreadKey, threadFor,
} from '../lib/askConversation.js';

// ─────────────────────────────────────────────────────────────────────────
// ASK COMPASS — a conversation, not a search box.
//
// Production: asking "is there a theft allegation potentially?", then "what is
// the allegation being investigated?", made the first exchange disappear.
//
// The audit found the conversation was never lost. Every surface already posts
// the full prior turns to the model. ReviewScreen rendered
// `askCompassHistory.slice(-2)` — a window of two over a complete transcript.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');

const noop = () => {};
const base = {
  caseInfo: { employee: 'Sam Employee', date: '02/10/2026' },
  meetingType: { label: 'Investigation' },
  isHR: true, requestHrReview: noop,
  reviewOutput: '## Meeting Details\nPurpose: alleged unauthorised vehicle use.',
  reviewOutputOriginal: '## Meeting Details\nPurpose: alleged unauthorised vehicle use.',
  meetingSummary: '', confirmDialog: noop, setShowShareModal: noop,
  saveMeetingToCase: noop, setScreen: noop, showToast: noop,
  askCompassInput: '', setAskCompassInput: noop, setAskCompassHistory: noop,
  askCompass: noop, setAskCompassProcessing: noop, askCompassProcessing: false,
  editProcessing: false, editRecord: noop, editingRecord: false, setEditingRecord: noop,
  aiProcessing: false, aiError: '', setReviewOutput: noop, setShowSignModal: noop,
  riskScore: null, reviewGenerationFailed: false, onRetryGeneration: noop,
};

const Q1 = 'is there a theft allegation potentially?';
const A1 = 'Nothing in this record records a theft allegation.';
const Q2 = 'what is the allegation being investigated?';
const A2 = 'Unauthorised use of a company vehicle on two occasions.';

const twoExchanges = [
  { role: ROLE.USER, content: Q1 }, { role: ROLE.ASSISTANT, content: A1 },
  { role: ROLE.USER, content: Q2 }, { role: ROLE.ASSISTANT, content: A2 },
];

describe('the conversation appends, it never replaces', () => {
  it('a question is added to the end', () => {
    const h = appendQuestion([{ role: ROLE.USER, content: Q1 }, { role: ROLE.ASSISTANT, content: A1 }], Q2);
    expect(h).toHaveLength(3);
    expect(h[0].content).toBe(Q1);
    expect(h[2].content).toBe(Q2);
  });

  it('a reply lands beneath the question it answers', () => {
    const h = appendReply(appendQuestion([], Q1), A1);
    expect(h.map(m => m.role)).toEqual([ROLE.USER, ROLE.ASSISTANT]);
    expect(h[1].content).toBe(A1);
  });

  it('ignores an empty question rather than appending a blank turn', () => {
    expect(appendQuestion(twoExchanges, '   ')).toHaveLength(4);
  });

  it('drops malformed entries instead of breaking the transcript', () => {
    expect(conversationTurns([null, { role: 'nonsense' }, { role: ROLE.USER, content: 'x' }])).toHaveLength(1);
  });
});

describe('failure and retry', () => {
  it('a failed turn keeps every earlier exchange', () => {
    const h = appendFailure(appendQuestion(twoExchanges, 'third'), 'Sorry');
    expect(h).toHaveLength(6);
    expect(h[0].content).toBe(Q1);
    expect(h[5].failed).toBe(true);
  });

  it('retry removes the failed reply so the question is not asked twice', () => {
    const failed = appendFailure(appendQuestion(twoExchanges, 'third'), 'Sorry');
    const retry = withoutTrailingFailure(failed);
    expect(retry).toHaveLength(5);
    expect(retry[4]).toEqual({ role: ROLE.USER, content: 'third' });
    expect(lastQuestion(retry)).toBe('third');
  });

  it('leaves a successful conversation untouched', () => {
    expect(withoutTrailingFailure(twoExchanges)).toHaveLength(4);
  });

  it('never sends a transport error back to the model as something Compass said', () => {
    const failed = appendFailure(twoExchanges, 'Sorry, something went wrong.');
    const sent = turnsForModel(failed);
    expect(sent).toHaveLength(4);
    expect(sent.some(m => /went wrong/.test(m.content))).toBe(false);
  });
});

describe('a thread belongs to one context', () => {
  it('keys by meeting, then case', () => {
    expect(askThreadKey({ meetingId: 'm1', caseId: 'c1' })).toBe('review:meeting:m1');
    expect(askThreadKey({ caseId: 'c1' })).toBe('review:case:c1');
  });

  it('refuses to invent a key when there is no context', () => {
    expect(askThreadKey({})).toBeNull();
  });

  it('two meetings never share a conversation', () => {
    const threads = { 'review:meeting:m1': twoExchanges };
    expect(threadFor(threads, 'review:meeting:m1')).toHaveLength(4);
    expect(threadFor(threads, 'review:meeting:m2')).toEqual([]);
  });

  it('a null key reads as no thread, never as a shared one', () => {
    expect(threadFor({ 'review:meeting:m1': twoExchanges }, null)).toEqual([]);
  });

  it('surfaces are separate even for the same meeting', () => {
    expect(askThreadKey({ meetingId: 'm1', surface: 'review' }))
      .not.toBe(askThreadKey({ meetingId: 'm1', surface: 'global' }));
  });
});

describe('Review renders the whole conversation', () => {
  const open = props => render(<ReviewScreen {...base} {...props} />);

  it('shows both questions and both answers at once', () => {
    open({ askCompassHistory: twoExchanges });
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(A1)).toBeInTheDocument();
    expect(screen.getByText(Q2)).toBeInTheDocument();
    expect(screen.getByText(A2)).toBeInTheDocument();
  });

  it('keeps the earlier exchange when a later one is added — the reported defect', () => {
    const { unmount } = open({ askCompassHistory: twoExchanges.slice(0, 2) });
    expect(screen.getByText(Q1)).toBeInTheDocument();
    unmount();
    open({ askCompassHistory: twoExchanges });
    expect(screen.getByText(Q1)).toBeInTheDocument();   // still there
    expect(screen.getByText(Q2)).toBeInTheDocument();
  });

  it('orders oldest first, newest last', () => {
    open({ askCompassHistory: twoExchanges });
    const first = screen.getByText(Q1);
    const last = screen.getByText(A2);
    expect(first.compareDocumentPosition(last) & 4).toBeTruthy();
  });

  it('shows a failed turn without erasing the conversation', () => {
    open({ askCompassHistory: appendFailure(twoExchanges, 'Sorry, something went wrong.') });
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/)).toBeInTheDocument();
  });

  it('puts the pending state on the new answer, not over the transcript', () => {
    open({ askCompassHistory: twoExchanges, askCompassProcessing: true });
    expect(screen.getByText('Compass is thinking...')).toBeInTheDocument();
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(A2)).toBeInTheDocument();
  });

  it('is a labelled live region for screen readers', () => {
    open({ askCompassHistory: twoExchanges });
    const log = screen.getByRole('log', { name: /Ask Compass conversation/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('distinguishes who said what without chat bubbles', () => {
    open({ askCompassHistory: twoExchanges });
    expect(screen.getAllByText('You')).toHaveLength(2);
    expect(screen.getAllByText('Compass')).toHaveLength(2);
  });

  it('invites a conversation when empty', () => {
    open({ askCompassHistory: [] });
    expect(screen.getByText(/the conversation stays here while you work/i)).toBeInTheDocument();
  });

  it('survives switching Summary → Ask and Advice → Ask', async () => {
    const { container } = open({ askCompassHistory: twoExchanges, meetingSummary: 'a triage read', advisorNotes: 'advice.' });
    // opens on Summary; the conversation is not rendered but is not destroyed
    expect(screen.queryByText(Q1)).not.toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    tabs.find(t => t.textContent.trim() === 'Advice').click();
    tabs.find(t => t.textContent.trim() === 'Ask').click();
    await new Promise(r => setTimeout(r, 0));
    expect(container.textContent).toContain(Q1);
    expect(container.textContent).toContain(Q2);
  });
});

describe('the conversation is internal advisory material, and inert', () => {
  it('never enters the editable employee record', () => {
    render(<ReviewScreen {...base} askCompassHistory={twoExchanges} editingRecord={true} />);
    const value = screen.getByLabelText('Meeting record').value;
    expect(value).not.toContain('theft');
    expect(value).not.toContain(Q2);
  });

  it('is not fed into Summary or Advice', () => {
    // reviewSupport counts Ask turns for ordering only; Summary/Advice content
    // comes from their own props and nothing else.
    render(<ReviewScreen {...base} askCompassHistory={twoExchanges} meetingSummary="only the summary" advisorNotes="only the advice" />);
    expect(screen.getByText(/only the summary/)).toBeInTheDocument();
    expect(screen.queryByText(Q1)).not.toBeInTheDocument();
  });

  it('the screen has no writer for case data at all', () => {
    for (const forbidden of ['saveCases(', 'createAllegation', 'addEvidence', 'patchAllegation']) {
      expect(review).not.toContain(forbidden);
    }
  });
});

// ── The architecture, pinned where it lives ──
describe('App wiring', () => {
  it('Review reads a thread keyed to the record, not the global array', () => {
    const i = app.indexOf('<ReviewScreen caseInfo={caseInfo}');
    const tag = app.slice(i, app.indexOf('/>', i));
    expect(tag).toContain('askCompassHistory={threadFor(askThreads, reviewAskKey)}');
    expect(tag).not.toContain('askCompassHistory={askCompassHistory}');
  });

  it('the global widget keeps its own organisation-wide conversation', () => {
    expect(app).toContain('showAskCompass, setShowAskCompass, askCompassHistory, setAskCompassHistory,');
  });

  it('presenting a record no longer wipes the global conversation', () => {
    const i = app.indexOf('const presentMeetingRecord =');
    const body = app.slice(i, i + 2200);
    expect(body).not.toContain('setAskCompassHistory([])');
  });

  it('prior turns are sent to the model, minus transport failures', () => {
    expect(app).toContain('const newHistory = [...turnsForModel(history), {role:"user", content:userContent}];');
    expect(app).toContain('messages:newHistory,');
  });

  it('a failure is appended and marked rather than replacing the thread', () => {
    expect(app).toContain('setHistory(appendFailure(displayHistory,');
  });

  it('each turn is re-grounded from current state, so memory cannot re-reach lost access', () => {
    const i = app.indexOf('const groundingBlock =');
    expect(app.slice(i, i + 400)).toContain('grounding.record');
    const j = app.indexOf('<ReviewScreen caseInfo={caseInfo}');
    expect(app.slice(j, app.indexOf('/>', j)))
      .toContain('askCompass={(m,h,sh,sp)=>askCompass(m,h,sh,sp,{record:reviewOutput})}');
  });
});
