import { FileAudio } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/ui/page-heading";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";

interface SimpleUploadShellProps {
  queuedCount: number;
  breadcrumbs: Parameters<typeof SmartBreadcrumb>[0]["items"];
  isTransitioning: boolean;
  hideHeadingOnMobile?: boolean;
  children: ReactNode;
}

export function SimpleUploadShell({
  queuedCount,
  breadcrumbs,
  isTransitioning,
  hideHeadingOnMobile = false,
  children,
}: SimpleUploadShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background pb-20 md:pb-0">
      <div className={hideHeadingOnMobile ? "hidden lg:block" : undefined}>
        <PageHeading
          icon={<FileAudio className="h-5 w-5 sm:h-6 sm:w-6" />}
          title="New Recording"
          breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
          className="py-3 sm:py-4"
        />
      </div>

      {queuedCount > 0 && (
        <div className="fixed right-4 top-5 z-40 animate-in fade-in slide-in-from-top-2">
          <Badge variant="outline" className="border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 shadow-sm sm:px-3 sm:py-1.5 sm:text-sm">
            {queuedCount} queued
          </Badge>
        </div>
      )}

      <div
        className={`mx-auto w-full max-w-7xl px-3 transition-all duration-500 ease-in-out sm:px-6 ${
          hideHeadingOnMobile ? "py-0 lg:py-5" : "py-3 sm:py-5"
        } ${
          isTransitioning ? "scale-95 opacity-0 blur-sm" : "scale-100 opacity-100 blur-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
