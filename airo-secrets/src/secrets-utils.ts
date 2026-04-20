import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Secret stored in config.json (cloud format)
 */
interface StoredSecret {
  VALUE: string | object;
  SYSTEM_MANAGED: boolean;
}

interface ConfigStorage {
  [key: string]: StoredSecret | unknown;
}

const CONFIG_PATH = '/alloc/config.json';

function readConfig(): ConfigStorage {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function isNonSystemManagedSecret(value: unknown): value is StoredSecret {
  return (
    value !== null &&
    typeof value === 'object' &&
    'VALUE' in (value as object) &&
    'SYSTEM_MANAGED' in (value as object) &&
    (value as StoredSecret).SYSTEM_MANAGED === false
  );
}

/**
 * Load .env file from the project root into process.env (local installs only).
 * This runs once on first call and is a no-op in cloud environments where
 * /alloc/config.json exists.
 */
let dotenvLoaded = false;
function loadDotenv() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  if (existsSync(CONFIG_PATH)) return; // cloud env — skip
  // Walk up from this file to find the project root .env
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    try {
      const lines = readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    } catch { /* ignore parse errors */ }
    break;
  }
}

/**
 * Get a secret by name.
 *
 * Resolution order:
 *  1. Cloud: /alloc/config.json (Airo platform)
 *  2. Local: process.env (populated from .env file on first call)
 *
 * This means the same codebase works both in the cloud builder and
 * as a self-hosted local install with a .env file.
 */
export function getSecret(secretName: string): string | object | null {
  // 1. Try cloud config
  const config = readConfig();
  if (secretName in config) {
    const entry = config[secretName];
    if (isNonSystemManagedSecret(entry)) return entry.VALUE;
  }

  // 2. Fall back to process.env / .env file
  loadDotenv();
  const envVal = process.env[secretName];
  if (envVal !== undefined && envVal !== '') return envVal;

  return null;
}

/**
 * List all available secret names (cloud + local env).
 */
export function listSecretNames(): string[] {
  loadDotenv();
  const names = new Set<string>();

  // Cloud secrets
  try {
    const config = readConfig();
    for (const [key, value] of Object.entries(config)) {
      if (isNonSystemManagedSecret(value)) names.add(key);
    }
  } catch { /* ignore */ }

  // Common env keys that are likely secrets (not system vars)
  const systemPrefixes = ['npm_', 'NODE_', 'PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'TERM'];
  for (const key of Object.keys(process.env)) {
    if (!systemPrefixes.some(p => key.startsWith(p))) {
      names.add(key);
    }
  }

  return [...names].sort();
}
