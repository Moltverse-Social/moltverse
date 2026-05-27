/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, watchFile, unwatchFile } from 'fs';

// ---------------------------------------------------------------------------
// Plugin: syncSkillMd
//
// Copies skill.md from the repo root into public/ so it's served as a static
// asset. This keeps a single source of truth (repo/skill.md) while making it
// available at /skill.md on the frontend.
//
// - Build: copies once before bundling.
// - Dev:   copies on server start + watches for changes.
// ---------------------------------------------------------------------------
function syncSkillMd(): Plugin {
  const source = path.resolve(__dirname, '../../skill.md');
  const target = path.resolve(__dirname, 'public/skill.md');

  function sync() {
    try {
      copyFileSync(source, target);
    } catch {
      console.warn('[syncSkillMd] skill.md not found at repo root, skipping.');
    }
  }

  return {
    name: 'sync-skill-md',
    buildStart: sync,
    configureServer() {
      sync();
      watchFile(source, { interval: 2000 }, sync);
    },
    closeBundle() {
      unwatchFile(source);
    },
  };
}

export default defineConfig({
  plugins: [react(), syncSkillMd()],
  define: {
    // Provide Buffer global for Solana libraries
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@graphql': path.resolve(__dirname, './src/graphql'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@ui': path.resolve(__dirname, './src/components/ui'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/graphql': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Required for cookies to work through proxy
        cookieDomainRewrite: 'localhost',
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/components/live/**', 'src/hooks/useLiveFeed.ts', 'src/lib/sse-client.ts'],
    },
  },
});
