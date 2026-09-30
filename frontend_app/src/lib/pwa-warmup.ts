import { SYSTEM_HEALTH_API } from "@/shared/api/constants";

/**
 * PWA Cache Warmup
 * 
 * Pre-caches critical API endpoints on first app load to ensure offline functionality.
 * This runs in the background after the app loads to populate the service worker cache.
 */

export async function warmupCache() {
  // Only warmup if we have a service worker and we're online
  if (!('serviceWorker' in navigator)) {
    console.debug('[PWA Warmup] Service Worker not supported');
    return;
  }

  if (!navigator.onLine) {
    console.debug('[PWA Warmup] Offline - skipping cache warmup');
    return;
  }

  // Wait for service worker to be ready
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
    console.debug('[PWA Warmup] No active service worker');
    return;
  }

  console.debug('[PWA Warmup] Starting cache warmup for critical API endpoints');

  // Critical API endpoints to pre-cache
  // Only cache endpoints that are guaranteed to exist and don't require auth
  const criticalEndpoints = [SYSTEM_HEALTH_API];

  // Fetch each endpoint in the background (don't await, don't block)
  const warmupPromises = criticalEndpoints.map(async (endpoint) => {
    try {
      const url = endpoint;
      
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-cache',
        credentials: 'omit', // Don't send auth cookies
      });

      if (response.ok) {
        // Read the response to trigger cache storage
        await response.json();
        console.debug(`[PWA Warmup] Cached: ${endpoint}`);
      } else {
        console.debug(`[PWA Warmup] Failed to cache ${endpoint}: ${response.status}`);
      }
    } catch (error) {
      console.debug(`[PWA Warmup] Error caching ${endpoint}:`, error);
    }
  });

  // Run all warmup requests in parallel, but don't wait for them
  Promise.all(warmupPromises).then(() => {
    console.debug('[PWA Warmup] Cache warmup complete');
  });
}
