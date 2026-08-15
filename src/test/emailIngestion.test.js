import { describe, it, expect } from 'vitest';
import { buildEmailEvidenceItem, buildConcernDescriptionFromEmail } from '../lib/emailIngestion';

describe('buildEmailEvidenceItem', () => {
  it('builds an evidence item with headers folded into the record text', () => {
    const item = buildEmailEvidenceItem({ sender: 'manager@company.com', subject: 'Re: absence on 5 August', date: '05/08/2026', body: 'Please see attached.', addedBy: 'Test HR' });
    expect(item).toMatchObject({ name: 'Email: Re: absence on 5 August', type: 'text/plain', date: '05/08/2026', addedBy: 'Test HR' });
    expect(item.record).toContain('From: manager@company.com');
    expect(item.record).toContain('Subject: Re: absence on 5 August');
    expect(item.record).toContain('Date: 05/08/2026');
    expect(item.record).toContain('Please see attached.');
  });

  it('IP9 — sets type to text/plain and includes a matching dataUrl and size, so canAnalyseEvidence can read it', () => {
    const item = buildEmailEvidenceItem({ sender: 'a@b.com', body: 'Body text.' });
    expect(item.type).toBe('text/plain');
    expect(item.dataUrl).toMatch(/^data:text\/plain;base64,/);
    expect(item.size).toBe(new Blob([item.record]).size);
    const decoded = decodeURIComponent(escape(atob(item.dataUrl.split(',')[1])));
    expect(decoded).toBe(item.record);
  });

  it('IP9 — folds recipients, mentioned employees, case references, dates and attachments into the record', () => {
    const item = buildEmailEvidenceItem({
      sender: 'manager@company.com', body: 'See attached rota.',
      recipients: ['hr@company.com'], employeesMentioned: ['James Smith'],
      caseReferences: ['the grievance we discussed'], datesMentioned: ['12/08/2026'],
      attachmentsMentioned: ['rota'],
    });
    expect(item.record).toContain('To: hr@company.com');
    expect(item.record).toContain('Employees mentioned: James Smith');
    expect(item.record).toContain('Case references: the grievance we discussed');
    expect(item.record).toContain('Other dates mentioned: 12/08/2026');
    expect(item.record).toContain('Attachments mentioned: rota');
  });

  it('falls back to a generic name when there is no subject', () => {
    const item = buildEmailEvidenceItem({ body: 'Just a note.' });
    expect(item.name).toBe('Pasted email');
  });

  it('defaults date to today and addedBy to "HR Manager" when omitted', () => {
    const item = buildEmailEvidenceItem({ body: 'x' });
    expect(item.date).toBeTruthy();
    expect(item.addedBy).toBe('HR Manager');
  });

  it('omits header lines that were not provided, rather than printing empty ones', () => {
    const item = buildEmailEvidenceItem({ body: 'Just the body.' });
    expect(item.record).not.toContain('From:');
    expect(item.record).not.toContain('Subject:');
    expect(item.record).toContain('Just the body.');
  });
});

describe('buildConcernDescriptionFromEmail (Phase 5, IP10)', () => {
  it('leads with the summary and includes sender/subject/witnesses/evidence when present', () => {
    const description = buildConcernDescriptionFromEmail({
      summary: 'Manager flags a possible bullying incident.', sender: 'manager@company.com', subject: 'Concern about team conduct',
      potentialWitnesses: ['James Smith'], potentialEvidence: ['a screenshot of the messages'], rawText: 'Full email text here.',
    });
    expect(description).toContain('Manager flags a possible bullying incident.');
    expect(description).toContain('From: manager@company.com');
    expect(description).toContain('Subject: Concern about team conduct');
    expect(description).toContain('Possible witnesses mentioned: James Smith');
    expect(description).toContain('Evidence mentioned: a screenshot of the messages');
    expect(description).toContain('Full email text here.');
  });

  it('falls back to just the raw email text when nothing else was extracted', () => {
    const description = buildConcernDescriptionFromEmail({ rawText: 'Just the raw text.' });
    expect(description).toContain('Just the raw text.');
    expect(description).not.toContain('undefined');
    expect(description).not.toContain('null');
  });

  it('handles a missing extraction gracefully', () => {
    expect(buildConcernDescriptionFromEmail(null)).toBe('Original email:');
    expect(buildConcernDescriptionFromEmail(undefined)).toBe('Original email:');
  });
});
