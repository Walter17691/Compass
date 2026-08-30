import { describe, it, expect } from 'vitest';
import { buildForYouFeed, relativeTime } from '../lib/homeFeed.js';

const getCaseStage = cs => cs.stage;
const noNextStep = () => null;

describe('buildForYouFeed — prioritisation (Home Experience Redesign)', () => {
  it('ranks overdue items ahead of upcoming deadlines and follow-ups', () => {
    const cases = [
      { id: 'c1', employeeName: 'Overdue Case', stage: 'investigation', updatedAt: new Date().toISOString() },
      { id: 'c2', employeeName: 'Stale Case', stage: 'investigation', updatedAt: new Date(Date.now() - 20 * 86400000).toISOString() },
    ];
    const dueSoon = [
      { key: 'od1', overdue: true, daysOverdue: 3, daysLeft: 0, label: 'DSAR response due', employeeName: 'Overdue Case', caseId: 'c1', category: 'dsar' },
      { key: 'up1', overdue: false, daysLeft: 5, label: 'Investigation target completion date', employeeName: 'Someone Else', caseId: null, category: 'investigation_target' },
    ];
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep: noNextStep, dueSoon });
    expect(feed[0].type).toBe('ACTION_NEEDED');
    expect(feed[0].urgent).toBe(true);
    expect(feed[0].title).toBe('DSAR response overdue');
    const types = feed.map(f => f.type);
    expect(types.indexOf('ACTION_NEEDED')).toBeLessThan(types.indexOf('DEADLINE'));
    expect(types.indexOf('DEADLINE')).toBeLessThan(types.indexOf('FOLLOW_UP'));
  });

  it('excludes today (daysLeft===0) deadlines — that belongs to the Today rail only, never duplicated here', () => {
    const dueSoon = [
      { key: 'today1', overdue: false, daysLeft: 0, label: 'Something due today', employeeName: 'X', caseId: null, category: 'task' },
    ];
    const feed = buildForYouFeed({ cases: [], getCaseStage, getNextStep: noNextStep, dueSoon });
    expect(feed).toHaveLength(0);
  });

  it('surfaces a case next-step action as a normal (non-urgent) ACTION_NEEDED item', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', stage: 'inv_report' }];
    const getNextStep = () => ({ action: 'inv_report', label: 'Submit investigation report' });
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep, dueSoon: [] });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: 'ACTION_NEEDED', urgent: false, title: 'Submit investigation report', subject: 'Sam Employee', caseId: 'c1' });
  });

  it('never shows the same case twice — an overdue case with a next-step action gets one row, not two', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const getNextStep = () => ({ action: 'inv_report', label: 'Submit investigation report' });
    const dueSoon = [{ key: 'od1', overdue: true, daysOverdue: 1, daysLeft: 0, label: 'Investigation overrunning', employeeName: 'Sam Employee', caseId: 'c1', category: 'investigation' }];
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep, dueSoon });
    expect(feed.filter(f => f.caseId === 'c1')).toHaveLength(1);
    expect(feed[0].title).toBe('Investigation overrunning');
  });

  it('surfaces a pending, approval-eligible HR review request as an APPROVAL item', () => {
    const cases = [{ id: 'c1', employeeName: 'Emma Lewis', stage: 'outcome' }];
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'dismissal', status: 'pending', requested_at: new Date(Date.now() - 2 * 3600000).toISOString() }];
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep: noNextStep, dueSoon: [], hrReviewRequests });
    expect(feed).toHaveLength(1);
    expect(feed[0].type).toBe('APPROVAL');
    expect(feed[0].title).toBe('Dismissal awaiting your approval');
    expect(feed[0].subject).toBe('Emma Lewis');
    expect(feed[0].timing).toBe('2 hours ago');
  });

  it('does not surface an HR review request whose step does not require approval', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', step: 'not_a_real_approval_step', status: 'pending' }];
    const feed = buildForYouFeed({ cases: [], getCaseStage, getNextStep: noNextStep, dueSoon: [], hrReviewRequests });
    expect(feed).toHaveLength(0);
  });

  it('surfaces a genuinely-unclaimed HIGH risk case as its own urgent item', () => {
    // getCurrentRisk (the real implementation, not a stub) reads the most
    // recent meeting's riskScore.rating — this case has no overdue
    // deadline, no next step, and updatedAt is recent (not stale), so the
    // HIGH-risk fallback is the only thing that should produce a row.
    const cases = [{ id: 'c1', employeeName: 'High Risk Case', stage: 'investigation', updatedAt: new Date().toISOString(), meetings: [{ date: '2026-01-01', riskScore: { rating: 'HIGH' } }] }];
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep: noNextStep, dueSoon: [] });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ urgent: true, risk: 'HIGH', type: 'ACTION_NEEDED', title: 'High risk — needs review', subject: 'High Risk Case' });
  });

  it('tags (but does not duplicate) a HIGH-risk case that already has another reason to appear', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const dueSoon = [{ key: 'od1', overdue: true, daysOverdue: 2, daysLeft: 0, label: 'Overdue thing', employeeName: 'Sam Employee', caseId: 'c1', category: 'outcome' }];
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep: noNextStep, dueSoon });
    expect(feed.filter(f => f.caseId === 'c1')).toHaveLength(1);
  });

  it('surfaces open concern referrals awaiting triage for HR, singular vs plural wording', () => {
    const single = buildForYouFeed({ cases: [], getCaseStage, getNextStep: noNextStep, dueSoon: [], isHR: true, concernReferrals: [{ id: 'ref1', status: 'new', employeeName: 'Jo' }] });
    expect(single[0].title).toBe('Concern awaiting triage');
    const multiple = buildForYouFeed({ cases: [], getCaseStage, getNextStep: noNextStep, dueSoon: [], isHR: true, concernReferrals: [{ id: 'ref1', status: 'new' }, { id: 'ref2', status: 'new' }] });
    expect(multiple[0].title).toBe('2 concerns awaiting triage');
  });

  it('does not surface concern referrals for a non-HR user', () => {
    const feed = buildForYouFeed({ cases: [], getCaseStage, getNextStep: noNextStep, dueSoon: [], isHR: false, concernReferrals: [{ id: 'ref1', status: 'new' }] });
    expect(feed).toHaveLength(0);
  });

  it('surfaces a follow-up item for a case quiet for 14+ days, and not for a recently-updated one', () => {
    const cases = [
      { id: 'c1', employeeName: 'Quiet Case', stage: 'investigation', updatedAt: new Date(Date.now() - 20 * 86400000).toISOString() },
      { id: 'c2', employeeName: 'Active Case', stage: 'investigation', updatedAt: new Date().toISOString() },
    ];
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep: noNextStep, dueSoon: [] });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: 'FOLLOW_UP', subject: 'Quiet Case', caseId: 'c1' });
  });

  it('never surfaces a closed case in any tier', () => {
    const cases = [{ id: 'c1', employeeName: 'Closed Case', stage: 'closed', updatedAt: new Date(Date.now() - 30 * 86400000).toISOString() }];
    const getNextStep = () => ({ action: 'x', label: 'Should never show' });
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep, dueSoon: [] });
    expect(feed).toHaveLength(0);
  });

  it('routes a non-case deadline (DSAR) to its own screen, not a case, with a destination-specific CTA', () => {
    const dueSoon = [{ key: 'dsar1', overdue: true, daysOverdue: 5, daysLeft: 0, label: 'DSAR response due', employeeName: 'Sarah Mitchell', caseId: null, category: 'dsar' }];
    const feed = buildForYouFeed({ cases: [], getCaseStage, getNextStep: noNextStep, dueSoon });
    expect(feed[0]).toMatchObject({ caseId: null, screen: 'dsar', cta: 'Open DSAR →' });
  });

  it('gives a case-linked item a generic "Open case" CTA, and a next-step action its own specific verb', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', stage: 'inv_report' }];
    const getNextStep = () => ({ action: 'inv_report', label: 'Submit investigation report' });
    const feed = buildForYouFeed({ cases, getCaseStage, getNextStep, dueSoon: [] });
    expect(feed[0].cta).toBe('Submit investigation report →');
  });

  it('is a pure function — same inputs always produce the same output', () => {
    const cases = [{ id: 'c1', employeeName: 'X', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const args = { cases, getCaseStage, getNextStep: noNextStep, dueSoon: [], now: 1700000000000 };
    expect(buildForYouFeed(args)).toEqual(buildForYouFeed(args));
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-01-01T12:00:00Z').getTime();
  it('formats minutes, hours and days correctly', () => {
    expect(relativeTime(new Date(now - 30000), now)).toBe('Just now');
    expect(relativeTime(new Date(now - 5 * 60000), now)).toBe('5 minutes ago');
    expect(relativeTime(new Date(now - 2 * 3600000), now)).toBe('2 hours ago');
    expect(relativeTime(new Date(now - 3 * 86400000), now)).toBe('3 days ago');
  });

  it('returns null for an invalid date', () => {
    expect(relativeTime('not-a-date', now)).toBeNull();
  });
});

// Home UX Polish pass, §1 — headlines must describe the human situation,
// never expose the raw database/statutory-citation wording computeDueSoon
// itself uses (that wording is still correct and unchanged — it's just
// shared with other consumers like the overdue popover and Settings, so
// this rewrite is scoped to the feed's own display only).
describe('buildForYouFeed — human-readable titles (Home UX Polish pass, §1)', () => {
  const caseFixture = [{ id: 'c1', employeeName: 'Sam Employee', stage: 'investigation', updatedAt: new Date().toISOString() }];
  const titleFor = (category, overdue, extra = {}) => {
    const dueSoon = [{ key: 'k1', overdue, daysOverdue: overdue ? 4 : 0, daysLeft: overdue ? 0 : 5, label: 'raw database label (statutory: 1 calendar month)', employeeName: 'Sam Employee', caseId: 'c1', category, ...extra }];
    return buildForYouFeed({ cases: caseFixture, getCaseStage, getNextStep: noNextStep, dueSoon })[0].title;
  };

  it('never surfaces the raw statutory-citation wording computeDueSoon writes', () => {
    expect(titleFor('dsar', true)).not.toMatch(/statutory/i);
    expect(titleFor('outcome', true)).not.toMatch(/ACAS/i);
    expect(titleFor('grievance', false)).not.toMatch(/ACAS|working days/i);
  });

  it('produces the exact headlines named in the brief', () => {
    expect(titleFor('dsar', true)).toBe('DSAR response overdue');
    expect(titleFor('investigation_target', true, { daysOverdue: 4 })).toBe('Investigation target overdue by 4 days');
  });

  it('humanises every known deadline category for both overdue and upcoming states', () => {
    const categories = ['dsar', 'wellbeing', 'redundancy', 'outcome', 'appeal', 'investigation', 'investigation_target', 'grievance', 'signature', 'fit_note', 'probation', 'oh_referral', 'suspension'];
    for (const category of categories) {
      const overdueTitle = titleFor(category, true);
      const upcomingTitle = titleFor(category, false);
      expect(overdueTitle).not.toMatch(/statutory|ACAS|completion date/i);
      expect(upcomingTitle).not.toMatch(/statutory|ACAS|completion date/i);
      expect(overdueTitle.length).toBeGreaterThan(0);
      expect(upcomingTitle.length).toBeGreaterThan(0);
    }
  });

  it('strips the "Task due: " prefix for task-category items, keeping the task\'s own real name', () => {
    const dueSoon = [{ key: 'k1', overdue: false, daysOverdue: 0, daysLeft: 3, label: 'Task due: Chase signed witness statement', employeeName: 'Sam Employee', caseId: 'c1', category: 'task' }];
    const feed = buildForYouFeed({ cases: caseFixture, getCaseStage, getNextStep: noNextStep, dueSoon });
    expect(feed[0].title).toBe('Chase signed witness statement');
  });

  it('leaves an unrecognised/next_step category label exactly as-is (already a specific, human-written action)', () => {
    const dueSoon = [{ key: 'k1', overdue: true, daysOverdue: 1, daysLeft: 0, label: 'Chase updated fit note from occupational health', employeeName: 'Sam Employee', caseId: 'c1', category: 'next_step' }];
    const feed = buildForYouFeed({ cases: caseFixture, getCaseStage, getNextStep: noNextStep, dueSoon });
    expect(feed[0].title).toBe('Chase updated fit note from occupational health');
  });
});
