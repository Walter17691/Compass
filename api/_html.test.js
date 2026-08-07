import { describe, it, expect } from 'vitest';
import { escapeHtml } from './_html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('neutralises a script tag rather than letting it through', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('neutralises an attribute-breakout attempt', () => {
    const input = '" onmouseover="alert(1)';
    expect(escapeHtml(input)).not.toContain('"');
  });

  it('leaves ordinary text — including apostrophes in names — readable once escaped', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });

  it('handles null/undefined/empty as an empty string, not "null"/"undefined"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('coerces non-string input (e.g. a number) to a string first', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
