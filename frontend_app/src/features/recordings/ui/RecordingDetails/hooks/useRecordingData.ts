import { useQuery } from '@tanstack/react-query';
import type { AudioRecording } from '@/types/api';
import type { SubcategoryResponse } from '@/shared/data/taxonomy/types';
import { getAudioRecordingQuery, getAudioTranscriptionQuery } from '@/features/recordings/data/queries';
import { fetchCategories, fetchSubcategories } from '@/shared/data/taxonomy/api';
import { taxonomyQueryKeys } from '@/shared/data/taxonomy/keys';

export interface ExtendedAudioRecording extends AudioRecording {
  analysis_text?: string;
  displayname?: string;
  file_name?: string;
  filename?: string;
  audio_duration_seconds?: number;
  original_audio_filename?: string;
  duration?: number;
  tags?: Array<string>;
}

/**
 * Centralized hook for managing all recording data and real-time updates
 */
export function useRecordingData(jobId: string) {
  // Fetch recording
  const {
    data: recording,
    isLoading: isLoadingRecording,
    isError: isErrorRecording,
    error: errorRecording,
  } = useQuery({
    ...getAudioRecordingQuery(jobId),
    enabled: !!jobId,
  });

  // Fetch transcription - only when status is 'transcribed' or 'completed'
  const {
    data: transcriptionText,
    refetch: refetchTranscription,
    isLoading: isLoadingTranscription,
    isError: isTranscriptionError,
    error: transcriptionError,
    isFetching: isFetchingTranscription,
  } = useQuery({
    ...getAudioTranscriptionQuery(jobId),
    enabled: !!recording && (recording.status === 'transcribed' || recording.status === 'completed'),
    refetchOnWindowFocus: false,
    staleTime: recording?.status === 'completed' ? 30 * 60 * 1000 : 0,
  });

  // Fetch categories and subcategories
  const { data: categories = [] } = useQuery({
    queryKey: taxonomyQueryKeys.categories(),
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: subcategories = [] } = useQuery<Array<SubcategoryResponse>>({
    queryKey: taxonomyQueryKeys.subcategories(),
    queryFn: () => fetchSubcategories(),
    staleTime: 5 * 60 * 1000,
  });

  // Compute derived states
  // Show processing state if:
  // 1. Query is actively loading/fetching
  // 2. Error is 404/409 (file not yet ready)
  // 3. Recording status is 'transcribing' (processing in progress)
  const isTranscriptionProcessing =
    isLoadingTranscription ||
    isFetchingTranscription ||
    (isTranscriptionError && [404, 409].includes((transcriptionError)?.status || (transcriptionError)?.response?.status)) ||
    recording?.status === 'transcribing';

  const shouldShowTranscriptionError =
    isTranscriptionError &&
    ![404, 409].includes((transcriptionError)?.status || (transcriptionError)?.response?.status);

  // Helper functions
  const getCategoryName = (categoryId: string | null | undefined): string => {
    if (!categoryId) return 'N/A';
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || categoryId;
  };

  const getSubcategoryName = (subcategoryId: string | null | undefined): string => {
    if (!subcategoryId) return 'N/A';
    const subcategory = subcategories.find((sub) => sub.id === subcategoryId);
    return subcategory?.name || subcategoryId;
  };

  return {
    // Core data
    recording: recording as ExtendedAudioRecording | undefined,
    transcriptionText,
    isLoading: isLoadingRecording,
    isError: isErrorRecording,
    error: errorRecording,

    // Category helpers
    categories,
    subcategories,
    getCategoryName,
    getSubcategoryName,

    // Loading states
    isTranscriptionProcessing,
    shouldShowTranscriptionError,
    transcriptionError,

    // Actions
    refetchTranscription,
  };
}

