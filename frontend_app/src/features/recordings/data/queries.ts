import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { AudioListValues } from "@/shared/schema/audio-list.schema";
import type {
  AnalysisRefinementRequest,
  AudioRecording,
  ReprocessRequest,
  SharedJobsResponse,
} from "@/types/api";
import {
  fetchRecordingByIdApi,
  getAudioRecordings,
  getAudioTranscription,
  getRefinementHistory,
  getRefinementSuggestions,
  getSharedJobs,
  refineAnalysis,
  reprocessJob,
} from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";

function sortAudioRecordings(data: Array<AudioRecording>) {
  if (!Array.isArray(data)) return [];
  return data.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getAudioRecordingsQuery(
  filters: AudioListValues & { page?: number; per_page?: number } = {},
) {
  const page = filters.page ?? 1;
  const perPage = filters.per_page ?? 12;

  return queryOptions({
    queryKey: recordingsKeys.list(page, perPage, filters),
    queryFn: async () => {
      const response = await getAudioRecordings({ ...filters, page, per_page: perPage });

      if (!Array.isArray(response)) {
        return {
          jobs: sortAudioRecordings(response.jobs),
          count: response.count,
          status: response.status,
        };
      }

      const jobs = sortAudioRecordings(response);
      return {
        jobs,
        count: jobs.length,
        status: 200,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function getAudioRecordingsInfiniteQuery(filters: AudioListValues = {}, pageSize: number = 12) {
  return infiniteQueryOptions({
    queryKey: recordingsKeys.infinite(pageSize, filters),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await getAudioRecordings({ ...filters, page: pageParam, per_page: pageSize });

      if (!Array.isArray(response)) {
        const jobs = sortAudioRecordings(response.jobs);
        return {
          jobs,
          count: response.count,
          status: response.status,
          currentPage: pageParam,
          totalPages: Math.ceil(response.count / pageSize),
        };
      }

      const jobs = sortAudioRecordings(response);
      return {
        jobs,
        count: jobs.length,
        status: 200,
        currentPage: pageParam,
        totalPages: 1,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.currentPage + 1;
      return nextPage <= lastPage.totalPages ? nextPage : undefined;
    },
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function getAudioRecordingQuery(id: string) {
  return queryOptions({
    queryKey: recordingsKeys.single(id),
    queryFn: async () => fetchRecordingByIdApi(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function getAudioTranscriptionQuery(id: string) {
  return queryOptions({
    queryKey: recordingsKeys.transcription(id),
    queryFn: () => getAudioTranscription(id),
    enabled: !!id,
    retry: (failureCount, error: any) => {
      const status = error?.status || error?.response?.status;
      if (status === 404) {
        return failureCount < 20;
      }
      if (status === 409 || (status >= 400 && status < 500)) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(3000 * Math.pow(1.5, attemptIndex), 30000),
    throwOnError: (error: any) => {
      const status = error?.status || error?.response?.status;
      return status !== 404 && status !== 409;
    },
  });
}

export function getRefinementHistoryQuery(jobId: string) {
  return queryOptions({
    queryKey: recordingsKeys.analysisHistory(jobId),
    queryFn: () => getRefinementHistory(jobId),
    enabled: !!jobId,
  });
}

export function getRefinementSuggestionsQuery(jobId: string) {
  return queryOptions({
    queryKey: recordingsKeys.analysisSuggestions(jobId),
    queryFn: () => getRefinementSuggestions(jobId),
    enabled: !!jobId,
  });
}

export function getSharedJobsQuery() {
  return queryOptions({
    queryKey: recordingsKeys.sharedJobs(),
    queryFn: async (): Promise<SharedJobsResponse> => getSharedJobs(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAnalysisRefinementMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobId,
      request,
    }: {
      jobId: string;
      request: AnalysisRefinementRequest;
    }) => refineAnalysis(jobId, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: recordingsKeys.analysisHistory(variables.jobId),
      });
      queryClient.invalidateQueries({
        queryKey: recordingsKeys.base(),
      });
    },
  });
}

export function useReprocessJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, request }: { jobId: string; request: ReprocessRequest }) =>
      reprocessJob(jobId, request),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: recordingsKeys.single(variables.jobId),
      });

      const previousJob = queryClient.getQueryData(recordingsKeys.single(variables.jobId));

      queryClient.setQueryData(
        recordingsKeys.single(variables.jobId),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            status: "analysing",
            analysis_in_progress: true,
          };
        },
      );

      return { previousJob };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: recordingsKeys.single(variables.jobId),
      });
      queryClient.invalidateQueries({
        queryKey: recordingsKeys.base(),
      });
    },
    onError: (_err, variables, context) => {
      if (context?.previousJob) {
        queryClient.setQueryData(
          recordingsKeys.single(variables.jobId),
          context.previousJob,
        );
      }
    },
  });
}

