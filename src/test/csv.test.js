import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv, csvRowsToObjects } from '../lib/csv.js';

describe('parseCsv', () => {
  it('parses a simple comma-separated file', () => {
    const rows = parseCsv('Name,Job title\nAda Lovelace,Engineer\n');
    expect(rows).toEqual([['Name', 'Job title'], ['Ada Lovelace', 'Engineer']]);
  });

  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('Name,Location\n"Smith, John",London\n');
    expect(rows).toEqual([['Name', 'Location'], ['Smith, John', 'London']]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const rows = parseCsv('Name\n"Sam ""The Boss"" Jones"\n');
    expect(rows).toEqual([['Name'], ['Sam "The Boss" Jones']]);
  });

  it('handles \\r\\n line endings', () => {
    const rows = parseCsv('Name,Role\r\nAda,Engineer\r\n');
    expect(rows).toEqual([['Name', 'Role'], ['Ada', 'Engineer']]);
  });

  it('ignores a trailing blank line', () => {
    const rows = parseCsv('Name\nAda\n\n');
    expect(rows).toEqual([['Name'], ['Ada']]);
  });
});

describe('toCsv', () => {
  it('quotes every field and escapes internal quotes', () => {
    const csv = toCsv([['Name', 'Note'], ['Ada', 'Said "hi"']]);
    expect(csv).toBe('"Name","Note"\n"Ada","Said ""hi"""');
  });

  it('round-trips through parseCsv', () => {
    const original = [['Name', 'Location'], ['Smith, John', 'London'], ['Ada', '']];
    const parsed = parseCsv(toCsv(original));
    expect(parsed).toEqual(original);
  });
});

describe('csvRowsToObjects', () => {
  it('maps rows to objects keyed by lowercased header', () => {
    const objs = csvRowsToObjects([['Name', 'Job Title'], ['Ada', 'Engineer']]);
    expect(objs).toEqual([{ name: 'Ada', 'job title': 'Engineer' }]);
  });

  it('returns an empty array for header-only input', () => {
    expect(csvRowsToObjects([['Name']])).toEqual([]);
  });
});
