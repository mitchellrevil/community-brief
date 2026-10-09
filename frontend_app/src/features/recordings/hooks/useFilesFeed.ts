import { useCallback, useEffect, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { queuedFileEntry } from "../data/file-entry";
import { buildFilesFeed } from "../data/files-feed";
import { recordingsKeys } from "../data/keys";
import { getAudioRecordingsQuery } from "../data/queries";
import { matchesRecordingFilters } from "../data/recording-filters";
import type { FileEntry } from "../data/file-entry";
import type { AudioListValues } from "@/shared/schema/audio-list.schema";
import { getPendingRecordings } from "@/lib/pwa-queue";
import { useTeamsRecordings } from "@/features/teams/hooks/useTeamsRecordings";

interface FilesFeedOptions {
  filters: AudioListValues;
  page: number;
  pageSize: number;
  includeFiles: boolean;
  includeTeams: boolean;
}

/** Owns list queries, source reconciliation and paging; the page only owns interaction state. */
export function useFilesFeed({
  filters,
  page,
  pageSize,
  includeFiles,
  includeTeams,
}: FilesFeedOptions) {
  const queryClient = useQueryClient();
  const teams = useTeamsRecordings(includeTeams);
  const [queuedEntries, setQueuedEntries] = useState<Array<FileEntry>>([]);
  const mergePages =
    includeTeams ||
    (includeFiles &&
      queuedEntries.some((entry) =>
        matchesRecordingFilters(entry.recording, filters),
      ));
  const fileQueries = useQueries({
    queries: includeFiles
      ? Array.from({ length: mergePages ? page : 1 }, (_, index) => ({
          ...getAudioRecordingsQuery({
            ...filters,
            page: mergePages ? index + 1 : page,
            per_page: pageSize,
          }),
          refetchOnWindowFocus: true,
          refetchInterval: (query: {
            state: { data?: { jobs: Array<{ status: string }> } };
          }) =>
            query.state.data?.jobs.some((job) =>
              [
                "uploaded",
                "pending",
                "processing",
                "transcribing",
                "transcribed",
                "analysing",
              ].includes(job.status),
            )
              ? 5000
              : false,
        }))
      : [],
  });

  useEffect(() => {
    if (!includeFiles) return;
    let cancelled = false;
    const loadQueue = async () => {
      try {
        const uploads = await getPendingRecordings();
        if (!cancelled) setQueuedEntries(uploads.map(queuedFileEntry));
      } catch (error) {
        console.error("Failed to read pending uploads", error);
      }
    };
    void loadQueue();
    const interval = setInterval(() => void loadQueue(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [includeFiles]);

  const jobs = fileQueries.flatMap((query) => query.data?.jobs ?? []);
  const feed = buildFilesFeed({
    jobs,
    jobCount: fileQueries[0]?.data?.count ?? 0,
    queuedEntries,
    meetings: teams.meetings,
    importedJobs: teams.importedJobs,
    candidates: teams.candidates,
    calendarComplete: teams.calendarComplete,
    filters,
    includeFiles,
    mergePages,
    page,
    pageSize,
  });
  const refetchJobs = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: recordingsKeys.base(),
        refetchType: "active",
      }),
    [queryClient],
  );

  return {
    ...feed,
    isLoading:
      feed.entries.length === 0 &&
      (fileQueries.some((query) => query.isPending) ||
        (includeTeams && teams.isLoading)),
    isRefetching:
      fileQueries.some((query) => query.isRefetching) || teams.isRefreshing,
    refetchJobs,
    teams,
  };
}
