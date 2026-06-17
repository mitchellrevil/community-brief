import { StrictMode } from "react";
import { MsalProvider } from "@azure/msal-react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { routeTree } from "./routeTree.gen";
import reportWebVitals from "./reportWebVitals.ts";
import * as TanstackQuery from "@/app/providers/tanstack-query";
import { AuthProvider } from "@/app/providers/auth";
import { WakeLockProvider } from "@/app/providers/wake-lock";
import { initializeMsal, msalInstance } from "@/features/auth/lib/msal";

import "./styles.css";
import "./lib/scroll-lock-override";


// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    ...TanstackQuery.getContext(),
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  const bootstrap = async () => {
    try {
      await initializeMsal();
    } catch (error) {
      console.error("[auth] Failed to initialize MSAL", error);
    }

    root.render(
      <StrictMode>
        <WakeLockProvider>
          <MsalProvider instance={msalInstance}>
            <TanstackQuery.Provider>
              <AuthProvider>
                <RouterProvider router={router} />
              </AuthProvider>
            </TanstackQuery.Provider>
          </MsalProvider>
        </WakeLockProvider>
      </StrictMode>,
    );
  };

  void bootstrap();
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Show toast notification when update is available
      import('sonner').then(({ toast }) => {
        toast.info('App update available', {
          description: 'Click to reload and update',
          action: {
            label: 'Reload',
            onClick: () => window.location.reload(),
          },
          duration: 10000,
        });
      });
    },
    onOfflineReady() {
      import('sonner').then(({ toast }) => {
        toast.success('App ready for offline use');
      });
    },
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      console.debug('[PWA] Service Worker registered:', registration);
      
      // Initialize background sync when online
      import('./lib/online-status').then(({ watchOnlineStatus, isOnline }) => {
          import('./lib/sync-coordinator').then(({ triggerSyncDebounced }) => {
          import('@/features/recordings/data/sync-service').then(({ startSync, isSyncNeeded }) => {
            import('./lib/pwa-queue').then(({ getQueuedCount }) => {
              
              let syncingToastShown = false;

              // Main sync execution function that handles toasts and calls startSync
              const executeSyncWithToast = async (source: string, showToast: boolean) => {
                if (!(await isSyncNeeded())) {
                  return;
                }

                const count = await getQueuedCount();
                console.debug(`[PWA] ${source}: Starting sync of ${count} queued recording(s)`);

                if (showToast && !syncingToastShown) {
                  syncingToastShown = true;
                  import('sonner').then(({ toast }) => {
                    toast.loading(`Uploading ${count} queued recording${count !== 1 ? 's' : ''}...`, {
                      id: 'sync-toast',
                      duration: Infinity,
                    });
                  });
                }

                try {
                  const result = await startSync();

                  if (showToast) {
                    import('sonner').then(({ toast }) => {
                      toast.dismiss('sync-toast');
                      syncingToastShown = false;

                      if (result.failed === 0) {
                        toast.success(
                          `Successfully uploaded ${result.success} recording${result.success !== 1 ? 's' : ''}!`
                        );
                      } else if (result.success > 0) {
                        toast.warning(
                          `Uploaded ${result.success}/${result.total} recordings. ` +
                            `${result.failed} failed - will retry later.`,
                          { duration: 8000 }
                        );
                      } else {
                        toast.error(
                          `Failed to upload ${result.failed} recording${result.failed !== 1 ? 's' : ''}. ` +
                            `Will retry automatically.`,
                          { duration: 8000 }
                        );
                      }
                    });
                  }
                  
                  return result;
                } catch (err) {
                  console.error(`[PWA] ${source}: Sync failed:`, err);
                  if (showToast) {
                    import('sonner').then(({ toast }) => {
                      toast.dismiss('sync-toast');
                      syncingToastShown = false;
                      toast.error('Upload sync failed. Will retry when connection improves.');
                    });
                  }
                  throw err;
                }
              };

              // Watch for online/offline status changes and trigger debounced sync
              const cleanup = watchOnlineStatus((online) => {
                if (online) {
                  console.debug('[PWA] Online - triggering debounced sync check');
                  // Use debounced trigger to handle rapid online/offline transitions
                  triggerSyncDebounced('online-event', () => executeSyncWithToast('online-event', true), true);
                }
              });
              
              // Periodic check (every 30 seconds) - also uses debouncing
              const periodicCheck = setInterval(async () => {
                if (!(await isSyncNeeded())) {
                  return;
                }

                const online = await isOnline();
                if (online) {
                  console.debug('[PWA] Periodic check: Found pending uploads, triggering debounced sync');
                  // Use debounced trigger for periodic checks too
                  triggerSyncDebounced('periodic', () => executeSyncWithToast('periodic', false), false);
                }
              }, 30000); // Check every 30 seconds
              
              // Cleanup on unload
              window.addEventListener('beforeunload', () => {
                cleanup();
                clearInterval(periodicCheck);
              });
            });
          });
        });
      });
    },
    onRegisterError(error: Error) {
      console.error('[PWA] Service Worker registration failed:', error);
    },
  });

  // Warmup critical API cache after service worker is registered
  import('./lib/pwa-warmup').then(({ warmupCache }) => {
    // Wait 3 seconds after page load to avoid blocking initial render
    setTimeout(() => {
      warmupCache().catch(err => {
        console.error('[PWA] Cache warmup failed:', err);
      });
    }, 3000);
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
