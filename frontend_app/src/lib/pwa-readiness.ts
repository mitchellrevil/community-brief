export const OFFLINE_STARTUP_TIMEOUT_MS = 15_000;

export async function waitForOfflineStartup(
  serviceWorker: ServiceWorkerContainer,
  timeoutMs = OFFLINE_STARTUP_TIMEOUT_MS,
): Promise<ServiceWorkerRegistration> {
  let timeoutId: number | undefined;

  try {
    const registration = await Promise.race([
      serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Templates are saved, but offline startup did not become ready. Reload and retry while online."));
        }, timeoutMs);
      }),
    ]);

    if (!registration.active) {
      throw new Error("Templates are saved, but offline startup is not active. Reload and retry while online.");
    }

    return registration;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}
