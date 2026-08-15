import { describe, it, expect } from 'vitest';
import { providerAdapter } from './_providers.js';

describe('providerAdapter', () => {
  it('returns the google adapter with a PUT update method', () => {
    const adapter = providerAdapter('google');
    expect(adapter.eventsPath).toBe('events');
    expect(adapter.updateMethod).toBe('PUT');
    expect(typeof adapter.buildEvent).toBe('function');
  });

  it('returns the microsoft adapter with a PATCH update method', () => {
    const adapter = providerAdapter('microsoft');
    expect(adapter.eventsPath).toBe('events');
    expect(adapter.updateMethod).toBe('PATCH');
    expect(typeof adapter.buildEvent).toBe('function');
  });

  it('throws for an unrecognised provider', () => {
    expect(() => providerAdapter('yahoo')).toThrow('Unknown calendar provider: yahoo');
  });
});
