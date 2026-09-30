export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallPromptListener = (event: InstallPromptEvent | null) => void;

let deferredInstallPrompt: InstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<InstallPromptListener>();

function publish(event: InstallPromptEvent | null) {
  deferredInstallPrompt = event;
  listeners.forEach((listener) => listener(event));
}

export function initializeInstallPromptCapture() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    publish(event as InstallPromptEvent);
  });

  window.addEventListener("appinstalled", () => publish(null));
}

export function getInstallPrompt() {
  return deferredInstallPrompt;
}

export function clearInstallPrompt() {
  publish(null);
}

export function subscribeToInstallPrompt(listener: InstallPromptListener) {
  listeners.add(listener);
  listener(deferredInstallPrompt);
  return () => listeners.delete(listener);
}
