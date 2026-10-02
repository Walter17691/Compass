// ─────────────────────────────────────────────────────────────────────────
// Is this tab running the build that is currently deployed?
//
// Compass is a single-page app. index.html is served max-age=0/must-revalidate
// and every asset filename is content-hashed, so a page LOAD always gets the
// current build and a superseded chunk 404s. What never happens on its own is
// the load: a manager opens Compass, works through People → a case → a meeting
// entirely client-side, and the tab keeps executing whatever build it started
// with — for as long as it stays open, across any number of deployments.
//
// That is how human UAT came to be looking at the previous live-meeting screen
// 34 minutes after its replacement went live, with production serving the new
// one correctly the whole time. Twice in this project a review cycle has been
// spent reconciling a "contradiction" that was only ever a tab older than the
// deploy, and neither time did the app give the slightest hint.
//
// ┌─ DELIBERATELY ADVISORY ─────────────────────────────────────────────────┐
// │ Nothing here reloads anything. It compares two strings and reports. A   │
// │ forced reload during a live disciplinary meeting would discard whatever │
// │ the chair had typed and not yet committed, so the reload is always the  │
// │ human's choice — see UpdateAvailableNotice.                             │
// │                                                                         │
// │ Every failure path returns null, which means "don't know" and shows     │
// │ nothing. Offline, a 5xx, or a bot-challenge interstitial must leave a   │
// │ working app completely untouched.                                       │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

// The Vite entry chunk specifically. Other hashed assets (App-*, ids-*, the
// lazy chunks) change independently of each other, and matching any of them
// would make this fire on builds that are not actually different.
const ENTRY = /\/assets\/(index-[A-Za-z0-9_-]+\.js)/;

// Which build this tab is executing, read from the script tag the document was
// served with. Returns null when there is no built entry script — which is the
// case under jsdom, so the whole mechanism is inert in tests by construction
// rather than by mocking.
export function runningBuildId(doc = typeof document === 'undefined' ? null : document) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  for (const el of doc.querySelectorAll('script[src]')) {
    const m = ENTRY.exec(el.getAttribute('src') || '');
    if (m) return m[1];
  }
  return null;
}

// Which build the server is handing out now, read from served HTML.
export function parseBuildId(html) {
  if (!html || typeof html !== 'string') return null;
  const m = ENTRY.exec(html);
  return m ? m[1] : null;
}

// Both must be known before this claims anything. An unknown id is not
// evidence of staleness, and guessing would put a reload prompt in front of a
// manager mid-meeting for no reason.
export function isStaleBuild(running, deployed) {
  if (!running || !deployed) return false;
  return running !== deployed;
}

export async function fetchDeployedBuildId(fetchImpl) {
  const f = fetchImpl || (typeof fetch === 'function' ? ((...a) => fetch(...a)) : null);
  if (!f) return null;
  try {
    // The document itself, revalidated. No new endpoint and therefore no new
    // serverless function — index.html is already must-revalidate and tiny.
    const res = await f('/', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    return parseBuildId(await res.text());
  } catch {
    return null;
  }
}
