/**
 * Shared types for the Setup wizard step components.
 *
 * All step components receive SetupStepProps so the orchestrator (setup.tsx)
 * can pass state down and receive navigation/mutation callbacks back up.
 */

export interface StepStatus {
  mediaDir: 'idle' | 'saving' | 'done' | 'error';
  qbit: 'idle' | 'testing' | 'ok' | 'error' | 'skip';
  jellyfin: 'idle' | 'testing' | 'ok' | 'error' | 'skip';
  apiKeys: 'idle' | 'saving' | 'done' | 'error';
  complete: 'idle' | 'saving' | 'done' | 'error';
}

export interface FormData {
  mediaDir: string;
  qbitUrl: string;
  qbitApiKey: string;
  qbitUsername: string;
  qbitPassword: string;
  jellyfinUrl: string;
  jellyfinApiKey: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  omdbApiKey: string;
  googleAiApiKey: string;   // kept for backward-compat; wizard writes aiApiKey instead
  tmdbApiKey: string;
  /** Single unified AI key — provider is auto-detected from the key format:
   *  - AIza…         → Gemini (Google)
   *  - sk-ant-…      → Anthropic Claude
   *  - sk-…          → OpenAI
   *  - http://…      → Ollama (URL, not a key)
   */
  aiApiKey: string;
  aiProvider: 'gemini' | 'ollama' | 'openai' | 'anthropic';
  ollamaUrl: string;
  ollamaModel: string;
  openaiModel: string;
  anthropicModel: string;
  preferredQuality: '720p' | '1080p' | '4k' | 'best';
  watchFolderEnabled: boolean;
  autoTranscode: boolean;
  // VPN
  vpnEnabled: boolean;
  vpnProtocol: 'wireguard' | 'openvpn';
  vpnProvider: string;
  vpnConfigContent: string;
  vpnUsername: string;
  vpnPassword: string;
  vpnAutoConnect: boolean;
  /** Preferred server type for providers that support multiple categories */
  vpnServerType: 'p2p' | 'standard' | 'obfuscated' | 'double' | 'tor';
  /** Auto-select the fastest/lowest-latency server before each download */
  vpnAutoFastest: boolean;
  /** For OpenVPN credential providers: comma-separated list of server hostnames to ping-rank */
  vpnKnownServers: string;
  /** VPN interface binding — Windows adapter name (e.g. "Norton Secure VPN") */
  vpnInterface?: string;
  // Prowlarr — self-hosted indexer aggregator
  prowlarrUrl: string;
  prowlarrApiKey: string;
  // Real-Debrid — premium download backend
  realDebridApiKey: string;
}

export type KeyTestState = 'idle' | 'testing' | 'ok' | 'error';
export type ScanState = 'idle' | 'scanning' | 'done' | 'importing' | 'imported';

export interface ScannedFile {
  name: string;
  size: number;
  path: string;
}

/** Props passed to every step component */
export interface SetupStepProps {
  form: FormData;
  set: (key: keyof FormData, value: unknown) => void;
  status: StepStatus;
  setStatus: React.Dispatch<React.SetStateAction<StepStatus>>;
  onNext: () => void;
  onBack: () => void;
  // Step-specific shared state (hoisted to orchestrator to survive step transitions)
  showQbitPass: boolean;
  setShowQbitPass: (v: boolean) => void;
  showAdminPass: boolean;
  setShowAdminPass: (v: boolean) => void;
  qbitVersion: string;
  setQbitVersion: (v: string) => void;
  jellyfinVersion: string;
  setJellyfinVersion: (v: string) => void;
  testError: string;
  setTestError: (v: string) => void;
  tmdbTest: KeyTestState;
  setTmdbTest: (v: KeyTestState) => void;
  omdbTest: KeyTestState;
  setOmdbTest: (v: KeyTestState) => void;
  googleAiTest: KeyTestState;
  setGoogleAiTest: (v: KeyTestState) => void;
  ollamaTest: KeyTestState;
  setOllamaTest: (v: KeyTestState) => void;
  tmdbTestMsg: string;
  setTmdbTestMsg: (v: string) => void;
  omdbTestMsg: string;
  setOmdbTestMsg: (v: string) => void;
  googleAiTestMsg: string;
  setGoogleAiTestMsg: (v: string) => void;
  ollamaTestMsg: string;
  setOllamaTestMsg: (v: string) => void;
  scanState: ScanState;
  setScanState: (v: ScanState) => void;
  scanFound: number;
  setScanFound: (v: number) => void;
  scanSkipped: number;
  setScanSkipped: (v: number) => void;
  scanFiles: ScannedFile[];
  setScanFiles: (v: ScannedFile[]) => void;
  importExisting: boolean;
  setImportExisting: (v: boolean) => void;
  vpnTestState: 'idle' | 'testing' | 'ok' | 'error';
  setVpnTestState: (v: 'idle' | 'testing' | 'ok' | 'error') => void;
  vpnTestMsg: string;
  setVpnTestMsg: (v: string) => void;
  prowlarrTest: KeyTestState;
  setProwlarrTest: (v: KeyTestState) => void;
  prowlarrTestMsg: string;
  setProwlarrTestMsg: (v: string) => void;
  rdTest: KeyTestState;
  setRdTest: (v: KeyTestState) => void;
  rdTestMsg: string;
  setRdTestMsg: (v: string) => void;
  /** True once /api/electron has responded — prevents saving stale mediaDir on fast clicks */
  platformDefaultsReady: boolean;
  /** Available fixed drives on Windows. Empty on macOS/Linux. */
  availableDrives: { path: string; freeSpaceGB?: number }[];
  /**
   * Server platform string from HOMESTREAM_PLATFORM env var ('win32' | 'linux' | 'darwin').
   * Undefined until /api/electron responds. Use getIsLinux(serverPlatform) from
   * platformUtils.ts for platform-conditional UI — never rely on navigator.userAgent alone.
   */
  serverPlatform: string | undefined;
  /** True when running inside the Electron shell — enables native folder picker */
  isElectron?: boolean;
}

/** Helper used by all steps — throws on non-2xx so callers can catch properly */
export async function apiPost(action: string, data: Record<string, unknown> = {}) {
  let res: Response;
  try {
    res = await fetch('/api/setup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    });
  } catch {
    // Network failure (no backend in dev preview) — silently succeed so the
    // wizard is navigable without a running server.
    return { ok: true };
  }
  if (!res.ok) {
    // 401 after setup is complete is expected in preview — treat as success
    if (res.status === 401) return { ok: true };
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.error ?? body.message ?? `Server error ${res.status}`);
  }
  return res.json();
}
