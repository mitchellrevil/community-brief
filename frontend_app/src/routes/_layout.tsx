import { Link, Outlet, createFileRoute}from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { DevelopmentServerBanner } from "@/components/development-server-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { AnnouncementPopover } from '@/features/announcements/ui/AnnouncementPopover';
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { buildLoginRedirectUrl } from "@/features/auth/lib/navigation";
import { isHelpPageEnabled } from "@/config/features";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { setStorageItem } from "@/lib/storage";
import { BusinessUnitSelectionDialog } from "@/components/business-unit-selection-dialog";
import { AppTutorialModal } from "@/components/app-tutorial-modal";
import { usePermissionGuard } from "@/hooks/usePermissions";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { TutorialProvider, useTutorial } from "@/app/contexts/tutorial-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_layout")({
  component: RouteComponent,
  errorComponent: ({ error }) => (
    <AppSidebar>
      <main className="min-h-screen flex-1 flex flex-col overflow-x-hidden">
        <div className="flex-1 flex items-center justify-center">
          <ErrorBoundary error={error} isRouteError={true} />
        </div>
      </main>
    </AppSidebar>
  ),
});

function RouteComponent() {
  return (
    <TutorialProvider>
      <LayoutContent />
    </TutorialProvider>
  );
}

function LayoutContent() {
  const auth = useAuthSession();
  const { isLoading, hasNoBusinessUnit } = usePermissionGuard();
  const isOnline = useOnlineStatus();
  const [showBusinessUnitDialog, setShowBusinessUnitDialog] = useState(false);
  const { tutorialState, startTutorial, endTutorial } = useTutorial();

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      window.location.replace(buildLoginRedirectUrl());
    }
  }, [auth.status]);

  useEffect(() => {
    // Show dialog only if online, data is loaded, and user has no business unit
    // Don't show dialog when offline since API calls won't work
    if (isOnline && !isLoading && hasNoBusinessUnit) {
      setShowBusinessUnitDialog(true);
    } else if (!isOnline) {
      // Hide dialog if we go offline
      setShowBusinessUnitDialog(false);
    }
  }, [isOnline, isLoading, hasNoBusinessUnit]);

  if (auth.status === "loading") {
    return (
      <AppSidebar>
        <main className="min-h-screen flex-1 flex items-center justify-center overflow-x-hidden">
          <div className="text-sm text-muted-foreground">Checking your session...</div>
        </main>
      </AppSidebar>
    );
  }

  if (auth.status === "unauthenticated") {
    return null;
  }

  if (auth.status === "error") {
    const error = auth.error instanceof Error ? auth.error : new Error("Failed to load your session.");
    return (
      <AppSidebar>
        <main className="min-h-screen flex-1 flex flex-col overflow-x-hidden">
          <div className="flex flex-1 items-center justify-center">
            <ErrorBoundary error={error} isRouteError={true} />
          </div>
        </main>
      </AppSidebar>
    );
  }

  const handleBusinessUnitComplete = (shouldShowTutorial?: boolean) => {
    setShowBusinessUnitDialog(false);
    if (shouldShowTutorial) {
      // Mark that tutorial has been shown for this session
      setStorageItem("tutorialShown", "true");
      startTutorial();
    }
  };

  const handleTutorialComplete = () => {
    endTutorial();
  };

  return (
    <>
      <AppSidebar>
        <main className="min-h-screen flex-1 flex flex-col overflow-x-hidden">
          <OfflineIndicator />
          <div className="flex-1">
            <div className="container mx-auto p-4">
              <div className="hidden sm:flex items-center justify-end space-x-3 relative z-40">
                <AnnouncementPopover />
                {isHelpPageEnabled && (
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      to="/help"
                      aria-label="Open help and documentation"
                      title="Help"
                    >
                      <CircleHelp className="size-5" />
                    </Link>
                  </Button>
                )}
                <ThemeToggle />
              </div>
              <Outlet />
            </div>
          </div>
          <DevelopmentServerBanner />
        </main>
      </AppSidebar>

      {showBusinessUnitDialog && (
        <BusinessUnitSelectionDialog
          open={showBusinessUnitDialog}
          onComplete={handleBusinessUnitComplete}
        />
      )}

      {tutorialState.isActive && (
        <AppTutorialModal
          open={tutorialState.isActive}
          onComplete={handleTutorialComplete}
        />
      )}
    </>
  );
}
