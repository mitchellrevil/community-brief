import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import {
  prepareOfflineTemplates,
  readOfflineTemplates,
} from "@/lib/offline-templates";
import { waitForOfflineStartup } from "@/lib/pwa-readiness";

export function OfflinePreparation() {
  const { user } = useAuthSession();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"syncing" | "ready" | "failed">(
    "syncing",
  );
  const [detail, setDetail] = useState(
    "Saving recording templates for offline use.",
  );

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const prepare = async () => {
      setStatus("syncing");
      setDetail("Saving recording templates for offline use.");
      try {
        const snapshot = navigator.onLine
          ? await prepareOfflineTemplates(user)
          : await readOfflineTemplates();
        controller.signal.throwIfAborted();
        if (!("serviceWorker" in navigator))
          throw new Error("Offline startup is unavailable in this browser.");
        await waitForOfflineStartup(navigator.serviceWorker);
        controller.signal.throwIfAborted();
        setStatus("ready");
        setDetail(
          `${snapshot.templates.length} templates are available offline.`,
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("failed");
        setDetail(
          error instanceof Error
            ? error.message
            : "Templates could not be prepared for offline use.",
        );
      }
    };
    void prepare();
    window.addEventListener("online", prepare);
    window.addEventListener("offline", prepare);
    const interval = window.setInterval(
      () => {
        if (navigator.onLine) void prepare();
      },
      15 * 60 * 1000,
    );
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", prepare);
      window.removeEventListener("offline", prepare);
    };
  }, [
    user?.user_id,
    user?.permission,
    user?.business_unit_id,
    JSON.stringify(user?.business_unit_ids),
    attempt,
  ]);

  if (!user) return null;

  const label =
    status === "ready"
      ? "Templates synced"
      : status === "failed"
        ? "Template sync failed"
        : "Syncing templates";

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="hover:bg-accent focus-visible:ring-ring inline-flex size-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {status === "ready" && (
            <Check className="size-4 text-emerald-600" aria-hidden="true" />
          )}
          {status === "failed" && (
            <X className="text-destructive size-4" aria-hidden="true" />
          )}
          {status === "syncing" && (
            <LoaderCircle
              className="text-muted-foreground size-4 animate-spin"
              aria-hidden="true"
            />
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 space-y-2 p-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {detail}
        </p>
        {status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
