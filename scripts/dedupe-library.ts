import { readLibrary, writeLibrary } from '../src/server/libraryStore.ts';

async function dedupeLibrary() {
  console.log('[dedupe] Starting database deduplication...');
  try {
    const library = readLibrary<any>();
    const seen = new Map<string, boolean>();
    const kept: any[] = [];
    let duplicateCount = 0;

    for (const item of library) {
      // Create a unique key by combining filepath, ID, title, and year
      const filepathKey = item.filepath || item.filePath || '';
      const key = [
        filepathKey,
        item.id,
        item.title?.toLowerCase()?.trim(),
        item.year
      ].filter(Boolean).join('|');

      if (!seen.has(key)) {
        seen.set(key, true);
        kept.push(item);
      } else {
        console.log(`[dedupe] 🗑️ Removing duplicate: "${item.title}" (${item.year}) [File: ${filepathKey}]`);
        duplicateCount++;
      }
    }

    if (duplicateCount > 0) {
      await writeLibrary(() => kept);
      console.log(`[dedupe] ✅ Deduplication complete. Kept ${kept.length} items. Removed ${duplicateCount} duplicates.`);
    } else {
      console.log(`[dedupe] ✅ No duplicates found. Kept all ${kept.length} items.`);
    }
  } catch (err) {
    console.error('[dedupe] Deduplication failed:', err);
  }
}

dedupeLibrary();
