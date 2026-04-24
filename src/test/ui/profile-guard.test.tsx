/**
 * profile-guard.test.tsx
 *
 * Tests for the ProfileGuard component extracted from RootLayout.
 *
 * ProfileGuard behaviour:
 *   - Does NOT redirect while authenticated === null (auth still resolving)
 *     This prevents the blank-screen race where the guard fires before the
 *     LoginGate has had a chance to render.
 *   - Redirects to /profiles when no active profile is set (and auth is known)
 *   - Does NOT redirect when already on /profiles
 *   - Renders children without redirecting when a profile is active
 *
 * Error codes produced when these tests fail:
 *   PROFILE_GUARD_RACE      — guard redirected while auth was still null
 *   PROFILE_GUARD_REDIRECT  — guard didn't redirect when profile is missing
 *   PROFILE_GUARD_LOOP      — guard redirected when already on /profiles
 *   PROFILE_GUARD_PASSTHRU  — guard blocked children when profile is set
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Inline ProfileGuard (mirrors RootLayout.tsx implementation) ───────────────

function ProfileGuard({
  children,
  activeProfile,
  authenticated,
}: {
  children: ReactElement;
  activeProfile: { id: string; name: string } | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_PROFILE = { id: 'p1', name: 'Alice' };

function renderGuard({
  initialPath = '/',
  activeProfile = null as { id: string; name: string } | null,
  authenticated = true as boolean | null,
} = {}) {
  const { container } = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <ProfileGuard activeProfile={activeProfile} authenticated={authenticated}>
              <div data-testid="children">Main Content</div>
            </ProfileGuard>
          }
        />
        <Route path="/profiles" element={<div data-testid="profiles-page">Profile Selector</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { container };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileGuard', () => {
  it('[PROFILE_GUARD_RACE] does NOT redirect while authenticated is null', async () => {
    // authenticated=null means auth check is still in flight
    renderGuard({ authenticated: null, activeProfile: null });

    // Give effects a tick to fire
    await act(async () => {});

    // Children should still be visible — no redirect yet
    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByTestId('profiles-page')).not.toBeInTheDocument();
  });

  it('[PROFILE_GUARD_REDIRECT] redirects to /profiles when no profile and auth is true', async () => {
    renderGuard({ authenticated: true, activeProfile: null });

    await waitFor(() => {
      expect(screen.getByTestId('profiles-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });

  it('[PROFILE_GUARD_REDIRECT] redirects to /profiles when no profile and auth is false', async () => {
    // Even if not authenticated, the guard still redirects (LoginGate handles auth separately)
    renderGuard({ authenticated: false, activeProfile: null });

    await waitFor(() => {
      expect(screen.getByTestId('profiles-page')).toBeInTheDocument();
    });
  });

  it('[PROFILE_GUARD_LOOP] does NOT redirect when already on /profiles', async () => {
    renderGuard({ initialPath: '/profiles', authenticated: true, activeProfile: null });

    await act(async () => {});

    // Should render children (the /profiles route content), not loop
    // The profiles route renders "Profile Selector" — guard should not re-redirect
    expect(screen.getByTestId('profiles-page')).toBeInTheDocument();
  });

  it('[PROFILE_GUARD_PASSTHRU] renders children without redirecting when profile is set', async () => {
    renderGuard({ authenticated: true, activeProfile: MOCK_PROFILE });

    await act(async () => {});

    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByTestId('profiles-page')).not.toBeInTheDocument();
  });

  it('[PROFILE_GUARD_PASSTHRU] renders children when authenticated is null but profile is set', async () => {
    // Profile already set from localStorage — auth check still pending
    renderGuard({ authenticated: null, activeProfile: MOCK_PROFILE });

    await act(async () => {});

    expect(screen.getByTestId('children')).toBeInTheDocument();
  });

  it('[PROFILE_GUARD_RACE] redirects after auth resolves from null to true', async () => {
    // Simulate auth resolving: start null, then flip to true
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <ProfileGuard activeProfile={null} authenticated={null}>
                <div data-testid="children">Main Content</div>
              </ProfileGuard>
            }
          />
          <Route path="/profiles" element={<div data-testid="profiles-page">Profile Selector</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // While null — no redirect
    await act(async () => {});
    expect(screen.getByTestId('children')).toBeInTheDocument();

    // Auth resolves to true — now guard should redirect
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <ProfileGuard activeProfile={null} authenticated={true}>
                <div data-testid="children">Main Content</div>
              </ProfileGuard>
            }
          />
          <Route path="/profiles" element={<div data-testid="profiles-page">Profile Selector</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('profiles-page')).toBeInTheDocument();
    });
  });
});
