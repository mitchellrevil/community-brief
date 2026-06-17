import { memo } from 'react';
import { Download, FileText, Link as LinkIcon, MessageSquare, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { fadeInUp } from '@/lib/motion';
import { MotionDiv } from '@/components/ui/motion';

interface RecordingActionsCardProps {
  isOwner: boolean;
  isShared: boolean;
  jobId: string;
  onShare: () => void;
  onDelete: () => void;
  onReprocess?: () => void;
  onDownloadAudio?: () => void;
  onDownloadTranscription?: () => void;
  onDownloadAnalysis?: (path: string, fileName: string) => void;
  analysisFilePath?: string | null;
  analysisAttempts?: Array<{
    attempt?: number;
    analysis_file_path: string;
    created_at?: string;
  }>;
  onChatWithAnalysis?: () => void;
  onCopyLink: () => void;
  hasTranscription?: boolean;
  hasAnalysis?: boolean;
  isTinyScreen: boolean;
}

/**
 * Recording actions sidebar card
 * Displays action buttons with permission checks
 */
export const RecordingActionsCard = memo(function RecordingActionsCardView({
  isOwner,
  isShared,
  jobId,
  onShare,
  onDelete,
  onReprocess,
  onDownloadAudio,
  onDownloadTranscription,
  onDownloadAnalysis,
  analysisFilePath,
  analysisAttempts,
  onChatWithAnalysis,
  onCopyLink,
  hasTranscription = false,
  hasAnalysis = false,
  isTinyScreen,
}: RecordingActionsCardProps) {
  const normalizedAttempts = Array.isArray(analysisAttempts)
    ? analysisAttempts.map((attempt, idx) => ({
        ...attempt,
        attempt: typeof attempt.attempt === "number" ? attempt.attempt : idx + 1,
      }))
    : [];

  const resolveAnalysisPath = () => {
    if (analysisFilePath) return analysisFilePath;
    if (normalizedAttempts.length > 0) return normalizedAttempts[normalizedAttempts.length - 1].analysis_file_path;
    return undefined;
  };

  const getFileType = (filePath?: string | null): string => {
    if (!filePath) return 'docx';
    const lastDot = filePath.lastIndexOf('.');
    const questionMark = filePath.indexOf('?');
    const endPos = questionMark !== -1 ? questionMark : filePath.length;
    const extension = lastDot !== -1 && lastDot < endPos ? filePath.substring(lastDot + 1, endPos).toLowerCase() : 'docx';
    return extension || 'docx';
  };

  const fileType = getFileType(resolveAnalysisPath());

  const getAttemptFileName = (attemptNumber: number = normalizedAttempts.length) => {
    const suffix = normalizedAttempts.length > 1 ? `_attempt_${attemptNumber}` : '';
    return `Analysis_${jobId}${suffix}.${fileType}`;
  };

  const downloadAllAttempts = async () => {
    if (!onDownloadAnalysis) return;
    for (const attempt of normalizedAttempts) {
      onDownloadAnalysis(attempt.analysis_file_path, getAttemptFileName(attempt.attempt));
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  return (
    <MotionDiv
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm w-full">
      <CardHeader className="pb-3">
        <CardTitle className={`${isTinyScreen ? 'text-sm' : 'text-base sm:text-lg'}`}>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {onDownloadAudio && (
          <Button onClick={onDownloadAudio} variant="outline" className="w-full justify-start gap-2" size={isTinyScreen ? 'sm' : 'default'}>
          <Download className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
          <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Download Audio</span>
          </Button>
        )}

        {hasTranscription && onDownloadTranscription && (
          <Button onClick={onDownloadTranscription} variant="outline" className="w-full justify-start gap-2" size={isTinyScreen ? 'sm' : 'default'}>
            <FileText className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
            <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Download Transcription</span>
          </Button>
        )}

        {hasAnalysis && onDownloadAnalysis && (
          <div className="w-full">
            {normalizedAttempts.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2" size={isTinyScreen ? 'sm' : 'default'}>
                    <FileText className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
                    <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Download Analysis</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 max-w-[85vw]">
                  <DropdownMenuLabel>Analysis downloads</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      const path = resolveAnalysisPath();
                      if (path) onDownloadAnalysis(path, getAttemptFileName(normalizedAttempts.length));
                    }}
                  >
                    Latest (Attempt {normalizedAttempts.length})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {normalizedAttempts.map((attempt) => (
                    <DropdownMenuItem
                      key={attempt.analysis_file_path}
                      onSelect={() => onDownloadAnalysis(attempt.analysis_file_path, getAttemptFileName(attempt.attempt))}
                    >
                      Attempt {attempt.attempt}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {attempt.created_at ? new Date(attempt.created_at).toLocaleDateString() : '—'}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => downloadAllAttempts()}>
                    Download all attempts
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => {
                  const path = resolveAnalysisPath();
                  if (path) onDownloadAnalysis(path, getAttemptFileName(1));
                }}
                variant="outline"
                className="w-full justify-start gap-2"
                size={isTinyScreen ? 'sm' : 'default'}
              >
                <FileText className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
                <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Download Analysis</span>
              </Button>
            )}
          </div>
        )}

        {hasAnalysis && onChatWithAnalysis && (
          <Button onClick={onChatWithAnalysis} variant="outline" className="w-full justify-start gap-2" size={isTinyScreen ? 'sm' : 'default'}>
            <MessageSquare className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
            <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Chat with Analysis</span>
          </Button>
        )}

        {hasAnalysis && onReprocess && (
          <Button onClick={onReprocess} variant="outline" className="w-full justify-start gap-2" size={isTinyScreen ? 'sm' : 'default'}>
            <RotateCcw className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
            <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Reprocess Analysis</span>
          </Button>
        )}

        <Button onClick={onCopyLink} variant="outline" className="w-full justify-start gap-2" size={isTinyScreen ? 'sm' : 'default'}>
          <LinkIcon className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
          <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Copy Link</span>
        </Button>

        {isOwner && (
          <>
            <Button
              onClick={onShare}
              variant="outline"
              className="w-full justify-start gap-2"
              size={isTinyScreen ? 'sm' : 'default'}
            >
              <Share2 className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
              <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>
                {isShared ? 'Manage Sharing' : 'Share Recording'}
              </span>
            </Button>

            <Button
              onClick={onDelete}
              variant="destructive"
              className="w-full justify-start gap-2"
              size={isTinyScreen ? 'sm' : 'default'}
            >
              <Trash2 className={`${isTinyScreen ? 'h-3 w-3' : 'h-4 w-4'}`} />
              <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Delete Recording</span>
            </Button>
          </>
        )}

        {!isOwner && isShared && (
          <div className="pt-2 space-y-2">
            <Badge variant="secondary" className="w-full justify-center">
              <span className={isTinyScreen ? 'text-xs' : 'text-sm'}>Shared with you</span>
            </Badge>
            <p className={`${isTinyScreen ? 'text-xs' : 'text-xs sm:text-sm'} text-muted-foreground text-center`}>
              Contact the owner to request changes
            </p>
          </div>
        )}
      </CardContent>
    </Card>
    </MotionDiv>
  );
});
