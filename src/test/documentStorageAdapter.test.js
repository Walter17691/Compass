import { describe, it, expect } from 'vitest';
import { createDocumentStorageAdapter, exampleStubAdapter, DOCUMENT_RECORD_FIELDS } from '../lib/documentStorageAdapter.js';

describe('createDocumentStorageAdapter (Phase 5, IP25)', () => {
  it('builds an adapter exposing storeDocument and referenceDocument', async () => {
    const adapter = createDocumentStorageAdapter({
      id: 'test-adapter', name: 'Test Adapter',
      storeDocument: async ({ file }) => ({ id: 'd1', name: file.name }),
      referenceDocument: async ({ url }) => ({ id: 'r1', url }),
    });
    expect(adapter.id).toBe('test-adapter');
    expect(adapter.name).toBe('Test Adapter');
    expect(await adapter.storeDocument({ file: { name: 'report.pdf' } })).toEqual({ id: 'd1', name: 'report.pdf' });
    expect(await adapter.referenceDocument({ url: 'https://example.com/doc' })).toEqual({ id: 'r1', url: 'https://example.com/doc' });
  });

  it('throws when required fields are missing', () => {
    const noop = async () => ({});
    expect(() => createDocumentStorageAdapter({ name: 'X', storeDocument: noop, referenceDocument: noop })).toThrow();
    expect(() => createDocumentStorageAdapter({ id: 'x', storeDocument: noop, referenceDocument: noop })).toThrow();
    expect(() => createDocumentStorageAdapter({ id: 'x', name: 'X', referenceDocument: noop })).toThrow();
    expect(() => createDocumentStorageAdapter({ id: 'x', name: 'X', storeDocument: noop })).toThrow();
  });
});

describe('exampleStubAdapter (Phase 5, IP25)', () => {
  it('is clearly labelled as a non-real connection', () => {
    expect(exampleStubAdapter.id).toBe('example-stub');
    expect(exampleStubAdapter.name).toContain('not a real connection');
  });

  it('storeDocument returns the full canonical record shape from a fake upload', async () => {
    const record = await exampleStubAdapter.storeDocument({ file: { name: 'incident-photo.jpg' }, caseId: 'case1', uploadedBy: 'Jo Smith', classification: 'confidential' });
    DOCUMENT_RECORD_FIELDS.forEach(field => expect(record).toHaveProperty(field));
    expect(record.name).toBe('incident-photo.jpg');
    expect(record.caseId).toBe('case1');
    expect(record.uploadedBy).toBe('Jo Smith');
    expect(record.classification).toBe('confidential');
    expect(record.url).toMatch(/^https:\/\/example-storage\.invalid\//);
  });

  it('referenceDocument wraps an existing URL into the same canonical shape without altering it', async () => {
    const record = await exampleStubAdapter.referenceDocument({ url: 'https://sharepoint.example.com/real-doc', name: 'Real Document.docx', caseId: 'case2' });
    DOCUMENT_RECORD_FIELDS.forEach(field => expect(record).toHaveProperty(field));
    expect(record.url).toBe('https://sharepoint.example.com/real-doc');
    expect(record.name).toBe('Real Document.docx');
    expect(record.caseId).toBe('case2');
  });

  it('defaults missing optional fields sensibly rather than throwing', async () => {
    const stored = await exampleStubAdapter.storeDocument({});
    expect(stored.caseId).toBeNull();
    expect(stored.classification).toBe('unclassified');
    expect(stored.uploadedBy).toBe('Example Uploader');

    const referenced = await exampleStubAdapter.referenceDocument({});
    expect(referenced.caseId).toBeNull();
    expect(referenced.classification).toBe('unclassified');
  });
});
