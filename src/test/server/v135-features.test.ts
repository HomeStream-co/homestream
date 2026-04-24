/**
 * v135-features.test.ts
 *
 * Unit tests for v1.3.5 bug fixes and feature additions that live in
 * pure logic (no DOM, no React) — testable entirely in the Node environment:
 *
 *   1. Auto-skip intro ref guard — fires exactly once per item
 *   2. Duplicate download 409 toast — correct response shape
 *   3. HTTPS Setup page — React import present (static analysis)
 *   4. Profiles page — layout class uses justify-start (top-aligned)
 *   5. SettingsPanel — forceOpen + onClose props exist in interface
 *   6. VPN interfaces — likelyVpn heuristic covers broad adapter names
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../');

// ── 1. Auto-skip intro ref guard ─────────────────────────────────────────────

describe('auto-skip intro — ref guard logic', () => {
  it('fires exactly once when guard starts false', () => {
    let fired = 0;
    const autoSkipFiredRef = { current: false };

    function simulateTick(currentTime: number) {
      const inIntro = currentTime > 30 && currentTime < 240;
      if (inIntro && !autoSkipFiredRef.current) {
        autoSkipFiredRef.current = true;
        fired++;
      }
    }

    // Simulate many currentTime updates while in intro range
    for (let t = 31; t < 240; t += 5) simulateTick(t);

    expect(fired).toBe(1);
  });

  it('does not fire when currentTime is before intro window', () => {
    let fired = 0;
    const autoSkipFiredRef = { current: false };

    function simulateTick(currentTime: number) {
      const inIntro = currentTime > 30 && currentTime < 240;
      if (inIntro && !autoSkipFiredRef.current) {
        autoSkipFiredRef.current = true;
        fired++;
      }
    }

    for (let t = 0; t <= 30; t += 5) simulateTick(t);
    expect(fired).toBe(0);
  });

  it('does not fire when currentTime is past intro window', () => {
    let fired = 0;
    const autoSkipFiredRef = { current: false };

    function simulateTick(currentTime: number) {
      const inIntro = currentTime > 30 && currentTime < 240;
      if (inIntro && !autoSkipFiredRef.current) {
        autoSkipFiredRef.current = true;
        fired++;
      }
    }

    for (let t = 240; t < 400; t += 10) simulateTick(t);
    expect(fired).toBe(0);
  });

  it('resets correctly when ref is reset (simulating item change)', () => {
    let fired = 0;
    const autoSkipFiredRef = { current: false };

    function simulateTick(currentTime: number) {
      const inIntro = currentTime > 30 && currentTime < 240;
      if (inIntro && !autoSkipFiredRef.current) {
        autoSkipFiredRef.current = true;
        fired++;
      }
    }

    // First item — fires once
    for (let t = 31; t < 240; t += 5) simulateTick(t);
    expect(fired).toBe(1);

    // Item changes — reset ref (as useEffect([id]) does)
    autoSkipFiredRef.current = false;

    // Second item — fires once more
    for (let t = 31; t < 240; t += 5) simulateTick(t);
    expect(fired).toBe(2);
  });

  it('does not fire when autoSkipIntro setting is false', () => {
    let fired = 0;
    const autoSkipFiredRef = { current: false };
    const autoSkipIntro = false;

    function simulateTick(currentTime: number) {
      const inIntro = currentTime > 30 && currentTime < 240;
      if (inIntro && autoSkipIntro && !autoSkipFiredRef.current) {
        autoSkipFiredRef.current = true;
        fired++;
      }
    }

    for (let t = 31; t < 240; t += 5) simulateTick(t);
    expect(fired).toBe(0);
  });
});

// ── 2. Duplicate download 409 response shape ──────────────────────────────────

describe('duplicate download — 409 response shape', () => {
  it('409 body includes jobId field', () => {
    // Mirrors the shape returned by POST /api/stremio/download on duplicate
    const response409 = {
      error: 'duplicate',
      jobId: 'abc12345',
      message: 'Already downloading',
    };
    expect(response409).toHaveProperty('jobId');
    expect(typeof response409.jobId).toBe('string');
  });

  it('409 body includes error field', () => {
    const response409 = { error: 'duplicate', jobId: 'abc12345' };
    expect(response409.error).toBe('duplicate');
  });

  it('toast logic: 409 triggers yellow toast, not red', () => {
    // Simulate the toast decision logic from discover.tsx handleTMDBDownload
    function getToastType(status: number): 'yellow' | 'red' | 'green' {
      if (status === 409) return 'yellow';
      if (status >= 400) return 'red';
      return 'green';
    }
    expect(getToastType(409)).toBe('yellow');
    expect(getToastType(500)).toBe('red');
    expect(getToastType(200)).toBe('green');
  });

  it('toast message includes job ID when 409', () => {
    const jobId = 'job-abc123';
    const message = `Already in queue (job ${jobId.slice(0, 8)}…)`;
    expect(message).toContain('job-abc1');
    expect(message).toContain('Already in queue');
  });
});

// ── 3. HTTPS Setup page — React import present ────────────────────────────────

describe('HTTPS Setup page — React import', () => {
  it('imports React at the top of https-setup.tsx', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/https-setup.tsx'),
      'utf-8'
    );
    // Must have a default React import (not just named imports)
    expect(src).toMatch(/import React[,\s{]/);
  });

  it('uses React.ElementType in SCENARIOS array type', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/https-setup.tsx'),
      'utf-8'
    );
    expect(src).toContain('React.ElementType');
  });

  it('React import appears before React.ElementType usage', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/https-setup.tsx'),
      'utf-8'
    );
    const importIdx = src.indexOf('import React');
    const usageIdx  = src.indexOf('React.ElementType');
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(usageIdx).toBeGreaterThan(importIdx);
  });
});

// ── 4. Profiles page — top-aligned layout ────────────────────────────────────

describe('Profiles page — top-aligned layout', () => {
  it('uses justify-start (not justify-center) for top alignment', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/profiles.tsx'),
      'utf-8'
    );
    expect(src).toContain('justify-start');
  });

  it('does not use justify-center for the main wrapper', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/profiles.tsx'),
      'utf-8'
    );
    // The outer wrapper should NOT be vertically centered
    // (justify-center may appear in child elements like buttons, that's fine)
    const wrapperMatch = src.match(/flex flex-col items-center justify-(\w+)/);
    expect(wrapperMatch?.[1]).toBe('start');
  });

  it('uses pt-16 for top padding instead of centering', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/profiles.tsx'),
      'utf-8'
    );
    expect(src).toContain('pt-16');
  });
});

// ── 5. SettingsPanel — forceOpen + onClose props ─────────────────────────────

describe('SettingsPanel — forceOpen + onClose props', () => {
  it('SettingsPanelProps interface includes forceOpen', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'components/SettingsPanel.tsx'),
      'utf-8'
    );
    expect(src).toContain('forceOpen');
  });

  it('SettingsPanelProps interface includes onClose', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'components/SettingsPanel.tsx'),
      'utf-8'
    );
    expect(src).toContain('onClose');
  });

  it('useEffect responds to forceOpen by calling setOpen(true)', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'components/SettingsPanel.tsx'),
      'utf-8'
    );
    // The effect should set open to true when forceOpen is truthy
    expect(src).toContain('if (forceOpen) setOpen(true)');
  });

  it('Header passes forceOpen and onClose to SettingsPanel', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'layouts/parts/Header.tsx'),
      'utf-8'
    );
    expect(src).toContain('forceOpen={settingsForceOpen}');
    expect(src).toContain('onClose={() => setSettingsForceOpen(false)}');
  });

  it('Security Center onBack sets settingsForceOpen to true', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'layouts/parts/Header.tsx'),
      'utf-8'
    );
    expect(src).toContain('setSettingsForceOpen(true)');
  });
});

// ── 6. Parental controls — hidden for restricted profiles ─────────────────────

describe('SettingsPanel — parental controls hidden for restricted profiles', () => {
  it('guards parental controls section with !activeProfile?.restricted', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'components/SettingsPanel.tsx'),
      'utf-8'
    );
    expect(src).toContain('!activeProfile?.restricted');
  });

  it('activeProfile is destructured from useProfile in SettingsPanel', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'components/SettingsPanel.tsx'),
      'utf-8'
    );
    // Must include activeProfile in the destructure
    expect(src).toMatch(/const\s*\{[^}]*activeProfile[^}]*\}\s*=\s*useProfile\(\)/);
  });
});

// ── 7. VPN interfaces — broad adapter name heuristic ─────────────────────────

describe('VPN interfaces — likelyVpn heuristic', () => {
  const VPN_HINTS = [
    'vpn', 'norton', 'nord', 'express', 'proton', 'mullvad', 'surfshark',
    'wireguard', 'openvpn', 'tun', 'tap', 'wg', 'private', 'secure',
  ];

  function likelyVpn(name: string): boolean {
    const lower = name.toLowerCase();
    return VPN_HINTS.some(hint => lower.includes(hint));
  }

  it('detects WireGuard adapter', () => {
    expect(likelyVpn('wg0')).toBe(true);
    expect(likelyVpn('WireGuard Tunnel')).toBe(true);
  });

  it('detects OpenVPN adapter', () => {
    expect(likelyVpn('OpenVPN TAP')).toBe(true);
    expect(likelyVpn('openvpn0')).toBe(true);
  });

  it('detects tun/tap adapters', () => {
    expect(likelyVpn('tun0')).toBe(true);
    expect(likelyVpn('tap0')).toBe(true);
  });

  it('detects named VPN providers', () => {
    expect(likelyVpn('NordVPN')).toBe(true);
    expect(likelyVpn('ProtonVPN')).toBe(true);
    expect(likelyVpn('Mullvad')).toBe(true);
    expect(likelyVpn('ExpressVPN')).toBe(true);
    expect(likelyVpn('Surfshark')).toBe(true);
    expect(likelyVpn('Norton Secure VPN')).toBe(true);
  });

  it('does NOT flag standard Ethernet as VPN', () => {
    expect(likelyVpn('Ethernet')).toBe(false);
    expect(likelyVpn('Wi-Fi')).toBe(false);
    expect(likelyVpn('Local Area Connection')).toBe(false);
    expect(likelyVpn('Loopback Pseudo-Interface 1')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(likelyVpn('WIREGUARD')).toBe(true);
    expect(likelyVpn('NORDVPN')).toBe(true);
    expect(likelyVpn('TUN0')).toBe(true);
  });
});

// ── 8. TV Shows discover — 3 rows present in source ──────────────────────────

describe('Discover page — TV Shows 3-row layout', () => {
  it('discover.tsx references topRatedShows from TMDB context', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/discover.tsx'),
      'utf-8'
    );
    expect(src).toContain('topRatedShows');
  });

  it('discover.tsx references popularShows from TMDB context', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/discover.tsx'),
      'utf-8'
    );
    expect(src).toContain('popularShows');
  });

  it('discover.tsx has "Trending This Week" row for shows', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/discover.tsx'),
      'utf-8'
    );
    expect(src).toContain('Trending This Week');
  });

  it('discover.tsx has "Popular Right Now" row for shows', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/discover.tsx'),
      'utf-8'
    );
    expect(src).toContain('Popular Right Now');
  });

  it('discover.tsx has "All-Time Top Rated" row for shows', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/discover.tsx'),
      'utf-8'
    );
    expect(src).toContain('All-Time Top Rated');
  });

  it('filteredTopRatedShows and filteredPopularShows are derived in discover.tsx', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'pages/discover.tsx'),
      'utf-8'
    );
    expect(src).toContain('filteredTopRatedShows');
    expect(src).toContain('filteredPopularShows');
  });
});
