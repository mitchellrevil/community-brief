import { memo } from "react";
import { Button } from "@/components/ui/button";
import { EditableDisplayName } from "@/components/ui/editable-display-name";
import { MotionDiv } from "@/components/ui/motion";
import { PageHeading } from "@/components/ui/page-heading";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { useIsMobile } from "@/hooks/useMobile";
import { getDisplayName } from "@/lib/display-name-utils";
import { fadeInDown } from "@/lib/motion";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { ExtendedAudioRecording } from "./hooks/useRecordingData";
import { TranscriptionStatusPopover } from "./TranscriptionStatusPopover";

interface RecordingHeaderProps {
  recording: ExtendedAudioRecording;
  isTinyScreen: boolean;
  backTo?: "/audio-recordings" | "/audio-recordings/shared" | "/admin/all-jobs";
  showTranscriptionPopover?: boolean;
  onDismissTranscriptionPopover?: () => void;
}

/**
 * Recording page header with navigation, breadcrumb, and status
 * Fully responsive with mobile-first design
 */
export const RecordingHeader = memo(function RecordingHeaderView({
  recording,
  isTinyScreen,
  backTo = "/audio-recordings",
  showTranscriptionPopover,
  onDismissTranscriptionPopover,
}: RecordingHeaderProps) {
  const status = recording.status;
  const displayName = getDisplayName(recording);
  const isMobile = useIsMobile();
  const backLabel =
    backTo === "/audio-recordings/shared"
      ? "Shared"
      : backTo === "/admin/all-jobs"
        ? "All Files"
        : "My Files";
  const breadcrumbItems =
    backTo === "/admin/all-jobs"
      ? [
          { label: backLabel, to: backTo },
          { label: displayName, isCurrentPage: true },
        ]
      : [
          { label: "My Files", to: "/audio-recordings" },
          ...(backTo === "/audio-recordings/shared"
            ? [{ label: backLabel, to: backTo }]
            : []),
          { label: displayName, isCurrentPage: true },
        ];

  return (
    <MotionDiv variants={fadeInDown} initial="hidden" animate="visible">
      <PageHeading
        sticky
        bleed
        titleElement="div"
        title={
          <div className="xs:gap-3 flex w-full min-w-0 items-center gap-2 overflow-hidden">
            <Link to={backTo} className="mt-1 flex-shrink-0">
              <Button
                variant="outline"
                size="icon"
                className={`${isTinyScreen ? "h-7 w-7" : "xs:h-9 xs:w-9 h-8 w-8 sm:h-10 sm:w-10"} hover:bg-muted flex-shrink-0`}
              >
                <ArrowLeft
                  className={`${isTinyScreen ? "h-3 w-3" : "h-4 w-4"}`}
                />
              </Button>
            </Link>
            <div className="min-w-0 flex-1 overflow-hidden">
              <EditableDisplayName
                job={recording}
                className={`block truncate ${isTinyScreen ? "xs:text-sm text-xs" : "xs:text-lg text-base sm:text-xl md:text-2xl"} max-w-full overflow-hidden text-ellipsis whitespace-nowrap`}
                showEditIcon={!isTinyScreen}
              />
            </div>
          </div>
        }
        breadcrumb={
          !isTinyScreen && (
            <SmartBreadcrumb
              items={breadcrumbItems}
              className="text-muted-foreground xs:text-xs mt-1 max-w-full truncate text-[0.7rem] sm:text-sm"
              maxItems={isMobile ? 2 : 4}
            />
          )
        }
        actions={
          <div className="xs:gap-2 relative flex flex-shrink-0 items-center gap-1.5">
            <Popover
              open={showTranscriptionPopover}
              onOpenChange={(open) => {
                if (!open && onDismissTranscriptionPopover) {
                  onDismissTranscriptionPopover();
                }
              }}
            >
              <PopoverTrigger asChild>
                <div>
                  <StatusBadge
                    status={status as any}
                    size={isTinyScreen ? "sm" : isMobile ? "sm" : "md"}
                    showIcon={!isTinyScreen}
                    animate={
                      status === "processing" ||
                      status === "analysing" ||
                      status === "transcribing"
                    }
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                sideOffset={8}
                className="w-auto border-0 bg-transparent p-0 shadow-none"
              >
                <TranscriptionStatusPopover
                  open={showTranscriptionPopover ?? false}
                  onOpenChange={(open) => {
                    if (!open && onDismissTranscriptionPopover) {
                      onDismissTranscriptionPopover();
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        }
        className="bg-background/95"
      />
    </MotionDiv>
  );
});
