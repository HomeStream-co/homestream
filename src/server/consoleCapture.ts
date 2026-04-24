/**
 * consoleCapture.ts
 *
 * Lightweight in-memory ring buffer that captures console output.
 * Installed once at server startup (called from configure.js).
 *
 * Keeps the last MAX_ENTRIES lines in memory — no disk I/O.
 * Used by GET /api/dev/logs to return recent server output for
 * AI-assisted remote debugging.
 *
 * Does NOT suppress output — original console methods still fire.
 */

export interface LogEntry {
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];
let installed = false;

function capture(level: LogEntry['level'], args: unknown[]): void {
  const message = args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  buffer.push({ timestamp: new Date().toISOString(), level, message });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

/**
 * Install console capture. Safe to call multiple times — only installs once.
 */
export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;

  const origLog   = console.log.bind(console);
  const origInfo  = console.info.bind(console);
  const origWarn  = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log   = (...args) => { capture('log',   args); origLog(...args);   };
  console.info  = (...args) => { capture('info',  args); origInfo(...args);  };
  console.warn  = (...args) => { capture('warn',  args); origWarn(...args);  };
  console.error = (...args) => { capture('error', args); origError(...args); };
}

/**
 * Returns the last N captured log entries.
 */
export function getConsoleLog(n = 100): LogEntry[] {
  return buffer.slice(-n);
}

/**
 * Clears the in-memory buffer.
 */
export function clearConsoleLog(): void {
  buffer.length = 0;
}
