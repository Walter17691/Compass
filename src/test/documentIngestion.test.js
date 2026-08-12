import { describe, it, expect } from 'vitest';
import { canAnalyseEvidence, parseDataUrl, decodeBase64Text, buildAnalysisContent, MAX_ANALYSIS_BYTES } from '../lib/documentIngestion';

describe('canAnalyseEvidence', () => {
  it('accepts a small image', () => {
    expect(canAnalyseEvidence({ type: 'image/png', size: 1000, dataUrl: 'data:image/png;base64,AAA' })).toBe(true);
  });

  it('accepts a small PDF', () => {
    expect(canAnalyseEvidence({ type: 'application/pdf', size: 1000, dataUrl: 'data:application/pdf;base64,AAA' })).toBe(true);
  });

  it('rejects a file with no dataUrl', () => {
    expect(canAnalyseEvidence({ type: 'image/png', size: 1000 })).toBe(false);
  });

  it('rejects an unsupported type (Word document)', () => {
    expect(canAnalyseEvidence({ type: 'application/msword', size: 1000, dataUrl: 'data:application/msword;base64,AAA' })).toBe(false);
  });

  it('rejects a video (no video understanding)', () => {
    expect(canAnalyseEvidence({ type: 'video/mp4', size: 1000, dataUrl: 'data:video/mp4;base64,AAA' })).toBe(false);
  });

  it('rejects a file over the analysis size cap even if under the evidence upload cap', () => {
    expect(canAnalyseEvidence({ type: 'image/png', size: MAX_ANALYSIS_BYTES + 1, dataUrl: 'data:image/png;base64,AAA' })).toBe(false);
  });

  it('accepts a file exactly at the cap', () => {
    expect(canAnalyseEvidence({ type: 'image/png', size: MAX_ANALYSIS_BYTES, dataUrl: 'data:image/png;base64,AAA' })).toBe(true);
  });
});

describe('parseDataUrl', () => {
  it('splits a data URL into media type and base64 payload', () => {
    expect(parseDataUrl('data:image/png;base64,iVBORw0KGgo=')).toEqual({ mediaType: 'image/png', base64: 'iVBORw0KGgo=' });
  });

  it('returns null for a non-data URL', () => {
    expect(parseDataUrl('blob:https://example.com/xyz')).toBeNull();
  });

  it('returns null for a missing dataUrl', () => {
    expect(parseDataUrl(undefined)).toBeNull();
    expect(parseDataUrl('')).toBeNull();
  });
});

describe('decodeBase64Text', () => {
  it('decodes plain ASCII text', () => {
    expect(decodeBase64Text(btoa('Hello, world!'))).toBe('Hello, world!');
  });

  it('decodes UTF-8 text with non-ASCII characters correctly', () => {
    const original = 'Café résumé — "curly quotes"';
    const bytes = new TextEncoder().encode(original);
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(decodeBase64Text(base64)).toBe(original);
  });
});

describe('buildAnalysisContent', () => {
  it('inlines a text file as a text content block, with a document header', () => {
    const ev = { name: 'statement.txt', type: 'text/plain', dataUrl: `data:text/plain;base64,${btoa('Witness saw the incident.')}` };
    const block = buildAnalysisContent(ev);
    expect(block.type).toBe('text');
    expect(block.text).toContain('DOCUMENT "statement.txt"');
    expect(block.text).toContain('Witness saw the incident.');
  });

  it('builds a document content block for a PDF', () => {
    const ev = { name: 'report.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAA' };
    expect(buildAnalysisContent(ev)).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AAA' } });
  });

  it('builds an image content block for a photo', () => {
    const ev = { name: 'photo.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,BBB' };
    expect(buildAnalysisContent(ev)).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBB' } });
  });

  it('returns null when the dataUrl is unparseable', () => {
    expect(buildAnalysisContent({ name: 'x', type: 'image/png', dataUrl: 'not-a-data-url' })).toBeNull();
  });
});
