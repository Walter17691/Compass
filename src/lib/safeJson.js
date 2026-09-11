// A response whose Content-Type isn't application/json (Vercel's own
// text/plain 404 page, an edge/proxy error page, a route renamed out from
// under an already-loaded tab mid-deploy) would otherwise reach
// response.json() directly and throw a raw parser error — e.g.
// `Unexpected token 'T', "The page c"... is not valid JSON` — straight to
// the user instead of a message they can act on.
// Only rejects on a Content-Type we can positively confirm isn't JSON —
// a real fetch() Response always has a working .headers.get(), but a lot
// of this codebase's test mocks stub {ok, json} without a headers object
// at all, so falling back to response.json() when we can't tell keeps
// every one of those mocks (deliberately) valid JSON producers working.
export async function safeJson(response) {
  const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') : null;
  if (contentType && !contentType.includes('application/json')) {
    throw new Error('Unexpected response from the server — please try again.');
  }
  return response.json();
}
