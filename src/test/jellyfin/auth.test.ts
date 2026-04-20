/**
 * Tests for POST /api/jellyfin/Users/AuthenticateByName
 *
 * Covers:
 *  - Open mode (no password set)
 *  - Plaintext password validation
 *  - bcrypt password validation
 *  - Invalid credentials → 401
 *  - Missing fields → 400
 *  - Response shape (AccessToken, User, SessionInfo, ServerId)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { mockReq, mockRes } from './helpers';

// ── Mock configStore ──────────────────────────────────────────────────────────

const mockConfig: Record<string, unknown> = { adminPassword: '' };

vi.mock('../../server/configStore', () => ({
  readConfig: () => mockConfig,
}));

// Import AFTER mocking
const { default: handler } = await import(
  '../../server/api/jellyfin/Users/AuthenticateByName/POST'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/jellyfin/Users/AuthenticateByName', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
    mockConfig.adminPassword = ''; // reset to open mode
  });

  // ── Open mode (no password) ─────────────────────────────────────────────────

  describe('open mode (no password set)', () => {
    it('accepts any username and password', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: 'anything' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.AccessToken).toBeDefined();
      expect(typeof body.AccessToken).toBe('string');
      expect((body.AccessToken as string).length).toBeGreaterThan(0);
    });

    it('accepts empty password in open mode', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: '' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(200);
    });
  });

  // ── Plaintext password ──────────────────────────────────────────────────────

  describe('plaintext password', () => {
    beforeEach(() => { mockConfig.adminPassword = 'secret123'; });

    it('accepts correct password', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: 'secret123' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.AccessToken).toBeDefined();
    });

    it('rejects wrong password with 401', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: 'wrongpassword' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(401);
      const body = res.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });
  });

  // ── bcrypt password ─────────────────────────────────────────────────────────

  describe('bcrypt-hashed password', () => {
    beforeEach(async () => {
      mockConfig.adminPassword = await bcrypt.hash('hashed-secret', 10);
    });

    it('accepts correct password against bcrypt hash', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: 'hashed-secret' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.AccessToken).toBeDefined();
    });

    it('rejects wrong password against bcrypt hash with 401', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: 'wrong-password' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns 400 when Username is missing', async () => {
      const req = mockReq({ body: { Pw: 'password' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when Pw is missing', async () => {
      const req = mockReq({ body: { Username: 'admin' } });
      await handler(req, res as never);

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when body is empty', async () => {
      const req = mockReq({ body: {} });
      await handler(req, res as never);

      expect(res.statusCode).toBe(400);
    });
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns all required Jellyfin auth fields', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: '' } });
      await handler(req, res as never);

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('AccessToken');
      expect(body).toHaveProperty('User');
      expect(body).toHaveProperty('SessionInfo');
      expect(body).toHaveProperty('ServerId');
      expect(body).toHaveProperty('ServerName');
    });

    it('User object has required fields', async () => {
      const req = mockReq({ body: { Username: 'testuser', Pw: '' } });
      await handler(req, res as never);

      const body = res.body as { User: Record<string, unknown> };
      expect(body.User).toHaveProperty('Name', 'testuser');
      expect(body.User).toHaveProperty('Id');
      expect(body.User).toHaveProperty('ServerId');
      expect(body.User).toHaveProperty('Policy');
      expect(body.User).toHaveProperty('Configuration');
    });

    it('SessionInfo has required fields', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: '' } });
      await handler(req, res as never);

      const body = res.body as { SessionInfo: Record<string, unknown> };
      expect(body.SessionInfo).toHaveProperty('UserId');
      expect(body.SessionInfo).toHaveProperty('Client');
      expect(body.SessionInfo).toHaveProperty('DeviceName');
      expect(body.SessionInfo).toHaveProperty('Id');
    });

    it('AccessToken is a 64-char hex string', async () => {
      const req = mockReq({ body: { Username: 'admin', Pw: '' } });
      await handler(req, res as never);

      const body = res.body as { AccessToken: string };
      expect(body.AccessToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it('each call generates a unique AccessToken', async () => {
      const req1 = mockReq({ body: { Username: 'admin', Pw: '' } });
      const req2 = mockReq({ body: { Username: 'admin', Pw: '' } });
      const res2 = mockRes();

      await handler(req1, res as never);
      await handler(req2, res2 as never);

      const token1 = (res.body as { AccessToken: string }).AccessToken;
      const token2 = (res2.body as { AccessToken: string }).AccessToken;
      expect(token1).not.toBe(token2);
    });
  });
});
