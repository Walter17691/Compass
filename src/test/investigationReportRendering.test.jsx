import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MDRenderer } from '../components/MDRenderer.jsx';
import { deriveDocumentsForCase } from '../lib/caseDocuments.js';
import fs from 'fs';
import path from 'path';

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

// ─────────────────────────────────────────────────────────────────────────
// IR-0 PRESENTATION — RAW MARKDOWN MUST NOT REACH THE READER.
//
// ┌─ WHAT HUMAN UAT SAW IN PRODUCTION ──────────────────────────────────────┐
// │ Investigation > Findings showed, literally:                              │
// │   "## Executive Summary"   "---"   "## PART 1 — Evidence on Record"      │
// │                                                                         │
// │ Root cause: that panel rendered {cs.investigationReport} raw inside a    │
// │ <div style={{whiteSpace:"pre-wrap"}}>. The report IS structured Markdown │
// │ — the generator prompt mandates ## for the three PART headers and ### for │
// │ subsections — and MDRenderer already existed for exactly this document   │
// │ ("written for an investigation report's PART 1/2/3 structure"), and was   │
// │ ALREADY used for the same text by LetterScreen. One surface was simply   │
// │ never wired to it.                                                      │
// │                                                                         │
// │ Verified in production: the persisted report (14,847 chars, md5          │
// │ ffbd8ad247f0b16c7a824876d4b84a79) contains ##, ###, --- and **.          │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

// The real shape of the generated report, from the generator's own prompt.
const REPORT = [
  '## Executive Summary',
  '',
  'Three investigation meetings were held.',
  '',
  '---',
  '',
  '## PART 1 — Evidence on Record',
  '',
  '### Background',
  '',
  'The **employee** was interviewed on 5 October.',
  '',
  '- First evidence item',
  '- Second evidence item',
  '',
  '1. A numbered step',
  '',
  '## PART 2 — Compass Analysis (advisory interpretation, not a finding)',
].join('\n');

describe('the report renders as a document, not as source', () => {
  it('no Markdown control syntax survives into the rendered output', () => {
    const { container } = render(<MDRenderer text={REPORT}/>);
    const shown = container.textContent;
    expect(shown).not.toMatch(/##/);
    expect(shown).not.toMatch(/###/);
    expect(shown).not.toMatch(/\*\*/);
    // The horizontal rule becomes an element, never the characters.
    expect(shown).not.toMatch(/---/);
    expect(container.querySelectorAll('hr').length).toBe(1);
  });

  it('the headings survive as readable text', () => {
    render(<MDRenderer text={REPORT}/>);
    expect(screen.getByText('Executive Summary')).toBeTruthy();
    expect(screen.getByText('PART 1 — Evidence on Record')).toBeTruthy();
    expect(screen.getByText('Background')).toBeTruthy();
    expect(screen.getByText(/PART 2 — Compass Analysis/)).toBeTruthy();
  });

  it('PRESENTATION ONLY — every word of the report is still shown', () => {
    const { container } = render(<MDRenderer text={REPORT}/>);
    const shown = container.textContent;
    for (const phrase of ['Three investigation meetings were held.', 'Background',
      'was interviewed on 5 October', 'First evidence item', 'Second evidence item',
      'A numbered step', 'advisory interpretation, not a finding']) {
      expect(shown).toContain(phrase);
    }
    // Emphasis markers are stripped but the emphasised WORD remains.
    expect(shown).toContain('employee');
  });

  it('is safe: no innerHTML anywhere, so model output cannot inject markup', () => {
    // Comments stripped first: the module now CONTAINS a comment explaining that
    // it never uses innerHTML, and matching the raw source found that sentence.
    const src = read('src/components/MDRenderer.jsx').replace(/^\s*\/\/.*$/gm, '');
    expect(src.length).toBeLessThan(read('src/components/MDRenderer.jsx').length);
    expect(src).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    // And prove it behaviourally: markup in the model output stays text.
    const { container } = render(<MDRenderer text={'## <img src=x onerror=alert(1)>\n\n<script>bad()</script>'}/>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>bad()</script>');
  });

  it('theme props default to the previous values, so existing consumers are unchanged', () => {
    const { container: before } = render(<MDRenderer text={'## H'}/>);
    expect(before.innerHTML).toMatch(/rgb\(124, 92, 252\)/);     // #7C5CFC, the old accent
    expect(before.firstChild.getAttribute('style')).toMatch(/DM Sans/);
  });

  it('accepts the Compass system on the Findings surface: Archivo, navy, violet, no cream', () => {
    const { container } = render(
      <MDRenderer text={REPORT} font={'"Archivo",system-ui,sans-serif'}
        ink="#0F1224" accent="#7A2FD8" rule="#E8EAF2"/>);
    const root = container.querySelector('div');
    expect(root.getAttribute('style')).toMatch(/Archivo/);
    expect(root.getAttribute('style')).not.toMatch(/DM Sans/);
    const all = container.innerHTML;
    expect(all).toMatch(/rgb\(122, 47, 216\)/);          // violet #7A2FD8
    // No cream, and no blue accent.
    expect(all).not.toMatch(/232, 224, 208/);            // #E8E0D0 cream
    expect(all).not.toMatch(/#7C5CFC|124, 92, 252/);
  });
});

describe('the surfaces agree, and read one artefact', () => {
  it('the Documents entry carries the SAME persisted text, not a copy', () => {
    const cs = { id: 'c1', investigationReport: REPORT, investigationReportDate: '2026-10-07T16:35:48.906Z', meetings: [], evidence: [] };
    const docs = deriveDocumentsForCase(cs);
    const report = docs.find(d => d.kind === 'report');
    expect(report).toBeTruthy();
    // Identity, not equality: the same string reference off the case.
    expect(report.content).toBe(cs.investigationReport);
    expect(report.date).toBe(cs.investigationReportDate);
  });

  it('Findings uses the shared renderer rather than raw pre-wrap (wiring)', () => {
    const tab = read('src/components/caseTabs/InvestigationTab.jsx').replace(/^\s*\/\/.*$/gm, '');
    expect(tab).toMatch(/<MDRenderer text=\{cs\.investigationReport\}/);
    // The raw render is gone.
    expect(tab).not.toMatch(/whiteSpace:"pre-wrap"[\s\S]{0,80}\{cs\.investigationReport\}/);
  });
});
