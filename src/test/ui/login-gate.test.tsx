/**
 * login-gate.test.tsx
 *
 * Tests for the LoginGate component (src/components/LoginGate.tsx).
 *
 * LoginGate behaviour:
 *   - Renders the password input and Sign In button
 *   - Sign In button is disabled when the password field is empty
 *   - Calls login() from AuthContext on form submit
 *   - Shows a spinner and "Signing in…" text while loading
 *   - Shows an error message when login() returns { ok: false }
 *   - Clears the password field after a failed attempt
 *   - Calls login() with the typed password
 *   - Toggle button reveals / hides the password
 *
 * Error codes produced when these tests fail:
 *   LOGIN_GATE_RENDER      — component didn't render expected elements
 *   LOGIN_GATE_DISABLED    — submit button wasn't disabled on empty input
 *   LOGIN_GATE_SUBMIT      — login() wasn't called on form submit
 *   LOGIN_GATE_LOADING     — spinner / loading text not shown during request
 *   LOGIN_GATE_ERROR       — error message not shown after failed login
 *   LOGIN_GATE_CLEAR       — password field not cleared after failure
 *   LOGIN_GATE_TOGGLE      — show/hide password toggle didn't work
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mock AuthContext ──────────────────────────────────────────────────────────
// LoginGate calls useAuth().login(password) and reads nothing else.
// Use the full relative path so Vite's alias resolver finds it in jsdom env.

const mockLogin = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// ── Mock motion/react ─────────────────────────────────────────────────────────
// Animations would require a real DOM animation engine — stub them out.

vi.mock('motion/react', () => ({
  motion: {
    p:   ({ children, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...p}>{children}</p>,
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>)       => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import LoginGate from '@/components/LoginGate';
import React from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderLoginGate() {
  return render(<LoginGate />);
}

// ── Timer management ──────────────────────────────────────────────────────────
// LoginGate calls setTimeout(() => setShake(false), 600) after a failed login.
// If that timer fires after jsdom tears down, React's scheduler throws
// "window is not defined" — an unhandled error that fails the whole test run.
//
// Strategy: use shouldAdvanceTime:true so real-time async (waitFor, promises)
// still works, but we can also call vi.runAllTimers() in afterEach to drain
// the 600ms shake timer before jsdom is destroyed.

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  // Drain any pending timers (e.g. the 600ms shake reset) inside act() so
  // React can flush the resulting state update before jsdom tears down.
  act(() => { vi.runAllTimers(); });
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginGate', () => {
  it('[LOGIN_GATE_RENDER] renders password input and Sign In button', () => {
    renderLoginGate();

    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('[LOGIN_GATE_DISABLED] Sign In button is disabled when password is empty', () => {
    renderLoginGate();

    const btn = screen.getByRole('button', { name: /sign in/i });
    expect(btn).toBeDisabled();
  });

  it('[LOGIN_GATE_DISABLED] Sign In button is enabled once password is typed', async () => {
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    await userEvent.type(input, 'secret');

    const btn = screen.getByRole('button', { name: /sign in/i });
    expect(btn).not.toBeDisabled();
  });

  it('[LOGIN_GATE_SUBMIT] calls login() with the typed password on submit', async () => {
    mockLogin.mockResolvedValue({ ok: true });
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    await userEvent.type(input, 'mypassword');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockLogin).toHaveBeenCalledWith('mypassword');
  });

  it('[LOGIN_GATE_SUBMIT] submits on Enter key press', async () => {
    mockLogin.mockResolvedValue({ ok: true });
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    await userEvent.type(input, 'mypassword{enter}');

    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockLogin).toHaveBeenCalledWith('mypassword');
  });

  it('[LOGIN_GATE_LOADING] shows spinner and "Signing in…" while login is in flight', async () => {
    // Never resolves — simulates slow network
    mockLogin.mockReturnValue(new Promise(() => {}));
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    await userEvent.type(input, 'secret');

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Button text changes to "Signing in…"
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });

    // Submit button should be disabled while loading
    const btn = screen.getByRole('button', { name: /signing in/i });
    expect(btn).toBeDisabled();
  });

  it('[LOGIN_GATE_ERROR] shows error message when login returns { ok: false }', async () => {
    mockLogin.mockResolvedValue({ ok: false, error: 'Incorrect password' });
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    await userEvent.type(input, 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });
  });

  it('[LOGIN_GATE_ERROR] shows fallback error when login returns { ok: false } with no error string', async () => {
    mockLogin.mockResolvedValue({ ok: false });
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    await userEvent.type(input, 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });
  });

  it('[LOGIN_GATE_CLEAR] clears the password field after a failed login', async () => {
    mockLogin.mockResolvedValue({ ok: false, error: 'Wrong' });
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password') as HTMLInputElement;
    await userEvent.type(input, 'badpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Wrong')).toBeInTheDocument();
    });

    // Password field should be cleared
    expect(input.value).toBe('');
  });

  it('[LOGIN_GATE_TOGGLE] show/hide password toggle changes input type', async () => {
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');

    // The toggle button has tabIndex=-1 and no accessible name — find by its
    // position as the sibling button inside the password wrapper
    // Fallback: find by the fact it's the only non-submit button
    const allButtons = screen.getAllByRole('button');
    // allButtons[0] = toggle (tabIndex=-1), allButtons[1] = submit
    const toggle = allButtons.find(b => b.getAttribute('tabindex') === '-1')!;

    await userEvent.click(toggle);
    expect(input.type).toBe('text');

    await userEvent.click(toggle);
    expect(input.type).toBe('password');
  });

  it('[LOGIN_GATE_RENDER] does not call login() when password is only whitespace', async () => {
    renderLoginGate();

    const input = screen.getByPlaceholderText('Password');
    // Type only spaces — button should remain disabled
    fireEvent.change(input, { target: { value: '   ' } });

    const btn = screen.getByRole('button', { name: /sign in/i });
    expect(btn).toBeDisabled();
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
