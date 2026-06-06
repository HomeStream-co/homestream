import { exec } from 'child_process';

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export function execAsync(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: options.timeout ?? 30_000, cwd: options.cwd }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}
