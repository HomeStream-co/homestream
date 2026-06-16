import { readLibrary, writeLibrary } from '../src/server/libraryStore.js';
import { normalizePath } from '../src/server/mediaUtils.js';

async function migratePaths() {
  const lib = readLibrary();
  let changed = 0;

  const updated = lib.map(item => {
    if (item.filePath) {
      const old = item.filePath;
      // Replace old spacing mismatch and normalize path slashes
      item.filePath = normalizePath(old.replace(/Home Stream/g, 'HomeStream'));
      item.filepath = item.filePath;
      if (old !== item.filePath) changed++;
    }
    return item;
  });

  if (changed > 0) {
    await writeLibrary(() => updated);
    console.log(`✅ Migrated ${changed} paths`);
  } else {
    console.log('No path changes needed');
  }
}

migratePaths();
