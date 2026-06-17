import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.png', 'logo192.png', 'logo512.png'],
      manifest: {
        name: 'Community Brief',
        short_name: 'Community Brief',
        description: 'AI-powered audio transcription and analysis platform',
        theme_color: '#1f2937',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/simple-upload',
        scope: '/',
        icons: [
          {
            src: '/logo192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        shortcuts: [
          {
            name: 'Upload Recording',
            short_name: 'Upload',
            description: 'Upload and analyze a new recording',
            url: '/simple-upload',
            icons: [{ src: '/logo192.png', sizes: '192x192' }]
          },
          {
            name: 'View Recordings',
            short_name: 'Recordings',
            description: 'View all audio recordings',
            url: '/audio-recordings',
            icons: [{ src: '/logo192.png', sizes: '192x192' }]
          }
        ],
        categories: ['productivity', 'business']
      },
      workbox: {
        // Runtime caching strategies optimized for NetworkFirst - always prefer fresh data
        runtimeCaching: [
          {
            // NEVER cache SSE streams - they must always be fresh
            urlPattern: /\/stream\/jobs\/[^/]+\/status/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'never-cache',
            }
          },
          {
            // NetworkFirst for all API calls - always try network when online
            // Only falls back to cache when offline
            urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10, // Wait max 10s for network, then use cache
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Also match relative API paths for local dev - NetworkFirst
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache-local',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // NetworkFirst for HTML pages - always get fresh content when online
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.html') && !url.pathname.endsWith('/auth-redirect.html'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // NetworkFirst for FFmpeg WASM files - check for updates, use cache as fallback
            urlPattern: /.*@ffmpeg.*\.(js|wasm)$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ffmpeg-cache',
              networkTimeoutSeconds: 15, // WASM files are large, allow more time
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 90 * 24 * 60 * 60 // 90 days
              }
            }
          },
          {
            // NetworkFirst for all static assets - prioritize availability and freshness
            urlPattern: /\.(js|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'assets-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          }
        ],
        // Precache essential files including all HTML
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['auth-redirect.html'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB per file
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^https?:\/\/[^/]+\/api\//, /^\/api\//, /^\/auth-redirect\.html$/],
        skipWaiting: true,   // Install new service worker immediately
        clientsClaim: true,  // Take control of pages immediately
        cleanupOutdatedCaches: true, // Remove old caches automatically
        // Don't cache SSE endpoints or streaming responses
        ignoreURLParametersMatching: [/^token$/], // Ignore token param for caching
      },
      devOptions: {
        enabled: false, // Disable in dev - requires backend API running
        type: 'module'
      }
    }),
  ],
  // Vitest configuration moved to vitest.config.ts for better separation
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'worker.js'],
  },
  build: {
    // Target modern browsers for smaller bundle size
    target: 'es2020',
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
    // Optimize chunk sizes
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        authRedirect: resolve(__dirname, 'auth-redirect.html'),
      },
      output: {
        advancedChunks: {
          groups: [
            // Vendor chunks for better caching
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](?:react|react-dom)[\\/]/,
            },
            {
              name: 'router-vendor',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]react-router[\\/]/,
            },
            {
              name: 'query-vendor',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]react-query[\\/]/,
            },
            // UI library chunks
            {
              name: 'radix-ui',
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            },
            // Heavy document viewers - lazy load these
            {
              name: 'document-viewers',
              test: /[\\/]node_modules[\\/]mammoth[\\/]/,
            },
            // Markdown editors - lazy load
            {
              name: 'markdown-tools',
              test: /[\\/]node_modules[\\/](?:@uiw[\\/](?:react-markdown-preview|react-md-editor)|react-markdown|remark-gfm|rehype-raw)[\\/]/,
            },
          ],
        },
      },
    },
    // Source maps for production debugging
    sourcemap: true,
    // Increase chunk size warning limit for better optimization
    chunkSizeWarningLimit: 1000,
  },
});
