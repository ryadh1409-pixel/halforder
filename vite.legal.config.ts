import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const LEGAL_HTML = 'index.vite.html';

function legalSpaFallbackPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (
    pathname.startsWith('/@') ||
    pathname.startsWith('/node_modules') ||
    pathname.startsWith('/src/')
  ) {
    return false;
  }
  if (pathname.match(/\.[a-zA-Z0-9]+$/)) return false;
  return true;
}

/** Serves SPA entry for client-side routes (BrowserRouter) when not using root index.html. */
function legalSpaFallback(): Plugin {
  return {
    name: 'legal-spa-fallback',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, _res, next) => {
          if (req.method !== 'GET' || !req.url) {
            next();
            return;
          }
          const [pathname, query] = req.url.split('?');
          if (!legalSpaFallbackPath(pathname)) {
            next();
            return;
          }
          req.url =
            query !== undefined ? `/${LEGAL_HTML}?${query}` : `/${LEGAL_HTML}`;
          next();
        });
      };
    },
  };
}

/** Standalone marketing/legal pages (Support, Privacy, Terms). Does not replace Expo. */
export default defineConfig({
  plugins: [react(), legalSpaFallback()],
  root: '.',
  publicDir: false,
  appType: 'spa',
  build: {
    outDir: 'dist-legal',
    emptyOutDir: true,
    rollupOptions: {
      input: `./${LEGAL_HTML}`,
    },
  },
});
