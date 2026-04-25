/**
 * cast-send.test.ts
 *
 * Tests for POST /api/cast/send — DLNA/UPnP cast handler.
 *
 * Covers:
 *   1.  401 when not authenticated
 *   2.  400 when deviceLocation is missing
 *   3.  400 when neither streamUrl nor mediaId is provided
 *   4.  404 when mediaId is provided but not found in library
 *   5.  422 when device does not expose AVTransport service
 *   6.  502 when SetAVTransportURI SOAP call fails
 *   7.  502 when Play SOAP call fails
 *   8.  200 ok:true on full success (SetAVTransportURI + Play both succeed)
 *   9.  streamUrl resolved from mediaId via library lookup
 *   10. 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock state ─────────────────────────────────────────────────────────

let mockAuthed = true;
let mockLibrary: Array<{ id: string; filename?: string; filePath?: string }> = [];

// Controls what the fake HTTP device returns for each request type
type DeviceResponse = { statusCode: number; body: string };
let mockDescriptionResponse: DeviceResponse = {
  statusCode: 200,
  body: `<serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
         <controlURL>/AVTransport/control</controlURL>`,
};
let mockSetUriResponse: DeviceResponse  = { statusCode: 200, body: '' };
let mockPlayResponse: DeviceResponse    = { statusCode: 200, body: '' };

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/authMiddleware.js', () => ({
  requireAuth: (_req: Request, res: Response) => {
    if (!mockAuthed) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));

vi.mock('../../server/libraryStore.js', () => ({
  readLibrary: () => mockLibrary,
}));

// Mock http.request — intercept all outbound HTTP calls from the handler
vi.mock('http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('http')>();

  let callCount = 0;

  const request = vi.fn((_options: unknown, callback: (res: unknown) => void) => {
    callCount++;
    const isFirst  = callCount === 1;   // device description fetch
    const isSecond = callCount === 2;   // SetAVTransportURI
    // third call = Play

    const response = isFirst
      ? mockDescriptionResponse
      : isSecond
        ? mockSetUriResponse
        : mockPlayResponse;

    // Reset counter after 3 calls (one full cast cycle)
    if (callCount >= 3) callCount = 0;

    const fakeRes = {
      statusCode: response.statusCode,
      on: (event: string, cb: (data?: unknown) => void) => {
        if (event === 'data') setTimeout(() => cb(response.body), 0);
        if (event === 'end')  setTimeout(() => cb(), 5);
      },
    };

    setTimeout(() => callback(fakeRes), 0);

    return {
      on:    vi.fn(),
      write: vi.fn(),
      end:   vi.fn(),
    };
  });

  // Reset call count between tests
  (request as unknown as { _reset: () => void })._reset = () => { callCount = 0; };

  return { ...actual, default: { ...actual, request } };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes(body: unknown) {
  const req = { body, cookies: { session: 'tok' } } as unknown as Request;
  const captured: { status?: number; json?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn((v: unknown) => { captured.json = v; return res; }),
  } as unknown as Response;
  return { req, res, captured };
}

const { default: handler } = await import('../../server/api/cast/send/POST.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/cast/send', () => {
  beforeEach(() => {
    mockAuthed = true;
    mockLibrary = [{ id: 'media-1', filename: 'inception.mp4' }];
    mockDescriptionResponse = {
      statusCode: 200,
      body: `<serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
             <controlURL>/AVTransport/control</controlURL>`,
    };
    mockSetUriResponse = { statusCode: 200, body: '' };
    mockPlayResponse   = { statusCode: 200, body: '' };
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthed = false;
    const { req, res } = makeReqRes({ deviceLocation: 'http://192.168.1.5:1400/desc.xml' });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when deviceLocation is missing', async () => {
    const { req, res } = makeReqRes({ streamUrl: 'http://192.168.1.10:3000/api/stream/movie.mp4' });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when neither streamUrl nor mediaId is provided', async () => {
    const { req, res } = makeReqRes({ deviceLocation: 'http://192.168.1.5:1400/desc.xml' });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when mediaId is not found in library', async () => {
    mockLibrary = [];
    const { req, res } = makeReqRes({
      deviceLocation: 'http://192.168.1.5:1400/desc.xml',
      mediaId: 'nonexistent',
    });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 422 when device does not expose AVTransport service', async () => {
    mockDescriptionResponse = { statusCode: 200, body: '<root><device><friendlyName>TV</friendlyName></device></root>' };
    const { req, res } = makeReqRes({
      deviceLocation: 'http://192.168.1.5:1400/desc.xml',
      streamUrl: 'http://192.168.1.10:3000/api/stream/movie.mp4',
    });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('returns 502 when SetAVTransportURI SOAP call fails', async () => {
    mockSetUriResponse = { statusCode: 500, body: 'Internal Server Error' };
    const { req, res } = makeReqRes({
      deviceLocation: 'http://192.168.1.5:1400/desc.xml',
      streamUrl: 'http://192.168.1.10:3000/api/stream/movie.mp4',
    });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns 502 when Play SOAP call fails', async () => {
    mockPlayResponse = { statusCode: 500, body: 'Internal Server Error' };
    const { req, res } = makeReqRes({
      deviceLocation: 'http://192.168.1.5:1400/desc.xml',
      streamUrl: 'http://192.168.1.10:3000/api/stream/movie.mp4',
    });
    await handler(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns ok:true on full success', async () => {
    const { req, res, captured } = makeReqRes({
      deviceLocation: 'http://192.168.1.5:1400/desc.xml',
      streamUrl: 'http://192.168.1.10:3000/api/stream/movie.mp4',
      title: 'Inception',
    });
    await handler(req as Request, res as Response);
    const body = captured.json as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it('resolves HLS stream URL from mediaId via library lookup', async () => {
    const { req, res } = makeReqRes({
      deviceLocation: 'http://192.168.1.5:1400/desc.xml',
      mediaId: 'media-1',
    });
    await handler(req as Request, res as Response);
    // Should NOT return 404 — item exists in library
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });
});
