import { authedFetch } from './authedFetch.js';

// Human UAT remediation, Batch 2, Part 12 — maxTokens is optional
// (defaults to the original 2048, unchanged for every existing caller)
// so a longer document (e.g. concludeInvestigation's multi-part
// investigation report, previously a non-streaming 3400-token call with
// no visible progress until the whole thing finished) can stream too,
// without truncating.
export async function streamClaude(system, user, onChunk, maxTokens = 2048) {
  const res = await authedFetch("/api/chat", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "anthropic-version":"2023-06-01",
    },
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:maxTokens, stream:true, system, messages:[{ role:"user", content:user }] })
  });
  if(!res.ok) { const e = await res.text(); throw new Error(`API ${res.status}: ${e.slice(0,200)}`); }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while(true) {
    const { done, value } = await reader.read();
    if(done) break;
    for(const line of dec.decode(value).split("\n")) {
      if(!line.startsWith("data: ")) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if(d.type==="content_block_delta" && d.delta?.text) { full += d.delta.text; onChunk(full); }
      } catch(e) {}
    }
  }
  return full;
}
