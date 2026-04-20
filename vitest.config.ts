import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const sharedAlias = {
  '@/': path.resolve(__dirname, './src/'),
  '@/components': path.resolve(__dirname, './src/components'),
  '@/lib': path.resolve(__dirname, './src/lib'),
  '@/api': path.resolve(__dirname, './src/server/api'),
  '@/db': path.resolve(__dirname, './src/server/db'),
  '@/layouts': path.resolve(__dirname, './src/layouts'),
  '@/patterns': path.resolve(__dirname, './src/patterns'),
  '@/pages': path.resolve(__dirname, './src/pages'),
  '@/hooks': path.resolve(__dirname, './src/hooks'),
  '@/styles': path.resolve(__dirname, './src/styles'),
  // Stub the airo secrets module so server handlers can be imported in tests
  '#airo/secrets': path.resolve(__dirname, './src/test/__mocks__/airo-secrets.ts'),
};

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Use forks pool to isolate memory per test file (prevents OOM)
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4,
        isolate: true,
      },
    },
    maxConcurrency: 5,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '*.config.js',
        '*.config.ts',
      ],
    },
    // Split into two projects: browser (React) and node (server handlers)
    projects: [
      {
        // React component tests — jsdom environment
        test: {
          name: 'browser',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/test/**/*.test.{ts,tsx}'],
          exclude: ['src/test/jellyfin/**'],
        },
        resolve: { alias: sharedAlias },
      },
      {
        // Server-side handler tests — node environment
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['./src/test/setup-node.ts'],
          include: ['src/test/jellyfin/**/*.test.ts'],
        },
        resolve: { alias: sharedAlias },
      },
    ],
  },
  resolve: {
    alias: sharedAlias,
  },
});
