import { useState, useEffect } from 'react';
import { runningBuildId, fetchDeployedBuildId, isStaleBuild } from '../lib/buildVersion';

// How often an open tab asks whether it is still current. Ten minutes is far
// below the time a meeting takes and far above anything that could be called
// polling — and the check also runs whenever the tab is brought back to the
// front, which is when a manager is about to act on what they see.
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// Reports whether this tab is running a superseded build. Reports only — see
// buildVersion.js for why nothing here reloads anything.
export function useBuildStaleness({ intervalMs = CHECK_INTERVAL_MS } = {}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const running = runningBuildId();
    // No entry chunk means this is not a built page (jsdom, dev server). Do
    // nothing at all rather than fetch on every mount.
    if (!running) return undefined;

    let cancelled = false;
    const check = async () => {
      const deployed = await fetchDeployedBuildId();
      if (!cancelled && isStaleBuild(running, deployed)) setStale(true);
    };

    check();
    const timer = setInterval(check, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return stale;
}
