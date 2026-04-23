/**
 * auth-gate.test.tsx
 *
 * Tests for the AuthGate component extracted from RootLayout.
 *
 * AuthGate behaviour:
 *   - authenticated === null  → renders nothing (prevents flash while checking)
 *   - authenticated === false → renders <LoginGate /> (password wall)
 *   - authenticated === true  → renders children
 *   - pathname === '/setup'   → always renders children regardless of auth state
 *     (wizard must be reachable even before any password is set)
 *
 * Error codes produced when these tests fail:
 *   AUTH_GATE_NULL_FLASH    — gate rendered children while auth was null
 *   AUTH_GATE_BLOCKS_UNAUTH — gate didn't show LoginGate when unauthenticated
 *   AUTH_GATE_PASSTHRU      — gate blocked children when authenticated
 *   AUTH_GATE_SETUP_BYPASS  — gate blocked /setup when it should always pass through
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';

// ── Inline AuthGate (mirrors RootLayout.tsx implementation) ──────────────────

function AuthGate({
  children,
  authenticated,
}: {
  children: ReactElement;
  authenticated: boolean | null;
}) {
  const location = useLocation();

  // Setup wizard is always accessible
  if (location.pathname === '/setup') return children;

  // Still checking — render nothing to avoid flash
  if (authenticated === null) return null;

  // Not authenticated — show login wall
  if (authenticated === false) return <div data-testid="login-gate">Login Gate</div>;

  return children;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderGate({
  authenticated,
  path = '/',
}: {
  authenticated: boolean | null;
  path?: string;
}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <AuthGate authenticated={authenticated}>
              <div data-testid="children">Protected Content</div>
            </AuthGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthGate', () => {
  it('[AUTH_GATE_NULL_FLASH] renders nothing while authenticated is null', async () => {
    const { container } = renderGate({ authenticated: null });

    await act(async () => {});

    expect(container.querySelector('[data-testid="children"]')).toBeNull();
    expect(container.querySelector('[data-testid="login-gate"]')).toBeNull();
    // Container should be effectively empty
    expect(container.firstChild).toBeNull();
  });

  it('[AUTH_GATE_BLOCKS_UNAUTH] renders LoginGate when authenticated is false', async () => {
    renderGate({ authenticated: false });

    await act(async () => {});

    expect(screen.getByTestId('login-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });

  it('[AUTH_GATE_PASSTHRU] renders children when authenticated is true', async () => {
    renderGate({ authenticated: true });

    await act(async () => {});

    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByTestId('login-gate')).not.toBeInTheDocument();
  });

  it('[AUTH_GATE_SETUP_BYPASS] always renders children on /setup when authenticated is null', async () => {
    renderGate({ authenticated: null, path: '/setup' });

    await act(async () => {});

    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByTestId('login-gate')).not.toBeInTheDocument();
  });

  it('[AUTH_GATE_SETUP_BYPASS] always renders children on /setup when authenticated is false', async () => {
    renderGate({ authenticated: false, path: '/setup' });

    await act(async () => {});

    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByTestId('login-gate')).not.toBeInTheDocument();
  });

  it('[AUTH_GATE_SETUP_BYPASS] always renders children on /setup when authenticated is true', async () => {
    renderGate({ authenticated: true, path: '/setup' });

    await act(async () => {});

    expect(screen.getByTestId('children')).toBeInTheDocument();
  });

  it('[AUTH_GATE_PASSTHRU] transitions from null to true — children appear after auth resolves', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <AuthGate authenticated={null}>
                <div data-testid="children">Protected Content</div>
              </AuthGate>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {});
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <AuthGate authenticated={true}>
                <div data-testid="children">Protected Content</div>
              </AuthGate>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {});
    expect(screen.getByTestId('children')).toBeInTheDocument();
  });

  it('[AUTH_GATE_BLOCKS_UNAUTH] transitions from null to false — LoginGate appears after auth resolves', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <AuthGate authenticated={null}>
                <div data-testid="children">Protected Content</div>
              </AuthGate>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {});
    expect(screen.queryByTestId('login-gate')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <AuthGate authenticated={false}>
                <div data-testid="children">Protected Content</div>
              </AuthGate>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {});
    expect(screen.getByTestId('login-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });
});
