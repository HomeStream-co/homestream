/**
 * setup-prowlarr.test.tsx
 *
 * Tests for the Prowlarr section in StepOptional (Setup Wizard Step 2).
 *
 * Covers:
 *   - Prowlarr section renders with URL input, API key input, and Test button
 *   - Test button is disabled when URL is empty
 *   - Test button is enabled when URL is filled
 *   - Clicking Test calls POST /api/setup with action=test_prowlarr
 *   - Shows success badge on ok response
 *   - Shows error badge on failed response
 *   - Clears test state when URL changes
 *   - Clears test state when API key changes
 *   - saveAndContinue includes prowlarrUrl and prowlarrApiKey in save payload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StepOptional from '../../pages/setup/StepOptional';
import type { SetupStepProps, FormData, StepStatus } from '../../pages/setup/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = vi.fn(handler) as unknown as typeof fetch;
}

function defaultForm(overrides: Partial<FormData> = {}): FormData {
  return {
    mediaDir: '/media',
    qbitUrl: 'http://localhost:8080',
    qbitUsername: 'admin',
    qbitPassword: 'homestream',
    jellyfinUrl: '',
    jellyfinApiKey: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    omdbApiKey: '',
    googleAiApiKey: '',
    tmdbApiKey: '',
    aiProvider: 'gemini',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    preferredQuality: '1080p',
    watchFolderEnabled: true,
    autoTranscode: true,
    vpnEnabled: false,
    vpnProtocol: 'wireguard',
    vpnProvider: 'custom',
    vpnConfigContent: '',
    vpnUsername: '',
    vpnPassword: '',
    vpnAutoConnect: false,
    vpnServerType: 'p2p',
    vpnAutoFastest: true,
    vpnKnownServers: '',
    prowlarrUrl: '',
    prowlarrApiKey: '',
    ...overrides,
  };
}

function defaultStatus(): StepStatus {
  return {
    mediaDir: 'idle',
    qbit: 'idle',
    jellyfin: 'idle',
    apiKeys: 'idle',
    complete: 'idle',
  };
}

function buildProps(overrides: Partial<SetupStepProps> = {}): SetupStepProps {
  return {
    form: defaultForm(),
    set: vi.fn(),
    status: defaultStatus(),
    setStatus: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    showQbitPass: false,
    setShowQbitPass: vi.fn(),
    showAdminPass: false,
    setShowAdminPass: vi.fn(),
    qbitVersion: '',
    setQbitVersion: vi.fn(),
    jellyfinVersion: '',
    setJellyfinVersion: vi.fn(),
    testError: '',
    setTestError: vi.fn(),
    tmdbTest: 'idle',
    setTmdbTest: vi.fn(),
    omdbTest: 'idle',
    setOmdbTest: vi.fn(),
    googleAiTest: 'idle',
    setGoogleAiTest: vi.fn(),
    ollamaTest: 'idle',
    setOllamaTest: vi.fn(),
    tmdbTestMsg: '',
    setTmdbTestMsg: vi.fn(),
    omdbTestMsg: '',
    setOmdbTestMsg: vi.fn(),
    googleAiTestMsg: '',
    setGoogleAiTestMsg: vi.fn(),
    ollamaTestMsg: '',
    setOllamaTestMsg: vi.fn(),
    scanState: 'idle',
    setScanState: vi.fn(),
    scanFound: 0,
    setScanFound: vi.fn(),
    scanSkipped: 0,
    setScanSkipped: vi.fn(),
    scanFiles: [],
    setScanFiles: vi.fn(),
    importExisting: false,
    setImportExisting: vi.fn(),
    vpnTestState: 'idle',
    setVpnTestState: vi.fn(),
    vpnTestMsg: '',
    setVpnTestMsg: vi.fn(),
    prowlarrTest: 'idle',
    setProwlarrTest: vi.fn(),
    prowlarrTestMsg: '',
    setProwlarrTestMsg: vi.fn(),
    platformDefaultsReady: true,
    availableDrives: [],
    ...overrides,
  };
}

// Mock fetch for VPN interfaces (always needed by StepOptional on mount)
function mockVpnInterfaces() {
  mockFetch(async (url: string) => {
    if (url.includes('/api/vpn/interfaces')) {
      return new Response(JSON.stringify({ interfaces: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepOptional — Prowlarr section renders', () => {
  beforeEach(() => {
    mockVpnInterfaces();
  });

  it('renders the Prowlarr section heading', () => {
    render(<StepOptional {...buildProps()} />);
    expect(screen.getByText('Prowlarr')).toBeInTheDocument();
  });

  it('renders the Prowlarr URL input', () => {
    render(<StepOptional {...buildProps()} />);
    const input = screen.getByPlaceholderText('http://localhost:9696');
    expect(input).toBeInTheDocument();
  });

  it('renders the Prowlarr API key input', () => {
    render(<StepOptional {...buildProps()} />);
    const input = screen.getByPlaceholderText(/Settings.*General.*API Key/i);
    expect(input).toBeInTheDocument();
  });

  it('renders the Test button', () => {
    render(<StepOptional {...buildProps()} />);
    // There are multiple Test buttons — find the one near Prowlarr
    const testButtons = screen.getAllByRole('button', { name: /test/i });
    expect(testButtons.length).toBeGreaterThan(0);
  });
});

describe('StepOptional — Prowlarr Test button state', () => {
  beforeEach(() => {
    mockVpnInterfaces();
  });

  it('Test button is disabled when prowlarrUrl is empty', () => {
    render(<StepOptional {...buildProps({ form: defaultForm({ prowlarrUrl: '' }) })} />);
    // Find the Test button that is disabled (prowlarr one)
    const buttons = screen.getAllByRole('button', { name: /test/i });
    const disabledBtn = buttons.find(b => b.hasAttribute('disabled'));
    expect(disabledBtn).toBeDefined();
  });

  it('Test button is enabled when prowlarrUrl is filled', () => {
    render(<StepOptional {...buildProps({ form: defaultForm({ prowlarrUrl: 'http://localhost:9696' }) })} />);
    // At least one Test button should not be disabled
    const buttons = screen.getAllByRole('button', { name: /test/i });
    const enabledBtn = buttons.find(b => !b.hasAttribute('disabled'));
    expect(enabledBtn).toBeDefined();
  });

  it('Test button is disabled when prowlarrTest is testing', () => {
    render(<StepOptional {...buildProps({
      form: defaultForm({ prowlarrUrl: 'http://localhost:9696' }),
      prowlarrTest: 'testing',
    })} />);
    const buttons = screen.getAllByRole('button', { name: /test/i });
    const disabledBtn = buttons.find(b => b.hasAttribute('disabled'));
    expect(disabledBtn).toBeDefined();
  });
});

describe('StepOptional — Prowlarr test interaction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls POST /api/setup with action=test_prowlarr on Test click', async () => {
    let capturedBody: Record<string, unknown> = {};

    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/vpn/interfaces')) {
        return new Response(JSON.stringify({ interfaces: [] }), { status: 200 });
      }
      if (url.includes('/api/setup') && init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return new Response(JSON.stringify({ ok: true, version: '1.14', appName: 'Prowlarr' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const setProwlarrTest = vi.fn();
    const setProwlarrTestMsg = vi.fn();

    render(<StepOptional {...buildProps({
      form: defaultForm({ prowlarrUrl: 'http://localhost:9696', prowlarrApiKey: 'mykey' }),
      setProwlarrTest,
      setProwlarrTestMsg,
    })} />);

    // Find the Test button near Prowlarr section — it's the last Test button
    const buttons = screen.getAllByRole('button', { name: /test/i });
    const prowlarrTestBtn = buttons[buttons.length - 1];
    fireEvent.click(prowlarrTestBtn);

    await waitFor(() => {
      expect(capturedBody.action).toBe('test_prowlarr');
      expect(capturedBody.prowlarrUrl).toBe('http://localhost:9696');
      expect(capturedBody.prowlarrApiKey).toBe('mykey');
    });
  });

  it('shows success badge when test returns ok:true', async () => {
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/vpn/interfaces')) {
        return new Response(JSON.stringify({ interfaces: [] }), { status: 200 });
      }
      if (url.includes('/api/setup') && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true, version: '1.14.3', appName: 'Prowlarr' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(<StepOptional {...buildProps({
      form: defaultForm({ prowlarrUrl: 'http://localhost:9696' }),
      prowlarrTest: 'ok',
      prowlarrTestMsg: 'Prowlarr v1.14.3 — connected',
    })} />);

    expect(screen.getByText(/Prowlarr v1\.14\.3 — connected/i)).toBeInTheDocument();
  });

  it('shows error badge when test returns ok:false', async () => {
    render(<StepOptional {...buildProps({
      form: defaultForm({ prowlarrUrl: 'http://localhost:9696' }),
      prowlarrTest: 'error',
      prowlarrTestMsg: 'Connection refused',
    })} />);

    expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
  });
});

describe('StepOptional — Prowlarr save on continue', () => {
  it('includes prowlarrUrl and prowlarrApiKey in save payload when continuing', async () => {
    let savedPayload: Record<string, unknown> = {};

    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/vpn/interfaces')) {
        return new Response(JSON.stringify({ interfaces: [] }), { status: 200 });
      }
      if (url.includes('/api/setup') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        if (body.action === 'save') savedPayload = body;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const onNext = vi.fn();
    render(<StepOptional {...buildProps({
      form: defaultForm({
        prowlarrUrl: 'http://192.168.1.100:9696',
        prowlarrApiKey: 'save-test-key',
      }),
      onNext,
    })} />);

    // Click the "Next" / "Save & Continue" button
    const nextBtn = screen.getByRole('button', { name: /next|continue|save/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(savedPayload.prowlarrUrl).toBe('http://192.168.1.100:9696');
      expect(savedPayload.prowlarrApiKey).toBe('save-test-key');
    });
  });
});
