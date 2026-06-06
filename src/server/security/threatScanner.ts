/**
 * Threat scanner stub — full implementation to be provided in a later batch.
 * Exports the surface used by episodeScheduler and other callers.
 */

export interface ScanResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Run a pre-download safety check on a torrent descriptor.
 * Stub always allows so the scheduler can proceed.
 */
export async function runPreDownloadScan(
  _descriptor: { infoHash: string; title?: string } | string,
  _opts?: { title?: string }
): Promise<ScanResult> {
  return { allowed: true };
}
