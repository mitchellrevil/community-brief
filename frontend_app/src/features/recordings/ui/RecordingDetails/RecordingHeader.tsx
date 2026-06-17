import { memo } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileAudio } from 'lucide-react';
import { TranscriptionStatusPopover } from './TranscriptionStatusPopover';
import type { ExtendedAudioRecording } from './hooks/useRecordingData';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/ui/page-heading';
import { SmartBreadcrumb } from '@/components/ui/smart-breadcrumb';
import { StatusBadge } from '@/components/ui/status-badge';
import { EditableDisplayName } from '@/components/ui/editable-display-name';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/useMobile';
import { getDisplayName } from '@/lib/display-name-utils';
import { fadeInDown } from '@/lib/motion';
import { MotionDiv } from '@/components/ui/motion';

interface RecordingHeaderProps {
  recording: ExtendedAudioRecording;
  isTinyScreen: boolean;
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
  showTranscriptionPopover,
  onDismissTranscriptionPopover,
}: RecordingHeaderProps) {
  const status = recording.status;
  const displayName = getDisplayName(recording);
  const isMobile = useIsMobile();

  return (
    <MotionDiv
      variants={fadeInDown}
      initial="hidden"
      animate="visible"
    >
      <PageHeading
        sticky
        bleed
        titleElement="div"
        icon={!isTinyScreen && <FileAudio className="text-primary h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />}
        title={
        <div className="flex items-center gap-2 xs:gap-3 min-w-0 w-full overflow-hidden">
          <Link to="/audio-recordings" className="flex-shrink-0 mt-1">
            <Button
              variant="outline"
              size="icon"
              className={`${isTinyScreen ? 'h-7 w-7' : 'h-8 w-8 xs:h-9 xs:w-9 sm:h-10 sm:w-10'} hover:bg-muted flex-shrink-0`}
            >
              <ArrowLeft className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
            </Button>
          </Link>
          <div className="min-w-0 flex-1 overflow-hidden">
            <EditableDisplayName
              job={recording}
              className={`truncate block ${isTinyScreen ? 'text-xs xs:text-sm' : 'text-base xs:text-lg sm:text-xl md:text-2xl'} max-w-full overflow-hidden text-ellipsis whitespace-nowrap`}
              showEditIcon={!isTinyScreen}
            />
          </div>
        </div>
      }
      breadcrumb={
        !isTinyScreen && (
          <SmartBreadcrumb
            items={[
              { label: 'My Files', to: '/audio-recordings' },
              { label: displayName, isCurrentPage: true },
            ]}
            className="text-muted-foreground text-[0.7rem] xs:text-xs sm:text-sm mt-1 truncate max-w-full"
            maxItems={isMobile ? 2 : 4}
          />
        )
      }
      actions={
        <div className="flex items-center gap-1.5 xs:gap-2 flex-shrink-0 relative">
          <Popover open={showTranscriptionPopover} onOpenChange={(open) => {
            if (!open && onDismissTranscriptionPopover) {
              onDismissTranscriptionPopover();
            }
          }}>
            <PopoverTrigger asChild>
              <div>
                <StatusBadge
                  status={status as any}
                  size={isTinyScreen ? 'sm' : isMobile ? 'sm' : 'md'}
                  showIcon={!isTinyScreen}
                  animate={status === 'processing' || status === 'analysing' || status === 'transcribing'}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={8}
              className="p-0 border-0 bg-transparent shadow-none w-auto"
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
