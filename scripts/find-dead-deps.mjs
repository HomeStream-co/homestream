import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const all = { ...pkg.dependencies, ...pkg.devDependencies };

// Everything actually imported in src/ (from find-used-deps.mjs output)
const used = new Set([
  '@google/generative-ai',
  '@radix-ui/react-accordion', '@radix-ui/react-alert-dialog', '@radix-ui/react-aspect-ratio',
  '@radix-ui/react-avatar', '@radix-ui/react-checkbox', '@radix-ui/react-collapsible',
  '@radix-ui/react-context-menu', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label', '@radix-ui/react-popover', '@radix-ui/react-progress',
  '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-separator',
  '@radix-ui/react-slider', '@radix-ui/react-slot', '@radix-ui/react-switch',
  '@radix-ui/react-tabs', '@radix-ui/react-toggle', '@radix-ui/react-tooltip',
  'bcryptjs', 'bonjour-service', 'class-variance-authority', 'clsx', 'cmdk',
  'embla-carousel-react', 'express', 'input-otp', 'lucide-react', 'motion', 'multer',
  'qrcode', 'react', 'react-dom', 'react-router-dom', 'sonner', 'tailwind-merge',
  'vitest', 'webtorrent', 'ws',
  // Always keep: toolchain, types, build, test infra
  'typescript', 'vite', '@vitejs/plugin-react', 'vite-plugin-api-routes',
  'tailwindcss', 'tailwindcss-animate', 'autoprefixer', 'postcss',
  'eslint', '@eslint/js', 'eslint-plugin-react', 'eslint-plugin-react-hooks', 'eslint-plugin-react-refresh',
  '@typescript-eslint/eslint-plugin', '@typescript-eslint/parser',
  '@testing-library/jest-dom', '@testing-library/react', '@testing-library/user-event',
  '@vitest/ui', 'prettier', 'tsx', 'esbuild',
  'electron', 'electron-builder',
  // types
  '@types/bcryptjs', '@types/cookie-parser', '@types/express', '@types/multer',
  '@types/node', '@types/qrcode', '@types/react', '@types/react-dom', '@types/webtorrent',
  // runtime deps used indirectly
  'cookie-parser', 'hls.js', 'ffmpeg-static',
  // react-markdown + remark used in AI chat panel
  'react-markdown', 'remark-gfm',
]);

console.log('=== POTENTIALLY DEAD ===');
for (const k of Object.keys(all)) {
  if (!used.has(k)) console.log(k);
}
