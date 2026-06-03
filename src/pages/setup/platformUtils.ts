/**
 * Platform detection helpers for the setup wizard.
 *
 * isLinux is derived from the HOMESTREAM_PLATFORM env var injected by Electron
 * (via /api/electron), which is the authoritative source. We fall back to
 * navigator.userAgent only as a last resort for non-Electron environments.
 *
 * DO NOT use navigator.userAgent alone — it reflects the *browser's* OS, not
 * the *server's* OS. A Windows user opening the wizard in Chrome on a Linux
 * server would see Windows UI. The server platform is what matters.
 *
 * Usage:
 *   import { getIsLinux } from './platformUtils';
 *   const isLinux = getIsLinux(platformFromApiElectron);
 *
 * Or use the synchronous UA fallback for components that render before
 * /api/electron resolves (only for initial placeholder text — not for logic):
 *   import { isLinuxUA } from './platformUtils';
 */

/**
 * Returns true if the server is running on Linux.
 * @param serverPlatform  Value of HOMESTREAM_PLATFORM from /api/electron response.
 *                        Pass undefined if the API hasn't responded yet.
 */
export function getIsLinux(serverPlatform: string | undefined): boolean {
  if (serverPlatform) return serverPlatform === 'linux';
  // Fallback: UA sniff — only used before /api/electron responds.
  // Acceptable for placeholder text; never use for conditional logic.
  return typeof navigator !== 'undefined'
    && /Linux/.test(navigator.userAgent)
    && !/Android/.test(navigator.userAgent);
}

/**
 * Synchronous UA-based Linux detection.
 * Use ONLY for initial placeholder text before the server platform is known.
 * Never gate feature logic on this — use getIsLinux(serverPlatform) instead.
 */
export const isLinuxUA: boolean =
  typeof navigator !== 'undefined'
  && /Linux/.test(navigator.userAgent)
  && !/Android/.test(navigator.userAgent);
