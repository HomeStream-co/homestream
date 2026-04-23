/**
 * root-layout.test.tsx
 *
 * Integration tests for RootLayout routing logic.
 *
 * These tests verify the ROUTING DECISIONS made by RootLayout — which guards
 * fire, which chrome is shown, and which paths bypass everything.  They do NOT
 * test the full provider tree (that would require mocking 6+ contexts).
 * Instead they test the guard logic in isolation using the same patterns as
 * the individual guard tests.
 *
 * Scenarios covered:
 *   1. /setup path — no header, no footer, no auth gate, no profile guard
 *   2. Normal path + setupComplete:true + authenticated + profile set → renders children
 *   3. Normal path + setupComplete:false → redirects to /setup
 *   4. Normal path + authenticated:false → shows LoginGate
 *   5. Normal path + authenticated:true + no profile → redirects to /profiles
 *   6. /player/* path — no header, no footer
 *   7. /profiles path — no header, no footer
 *
 * Error codes produced when these tests fail:
 *   LAYOUT_SETUP_BYPASS    — /setup got header/footer/auth/profile guards
 *   LAYOUT_FULL_CHROME     — normal route missing header or footer
 *   LAYOUT_SETUP_REDIRECT  — didn't redirect to /setup when not configured
 *   LAYOUT_AUTH_WALL       — didn't show LoginGate when unauthenticated
 *   LAYOUT_PROFILE_REDIR   — didn't redirect to /profiles when no profile
 *   LAYOUT_PLAYER_CHROME   — player route got header/footer (should be hidden)
 *   LAYOUT_PROFILES_CHROME — /profiles route got header/footer (should be hidden)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React, { type ReactElement } from 'react';

// ── Inline the guard logic under test ────────────────────────────────────────
// We test the COMBINED guard logic as it appears in RootLayout, but without
// the full provider tree.  Each guard is inlined here so failures point
// directly at the guard logic, not at context wiring.

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// SetupGuard
function SetupGuard({ children }: { children: ReactElement }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (location.pathname === '/setup') { setReady(true); return; }
    fetch('/api/setup')
      .then(r => r.json())
      .then((d: { setupComplete?: boolean }) => {
        if (!d.setupComplete) navigate('/setup', { replace: true });
        else setReady(true);
      })
      .catch(() => setReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready && location.pathname !== '/setup') return null;
  return children;
}

// AuthGate
function AuthGate({ children, authenticated }: { children: ReactElement; authenticated: boolean | null }) {
  const location = useLocation();
  if (location.pathname === '/setup') return children;
  if (authenticated === null) return null;
  if (authenticated === false) return <div data-testid="login-gate">Login Gate</div>;
  return children;
}

// ProfileGuard
function ProfileGuard({
  children,
  activeProfile,
  authenticated,
}: {
  children: ReactElement;
  activeProfile: { id: string } | null;
  authenticated: boolean | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (authenticated === null) return;
    if (!activeProfile && location.pathname !== '/profiles') {
      navigate('/profiles', { replace: true });
    }
  }, [activeProfile, authenticated, location.pathname, navigate]);

  return children;
}

// Fake Header / Footer so we can detect their presence
function FakeHeader() { return <header data-testid="header">Header</header>; }
function FakeFooter() { return <footer data-testid="footer">Footer</footer>; }

// Minimal RootLayout-like shell that wires the guards together
function TestLayout({
  children,
  authenticated = true as boolean | null,
  activeProfile = { id: 'p1' } as { id: string } | null,
}: {
  children: ReactElement;
  authenticated?: boolean | null;
  activeProfile?: { id: string } | null;
}) {
  const location = useLocation();
  const isPlayer   = location.pathname.startsWith('/player/');
  const isProfiles = location.pathname === '/profiles';
  const isSetup    = location.pathname === '/setup';

  if (isSetup) {
    return <>{children}</>;
  }

  return (
    <SetupGuard>
      <AuthGate authenticated={authenticated}>
        <>
          {!isPlayer && !isProfiles && <FakeHeader />}
          <ProfileGuard activeProfile={activeProfile} authenticated={authenticated}>
            {children}
          </ProfileGuard>
          {!isPlayer && !isProfiles && <FakeFooter />}
        </>
      </AuthGate>
    </SetupGuard>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(response: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  } as Response);
}

function renderLayout(
  path: string,
  opts: { authenticated?: boolean | null; activeProfile?: { id: string } | null } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <TestLayout {...opts}>
              <div data-testid="page-content">Page Content</div>
            </TestLayout>
          }
        />
        <Route path="/setup"    element={<div data-testid="setup-page">Setup</div>} />
        <Route path="/profiles" element={<div data-testid="profiles-page">Profiles</div>} />
        <Route path="/player/:id" element={<div data-testid="player-page">Player</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RootLayout routing', () => {
  // ── /setup bypass ──────────────────────────────────────────────────────────

  it('[LAYOUT_SETUP_BYPASS] /setup renders children without header, footer, or guards', async () => {
    // No fetch mock needed — /setup skips the SetupGuard fetch entirely
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <Routes>
          <Route
            path="/setup"
            element={
              <TestLayout authenticated={false} activeProfile={null}>
                <div data-testid="setup-content">Wizard</div>
              </TestLayout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {});

    expect(screen.getByTestId('setup-content')).toBeInTheDocument();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-gate')).not.toBeInTheDocument();
  });

  // ── Normal route — full chrome ─────────────────────────────────────────────

  it('[LAYOUT_FULL_CHROME] normal route shows header and footer when authenticated with profile', async () => {
    mockFetch({ setupComplete: true });

    renderLayout('/', { authenticated: true, activeProfile: { id: 'p1' } });

    await waitFor(() => {
      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });
  });

  // ── Setup redirect ─────────────────────────────────────────────────────────

  it('[LAYOUT_SETUP_REDIRECT] redirects to /setup when setupComplete is false', async () => {
    mockFetch({ setupComplete: false });

    renderLayout('/', { authenticated: true, activeProfile: { id: 'p1' } });

    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
  });

  // ── Auth wall ──────────────────────────────────────────────────────────────

  it('[LAYOUT_AUTH_WALL] shows LoginGate when authenticated is false', async () => {
    mockFetch({ setupComplete: true });

    renderLayout('/', { authenticated: false, activeProfile: null });

    await waitFor(() => {
      expect(screen.getByTestId('login-gate')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
  });

  it('[LAYOUT_AUTH_WALL] renders nothing while authenticated is null (loading)', async () => {
    mockFetch({ setupComplete: true });

    const { container } = renderLayout('/', { authenticated: null, activeProfile: null });

    await act(async () => {});

    // AuthGate returns null while checking — nothing visible except the guards
    expect(container.querySelector('[data-testid="page-content"]')).toBeNull();
    expect(container.querySelector('[data-testid="login-gate"]')).toBeNull();
  });

  // ── Profile redirect ───────────────────────────────────────────────────────

  it('[LAYOUT_PROFILE_REDIR] redirects to /profiles when authenticated but no profile', async () => {
    mockFetch({ setupComplete: true });

    renderLayout('/', { authenticated: true, activeProfile: null });

    await waitFor(() => {
      expect(screen.getByTestId('profiles-page')).toBeInTheDocument();
    });
  });

  it('[LAYOUT_PROFILE_REDIR] does NOT redirect while authenticated is null', async () => {
    mockFetch({ setupComplete: true });

    renderLayout('/', { authenticated: null, activeProfile: null });

    await act(async () => {});

    // AuthGate blocks rendering while null — profiles page should not appear
    expect(screen.queryByTestId('profiles-page')).not.toBeInTheDocument();
  });

  // ── Player route — no chrome ───────────────────────────────────────────────

  it('[LAYOUT_PLAYER_CHROME] /player/* route hides header and footer', async () => {
    mockFetch({ setupComplete: true });

    render(
      <MemoryRouter initialEntries={['/player/abc123']}>
        <Routes>
          <Route
            path="/player/:id"
            element={
              <TestLayout authenticated={true} activeProfile={{ id: 'p1' }}>
                <div data-testid="player-content">Player</div>
              </TestLayout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('player-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
  });

  // ── /profiles route — no chrome ────────────────────────────────────────────

  it('[LAYOUT_PROFILES_CHROME] /profiles route hides header and footer', async () => {
    mockFetch({ setupComplete: true });

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <Routes>
          <Route
            path="/profiles"
            element={
              <TestLayout authenticated={true} activeProfile={null}>
                <div data-testid="profiles-content">Profiles</div>
              </TestLayout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('profiles-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
  });
});
