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

export interface QuarantineEntry {
  id: string;
  filePath: string;
  infoHash?: string;
  title?: string;
  reason?: string;
  quarantinedAt: number;
}

export async function readQuarantineLog(): Promise<QuarantineEntry[]> {
  return [];
}

export async function deleteFromQuarantine(_id: string): Promise<void> {}

export async function restoreFromQuarantine(_id: string): Promise<void> {}

export async function runPostDownloadScan(
  _opts: { filePath?: string; infoHash?: string; title?: string }
): Promise<ScanResult> {
  return { allowed: true };
}
