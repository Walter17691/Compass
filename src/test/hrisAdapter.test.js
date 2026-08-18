import { describe, it, expect } from 'vitest';
import { createHrisAdapter, exampleStubAdapter, HRIS_EMPLOYEE_FIELDS } from '../lib/hrisAdapter.js';

describe('createHrisAdapter (Phase 5, IP19)', () => {
  it('builds an adapter that fetches and normalizes raw records', async () => {
    const adapter = createHrisAdapter({
      id: 'test-adapter', name: 'Test Adapter',
      fetchEmployees: async () => [{ raw_name: 'Sarah Jones' }],
      normalize: raw => ({ name: raw.raw_name }),
    });
    expect(adapter.id).toBe('test-adapter');
    expect(adapter.name).toBe('Test Adapter');
    const employees = await adapter.fetchNormalizedEmployees();
    expect(employees).toEqual([{ name: 'Sarah Jones' }]);
  });

  it('handles fetchEmployees returning nothing gracefully', async () => {
    const adapter = createHrisAdapter({ id: 'x', name: 'X', fetchEmployees: async () => null, normalize: r => r });
    expect(await adapter.fetchNormalizedEmployees()).toEqual([]);
  });

  it('throws when required fields are missing', () => {
    expect(() => createHrisAdapter({ name: 'X', fetchEmployees: async () => [], normalize: r => r })).toThrow();
    expect(() => createHrisAdapter({ id: 'x', fetchEmployees: async () => [], normalize: r => r })).toThrow();
    expect(() => createHrisAdapter({ id: 'x', name: 'X', normalize: r => r })).toThrow();
    expect(() => createHrisAdapter({ id: 'x', name: 'X', fetchEmployees: async () => [] })).toThrow();
  });
});

describe('exampleStubAdapter (Phase 5, IP19)', () => {
  it('is clearly labelled as a non-real connection', () => {
    expect(exampleStubAdapter.id).toBe('example-stub');
    expect(exampleStubAdapter.name).toContain('not a real connection');
  });

  it('normalizes its example data to the full canonical field set', async () => {
    const employees = await exampleStubAdapter.fetchNormalizedEmployees();
    expect(employees).toHaveLength(1);
    HRIS_EMPLOYEE_FIELDS.forEach(field => {
      expect(employees[0]).toHaveProperty(field);
      expect(employees[0][field]).not.toBe('');
    });
    expect(employees[0].name).toBe('Jordan Example');
    expect(employees[0].employeeNumber).toBe('EX-001');
  });
});
