import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearInstallPrompt,
  getInstallPrompt,
  subscribeToInstallPrompt,
} from "@/lib/pwa-install";

const DISMISSED_KEY = "community-install-guidance-dismissed";
const INSTALLED_KEY = "community-pwa-installed";
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const wasInstalled = () => {
  if (isInstalled()) return true;
  try {
    return localStorage.getItem(INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
};

const rememberInstallation = () => {
  try {
    localStorage.setItem(INSTALLED_KEY, "true");
  } catch {
    /* Installed display mode still hides the guidance for this session. */
  }
};

export function InstallAppPrompt() {
  const [installed, setInstalled] = useState(wasInstalled);
  const [installEvent, setInstallEvent] = useState(getInstallPrompt);
  const [showHelp, setShowHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const unsubscribe = subscribeToInstallPrompt(setInstallEvent);
    const onInstalled = () => {
      rememberInstallation();
      setInstalled(true);
      setShowHelp(false);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = () => {
      if (isInstalled()) onInstalled();
    };
    if (isInstalled()) rememberInstallation();
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener("change", onDisplayChange);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", onDisplayChange);
    };
  }, []);
  if (installed || dismissed) return null;
  const install = async () => {
    if (!installEvent) {
      setShowHelp(true);
      return;
    }
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        rememberInstallation();
        setInstalled(true);
      }
    } catch {
      setShowHelp(true);
    } finally {
      clearInstallPrompt();
    }
  };
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      /* Optional preference. */
    }
  };
  return (
    <>
      <aside
        aria-label="Install Community Brief"
        className="bg-primary/5 border-primary/20 container mx-auto my-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-lg border px-3 py-2 shadow-sm"
      >
        <span className="bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-md">
          <Download className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">
          Please install the app for better offline capabilities.
        </p>
        <Button size="sm" onClick={() => void install()}>
          Install app
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Dismiss installation guidance"
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </aside>
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Community Brief</DialogTitle>
            <DialogDescription>
              Add the app to your home screen or desktop for easy access to
              recordings.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <strong>iPhone or iPad:</strong> open Community Brief in Safari, open
              Share, then choose Add to Home Screen. Enable Open as Web App if
              shown, then tap Add.
            </li>
            <li>
              <strong>Android:</strong> open the browser menu and choose Install
              app or Add to Home screen.
            </li>
            <li>
              <strong>Windows or Mac:</strong> use the install icon in Chrome or
              Edge, or the browser menu. In Safari on Mac, choose File → Add to
              Dock.
            </li>
          </ul>
          <p className="text-muted-foreground text-sm leading-relaxed">
            If your browser or organisation does not offer installation, you can
            keep using Community Brief in a browser tab. Installation alone does not
            download your templates: sign in and prepare the app online before
            going offline. Sign-in, uploading, transcription and analysis
            require internet access.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
