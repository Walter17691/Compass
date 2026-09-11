import { randomBytes, createHash } from 'crypto';

// Final security gate (Release 1.0 P1 invitation remediation) — the raw
// token is a bearer credential capable of granting organisation
// membership on its own. 32 random bytes (256 bits) comfortably exceeds
// what's needed for brute-force resistance; the reason for this specific
// design is what gets PERSISTED: only the SHA-256 hash ever reaches
// team_invites.token_hash, so a database-level read (Supabase dashboard,
// a backup, a future support/debug query) discloses nothing usable — the
// raw token exists only in the invitation email/URL and the caller's own
// acceptance request, never in a table, a log line, or an audit event.
export function generateTeamInviteToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashTeamInviteToken(raw) };
}

export function hashTeamInviteToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}
