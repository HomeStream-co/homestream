/**
 * Tests for GET /api/jellyfin/System/Info/Public
 *
 * This is the first endpoint TV apps call to verify they're talking to a
 * Jellyfin-compatible server. It must return the correct shape and version.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './helpers';

// ── Module mock ───────────────────────────────────────────────────────────────
// os.networkInterfaces() varies by machine — mock it for deterministic tests
vi.mock('os', () => ({
  default: {
    platform: () => 'linux',
    networkInterfaces: () => ({
      eth0: [
        { family: 'IPv4', address: '192.168.1.100', internal: false },
        { family: 'IPv6', address: '::1', internal: false },
      ],
      lo: [
        { family: 'IPv4', address: '127.0.0.1', internal: true },
      ],
    }),
  },
}));

// Import AFTER mocking
const { default: handler } = await import(
  '../../server/api/jellyfin/System/Info/Public/GET'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/jellyfin/System/Info/Public', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
  });

  it('returns 200 with required Jellyfin fields', async () => {
    const req = mockReq();
    await handler(req, res as never);

    expect(res.json).toHaveBeenCalledOnce();
    const body = res.body as Record<string, unknown>;

    expect(body).toMatchObject({
      ServerName: 'HomeStream',
      ProductName: 'HomeStream Media Server',
      Id: 'homestream-server-001',
      StartupWizardCompleted: true,
    });
  });

  it('returns Jellyfin-compatible version string', async () => {
    const req = mockReq();
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    // Must be a semver-like string that TV apps can parse
    expect(typeof body.Version).toBe('string');
    expect(body.Version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('includes a LocalAddress with the non-loopback IP', async () => {
    const req = mockReq();
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(typeof body.LocalAddress).toBe('string');
    // Should contain the mocked non-internal IP
    expect(body.LocalAddress).toContain('192.168.1.100');
  });

  it('includes OperatingSystem field', async () => {
    const req = mockReq();
    await handler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(typeof body.OperatingSystem).toBe('string');
  });
});
