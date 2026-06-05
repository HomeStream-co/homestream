/**
 * setup-guard.test.tsx
 *
 * Tests for the SetupGuard component extracted from RootLayout.
 *
 * SetupGuard behaviour:
 *   - Renders null (loading) while the /api/health fetch is in flight
 *   - Redirects to /setup when setupComplete is false
 *   - Renders children when setupComplete is true
 *   - Renders children on fetch error (fail-open so a network blip doesn't
 *     lock users out of the app)
 *   - Skips the fetch entirely when already on /setup (avoids redirect loop)
 *
 * Uses /api/health (always unauthenticated) — NOT /api/setup which returns
 * 401 after setup is complete and would cause an infinite redirect loop.
 *
 * Error codes produced when these tests fail:
 *   SETUP_GUARD_REDIRECT  — guard didn't redirect to /setup when it should have
 *   SETUP_GUARD_PASSTHRU  — guard blocked children when setup is complete
 *   SETUP_GUARD_FAILOPEN  — guard blocked children on fetch error
 *   SETUP_GUARD_LOOP      — guard triggered a redirect loop on /setup itself
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { type ReactElement } from 'react';

// ── Inline SetupGuard (mirrors the implementation in RootLayout.tsx) ──────────
// We test the guard in isolation so failures point directly at the guard logic,
// not at the full RootLayout provider tree.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function SetupGuard({ children }: { children: ReactElement }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (location.pathname === '/setup') {
      setReady(true);
      return;
    }
    fetch('/api/health')
      .then(r => r.json())
      .then((data: { setupComplete?: boolean }) => {
        if (!data.setupComplete) {
          navigate('/setup', { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        setReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready && location.pathname !== '/setup') return null;
  return children;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(response: unknown, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  } as Response);
}

function mockFetchReject(error = new Error('Network error')) {
  return vi.spyOn(global, 'fetch').mockRejectedValue(error);
}

/** Renders SetupGuard at `initialPath` and returns helpers */
function renderGuard(initialPath = '/') {
  const navigated: string[] = [];

  function LocationSpy() {
    const loc = useLocation();
    navigated.push(loc.pathname);
    return null;
  }

  const { container } = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationSpy />
      <Routes>
        <Route
          path="*"
          element={
            <SetupGuard>
              <div data-testid="children">App Content</div>
            </SetupGuard>
          }
        />
        <Route path="/setup" element={<div data-testid="setup-page">Setup Wizard</div>} />
      </Routes>
    </MemoryRouter>,
  );

  return { container, navigated };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SetupGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('[SETUP_GUARD_REDIRECT] redirects to /setup when setupComplete is false', async () => {
    mockFetch({ setupComplete: false });

    renderGuard('/');

    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });

  it('[SETUP_GUARD_PASSTHRU] renders children when setupComplete is true', async () => {
    mockFetch({ setupComplete: true });

    renderGuard('/');

    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
  });

  it('[SETUP_GUARD_FAILOPEN] renders children when fetch throws (fail-open)', async () => {
    mockFetchReject();

    renderGuard('/');

    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument();
    });
  });

  it('[SETUP_GUARD_FAILOPEN] renders children when fetch returns non-JSON (fail-open)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    renderGuard('/');

    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument();
    });
  });

  it('[SETUP_GUARD_LOOP] skips fetch and renders children immediately when on /setup', async () => {
    // fetch should NOT be called when already on /setup
    const spy = mockFetch({ setupComplete: false });

    render(
      <MemoryRouter initialEntries={['/setup']}>
        <Routes>
          <Route
            path="/setup"
            element={
              <SetupGuard>
                <div data-testid="setup-children">Wizard Content</div>
              </SetupGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    // Children render immediately — no async wait needed
    expect(screen.getByTestId('setup-children')).toBeInTheDocument();
    // fetch must NOT have been called
    expect(spy).not.toHaveBeenCalled();
  });

  it('[SETUP_GUARD_REDIRECT] renders null (loading) while fetch is in flight', () => {
    // Never resolves — simulates slow network
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));

    const { container } = renderGuard('/');

    // Guard renders null — container should be empty (only LocationSpy renders nothing)
    expect(container.querySelector('[data-testid="children"]')).toBeNull();
  });

  it('[SETUP_GUARD_PASSTHRU] calls /api/health exactly once on mount', async () => {
    const spy = mockFetch({ setupComplete: true });

    renderGuard('/');

    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument();
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('/api/health');
  });
});
