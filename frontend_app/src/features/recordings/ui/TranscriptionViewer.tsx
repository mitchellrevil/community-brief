import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Edit3,
  Loader2,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TranscriptionSegment } from '@/lib/transcription-parser';
import {
  filterSegmentsBySpeaker,
  parseTranscription,
  searchSegments,
} from '@/lib/transcription-parser';
import { useUpdateTranscriptionSpeakerNamesMutation } from '@/features/recordings/data/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TranscriptionViewerProps {
  jobId?: string;
  transcriptionText: string;
  onSegmentClick?: (segment: TranscriptionSegment) => void;
  className?: string;
  compact?: boolean;
}

/**
 * TranscriptionViewer Component
 * Displays parsed transcription with minimalist filters and improved readability
 */
export function TranscriptionViewer({
  jobId,
  transcriptionText,
  onSegmentClick,
  className = '',
  compact,
}: TranscriptionViewerProps) {
  const effectiveCompact = compact ?? false;
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingSpeakers, setIsEditingSpeakers] = useState(false);
  const [speakerEdits, setSpeakerEdits] = useState<Record<string, string>>({});
  const updateSpeakerNamesMutation = useUpdateTranscriptionSpeakerNamesMutation();

  // Parse transcription
  const parsed = useMemo(
    () => parseTranscription(transcriptionText),
    [transcriptionText]
  );

  // Filter segments based on selections
  const filteredSegments = useMemo(() => {
    let filtered = parsed.segments;

    // Filter by speaker
    if (selectedSpeakerId !== 'all') {
      filtered = filterSegmentsBySpeaker(filtered, selectedSpeakerId);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = searchSegments(filtered, searchQuery);
    }

    return filtered;
  }, [parsed.segments, selectedSpeakerId, searchQuery]);

  const hasActiveFilters = selectedSpeakerId !== 'all' || searchQuery.trim() !== '';
  const speakerEditDefaults = useMemo(
    () => Object.fromEntries(parsed.speakers.map((speaker) => [speaker.id, speaker.displayName || ''])),
    [parsed.speakers]
  );
  const hasSpeakerNameChanges = parsed.speakers.some(
    (speaker) => (speakerEdits[speaker.id] || '').trim() !== (speaker.displayName || '')
  );

  useEffect(() => {
    if (!isEditingSpeakers) {
      setSpeakerEdits(speakerEditDefaults);
    }
  }, [isEditingSpeakers, speakerEditDefaults]);

  const clearFilters = useCallback(() => {
    setSelectedSpeakerId('all');
    setSearchQuery('');
  }, []);

  const handleSaveSpeakerNames = useCallback(async () => {
    if (!jobId || !hasSpeakerNameChanges) {
      setIsEditingSpeakers(false);
      return;
    }

    try {
      await updateSpeakerNamesMutation.mutateAsync({ jobId, speakerNames: speakerEdits });
      toast.success('Speaker names saved');
      setIsEditingSpeakers(false);
    } catch {
      toast.error('Failed to save speaker names');
    }
  }, [hasSpeakerNameChanges, jobId, speakerEdits, updateSpeakerNamesMutation]);

  if (!parsed.isValid) {
    // Fallback: if the transcription text exists but doesn't match expected parser format
    // (e.g., VTT/SRT or other formats), render the raw text so users can still read it.
    if (transcriptionText && transcriptionText.trim().length > 0) {
      return (
        <div className={`space-y-4 ${className}`}>
          <div className="text-sm text-muted-foreground">Transcription format not parsed into segments, showing raw content:</div>
          <div className="bg-muted/20 rounded p-3 text-sm whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
            {transcriptionText}
          </div>
        </div>
      );
    }

    return (
      <div className={`flex flex-col items-center justify-center py-12 space-y-4 ${className}`}>
        <AlertCircle className="h-8 w-8 text-yellow-500" />
        <div className="text-center">
          <h3 className="font-medium text-lg">No transcription available</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Unable to parse transcription data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Compact Controls Section */}
      <div className="flex flex-col gap-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transcription..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-sm max-[376px]:pl-8 max-[376px]:text-[12px]"
          />
        </div>

        {/* Speaker Filters - Horizontal Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* "All" Button */}
          <Button
            variant={selectedSpeakerId === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSpeakerId('all')}
            className="text-xs font-medium max-[376px]:text-[11px] max-[376px]:px-2"
          >
            All ({parsed.segments.length})
          </Button>

          {/* Individual Speaker Buttons */}
          {parsed.speakers.map((speaker) => (
            <Button
              key={speaker.id}
              variant={selectedSpeakerId === speaker.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedSpeakerId(speaker.id)}
              className="text-xs font-medium"
            >
              {speaker.label} ({speaker.segmentCount})
            </Button>
          ))}

          {jobId && parsed.speakers.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingSpeakers(true)}
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <Edit3 className="h-3 w-3" />
              Names
            </Button>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground ml-auto gap-1"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        {isEditingSpeakers && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {parsed.speakers.map((speaker) => (
                <label key={speaker.id} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 font-medium text-muted-foreground">
                    Speaker {speaker.id}
                  </span>
                  <Input
                    value={speakerEdits[speaker.id] || ''}
                    onChange={(event) =>
                      setSpeakerEdits((current) => ({
                        ...current,
                        [speaker.id]: event.target.value,
                      }))
                    }
                    placeholder={`Speaker ${speaker.id}`}
                    maxLength={100}
                    className="h-8 text-xs"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSpeakerEdits(speakerEditDefaults);
                  setIsEditingSpeakers(false);
                }}
                disabled={updateSpeakerNamesMutation.isPending}
                className="h-8 w-8 p-0"
                aria-label="Cancel speaker name edit"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSpeakerNames}
                disabled={updateSpeakerNamesMutation.isPending}
                className="h-8 w-8 p-0"
                aria-label="Save speaker names"
              >
                {updateSpeakerNamesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Results Counter - Minimal */}
        {hasActiveFilters && (
          <div className="text-xs text-muted-foreground">
            {filteredSegments.length} of {parsed.segments.length} segments
          </div>
        )}
      </div>

      {/* Transcription Display */}
      <div className="space-y-0">
        {filteredSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 bg-muted/20 rounded-lg border border-border/50">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium">No segments found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters or search
              </p>
            </div>
          </div>
        ) : (
 <div className={`${compact ? 'text-xs leading-tight space-y-1' : 'text-sm leading-relaxed space-y-1.5'}`}>
            {filteredSegments.map((segment, index) => {
              const prevSegment = index > 0 ? filteredSegments[index - 1] : null;
              const isSpeakerChange = !prevSegment || prevSegment.speakerId !== segment.speakerId;

              return (
                <div key={segment.id}>
                  {/* Speaker Label - Only on speaker change */}
                  {isSpeakerChange && (
                    <div className="flex items-center gap-2 mt-2 mb-1 pt-2">
                      <Badge
                        className={`${segment.speakerColor} border text-xs font-semibold py-0.5 px-2`}
                      >
                        <Volume2 className="h-3 w-3 mr-1 inline" />
                        {segment.speakerLabel}
                      </Badge>
                    </div>
                  )}

                  {/* Segment Text with inline metadata */}
                  <TranscriptionLine
                    segment={segment}
                    onClick={() => onSegmentClick?.(segment)}
                    compact={effectiveCompact}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Single transcription line with compact metadata
 */
function TranscriptionLine({
  segment,
  onClick,
  compact
}: {
  segment: TranscriptionSegment;
  onClick?: () => void;
  compact?: boolean;
}) {
  // Format timestamp to be more compact (remove leading zeros)
  const formatCompactTimestamp = (timestamp: string) => {
    // Remove hours if 00, e.g., "00:00:10.919" → "0:10"
    const parts = timestamp.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = Math.floor(parseFloat(parts[2]));
      
      if (hours === 0) {
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
      }
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return timestamp;
  };

  return (
    <div
      onClick={onClick}
      className={`py-0.5 rounded transition-colors ${
        onClick ? 'cursor-pointer hover:bg-muted/50' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Compact Timestamp */}
        {segment.timestamp && segment.timestamp !== '00:00:00.000' && (
          <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground/70 font-mono flex-shrink-0 pt-0.5 min-w-[2.5rem] tabular-nums`}>
            {formatCompactTimestamp(segment.timestamp)}
          </span>
        )}

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <p className={`${compact ? 'text-xs' : 'text-sm'} text-foreground/90`}> 
            {segment.text}
          </p>
        </div>
      </div>
    </div>
  );
}

// Re-export for convenience
export { parseTranscription, type TranscriptionSegment } from '@/lib/transcription-parser';

