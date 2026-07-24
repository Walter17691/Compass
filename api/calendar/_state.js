import crypto from 'crypto';

export function signState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.CALENDAR_STATE_SECRET).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

export function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null;
  const [encoded, sig] = state.split('.');
  const expectedSig = crypto.createHmac('sha256', process.env.CALENDAR_STATE_SECRET).update(encoded).digest('hex');
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()); } catch { return null; }
  if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
  return payload;
}
