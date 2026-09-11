import { describe, it, expect, vi } from 'vitest';

// Production incident (2026-09-11) — every existing invitation test
// imported _invite-member.js/_team-invites.js/_accept-team-invite.js's
// handler directly, so none of them exercised [...action].js's own
// req.url-based dispatch — the actual mechanism Vercel's routing hits in
// production. These tests exercise dispatch() the same way Vercel does:
// by URL, not by importing a named export.
//
// The incident itself (a stale client still calling the removed
// top-level /api/invite-member path) isn't reproducible here: Vercel's
// own edge router never invokes this function for that path at all — it
// only routes requests under /api/team/* here in the first place, and
// returns its own 404 before any function code runs. That boundary was
// confirmed directly against production, not unit-tested.
vi.mock('./_invite-member.js', () => ({ inviteMember: vi.fn((req, res) => res.status(200).json({ from: 'invite-member' })) }));
vi.mock('./_team-invites.js', () => ({ teamInvites: vi.fn((req, res) => res.status(200).json({ from: 'team-invites' })) }));
vi.mock('./_accept-team-invite.js', () => ({ acceptTeamInvite: vi.fn((req, res) => res.status(200).json({ from: 'accept-team-invite' })) }));

const { default: dispatch } = await import('./[...action].js');

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('api/team/[...action].js — production routing contract', () => {
  it('routes POST /api/team/invite-member to the invite-member handler', async () => {
    const res = mockRes();
    await dispatch({ url: '/api/team/invite-member', method: 'POST' }, res);
    expect(res.body).toEqual({ from: 'invite-member' });
  });

  it('routes GET /api/team/team-invites?orgId=... (query string included in req.url) to the team-invites handler', async () => {
    const res = mockRes();
    await dispatch({ url: '/api/team/team-invites?orgId=org-1', method: 'GET' }, res);
    expect(res.body).toEqual({ from: 'team-invites' });
  });

  it('routes POST /api/team/accept-team-invite to the accept-team-invite handler', async () => {
    const res = mockRes();
    await dispatch({ url: '/api/team/accept-team-invite', method: 'POST' }, res);
    expect(res.body).toEqual({ from: 'accept-team-invite' });
  });

  it('404s an unknown action instead of guessing', async () => {
    const res = mockRes();
    await dispatch({ url: '/api/team/not-a-real-action', method: 'GET' }, res);
    expect(res.statusCode).toBe(404);
  });
});
