import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import fs from 'fs';
import path from 'path';
import {
  internalDocumentEntryKey, useScrollToTopOnDocumentEntry, scrollWorkspaceToTop, entryResetsScroll,
} from '../lib/screenScroll.js';
import { INVESTIGATION_REPORT_DOC, documentCapabilities } from '../lib/investigationReportDocument.js';
import { LetterScreen } from '../screens/LetterScreen.jsx';

// ─────────────────────────────────────────────────────────────────────────
// IR-SURF-01a — DOCUMENT ENTRY POSITION + RESIDUAL LETTER CHROME.
//
// ┌─ WHAT HUMAN UAT FOUND ──────────────────────────────────────────────────┐
// │ 1. Meetings -> Investigation report -> View report opened PART WAY DOWN  │
// │    the report. Root cause: entryResetsScroll is an allow-list of exactly  │
// │    ONE screen (Review, from UX-07). The document view was never added, so │
// │    it inherited the Meetings tab's scroll position.                      │
// │ 2. "Ask why" and "Edit letter" still appeared above an internal document. │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The scroll rule is keyed on the DOCUMENT, not the screen, because genuine
// letters share that screen and must be provably unaffected.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t.replace(/^\s*\/\/.*$/gm, '');

const LETTER_SCREEN = 'letter';
const REPORT = '## Executive Summary\n\nThe investigation considered two meetings.';
const LETTER = 'Dear ZZ Test,\n\nFollowing the hearing...';
const GENUINE_LETTERS = ['outcome', 'invite', 'appeal', 'suspension', 'meeting-confirmation'];

const keyFor = (docType, screen = LETTER_SCREEN) => internalDocumentEntryKey({
  screen, documentScreen: LETTER_SCREEN, docType,
  internal: documentCapabilities(docType).internal,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('1. the entry key identifies a document, not a screen', () => {
  it('EXECUTED: an internal document on the document screen yields a key', () => {
    expect(keyFor(INVESTIGATION_REPORT_DOC)).toBe('letter:investigation-report');
  });

  it('EXECUTED: every genuine letter yields NULL, so letters are untouched', () => {
    for (const l of [...GENUINE_LETTERS, 'witness-invitation', 'no-case-answer', undefined, null, '']) {
      expect(keyFor(l), String(l)).toBe(null);
    }
  });

  it('EXECUTED: the key is null anywhere other than the document screen', () => {
    expect(keyFor(INVESTIGATION_REPORT_DOC, 'cases')).toBe(null);
    expect(keyFor(INVESTIGATION_REPORT_DOC, null)).toBe(null);
    expect(internalDocumentEntryKey({})).toBe(null);
    expect(internalDocumentEntryKey()).toBe(null);
  });

  it('the UX-07 Review rule is untouched', () => {
    expect(entryResetsScroll('review', 'review')).toBe(true);
    expect(entryResetsScroll('letter', 'review')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A/B. entry resets the position; ordinary interaction does not', () => {
  let scrolled;
  beforeEach(() => {
    scrolled = 0;
    window.scrollTo = vi.fn(() => { scrolled += 1; });
  });

  // A harness with the real lifecycle: navigate in, then re-render repeatedly
  // without changing the document.
  function Harness({ docType }) {
    const [screenName, setScreenName] = useState('cases');
    const [tick, setTick] = useState(0);
    useScrollToTopOnDocumentEntry(internalDocumentEntryKey({
      screen: screenName, documentScreen: LETTER_SCREEN, docType,
      internal: documentCapabilities(docType).internal,
    }));
    Harness.open = () => setScreenName(LETTER_SCREEN);
    Harness.leave = () => setScreenName('cases');
    Harness.rerender = () => setTick(t => t + 1);
    return <div data-tick={tick}/>;
  }

  it('A. opening the report resets the position — it cannot retain a mid-document scroll', async () => {
    const { rerender } = render(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    expect(scrolled).toBe(0);                       // not on the document screen yet
    await Promise.resolve(Harness.open());
    rerender(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    expect(scrolled).toBeGreaterThan(0);            // entered -> reset
  });

  it('B. ordinary re-renders while reading do NOT reset the position', async () => {
    const { rerender } = render(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    await Promise.resolve(Harness.open());
    rerender(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    const afterEntry = scrolled;
    expect(afterEntry).toBeGreaterThan(0);
    // Simulate reading: several state updates with the document unchanged.
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve(Harness.rerender());
      rerender(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    }
    expect(scrolled).toBe(afterEntry);              // not once more
  });

  it('C. a genuine letter never triggers the reset at all', async () => {
    const { rerender } = render(<Harness docType="outcome"/>);
    await Promise.resolve(Harness.open());
    rerender(<Harness docType="outcome"/>);
    for (let i = 0; i < 3; i += 1) {
      await Promise.resolve(Harness.rerender());
      rerender(<Harness docType="outcome"/>);
    }
    expect(scrolled).toBe(0);
  });

  it('leaving and re-entering resets again', async () => {
    const { rerender } = render(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    await Promise.resolve(Harness.open());
    rerender(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    const first = scrolled;
    await Promise.resolve(Harness.leave());
    rerender(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    await Promise.resolve(Harness.open());
    rerender(<Harness docType={INVESTIGATION_REPORT_DOC}/>);
    expect(scrolled).toBeGreaterThan(first);
  });

  it('a falsy key never scrolls, and the reset itself never throws', () => {
    const before = scrolled;
    render(<Harness docType={null}/>);
    expect(scrolled).toBe(before);
    expect(() => scrollWorkspaceToTop({})).not.toThrow();
  });

  it('no timers are used (wiring)', () => {
    const lib = stripComments(read('src/lib/screenScroll.js'));
    expect(lib).not.toMatch(/setTimeout|requestAnimationFrame|setInterval/);
    const app = stripComments(read('src/App.jsx'));
    const call = app.slice(app.indexOf('useScrollToTopOnDocumentEntry('), app.indexOf('}));', app.indexOf('useScrollToTopOnDocumentEntry(')));
    expect(call).toMatch(/documentScreen: SCREENS\.LETTER/);
    expect(call).toMatch(/internal: documentCapabilities\(activeLetter\)\.internal/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('3/4. residual letter chrome follows the capability model', () => {
  const noop = () => {};
  const renderScreen = (activeLetter, output, over = {}) => render(<LetterScreen
    activeLetter={activeLetter} letterOutput={output} handleLetter={noop} aiProcessing={false}
    caseInfo={{ employee: 'ZZ Test', manager: 'A Manager', email: 'zz@example.test' }}
    setScreen={noop} setLetterOutput={noop} signature={null} setSignature={noop} setShowSigPad={noop}
    letterIsApproved={false} approveLetter={noop} letterApproval={null}
    triggerWithSig={noop} pdfGenerating={false} saveMeetingToCase={async () => ({ ok: true })}
    onSendFromCompass={noop} onSendForAcknowledgement={noop} onAskWhy={noop}
    editingLetter={false} setEditingLetter={noop}
    meetingType={{ label: 'Investigation' }} outcomeRecorded={false} {...over}/>);

  it('EXECUTED: both residual capabilities are off for the report, on for letters', () => {
    expect(documentCapabilities(INVESTIGATION_REPORT_DOC).mayAskWhy).toBe(false);
    expect(documentCapabilities(INVESTIGATION_REPORT_DOC).mayEditInline).toBe(false);
    for (const l of GENUINE_LETTERS) {
      expect(documentCapabilities(l).mayAskWhy, l).toBe(true);
      expect(documentCapabilities(l).mayEditInline, l).toBe(true);
    }
  });

  it('4. the report shows no "Edit letter" and no "Ask why"', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT);
    expect(screen.queryByText(/Edit letter/)).toBeNull();
    expect(screen.queryByText(/Done editing/)).toBeNull();
    expect(screen.queryByText(/Ask why/)).toBeNull();
    // And no "letter" wording anywhere on the surface.
    expect(document.body.textContent).not.toMatch(/letter/i);
  });

  it('the report still renders, and the IR-SURF-01 boundaries still hold', () => {
    renderScreen(INVESTIGATION_REPORT_DOC, REPORT);
    expect(screen.getByText('Investigation report')).toBeTruthy();
    expect(screen.getByText('Internal case document')).toBeTruthy();
    expect(screen.getByText('Executive Summary')).toBeTruthy();
    for (const gone of [/Approve for sending/, /Send via Gmail/, /Send via Outlook/,
      /Send from Compass/, /Send for acknowledgement/, /Save to case/, /E-signature:/,
      /Outcome letter/, /Invitation/]) {
      expect(screen.queryByText(gone), String(gone)).toBeNull();
    }
    // Export remains available with no approval.
    for (const name of [/Download/, /^Print$/, /Copy/]) {
      expect(screen.getByRole('button', { name }).disabled, String(name)).toBe(false);
    }
  });

  it('6. a genuine letter keeps Ask why and Edit letter', () => {
    renderScreen('invite', LETTER);
    expect(screen.getByText(/Ask why/)).toBeTruthy();
    expect(screen.getByText(/Edit letter/)).toBeTruthy();
    expect(screen.getByText(/Approve for sending/)).toBeTruthy();
    expect(screen.getByText(/E-signature:/)).toBeTruthy();
  });

  it('a genuine letter mid-edit still shows the editing affordance', () => {
    renderScreen('invite', LETTER, { editingLetter: true });
    expect(screen.getByText(/Done editing/)).toBeTruthy();
    expect(screen.getByLabelText('Letter text')).toBeTruthy();
  });

  it('LetterScreen still adds no document-type string comparisons (wiring)', () => {
    const src = stripComments(read('src/screens/LetterScreen.jsx'));
    const comparisons = src.match(/activeLetter\s*===\s*["'][a-z-]+["']/g) || [];
    expect(comparisons).toEqual(['activeLetter==="outcome"', 'activeLetter==="outcome"']);
    expect(src).toMatch(/caps\.mayAskWhy/);
    expect(src).toMatch(/caps\.mayEditInline/);
  });
});
