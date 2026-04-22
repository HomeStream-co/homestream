/**
 * threat-scanner.test.ts
 *
 * Unit tests for src/server/security/threatScanner.ts
 *
 * The threat scanner is the security gate for every torrent download.
 * Bugs here mean malware gets downloaded silently. This is the highest-stakes
 * module in the entire codebase from a security perspective.
 *
 * Coverage:
 *   Layer 1 — scanTorrentFileList()
 *     - Dangerous extensions blocked (.exe, .bat, .ps1, .dll, etc.)
 *     - Double extension attacks blocked (movie.mp4.exe)
 *     - Safe extensions pass (.mp4, .mkv, .srt, .nfo)
 *     - Empty file list passes
 *     - Archives (.zip/.rar) pass Layer 1 (inspected separately)
 *
 *   Layer 2 — scanInfoHashOnVT()
 *     - Skipped when no API key configured
 *     - 404 (unknown hash) → allowed
 *     - 429 (rate limited) → allowed (fail open)
 *     - HTTP error → allowed (fail open)
 *     - malicious >= 3 → blocked
 *     - suspicious >= 5 → blocked
 *     - 1-2 malicious → allowed (suspicious threat level)
 *     - Network timeout → allowed (fail open)
 *
 *   Layer 3 — verifyFileMagicBytes()
 *     - Windows PE (MZ) → blocked
 *     - ELF executable → blocked
 *     - MKV/WebM (EBML) → clean
 *     - MP4 (ftyp at offset 4) → clean
 *     - ZIP archive → suspicious (not blocked)
 *     - Missing file → allowed (skip)
 *
 *   runPreDownloadScan() — combined Layer 1 + 2
 *     - Layer 1 block short-circuits (Layer 2 not called)
 *     - Layer 2 block returned when Layer 1 passes
 *     - Both pass → clean result
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock configStore (for VT API key) ─────────────────────────────────────────
// vi.hoisted ensures the object is available when the vi.mock factory runs
// (vi.mock factories are hoisted to the top of the file by Vitest).

const mockConfig = vi.hoisted(() => ({ vtApiKey: '' }));

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({ virusTotalApiKey: mockConfig.vtApiKey, mediaDir: '/tmp' }),
}));

// ── Mock fs (for Layer 3 magic bytes) ─────────────────────────────────────────

let mockFileBytes: number[] | null = null; // null = file doesn't exist

vi.mock('fs', () => ({
  default: {
    existsSync:   (p: string) => mockFileBytes !== null && p !== '/nonexistent.mp4',
    openSync:     () => 42,
    readSync:     (_fd: number, buf: Buffer) => {
      const bytes = mockFileBytes ?? [];
      for (let i = 0; i < Math.min(16, bytes.length); i++) buf[i] = bytes[i];
      return Math.min(16, bytes.length);
    },
    closeSync:    () => undefined,
    // Quarantine helpers (not under test here)
    mkdirSync:    () => undefined,
    writeFileSync: () => undefined,
    readFileSync:  () => '[]',
    renameSync:   () => undefined,
    statSync:     () => ({ size: 1024 }),
  },
  existsSync:   (p: string) => mockFileBytes !== null && p !== '/nonexistent.mp4',
  openSync:     () => 42,
  readSync:     (_fd: number, buf: Buffer) => {
    const bytes = mockFileBytes ?? [];
    for (let i = 0; i < Math.min(16, bytes.length); i++) buf[i] = bytes[i];
    return Math.min(16, bytes.length);
  },
  closeSync:    () => undefined,
  mkdirSync:    () => undefined,
  writeFileSync: () => undefined,
  readFileSync:  () => '[]',
  renameSync:   () => undefined,
  statSync:     () => ({ size: 1024 }),
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (name: string) => `/tmp/test-${name}`,
}));

// ── Mock fetch (for Layer 2 VT calls) ─────────────────────────────────────────

type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

let mockFetchResponse: MockFetchResponse = {
  ok: true,
  status: 200,
  json: async () => ({}),
};

vi.stubGlobal('fetch', async () => mockFetchResponse);

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const {
  scanTorrentFileList,
  scanInfoHashOnVT,
  verifyFileMagicBytes,
  runPreDownloadScan,
} = await import('../../server/security/threatScanner.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function file(name: string) { return { name }; }

function vtResponse(malicious: number, suspicious: number, total = 70) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        attributes: {
          last_analysis_stats: {
            malicious,
            suspicious,
            harmless: total - malicious - suspicious,
            undetected: 0,
          },
          meaningful_name: 'test.torrent',
          type_description: 'BitTorrent file',
        },
      },
    }),
  };
}

// ── Layer 1: scanTorrentFileList() ────────────────────────────────────────────

describe('Layer 1 — scanTorrentFileList() — dangerous extensions', () => {
  it('blocks .exe files', () => {
    const r = scanTorrentFileList([file('setup.exe')]);
    expect(r.allowed).toBe(false);
    expect(r.threatLevel).toBe('blocked');
    expect(r.layer).toContain('Layer 1');
  });

  it('blocks .bat files', () => {
    expect(scanTorrentFileList([file('run.bat')]).allowed).toBe(false);
  });

  it('blocks .ps1 (PowerShell) files', () => {
    expect(scanTorrentFileList([file('script.ps1')]).allowed).toBe(false);
  });

  it('blocks .dll files', () => {
    expect(scanTorrentFileList([file('library.dll')]).allowed).toBe(false);
  });

  it('blocks .sh shell scripts', () => {
    expect(scanTorrentFileList([file('install.sh')]).allowed).toBe(false);
  });

  it('blocks .jar Java archives', () => {
    expect(scanTorrentFileList([file('app.jar')]).allowed).toBe(false);
  });

  it('blocks .lnk Windows shortcuts', () => {
    expect(scanTorrentFileList([file('shortcut.lnk')]).allowed).toBe(false);
  });

  it('blocks .hta HTML application files', () => {
    expect(scanTorrentFileList([file('page.hta')]).allowed).toBe(false);
  });

  it('includes the filename in the reason', () => {
    const r = scanTorrentFileList([file('virus.exe')]);
    expect(r.reason).toContain('virus.exe');
  });
});

describe('Layer 1 — scanTorrentFileList() — double extension attacks', () => {
  it('blocks movie.mp4.exe (classic double extension)', () => {
    const r = scanTorrentFileList([file('movie.mp4.exe')]);
    expect(r.allowed).toBe(false);
  });

  it('blocks video.mkv.bat', () => {
    expect(scanTorrentFileList([file('video.mkv.bat')]).allowed).toBe(false);
  });

  it('blocks subtitle.srt.ps1', () => {
    expect(scanTorrentFileList([file('subtitle.srt.ps1')]).allowed).toBe(false);
  });

  it('allows movie.1080p.mp4 (multiple dots but safe extension)', () => {
    const r = scanTorrentFileList([file('movie.1080p.mp4')]);
    expect(r.allowed).toBe(true);
  });
});

describe('Layer 1 — scanTorrentFileList() — safe extensions', () => {
  it('allows .mp4 video files', () => {
    expect(scanTorrentFileList([file('movie.mp4')]).allowed).toBe(true);
  });

  it('allows .mkv video files', () => {
    expect(scanTorrentFileList([file('show.mkv')]).allowed).toBe(true);
  });

  it('allows .srt subtitle files', () => {
    expect(scanTorrentFileList([file('movie.en.srt')]).allowed).toBe(true);
  });

  it('allows .nfo info files', () => {
    expect(scanTorrentFileList([file('movie.nfo')]).allowed).toBe(true);
  });

  it('allows .jpg poster images', () => {
    expect(scanTorrentFileList([file('poster.jpg')]).allowed).toBe(true);
  });

  it('allows mixed safe files', () => {
    const r = scanTorrentFileList([
      file('movie.mkv'),
      file('movie.en.srt'),
      file('poster.jpg'),
      file('movie.nfo'),
    ]);
    expect(r.allowed).toBe(true);
    expect(r.threatLevel).toBe('clean');
  });

  it('returns clean for empty file list', () => {
    const r = scanTorrentFileList([]);
    expect(r.allowed).toBe(true);
    expect(r.threatLevel).toBe('clean');
  });

  it('blocks if ANY file in a mixed list is dangerous', () => {
    const r = scanTorrentFileList([
      file('movie.mkv'),
      file('bonus.exe'),  // dangerous
      file('subtitle.srt'),
    ]);
    expect(r.allowed).toBe(false);
  });
});

// ── Layer 2: scanInfoHashOnVT() ───────────────────────────────────────────────

describe('Layer 2 — scanInfoHashOnVT() — no API key', () => {
  beforeEach(() => { mockConfig.vtApiKey = ''; });

  it('returns allowed:true when no VT API key is configured', async () => {
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
    expect(r.details).toContain('no VirusTotal API key');
  });
});

describe('Layer 2 — scanInfoHashOnVT() — with API key', () => {
  beforeEach(() => { mockConfig.vtApiKey = 'test-vt-key'; });

  it('returns allowed:true when hash is not in VT database (404)', async () => {
    mockFetchResponse = { ok: false, status: 404, json: async () => ({}) };
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
    expect(r.details).toContain('not found');
  });

  it('returns allowed:true when VT rate-limits (429)', async () => {
    mockFetchResponse = { ok: false, status: 429, json: async () => ({}) };
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
    expect(r.details).toContain('rate limit');
  });

  it('returns allowed:true on other HTTP errors (fail open)', async () => {
    mockFetchResponse = { ok: false, status: 500, json: async () => ({}) };
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
  });

  it('blocks when malicious count >= 3', async () => {
    mockFetchResponse = vtResponse(5, 0);
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(false);
    expect(r.threatLevel).toBe('blocked');
    expect(r.reason).toContain('5/');
  });

  it('blocks when suspicious count >= 5', async () => {
    mockFetchResponse = vtResponse(0, 6);
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(false);
    expect(r.threatLevel).toBe('suspicious');
  });

  it('allows when malicious count is 1 or 2 (below threshold)', async () => {
    mockFetchResponse = vtResponse(2, 0);
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
    expect(r.threatLevel).toBe('suspicious'); // flagged but not blocked
  });

  it('allows when suspicious count is 4 (below threshold)', async () => {
    mockFetchResponse = vtResponse(0, 4);
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
  });

  it('returns clean when no malicious/suspicious detections', async () => {
    mockFetchResponse = vtResponse(0, 0);
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
    expect(r.threatLevel).toBe('clean');
  });

  it('includes the infoHash in the result', async () => {
    mockFetchResponse = vtResponse(0, 0);
    const r = await scanInfoHashOnVT('myhash123');
    expect(r.infoHash).toBe('myhash123');
  });

  it('returns allowed:true on network error (fail open)', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('Network error'); });
    const r = await scanInfoHashOnVT('aabbccdd');
    expect(r.allowed).toBe(true);
    expect(r.details).toContain('Network error');
    // Restore
    vi.stubGlobal('fetch', async () => mockFetchResponse);
  });
});

// ── Layer 3: verifyFileMagicBytes() ───────────────────────────────────────────

describe('Layer 3 — verifyFileMagicBytes() — executables blocked', () => {
  it('blocks Windows PE executable (MZ header: 0x4D 0x5A)', () => {
    mockFileBytes = [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00];
    const r = verifyFileMagicBytes('/downloads/movie.mp4');
    expect(r.allowed).toBe(false);
    expect(r.threatLevel).toBe('blocked');
    expect(r.reason).toContain('Windows PE');
  });

  it('blocks ELF Linux executable (0x7F 0x45 0x4C 0x46)', () => {
    mockFileBytes = [0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const r = verifyFileMagicBytes('/downloads/movie.mkv');
    expect(r.allowed).toBe(false);
    expect(r.threatLevel).toBe('blocked');
    expect(r.reason).toContain('ELF');
  });

  it('blocks Java class file (0xCA 0xFE 0xBA 0xBE)', () => {
    mockFileBytes = [0xCA, 0xFE, 0xBA, 0xBE, 0x00, 0x00, 0x00, 0x3D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const r = verifyFileMagicBytes('/downloads/movie.mp4');
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('Java Class');
  });
});

describe('Layer 3 — verifyFileMagicBytes() — video files allowed', () => {
  it('allows MKV/WebM (EBML header: 0x1A 0x45 0xDF 0xA3)', () => {
    mockFileBytes = [0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81, 0x01, 0x42, 0xF2, 0x81];
    const r = verifyFileMagicBytes('/downloads/show.mkv');
    expect(r.allowed).toBe(true);
    expect(r.threatLevel).toBe('clean');
  });

  it('allows MP4 (ftyp box at offset 4)', () => {
    // Bytes 0-3: size (any), bytes 4-7: 'ftyp' (0x66 0x74 0x79 0x70)
    mockFileBytes = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00];
    const r = verifyFileMagicBytes('/downloads/movie.mp4');
    expect(r.allowed).toBe(true);
    expect(r.details).toContain('MP4');
  });

  it('allows AVI (RIFF header)', () => {
    mockFileBytes = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20, 0x00, 0x00, 0x00, 0x00];
    const r = verifyFileMagicBytes('/downloads/movie.avi');
    expect(r.allowed).toBe(true);
  });
});

describe('Layer 3 — verifyFileMagicBytes() — archives suspicious', () => {
  it('marks ZIP as suspicious (not blocked)', () => {
    mockFileBytes = [0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const r = verifyFileMagicBytes('/downloads/archive.zip');
    expect(r.allowed).toBe(true); // suspicious but not blocked
    expect(r.threatLevel).toBe('suspicious');
  });
});

describe('Layer 3 — verifyFileMagicBytes() — missing file', () => {
  it('returns allowed:true when file does not exist', () => {
    mockFileBytes = null;
    const r = verifyFileMagicBytes('/nonexistent.mp4');
    expect(r.allowed).toBe(true);
    expect(r.details).toContain('not found');
  });
});

// ── runPreDownloadScan() — combined ───────────────────────────────────────────

describe('runPreDownloadScan() — combined Layer 1 + 2', () => {
  beforeEach(() => {
    mockConfig.vtApiKey = '';
    mockFetchResponse = vtResponse(0, 0);
  });

  it('returns clean when file list is safe and VT passes', async () => {
    const r = await runPreDownloadScan({
      infoHash: 'abc123',
      files: [{ name: 'movie.mkv' }],
    });
    expect(r.allowed).toBe(true);
    expect(r.threatLevel).toBe('clean');
  });

  it('blocks on Layer 1 without calling Layer 2', async () => {
    mockConfig.vtApiKey = 'vt-key';
    const fetchSpy = vi.fn(async () => vtResponse(0, 0));
    vi.stubGlobal('fetch', fetchSpy);

    const r = await runPreDownloadScan({
      infoHash: 'abc123',
      files: [{ name: 'virus.exe' }],
    });
    expect(r.allowed).toBe(false);
    expect(r.layer).toContain('Layer 1');
    // Layer 2 (VT fetch) should NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', async () => mockFetchResponse);
  });

  it('returns Layer 2 block when Layer 1 passes but VT flags it', async () => {
    mockConfig.vtApiKey = 'vt-key';
    mockFetchResponse = vtResponse(5, 0);

    const r = await runPreDownloadScan({
      infoHash: 'malicious-hash',
      files: [{ name: 'movie.mkv' }],
    });
    expect(r.allowed).toBe(false);
    expect(r.layer).toContain('Layer 2');
  });

  it('passes when no file list provided (skips Layer 1)', async () => {
    const r = await runPreDownloadScan({ infoHash: 'abc123' });
    expect(r.allowed).toBe(true);
  });

  it('passes when file list is empty', async () => {
    const r = await runPreDownloadScan({ infoHash: 'abc123', files: [] });
    expect(r.allowed).toBe(true);
  });
});
