// Phase 6.5 hardening (closes Prompt 11 audit finding 2.11, MEDIUM) — every
// OAuth callback (calendar/graph-mail, Google/Microsoft/Gmail) logged the
// full token-exchange response verbatim whenever it failed the
// refresh_token check, including a genuinely live access_token in the case
// where the provider returns one without a refresh_token (e.g. a user who
// had already granted access once before, so no re-consent prompt fired).
// A credential written to server logs is a credential compromised, no
// different from one committed to source — this keeps only the fields
// useful for diagnosing why an exchange failed.
const TOKEN_FIELD_PATTERN = /token/i;

export function redactTokenResponse(tokenData) {
  if (!tokenData || typeof tokenData !== 'object') return tokenData;
  const safe = {};
  for (const [key, value] of Object.entries(tokenData)) {
    safe[key] = TOKEN_FIELD_PATTERN.test(key) ? '[redacted]' : value;
  }
  return safe;
}
