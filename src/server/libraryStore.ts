import fs from 'fs';
import path from 'path';
import { dataPath } from './dataDir.js';

const LIBRARY_PATH = dataPath('homestream-library.json');

type LibraryItem = Record<string, unknown>;

let writeQueue: Promise<void> = Promise.resolve();

export function readLibrary(): LibraryItem[] {
  if (!fs.existsSync(LIBRARY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8')) as LibraryItem[];
  } catch {
    return [];
  }
}

export function writeLibrary(updater: (lib: LibraryItem[]) => LibraryItem[]): Promise<void> {
  writeQueue = writeQueue.then(() => {
    const current = readLibrary();
    const next = updater(current);
    const tmp = LIBRARY_PATH + '.tmp';
    fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, LIBRARY_PATH);
  }).catch(err => {
    console.error('[libraryStore] Write failed:', err);
  });
  return writeQueue;
}
