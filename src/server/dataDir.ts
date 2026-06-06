import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.HOMESTREAM_DATA_DIR ?? path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function dataPath(filename: string): string {
  return path.join(DATA_DIR, filename);
}

export function dataDir(): string {
  return DATA_DIR;
}
