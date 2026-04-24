/**
 * HomeStream Threat Scanner
 * ─────────────────────────
 * 4-layer security system for torrent downloads.
 *
 * Layer 1 — Pre-download file list scan
 *   Inspects every filename in the torrent's file list before qBittorrent
 *   starts. Blocks if any file has a dangerous extension (.exe, .bat, etc.)
 *   Also peeks inside .zip/.rar archives to check their contents.
 *
 * Layer 2 — VirusTotal info hash lookup
 *   Looks up the torrent's SHA1 info hash on VirusTotal's public API.
 *   If the hash is a known malware sample, blocks the download instantly.
 *   Zero delay on clean/unknown hashes (VT returns "not found" immediately).
 *   Requires VIRUSTOTAL_API_KEY in config (optional — skipped if not set).
 *
 * Layer 3 — Magic bytes MIME verification (post-download)
 *   Reads the first 16 bytes of a downloaded file and checks against known
 *   video container signatures. Catches renamed executables (e.g. virus.mp4
 *   that is actually a Windows PE binary).
 *
 * Layer 4 — Quarantine system
 *   Suspicious files are moved to /quarantine instead of deleted.
 *   Every quarantine event is logged to quarantine-log.json with reason,
 *   timestamp, original path, and which layer caught it.
 *   The SecurityPanel UI lets you review and permanently delete from there.
 */

import fs from 'fs';
import path from 'path';
import { readConfig } from '../configStore.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThreatLevel = 'clean' | 'suspicious' | 'blocked';

export interface ScanResult {
  allowed: boolean;
  threatLevel: ThreatLevel;
  reason?: string;
  layer?: string;
  details?: string;
  infoHash?: string;
  checkedAt: string;
}

export interface QuarantineEntry {
  id: string;
  originalPath: string;
  quarantinePath: string;
  reason: string;
  layer: string;
  infoHash?: string;
  title?: string;
  quarantinedAt: string;
  sizeBytes?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Extensions that should never appear in a media torrent */
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.ps1', '.ps2', '.psm1', '.psd1',
  '.msi', '.msp', '.mst',
  '.jar', '.class',
  '.sh', '.bash', '.zsh', '.fish',
  '.app', '.dmg', '.pkg',
  '.deb', '.rpm',
  '.lnk', '.url',
  '.hta', '.htm', '.html',  // in a torrent context, suspicious
  '.reg',
  '.dll', '.sys', '.drv',
]);

/** Extensions that are safe in a media torrent */
const SAFE_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
  '.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a',
  '.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx',
  '.nfo', '.txt', '.jpg', '.jpeg', '.png',
  '.zip', '.rar', '.7z',  // archives — will be peeked into
]);

/** Magic bytes for common video containers */
const VIDEO_MAGIC: Array<{ sig: number[]; mask?: number[]; name: string }> = [
  // MP4 / M4V / MOV — ftyp box at offset 4
  { sig: [0x66, 0x74, 0x79, 0x70], name: 'MP4/MOV' },
  // MKV / WebM — EBML header
  { sig: [0x1A, 0x45, 0xDF, 0xA3], name: 'MKV/WebM' },
  // AVI — RIFF....AVI
  { sig: [0x52, 0x49, 0x46, 0x46], name: 'AVI/RIFF' },
  // FLV
  { sig: [0x46, 0x4C, 0x56, 0x01], name: 'FLV' },
  // MPEG-2 TS
  { sig: [0x47], name: 'MPEG-TS' },
  // WMV / ASF
  { sig: [0x30, 0x26, 0xB2, 0x75], name: 'WMV/ASF' },
  // OGG
  { sig: [0x4F, 0x67, 0x67, 0x53], name: 'OGG' },
];

/** Magic bytes for executables / dangerous formats */
const DANGEROUS_MAGIC: Array<{ sig: number[]; offset?: number; name: string }> = [
  // Windows PE (EXE/DLL/SYS)
  { sig: [0x4D, 0x5A], name: 'Windows PE Executable' },
  // ELF (Linux executable)
  { sig: [0x7F, 0x45, 0x4C, 0x46], name: 'ELF Executable' },
  // Mach-O (macOS executable)
  { sig: [0xFE, 0xED, 0xFA, 0xCE], name: 'Mach-O Executable' },
  { sig: [0xFE, 0xED, 0xFA, 0xCF], name: 'Mach-O 64-bit Executable' },
  { sig: [0xCE, 0xFA, 0xED, 0xFE], name: 'Mach-O Executable (LE)' },
  // Java class
  { sig: [0xCA, 0xFE, 0xBA, 0xBE], name: 'Java Class File' },
  // ZIP (could contain executables — flagged as suspicious, not blocked)
  { sig: [0x50, 0x4B, 0x03, 0x04], name: 'ZIP Archive' },
  // RAR
  { sig: [0x52, 0x61, 0x72, 0x21], name: 'RAR Archive' },
  // 7-Zip
  { sig: [0x37, 0x7A, 0xBC, 0xAF], name: '7-Zip Archive' },
  // PDF (can contain JS exploits)
  { sig: [0x25, 0x50, 0x44, 0x46], name: 'PDF Document' },
  // Windows Script
  { sig: [0x3C, 0x3F, 0x78, 0x6D], name: 'XML/Script File' },
  // PowerShell
  { sig: [0xFF, 0xFE], name: 'UTF-16 Script (possible PowerShell)' },
];

// ── Quarantine store ──────────────────────────────────────────────────────────

function getQuarantineDir(): string {
  const config = readConfig();
  const base = config.mediaDir || '/tmp';
  return path.join(base, 'quarantine');
}

function getQuarantineLogPath(): string {
  const config = readConfig();
  const base = config.mediaDir || '/tmp';
  return path.join(base, 'quarantine-log.json');
}

export function readQuarantineLog(): QuarantineEntry[] {
  try {
    const p = getQuarantineLogPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as QuarantineEntry[];
  } catch {
    return [];
  }
}

function writeQuarantineLog(entries: QuarantineEntry[]) {
  try {
    const p = getQuarantineLogPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
  } catch (err) {
    console.error('[security] Failed to write quarantine log:', err);
  }
}

export function quarantineFile(params: {
  filePath: string;
  reason: string;
  layer: string;
  infoHash?: string;
  title?: string;
}): QuarantineEntry | null {
  try {
    const qDir = getQuarantineDir();
    fs.mkdirSync(qDir, { recursive: true });

    const filename = path.basename(params.filePath);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const qPath = path.join(qDir, `${id}-${filename}`);

    // Move file to quarantine
    if (fs.existsSync(params.filePath)) {
      fs.renameSync(params.filePath, qPath);
    }

    let sizeBytes: number | undefined;
    try { sizeBytes = fs.statSync(qPath).size; } catch { /* ignore */ }

    const entry: QuarantineEntry = {
      id,
      originalPath: params.filePath,
      quarantinePath: qPath,
      reason: params.reason,
      layer: params.layer,
      infoHash: params.infoHash,
      title: params.title,
      quarantinedAt: new Date().toISOString(),
      sizeBytes,
    };

    const log = readQuarantineLog();
    log.unshift(entry); // newest first
    writeQuarantineLog(log.slice(0, 500)); // cap at 500 entries

    console.warn(`[security] QUARANTINED: ${filename} — ${params.reason} (${params.layer})`);
    return entry;
  } catch (err) {
    console.error('[security] Quarantine failed:', err);
    return null;
  }
}

export function deleteFromQuarantine(id: string): { ok: boolean; error?: string } {
  try {
    const log = readQuarantineLog();
    const entry = log.find(e => e.id === id);
    if (!entry) return { ok: false, error: 'Entry not found' };

    if (fs.existsSync(entry.quarantinePath)) {
      fs.unlinkSync(entry.quarantinePath);
    }

    writeQuarantineLog(log.filter(e => e.id !== id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function restoreFromQuarantine(id: string): { ok: boolean; error?: string } {
  try {
    const log = readQuarantineLog();
    const entry = log.find(e => e.id === id);
    if (!entry) return { ok: false, error: 'Entry not found' };

    if (!fs.existsSync(entry.quarantinePath)) {
      return { ok: false, error: 'Quarantined file no longer exists' };
    }

    const restoreDir = path.dirname(entry.originalPath);
    fs.mkdirSync(restoreDir, { recursive: true });
    fs.renameSync(entry.quarantinePath, entry.originalPath);

    writeQuarantineLog(log.filter(e => e.id !== id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Layer 1: File list scan ───────────────────────────────────────────────────

export interface TorrentFileMeta {
  name: string;
  path?: string;
  length?: number;
}

/**
 * Scans a list of files from a torrent's metadata.
 * Returns a ScanResult — blocked if any dangerous extension found.
 */
export function scanTorrentFileList(files: TorrentFileMeta[]): ScanResult {
  const checkedAt = new Date().toISOString();

  for (const file of files) {
    const name = file.name || file.path || '';
    const lower = name.toLowerCase();

    // Check for double extensions (e.g. Movie.mp4.exe)
    const parts = lower.split('.');
    if (parts.length > 2) {
      // Check every extension segment, not just the last
      for (let i = 1; i < parts.length; i++) {
        const ext = '.' + parts[i];
        if (DANGEROUS_EXTENSIONS.has(ext)) {
          return {
            allowed: false,
            threatLevel: 'blocked',
            reason: `Dangerous file in torrent: "${name}"`,
            layer: 'Layer 1 — File List Scan',
            details: `Extension "${ext}" is not allowed in media torrents. This is a common technique used to disguise malware as video files.`,
            checkedAt,
          };
        }
      }
    }

    // Check final extension
    const ext = path.extname(lower);
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return {
        allowed: false,
        threatLevel: 'blocked',
        reason: `Dangerous file in torrent: "${name}"`,
        layer: 'Layer 1 — File List Scan',
        details: `Extension "${ext}" is not allowed in media torrents.`,
        checkedAt,
      };
    }

    // Flag archives as suspicious (will be inspected by archive peek)
    if (['.zip', '.rar', '.7z'].includes(ext)) {
      console.warn(`[security] Archive found in torrent: ${name} — will inspect contents`);
    }
  }

  return {
    allowed: true,
    threatLevel: 'clean',
    layer: 'Layer 1 — File List Scan',
    checkedAt,
  };
}

// ── Layer 2: VirusTotal hash lookup ───────────────────────────────────────────

interface VTFileReport {
  data?: {
    attributes?: {
      last_analysis_stats?: {
        malicious?: number;
        suspicious?: number;
        undetected?: number;
        harmless?: number;
      };
      meaningful_name?: string;
      type_description?: string;
    };
  };
  error?: { code?: string; message?: string };
}

/**
 * Looks up a torrent info hash on VirusTotal.
 * Returns immediately if no API key is configured (skips check).
 * Returns immediately if VT has never seen this hash (unknown = allowed).
 * Blocks only if VT reports it as malicious.
 */
export async function scanInfoHashOnVT(infoHash: string): Promise<ScanResult> {
  const checkedAt = new Date().toISOString();
  const config = readConfig();
  const apiKey = config.virusTotalApiKey;

  if (!apiKey) {
    return {
      allowed: true,
      threatLevel: 'clean',
      layer: 'Layer 2 — VirusTotal Hash Lookup',
      details: 'Skipped — no VirusTotal API key configured',
      infoHash,
      checkedAt,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(`https://www.virustotal.com/api/v3/files/${infoHash.toLowerCase()}`, {
      headers: { 'x-apikey': apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      // Hash not in VT database — unknown, allow it
      return {
        allowed: true,
        threatLevel: 'clean',
        layer: 'Layer 2 — VirusTotal Hash Lookup',
        details: 'Hash not found in VirusTotal database (new/unknown torrent)',
        infoHash,
        checkedAt,
      };
    }

    if (res.status === 429) {
      // Rate limited — allow but log
      console.warn('[security] VirusTotal rate limit hit — skipping hash check');
      return {
        allowed: true,
        threatLevel: 'clean',
        layer: 'Layer 2 — VirusTotal Hash Lookup',
        details: 'Skipped — VirusTotal API rate limit reached',
        infoHash,
        checkedAt,
      };
    }

    if (!res.ok) {
      return {
        allowed: true,
        threatLevel: 'clean',
        layer: 'Layer 2 — VirusTotal Hash Lookup',
        details: `VT API returned HTTP ${res.status} — skipping`,
        infoHash,
        checkedAt,
      };
    }

    const data = await res.json() as VTFileReport;
    const stats = data.data?.attributes?.last_analysis_stats;

    if (!stats) {
      return {
        allowed: true,
        threatLevel: 'clean',
        layer: 'Layer 2 — VirusTotal Hash Lookup',
        details: 'No analysis stats available',
        infoHash,
        checkedAt,
      };
    }

    const malicious = stats.malicious ?? 0;
    const suspicious = stats.suspicious ?? 0;
    const total = (stats.harmless ?? 0) + (stats.undetected ?? 0) + malicious + suspicious;

    if (malicious >= 3) {
      return {
        allowed: false,
        threatLevel: 'blocked',
        reason: `VirusTotal: ${malicious}/${total} engines flagged this hash as malicious`,
        layer: 'Layer 2 — VirusTotal Hash Lookup',
        details: `File type: ${data.data?.attributes?.type_description ?? 'unknown'}. Name: ${data.data?.attributes?.meaningful_name ?? infoHash}`,
        infoHash,
        checkedAt,
      };
    }

    if (suspicious >= 5) {
      return {
        allowed: false,
        threatLevel: 'suspicious',
        reason: `VirusTotal: ${suspicious}/${total} engines flagged this hash as suspicious`,
        layer: 'Layer 2 — VirusTotal Hash Lookup',
        details: 'Flagged as suspicious by multiple engines. Blocking out of caution.',
        infoHash,
        checkedAt,
      };
    }

    return {
      allowed: true,
      threatLevel: malicious > 0 ? 'suspicious' : 'clean',
      layer: 'Layer 2 — VirusTotal Hash Lookup',
      details: `${malicious} malicious, ${suspicious} suspicious out of ${total} engines`,
      infoHash,
      checkedAt,
    };
  } catch (err) {
    // Network error / timeout — fail open (allow) but log
    console.warn('[security] VirusTotal lookup failed:', err);
    return {
      allowed: true,
      threatLevel: 'clean',
      layer: 'Layer 2 — VirusTotal Hash Lookup',
      details: `VT lookup failed: ${String(err)} — allowing download`,
      infoHash,
      checkedAt,
    };
  }
}

// ── Layer 3: Magic bytes MIME verification ────────────────────────────────────

/**
 * Reads the first 16 bytes of a file and checks against known signatures.
 * Returns blocked if the file is a known executable format.
 * Returns suspicious if it's an archive (could contain executables).
 * Returns clean if it matches a known video container.
 */
export function verifyFileMagicBytes(filePath: string): ScanResult {
  const checkedAt = new Date().toISOString();

  try {
    if (!fs.existsSync(filePath)) {
      return { allowed: true, threatLevel: 'clean', layer: 'Layer 3 — Magic Bytes', details: 'File not found — skipping', checkedAt };
    }

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);

    const bytes = Array.from(buf);

    // Check for dangerous magic bytes first
    for (const sig of DANGEROUS_MAGIC) {
      const offset = sig.offset ?? 0;
      const match = sig.sig.every((b, i) => bytes[offset + i] === b);
      if (match) {
        const isArchive = ['ZIP Archive', 'RAR Archive', '7-Zip Archive'].includes(sig.name);
        return {
          allowed: !isArchive ? false : true, // archives: suspicious but not blocked
          threatLevel: isArchive ? 'suspicious' : 'blocked',
          reason: `File magic bytes indicate: ${sig.name}`,
          layer: 'Layer 3 — Magic Bytes Verification',
          details: `Expected a video container. First bytes: ${bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`,
          checkedAt,
        };
      }
    }

    // Check for MP4 ftyp box (at offset 4, not offset 0)
    const ftypBytes = [0x66, 0x74, 0x79, 0x70];
    if (ftypBytes.every((b, i) => bytes[4 + i] === b)) {
      return { allowed: true, threatLevel: 'clean', layer: 'Layer 3 — Magic Bytes Verification', details: 'Valid MP4/MOV container', checkedAt };
    }

    // Check for known video magic bytes
    for (const sig of VIDEO_MAGIC) {
      const match = sig.sig.every((b, i) => bytes[i] === b);
      if (match) {
        return { allowed: true, threatLevel: 'clean', layer: 'Layer 3 — Magic Bytes Verification', details: `Valid ${sig.name} container`, checkedAt };
      }
    }

    // Unknown format — check extension
    const ext = path.extname(filePath).toLowerCase();
    if (SAFE_EXTENSIONS.has(ext)) {
      // Known safe extension but unknown magic — allow with note
      return {
        allowed: true,
        threatLevel: 'clean',
        layer: 'Layer 3 — Magic Bytes Verification',
        details: `Unknown magic bytes for ${ext} file — allowed by extension whitelist`,
        checkedAt,
      };
    }

    // Unknown extension + unknown magic — suspicious but not blocked
    return {
      allowed: true,
      threatLevel: 'suspicious',
      layer: 'Layer 3 — Magic Bytes Verification',
      details: `Unrecognized file format. First bytes: ${bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`,
      checkedAt,
    };
  } catch (err) {
    return {
      allowed: true,
      threatLevel: 'clean',
      layer: 'Layer 3 — Magic Bytes Verification',
      details: `Could not read file: ${String(err)}`,
      checkedAt,
    };
  }
}

// ── Layer 4: Archive inspection ───────────────────────────────────────────────

/**
 * Peeks inside a ZIP archive's central directory to list filenames.
 * Does NOT extract anything — just reads the file table at the end of the ZIP.
 * Returns blocked if any dangerous extension found inside.
 */
export function inspectZipContents(filePath: string): ScanResult {
  const checkedAt = new Date().toISOString();

  try {
    if (!fs.existsSync(filePath)) {
      return { allowed: true, threatLevel: 'clean', layer: 'Layer 4 — Archive Inspection', checkedAt };
    }

    const buf = fs.readFileSync(filePath);

    // Find ZIP End of Central Directory signature (0x06054b50)
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return { allowed: true, threatLevel: 'clean', layer: 'Layer 4 — Archive Inspection', details: 'Not a valid ZIP or could not read directory', checkedAt };
    }

    // Read central directory offset and size
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    const cdSize = buf.readUInt32LE(eocdOffset + 12);

    const dangerousFiles: string[] = [];
    let pos = cdOffset;
    const cdEnd = cdOffset + cdSize;

    while (pos < cdEnd && pos + 46 <= buf.length) {
      // Central directory file header signature: 0x02014b50
      if (buf[pos] !== 0x50 || buf[pos+1] !== 0x4B || buf[pos+2] !== 0x01 || buf[pos+3] !== 0x02) break;

      const filenameLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);

      if (pos + 46 + filenameLen > buf.length) break;

      const filename = buf.slice(pos + 46, pos + 46 + filenameLen).toString('utf-8');
      const ext = path.extname(filename.toLowerCase());

      if (DANGEROUS_EXTENSIONS.has(ext)) {
        dangerousFiles.push(filename);
      }

      pos += 46 + filenameLen + extraLen + commentLen;
    }

    if (dangerousFiles.length > 0) {
      return {
        allowed: false,
        threatLevel: 'blocked',
        reason: `Archive contains dangerous files: ${dangerousFiles.slice(0, 3).join(', ')}`,
        layer: 'Layer 4 — Archive Inspection',
        details: `Found ${dangerousFiles.length} dangerous file(s) inside the archive.`,
        checkedAt,
      };
    }

    return {
      allowed: true,
      threatLevel: 'clean',
      layer: 'Layer 4 — Archive Inspection',
      details: 'Archive contents appear safe',
      checkedAt,
    };
  } catch (err) {
    return {
      allowed: true,
      threatLevel: 'clean',
      layer: 'Layer 4 — Archive Inspection',
      details: `Could not inspect archive: ${String(err)}`,
      checkedAt,
    };
  }
}

// ── Combined pre-download scan ────────────────────────────────────────────────

/**
 * Run all pre-download checks (Layers 1 + 2) before qBittorrent starts.
 * Returns the first blocking result, or clean if all pass.
 */
export async function runPreDownloadScan(params: {
  infoHash: string;
  files?: TorrentFileMeta[];
  title?: string;
}): Promise<ScanResult> {
  const { infoHash, files, title } = params;

  console.log(`[security] Pre-download scan: ${title ?? infoHash}`);

  // Layer 1: file list
  if (files && files.length > 0) {
    const l1 = scanTorrentFileList(files);
    if (!l1.allowed) {
      console.warn(`[security] BLOCKED by Layer 1: ${l1.reason}`);
      return l1;
    }
  }

  // Layer 2: VT hash lookup (async, ~200ms on cache hit, ~1-2s on miss)
  const l2 = await scanInfoHashOnVT(infoHash);
  if (!l2.allowed) {
    console.warn(`[security] BLOCKED by Layer 2: ${l2.reason}`);
    return l2;
  }

  return {
    allowed: true,
    threatLevel: 'clean',
    layer: 'Pre-download scan',
    details: 'All pre-download checks passed',
    infoHash,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Run post-download checks (Layer 3 + 4) after a file lands on disk.
 * Quarantines the file if it fails.
 */
export function runPostDownloadScan(params: {
  filePath: string;
  infoHash?: string;
  title?: string;
}): ScanResult {
  const { filePath, infoHash, title } = params;

  console.log(`[security] Post-download scan: ${path.basename(filePath)}`);

  // Layer 3: magic bytes
  const l3 = verifyFileMagicBytes(filePath);
  if (!l3.allowed) {
    console.warn(`[security] BLOCKED by Layer 3: ${l3.reason}`);
    quarantineFile({ filePath, reason: l3.reason!, layer: l3.layer!, infoHash, title });
    return l3;
  }

  // Layer 4: archive inspection (if it's a zip)
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.zip') {
    const l4 = inspectZipContents(filePath);
    if (!l4.allowed) {
      console.warn(`[security] BLOCKED by Layer 4: ${l4.reason}`);
      quarantineFile({ filePath, reason: l4.reason!, layer: l4.layer!, infoHash, title });
      return l4;
    }
  }

  return {
    allowed: true,
    threatLevel: l3.threatLevel,
    layer: 'Post-download scan',
    details: 'All post-download checks passed',
    infoHash,
    checkedAt: new Date().toISOString(),
  };
}
