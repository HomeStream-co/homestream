/**
 * Tests for:
 *   GET /api/jellyfin/Users
 *   GET /api/jellyfin/Users/:userId
 *
 * TV apps call these after login to get the user ID and preferences.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockReq, mockRes } from './helpers';

const { default: usersListHandler } = await import(
  '../../server/api/jellyfin/Users/GET'
);
const { default: userByIdHandler } = await import(
  '../../server/api/jellyfin/Users/[userId]/GET'
);

// ── GET /api/jellyfin/Users ───────────────────────────────────────────────────

describe('GET /api/jellyfin/Users', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => { res = mockRes(); });

  it('returns an array with at least one user', async () => {
    const req = mockReq();
    await usersListHandler(req, res as never);

    const body = res.body as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('each user has required Jellyfin fields', async () => {
    const req = mockReq();
    await usersListHandler(req, res as never);

    const users = res.body as Record<string, unknown>[];
    for (const user of users) {
      expect(user).toHaveProperty('Id');
      expect(user).toHaveProperty('Name');
      expect(user).toHaveProperty('ServerId');
      expect(user).toHaveProperty('Policy');
    }
  });

  it('admin user has administrator policy', async () => {
    const req = mockReq();
    await usersListHandler(req, res as never);

    const users = res.body as Array<{ Policy: Record<string, unknown> }>;
    const admin = users.find(u => (u as Record<string, unknown>).Id === 'homestream-admin');
    expect(admin).toBeDefined();
    expect(admin!.Policy.IsAdministrator).toBe(true);
    expect(admin!.Policy.EnableMediaPlayback).toBe(true);
  });
});

// ── GET /api/jellyfin/Users/:userId ──────────────────────────────────────────

describe('GET /api/jellyfin/Users/:userId', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => { res = mockRes(); });

  it('returns the admin user for id "homestream-admin"', async () => {
    const req = mockReq({ params: { userId: 'homestream-admin' } });
    await userByIdHandler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Id).toBe('homestream-admin');
    expect(body.Name).toBe('Admin');
    expect(body.ServerId).toBe('homestream-server-001');
  });

  it('returns the admin user for the special "me" alias', async () => {
    const req = mockReq({ params: { userId: 'me' } });
    await userByIdHandler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Id).toBe('homestream-admin');
  });

  it('returns 404 for an unknown user id', async () => {
    const req = mockReq({ params: { userId: 'unknown-user-xyz' } });
    await userByIdHandler(req, res as never);

    expect(res.statusCode).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('includes Policy and Configuration objects', async () => {
    const req = mockReq({ params: { userId: 'homestream-admin' } });
    await userByIdHandler(req, res as never);

    const body = res.body as Record<string, unknown>;
    expect(body.Policy).toBeDefined();
    expect(body.Configuration).toBeDefined();
  });

  it('Policy has media playback permissions enabled', async () => {
    const req = mockReq({ params: { userId: 'homestream-admin' } });
    await userByIdHandler(req, res as never);

    const body = res.body as { Policy: Record<string, unknown> };
    expect(body.Policy.EnableMediaPlayback).toBe(true);
    expect(body.Policy.EnableAllFolders).toBe(true);
    expect(body.Policy.IsAdministrator).toBe(true);
  });

  it('Configuration has sensible defaults for TV apps', async () => {
    const req = mockReq({ params: { userId: 'homestream-admin' } });
    await userByIdHandler(req, res as never);

    const body = res.body as { Configuration: Record<string, unknown> };
    expect(body.Configuration.PlayDefaultAudioTrack).toBe(true);
    expect(body.Configuration.EnableNextEpisodeAutoPlay).toBe(true);
    expect(body.Configuration.RememberAudioSelections).toBe(true);
  });
});
