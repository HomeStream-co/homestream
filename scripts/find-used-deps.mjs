import fs from 'fs';
import path from 'path';

const used = new Set();

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const src = fs.readFileSync(full, 'utf8');
    // Match: from 'pkg' or from "pkg" or require('pkg') or require("pkg")
    const re = /(?:from|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:from)\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = m[1] || m[2];
      if (!raw || raw.startsWith('.') || raw.startsWith('#')) continue;
      // Normalise to package name (handle @scope/pkg/sub -> @scope/pkg, pkg/sub -> pkg)
      const pkg = raw.startsWith('@')
        ? raw.split('/').slice(0, 2).join('/')
        : raw.split('/')[0];
      used.add(pkg);
    }
  }
}

walk('./src');
console.log([...used].sort().join('\n'));
