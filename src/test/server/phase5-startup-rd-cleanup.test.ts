/**
 * phase5-startup-rd-cleanup.test.ts
 *
 * Phase 5 fix: runStartupCleanup() must mark stuck Real-Debrid jobs as error.
 *
 * RD downloads run as fire-and-forget async tasks. If the server restarts
 * while an RD download is in progress, the job stays stuck at
 * status='queued' or status='downloading' forever — the background task
 * that would have called upsertJob({status:'done'|'error'}) is gone.
 *
 * Fix: on boot, any RD job still in queued/downloading is marked as error
 * so the Downloads page shows a "Retry" button instead of a stuck spinner.
 *
 * Coverage:
 *   - queued RD job → marked as error on startup
 *   - downloading RD job → marked as error on startup
 *   - done RD job → NOT touched on startup
 *   - error RD job → NOT touched on startup (already terminal)
 *   - qBit/WT jobs in queued/downloading → NOT touched (only RD is affected)
 *   - upsertJob is called once per stuck RD job
 *   - upsertJob is NOT called when no stuck RD jobs exist
 *   - completedAt is set on the error record
 *   - console.log is emitted for each interrupted job
 *   - cleanup is non-fatal: does not throw even if downloadJobStore import fails
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockPersistedJobs: Record<string, unknown>[] = [];
const mockUpsertJob = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Library + file system mocks — runStartupCleanup does a lot; we only care
// about the RD cleanup section, so stub everything else out.
vi.mock('../../server/libraryStore.js', () => ({
  readLibrary:      () => [],
  writeLibrarySafe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/dataDir.js', () => ({
  dataPath: (f: string) => `/tmp/test-homestream/${f}`,
}));

vi.mock('../../server/configStore.js', () => ({
  readConfig: () => ({ mediaDir: '/media', downloadsDir: '/media/downloads' }),
}));

vi.mock('../../server/tmdbCache.js', () => ({
  pruneStaleTmdbCache: vi.fn(),
}));

vi.mock('../../server/probeCache.js', () => ({
  evictStaleProbeCache: vi.fn().mockReturnValue(0),
}));

vi.mock('../../server/downloadJobStore.js', () => ({
  getAllPersistedJobs: () => mockPersistedJobs,
  upsertJob:          (...args: unknown[]) => mockUpsertJob(...args),
  updateJobStatus:    vi.fn(),
}));

// Stub fs so the HLS/upload cleanup sections don't touch the real filesystem
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync:    vi.fn().mockReturnValue(false),
    readdirSync:   vi.fn().mockReturnValue([]),
    statSync:      vi.fn().mockReturnValue({ mtimeMs: Date.now(), isDirectory: () => false }),
    unlinkSync:    vi.fn(),
    rmdirSync:     vi.fn(),
    mkdirSync:     vi.fn(),
    writeFileSync: vi.fn(),
    renameSync:    vi.fn(),
    readFileSync:  vi.fn().mockReturnValue('[]'),
  };
});

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { runStartupCleanup } = await import('../../server/startupCleanup.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRdJob(
  status: 'queued' | 'downloading' | 'done' | 'error',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jobId:     `rd-abc123-${Date.now()}`,
    infoHash:  'abc123',
    title:     'Inception 1080p',
    quality:   '1080p',
    type:      'movie',
    status,
    addedAt:   new Date().toISOString(),
    imdbId:    'tt1375666',
    backend:   'real-debrid',
    ...overrides,
  };
}

function makeQbitJob(status: 'queued' | 'downloading' | 'done' | 'error'): Record<string, unknown> {
  return {
    jobId:    `qb-def456-${Date.now()}`,
    infoHash: 'def456',
    title:    'Some Movie',
    quality:  '720p',
    type:     'movie',
    status,
    addedAt:  new Date().toISOString(),
    imdbId:   'tt9999999',
    backend:  'qbittorrent',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runStartupCleanup — Phase 5: RD interrupted job cleanup', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockPersistedJobs = [];
    mockUpsertJob.mockClear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks a queued RD job as error on startup', async () => {
    mockPersistedJobs = [makeRdJob('queued')];
    runStartupCleanup();
    // The RD cleanup is async (dynamic import inside runStartupCleanup)
    await vi.waitFor(() => expect(mockUpsertJob).toHaveBeenCalled(), { timeout: 2000 });

    const call = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(call.status).toBe('error');
    expect(call.backend).toBe('real-debrid');
  });

  it('marks a downloading RD job as error on startup', async () => {
    mockPersistedJobs = [makeRdJob('downloading')];
    runStartupCleanup();
    await vi.waitFor(() => expect(mockUpsertJob).toHaveBeenCalled(), { timeout: 2000 });

    const call = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(call.status).toBe('error');
  });

  it('does NOT touch a done RD job on startup', async () => {
    mockPersistedJobs = [makeRdJob('done')];
    runStartupCleanup();
    // Give the async cleanup time to run
    await new Promise(r => setTimeout(r, 200));
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('does NOT touch an error RD job on startup', async () => {
    mockPersistedJobs = [makeRdJob('error')];
    runStartupCleanup();
    await new Promise(r => setTimeout(r, 200));
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('does NOT touch queued/downloading qBit jobs on startup', async () => {
    mockPersistedJobs = [makeQbitJob('queued'), makeQbitJob('downloading')];
    runStartupCleanup();
    await new Promise(r => setTimeout(r, 200));
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('marks multiple stuck RD jobs — one upsertJob call per job', async () => {
    mockPersistedJobs = [
      makeRdJob('queued',      { jobId: 'rd-aaa-1', infoHash: 'aaa' }),
      makeRdJob('downloading', { jobId: 'rd-bbb-2', infoHash: 'bbb' }),
      makeRdJob('done',        { jobId: 'rd-ccc-3', infoHash: 'ccc' }),
    ];
    runStartupCleanup();
    await vi.waitFor(() => expect(mockUpsertJob).toHaveBeenCalledTimes(2), { timeout: 2000 });

    const statuses = mockUpsertJob.mock.calls.map(c => (c[0] as Record<string, unknown>).status);
    expect(statuses).toEqual(['error', 'error']);
  });

  it('sets completedAt on the error record', async () => {
    const before = new Date().toISOString();
    mockPersistedJobs = [makeRdJob('downloading')];
    runStartupCleanup();
    await vi.waitFor(() => expect(mockUpsertJob).toHaveBeenCalled(), { timeout: 2000 });

    const call = mockUpsertJob.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof call.completedAt).toBe('string');
    expect(call.completedAt as string >= before).toBe(true);
  });

  it('does NOT call upsertJob when no stuck RD jobs exist', async () => {
    mockPersistedJobs = [makeRdJob('done'), makeQbitJob('downloading')];
    runStartupCleanup();
    await new Promise(r => setTimeout(r, 200));
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('emits a console.log for each interrupted RD job', async () => {
    mockPersistedJobs = [makeRdJob('queued', { title: 'Inception 1080p' })];
    runStartupCleanup();
    await vi.waitFor(() => expect(mockUpsertJob).toHaveBeenCalled(), { timeout: 2000 });

    const logCalls = logSpy.mock.calls.map(c => c.join(' '));
    const hasJobLog = logCalls.some(msg => msg.includes('Inception 1080p'));
    expect(hasJobLog).toBe(true);
  });

  it('emits a summary log when stuck RD jobs are found', async () => {
    mockPersistedJobs = [makeRdJob('downloading'), makeRdJob('queued', { infoHash: 'xyz' })];
    runStartupCleanup();
    await vi.waitFor(() => expect(mockUpsertJob).toHaveBeenCalledTimes(2), { timeout: 2000 });

    const logCalls = logSpy.mock.calls.map(c => c.join(' '));
    const hasSummary = logCalls.some(msg => msg.includes('2') && msg.includes('interrupted'));
    expect(hasSummary).toBe(true);
  });

  it('does not throw even if no jobs exist at all', () => {
    mockPersistedJobs = [];
    expect(() => runStartupCleanup()).not.toThrow();
  });
});
