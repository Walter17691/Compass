import { describe, it, expect } from 'vitest';
import { ORG_EVENT_TYPES, orgEventTypeLabel, describeEventCorrelation } from '../lib/orgEvents';

describe('orgEventTypeLabel', () => {
  it('resolves a known type to its label', () => {
    expect(orgEventTypeLabel('new_rota_system')).toBe('New rota system');
  });

  it('falls back to the raw type for an unknown value', () => {
    expect(orgEventTypeLabel('something_else')).toBe('something_else');
  });

  it('covers every type the spec names', () => {
    const ids = ORG_EVENT_TYPES.map(t => t.id);
    expect(ids).toEqual(expect.arrayContaining([
      'restructure','new_rota_system','new_policy','site_opening','site_closure',
      'leadership_change','pay_review','new_operating_model','other',
    ]));
  });
});

describe('describeEventCorrelation', () => {
  it('describes an increase, using "temporal correlation" language, never causation', () => {
    const text = describeEventCorrelation({ before_count: 10, after_count: 15 });
    expect(text).toContain('increased 50%');
    expect(text).toContain('temporal correlation worth reviewing');
    expect(text.toLowerCase()).not.toContain('caused');
  });

  it('describes a decrease', () => {
    const text = describeEventCorrelation({ before_count: 10, after_count: 5 });
    expect(text).toContain('decreased 50%');
  });

  it('describes no change', () => {
    const text = describeEventCorrelation({ before_count: 10, after_count: 10 });
    expect(text).toBe('Case volume was unchanged (10 before, 10 after this event).');
  });

  it('handles a zero before-count without dividing by zero', () => {
    const text = describeEventCorrelation({ before_count: 0, after_count: 5 });
    expect(text).toContain('No cases were recorded in the period before this event, and 5 in the period after');
  });

  it('handles no data at all', () => {
    expect(describeEventCorrelation({ before_count: 0, after_count: 0 })).toBe('No cases recorded in the windows before or after this event.');
  });

  it('handles missing data gracefully', () => {
    expect(describeEventCorrelation(null)).toBe('No cases recorded in the windows before or after this event.');
  });
});
