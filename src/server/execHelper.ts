/**
 * Thin wrapper around child_process.exec with a configurable timeout.
 * Shared by vpnService and vpnServerRanker to avoid duplicating the
 * promisify + timeout pattern.
 */
import { exec } from 'child_process';

export function execAsync(
  cmd: string,
  opts: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: opts.timeout ?? 30_000 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}
