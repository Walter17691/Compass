import { verifyCaller } from './_auth.js';
import { checkRateLimit } from './_rateLimit.js';

// VERCEL_ENV (not NODE_ENV, which Vercel functions always run as
// "production") is 'development' under `vercel dev` and 'preview' on
// preview deployments — 'production' only on the real production deploy.
const isDev = process.env.VERCEL_ENV !== 'production';

function logCacheUsage(usage) {
  if (!usage) return;
  console.log('[claude usage]', {
    input_tokens: usage.input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  });
}

// Streaming responses carry usage on the `message_start` SSE event. Scans
// complete "event\ndata: {...}\n\n" chunks out of the buffer without
// altering what's written to the client.
function logCacheUsageFromSseBuffer(buffer) {
  let idx;
  while ((idx = buffer.indexOf('\n\n')) !== -1) {
    const chunk = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    const dataLine = chunk.split('\n').find(l => l.startsWith('data: '));
    if (!dataLine) continue;
    try {
      const parsed = JSON.parse(dataLine.slice(6));
      if (parsed.type === 'message_start') logCacheUsage(parsed.message?.usage);
    } catch { /* ignore partial/non-JSON chunk */ }
  }
  return buffer;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const withinLimit = await checkRateLimit(`chat:${caller.id}`, 30, 300);
  if (!withinLimit) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });
  }

  try {
    const body = req.body;
    const isStreaming = body.stream === true;

    // Automatic prompt caching: every caller already sends a stable system
    // prompt followed by dynamic content in `messages`, so a single
    // top-level breakpoint (auto-placed on the last cacheable block) is
    // enough here — no per-caller changes needed. Skip requests with no
    // system prompt (nothing stable to cache) and don't clobber a caller
    // that already set its own cache_control.
    const requestBody = (body.system && !body.cache_control)
      ? { ...body, cache_control: { type: 'ephemeral', ttl: '1h' } }
      : body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.status(response.status);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const decoded = decoder.decode(value);
        res.write(decoded);
        if (isDev) {
          sseBuffer = logCacheUsageFromSseBuffer(sseBuffer + decoded);
        }
      }
      res.end();
    } else {
      const data = await response.json();
      if (isDev) logCacheUsage(data.usage);
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
