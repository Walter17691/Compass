import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  runningBuildId,
  parseBuildId,
  isStaleBuild,
  fetchDeployedBuildId,
} from '../lib/buildVersion.js';
import { UpdateAvailableNotice } from '../components/UpdateAvailableNotice.jsx';
import { useBuildStaleness } from '../hooks/useBuildStaleness.js';

// ─────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the C3 production discrepancy.
//
// Human UAT reported production rendering the OLD live meeting 34 minutes
// after the new build went live. Production was correct: the served HTML is
// max-age=0/must-revalidate, the previous deployment's chunks 404, and a fresh
// load of the exact UAT route rendered the new screen. The tab had simply been
// open since before the deploy, and this is a single-page app — the manager
// navigated client-side for half an hour and never re-fetched index.html, so it
// kept executing the build it started with.
//
// Nothing warned them. That is the defect these tests pin: not the meeting
// screen, the absence of any build-staleness signal.
// ─────────────────────────────────────────────────────────────────────────

const htmlWith = src =>
  `<!doctype html><html><head><script type="module" crossorigin src="${src}"></script></head><body></body></html>`;

// The real Vercel Security Checkpoint body, reduced to its distinguishing
// shape: a self-contained interstitial with an INLINE module and no build
// asset. Encountered for real while verifying C3 — automated clients get this
// instead of the app, and it must never be mistaken for a new deployment.
const CHALLENGE_HTML =
  '<!doctype html><html><head><title>Vercel Security Checkpoint</title>' +
  '<script type="module">(()=>{})()</script></head><body></body></html>';

describe('buildVersion — identifying which build is running', () => {
  it('reads the running build id from the entry script', () => {
    const doc = new DOMParser().parseFromString(htmlWith('/assets/index-C0vNN1T9.js'), 'text/html');
    expect(runningBuildId(doc)).toBe('index-C0vNN1T9.js');
  });

  it('returns null when there is no built entry script, so it stays inert under test', () => {
    const doc = new DOMParser().parseFromString('<html><head></head><body></body></html>', 'text/html');
    expect(runningBuildId(doc)).toBeNull();
  });

  it('parses the deployed build id out of served HTML', () => {
    expect(parseBuildId(htmlWith('/assets/index-Bc71v_K0.js'))).toBe('index-Bc71v_K0.js');
  });

  it('ignores hashed assets that are not the entry chunk', () => {
    expect(parseBuildId(htmlWith('/assets/App-BHCrtU7G.js'))).toBeNull();
  });

  it('returns null for a bot-challenge interstitial rather than reporting a new build', () => {
    expect(parseBuildId(CHALLENGE_HTML)).toBeNull();
  });

  it('returns null for empty or non-string input', () => {
    expect(parseBuildId('')).toBeNull();
    expect(parseBuildId(null)).toBeNull();
  });
});

describe('isStaleBuild', () => {
  it('is false when the ids match', () => {
    expect(isStaleBuild('index-A.js', 'index-A.js')).toBe(false);
  });

  it('is true only when both ids are known and differ', () => {
    expect(isStaleBuild('index-A.js', 'index-B.js')).toBe(true);
  });

  it('is false when either id is unknown — never guess', () => {
    expect(isStaleBuild(null, 'index-B.js')).toBe(false);
    expect(isStaleBuild('index-A.js', null)).toBe(false);
    expect(isStaleBuild(null, null)).toBe(false);
  });
});

describe('fetchDeployedBuildId', () => {
  it('reads the id from the served document', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(htmlWith('/assets/index-NEW00001.js')) });
    await expect(fetchDeployedBuildId(f)).resolves.toBe('index-NEW00001.js');
    expect(f).toHaveBeenCalledWith('/', expect.objectContaining({ cache: 'no-store' }));
  });

  it('returns null on a non-OK response instead of throwing', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve(CHALLENGE_HTML) });
    await expect(fetchDeployedBuildId(f)).resolves.toBeNull();
  });

  // Deliberately a body that WOULD parse: otherwise dropping the res.ok guard
  // is an inert mutation, because an error page has no entry chunk in it anyway.
  it('ignores the body of a non-OK response even when it contains an entry chunk', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: false, status: 500, text: () => Promise.resolve(htmlWith('/assets/index-NEW00003.js')),
    });
    await expect(fetchDeployedBuildId(f)).resolves.toBeNull();
  });

  it('swallows network failure — a staleness check must never break the app', async () => {
    const f = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(fetchDeployedBuildId(f)).resolves.toBeNull();
  });
});

describe('useBuildStaleness — the mechanism, not just the helpers', () => {
  afterEach(() => {
    document.querySelectorAll('script[data-test-entry]').forEach(s => s.remove());
    vi.unstubAllGlobals();
  });

  const withEntryScript = src => {
    const s = document.createElement('script');
    s.setAttribute('src', src);
    s.setAttribute('data-test-entry', '1');
    document.head.appendChild(s);
  };

  const Probe = () => (useBuildStaleness({ intervalMs: 10 ** 7 }) ? <div>stale</div> : <div>current</div>);

  it('never calls the network on a page that has no built entry script', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('current')).toBeInTheDocument());
    expect(f).not.toHaveBeenCalled();
  });

  it('reports stale when the served entry chunk differs from the running one', async () => {
    withEntryScript('/assets/index-OLD00001.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(htmlWith('/assets/index-NEW00002.js')),
    }));
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('stale')).toBeInTheDocument());
  });

  it('stays quiet when the served entry chunk is the one already running', async () => {
    withEntryScript('/assets/index-SAME0001.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(htmlWith('/assets/index-SAME0001.js')),
    }));
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('current')).toBeInTheDocument());
    // give the resolved promise a chance to flip it wrongly
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByText('current')).toBeInTheDocument();
  });

  it('does not reload the page by itself when it finds a new build', async () => {
    withEntryScript('/assets/index-OLD00001.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(htmlWith('/assets/index-NEW00002.js')),
    }));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('stale')).toBeInTheDocument());
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('UpdateAvailableNotice', () => {
  let reload;
  beforeEach(() => {
    reload = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setup = (props = {}) =>
    render(<UpdateAvailableNotice stale={true} onReload={reload} {...props} />);

  it('renders nothing when the running build is current', () => {
    const { container } = render(<UpdateAvailableNotice stale={false} onReload={reload} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells the user a newer version is available', () => {
    setup();
    expect(screen.getByText(/newer version of Compass/i)).toBeInTheDocument();
  });

  it('never reloads on its own — the human chooses', () => {
    setup();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads only when the button is pressed', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed and stays dismissed', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/newer version of Compass/i)).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('is announced politely, not as an alert — it is not an emergency', () => {
    setup();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('warns against reloading mid-meeting, and does not make reload the primary action', () => {
    setup({ meetingInProgress: true });
    expect(screen.getByText(/finish this meeting/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /reload/i });
    // brand fill is the primary treatment in this design system; mid-meeting
    // the reload must not wear it
    expect(btn.style.background || '').not.toMatch(/7A2FD8|linear-gradient/i);
  });

  it('offers reload as the primary action when no meeting is in progress', () => {
    setup({ meetingInProgress: false });
    const btn = screen.getByRole('button', { name: /reload/i });
    expect(btn.style.background || '').toMatch(/7A2FD8|linear-gradient/i);
  });

  it('uses the cool token palette, never the retired cream or DM Sans', () => {
    const { container } = setup();
    const warm = [...container.querySelectorAll('*')].filter(el => {
      const cs = getComputedStyle(el);
      return /253,\s*250,\s*245|FDFAF5/i.test(
        [cs.backgroundColor, cs.borderTopColor, cs.borderBottomColor, cs.borderLeftColor, cs.borderRightColor, cs.color].join(' ')
      ) || /DM Sans/i.test(cs.fontFamily);
    });
    expect(warm).toEqual([]);
  });
});
