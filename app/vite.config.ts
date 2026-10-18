import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from 'path';
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const host = process.env.TAURI_DEV_HOST || '0.0.0.0';
const EXPRESS_PORT = 1111;
const isDev = process.env.NODE_ENV === 'development';

/**
 * Drop KaTeX's legacy webfont formats.
 *
 * katex.min.css declares every face three times — woff2, woff, ttf — and Vite
 * emits all of them, which is ~59 font files (a third of the whole asset
 * count). The `src` list puts woff2 first, so any browser from the last decade
 * (Chrome 36+, Firefox 39+, Safari 10+, Edge) resolves it and never requests
 * the other two; they are dead weight that still gets uploaded to the CDN.
 * The CSS keeps referencing them, which only matters for browsers old enough
 * to lack woff2 — there the math glyphs fall back instead of loading.
 */
function dropKatexLegacyFonts() {
  return {
    name: 'drop-katex-legacy-fonts',
    generateBundle(_options: unknown, bundle: Record<string, { fileName?: string }>) {
      let dropped = 0;
      for (const key of Object.keys(bundle)) {
        const fileName = bundle[key].fileName ?? key;
        if (/^assets\/KaTeX_.+\.(woff|ttf)$/.test(fileName)) {
          delete bundle[key];
          dropped++;
        }
      }
      if (dropped > 0) {
        console.log(`[drop-katex-legacy-fonts] removed ${dropped} legacy KaTeX font(s)`);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    dropKatexLegacyFonts(),
    // PWA: Only enabled in production, disabled in development to avoid caching issues
    ...(!isDev && !process.env.DISABLE_PWA ? [
      VitePWA({
        // Disable in development mode
        devOptions: {
          enabled: false
        },
        // Auto update service worker when new version is available
        registerType: 'autoUpdate',
        includeAssets: ['icons/Square*.png'],
        manifest: {
          name: 'Ink',
          short_name: 'Ink',
          icons: [
            {
              src: '/icons/Square30x30Logo.png',
              sizes: '30x30',
              type: 'image/png'
            },
            {
              src: '/icons/Square44x44Logo.png',
              sizes: '44x44',
              type: 'image/png'
            },
            {
              src: '/icons/Square71x71Logo.png',
              sizes: '71x71',
              type: 'image/png'
            },
            {
              src: '/icons/Square89x89Logo.png',
              sizes: '89x89',
              type: 'image/png'
            },
            {
              src: '/icons/Square107x107Logo.png',
              sizes: '107x107',
              type: 'image/png'
            },
            {
              src: '/icons/Square142x142Logo.png',
              sizes: '142x142',
              type: 'image/png'
            },
            {
              src: '/icons/Square150x150Logo.png',
              sizes: '150x150',
              type: 'image/png'
            },
            {
              src: '/icons/Square284x284Logo.png',
              sizes: '284x284',
              type: 'image/png'
            },
            {
              src: '/icons/Square310x310Logo.png',
              sizes: '310x310',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ],
          theme_color: '#FFFFFF',
          background_color: '#FFFFFF',
          start_url: '/',
          display: 'standalone',
          orientation: 'portrait'
        },
        workbox: {
          // Maximum file size to cache (10MB)
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          // Assets use runtime CDN URLs. Precaching their origin URLs would
          // download a second copy even when the page already loaded from CDN.
          globPatterns: [
            'registerSW.js',
            'icons/**/*.png',
          ],
          // HTML contains runtime CDN configuration; never serve a frozen app shell.
          navigateFallback: null,
          // Clean old caches automatically
          cleanupOutdatedCaches: true,
          // Runtime caching strategy for better update control
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) => request.mode === 'navigate'
                && url.origin === self.location.origin
                && !/^\/(?:api|trpc|v1)\//.test(url.pathname),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'page-navigation',
                networkTimeoutSeconds: 3,
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
              },
            },
            {
              // Lazily-imported chunks (mermaid, echarts, route pages) are fetched
              // on demand — cache them after the first use instead of precaching.
              urlPattern: /\/assets\/.*\.(?:js|css)$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'static-assets',
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
            {
              // Cache API responses with network-first strategy
              urlPattern: /^https:\/\/api\..*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 5 * 60, // 5 minutes
                },
                networkTimeoutSeconds: 10,
              },
            },
            {
              // Cache images with cache-first strategy
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
          ],
        },
      })
    ] : [])
  ],
  resolve: {
    // Workspace/isolated installs can otherwise load separate ProseMirror
    // instances, causing duplicate keyed plugins when extensions are combined.
    dedupe: [
      '@tiptap/core', '@tiptap/pm',
      'prosemirror-model', 'prosemirror-state', 'prosemirror-view',
      'prosemirror-transform', 'prosemirror-commands', 'prosemirror-history',
      'prosemirror-keymap', 'prosemirror-inputrules', 'prosemirror-schema-list',
      'prosemirror-gapcursor', 'prosemirror-dropcursor', 'prosemirror-tables',
    ],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Give the entry chunk its own prefix: async chunks also get auto-named
        // "index-*.js", which made the PWA precache glob pick up 1MB+ of
        // lazily-loaded code (echarts, ...) that never should be precached.
        entryFileNames: 'assets/entry-[hash].js',
        // Forced React/UI chunks can form an initialization cycle on desktop.
        // Let Rollup preserve module execution order for the desktop bundle.
        manualChunks: process.env.VITE_DESKTOP_ENDPOINT ? undefined : (id) => {
          if (id.includes('node_modules/react') || 
              id.includes('node_modules/react-dom') || 
              id.includes('node_modules/react-router-dom')) {
            return 'react-vendor';
          }
          
          if (id.includes('node_modules/@react-') || 
              id.includes('node_modules/react-') || 
              id.includes('node_modules/@ui-') || 
              id.includes('node_modules/@headlessui') || 
              id.includes('node_modules/headlessui')) {
            return 'ui-components';
          }
          
          if (id.includes('node_modules/lodash') || 
              id.includes('node_modules/axios') || 
              id.includes('node_modules/date-fns')) {
            return 'utils';
          }

          // NOTE: do NOT hand-name chunks for the heavy renderers (mermaid,
          // echarts, markmap, katex, emoji-picker). They are only reached through
          // dynamic imports, so rollup already splits them into async chunks —
          // forcing a chunk name made vite host shared helpers (e.g. the
          // __vitePreload helper) inside them, which turned them back into static
          // dependencies of the entry chunk and put them in the HTML preload list.
        }
      }
    }
  },
  clearScreen: false,
  server: {
    port: EXPRESS_PORT,
    strictPort: false,
    host: host || false,
    allowedHosts: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/node_modules/**", "**/.git/**"],
    },
  },
  optimizeDeps: {
    force: false,
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: []
  },
  css: {
    devSourcemap: false
  },
  cacheDir: 'node_modules/.vite',
  experimental: {
    renderBuiltUrl: (filename) => ({ relative: true }),
    hmrPartialAccept: true
  }
});
