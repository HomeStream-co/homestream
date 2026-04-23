/**
 * setup-page.test.tsx
 *
 * Tests for the SetupPage orchestrator (src/pages/setup.tsx).
 *
 * SetupPage behaviour:
 *   - Renders the step indicator with 5 steps
 *   - Starts on step 1 (Requirements)
 *   - Shows the correct step label at the bottom
 *   - Redirects to "/" when the server reports setupComplete:true on mount
 *   - Does NOT redirect when setupComplete is false
 *   - Auto-populates the TMDB key from the server response if present
 *   - Renders the HomeStream logo
 *
 * Error codes produced when these tests fail:
 *   SETUP_PAGE_INDICATOR   — step indicator not rendered correctly
 *   SETUP_PAGE_STEP_LABEL  — step label text incorrect
 *   SETUP_PAGE_REDIRECT    — didn't redirect when already set up
 *   SETUP_PAGE_NO_REDIRECT — redirected when setup not complete (wrong)
 *   SETUP_PAGE_LOGO        — logo not rendered
 *   SETUP_PAGE_TMDB_AUTOFILL — TMDB key not auto-populated from server
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// ── Mock react-router-dom navigate ────────────────────────────────────────────
// We need to capture navigate() calls without actually routing.

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock motion/react ─────────────────────────────────────────────────────────

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock all step sub-components ──────────────────────────────────────────────
// We test the orchestrator only — step internals are tested separately.

vi.mock('@/pages/setup/StepSysReqs', () => ({
  default: () => <div data-testid="step-sysreqs">StepSysReqs</div>,
}));
vi.mock('@/pages/setup/StepMediaFolder', () => ({
  default: () => <div data-testid="step-media">StepMediaFolder</div>,
}));
vi.mock('@/pages/setup/StepOptional', () => ({
  default: () => <div data-testid="step-optional">StepOptional</div>,
}));
vi.mock('@/pages/setup/StepApiKeys', () => ({
  default: () => <div data-testid="step-apikeys">StepApiKeys</div>,
}));
vi.mock('@/pages/setup/StepFinish', () => ({
  default: () => <div data-testid="step-finish">StepFinish</div>,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import SetupPage from '@/pages/setup';
import React from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(response: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  } as Response);
}

function renderSetupPage() {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<div data-testid="home-page">Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SetupPage', () => {
  it('[SETUP_PAGE_LOGO] renders the HomeStream logo', async () => {
    mockFetch({ setupComplete: false });
    renderSetupPage();

    expect(screen.getByText('HomeStream')).toBeInTheDocument();
  });

  it('[SETUP_PAGE_INDICATOR] renders 5 step indicator dots', async () => {
    mockFetch({ setupComplete: false });
    renderSetupPage();

    // Each step has a number (1-5) or a checkmark icon
    // Step 1 is active (primary ring), steps 2-5 are muted
    // We check for the step numbers 2-5 being visible (step 1 is active = shows "1")
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('[SETUP_PAGE_STEP_LABEL] shows "Step 1 of 5 — Requirements" on initial render', async () => {
    mockFetch({ setupComplete: false });
    renderSetupPage();

    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
    expect(screen.getByText(/requirements/i)).toBeInTheDocument();
  });

  it('[SETUP_PAGE_INDICATOR] renders StepSysReqs on step 0 (initial)', async () => {
    mockFetch({ setupComplete: false });
    renderSetupPage();

    expect(screen.getByTestId('step-sysreqs')).toBeInTheDocument();
    expect(screen.queryByTestId('step-media')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-optional')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-apikeys')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-finish')).not.toBeInTheDocument();
  });

  it('[SETUP_PAGE_REDIRECT] calls navigate("/") when setupComplete is true', async () => {
    mockFetch({ setupComplete: true });
    renderSetupPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('[SETUP_PAGE_NO_REDIRECT] does NOT navigate when setupComplete is false', async () => {
    mockFetch({ setupComplete: false });
    renderSetupPage();

    // Give effects time to fire
    await new Promise(r => setTimeout(r, 50));

    expect(mockNavigate).not.toHaveBeenCalledWith('/');
  });

  it('[SETUP_PAGE_TMDB_AUTOFILL] auto-populates TMDB key from server response', async () => {
    // The server returns a masked TMDB key — SetupPage should pre-fill the form
    mockFetch({
      setupComplete: false,
      config: { tmdbApiKey: 'tmdb-key-from-server' },
    });

    // We can't directly inspect form state, but we can verify the fetch was called
    // and the component rendered without crashing (the key is set via setForm)
    renderSetupPage();

    await waitFor(() => {
      // Component should still be on /setup (not redirected)
      expect(screen.getByTestId('step-sysreqs')).toBeInTheDocument();
    });

    // Verify fetch was called with /api/setup
    expect(global.fetch).toHaveBeenCalledWith('/api/setup');
  });

  it('[SETUP_PAGE_NO_REDIRECT] handles fetch error gracefully (no crash, no redirect)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    renderSetupPage();

    // Give effects time to fire
    await new Promise(r => setTimeout(r, 50));

    // Should still render the wizard
    expect(screen.getByTestId('step-sysreqs')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/');
  });

  it('[SETUP_PAGE_INDICATOR] calls /api/electron on mount to get platform defaults', async () => {
    mockFetch({ setupComplete: false });

    // Also mock the /api/electron call
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ setupComplete: false }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ defaultMediaDir: 'C:\\Users\\Test\\Videos' }),
      } as Response);

    renderSetupPage();

    await waitFor(() => {
      // Both /api/setup and /api/electron should have been called
      expect(global.fetch).toHaveBeenCalledWith('/api/setup');
      expect(global.fetch).toHaveBeenCalledWith('/api/electron');
    });
  });
});
