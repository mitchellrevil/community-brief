import { useEffect, useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  downloadTeamsTranscript,
  getMeetingMedia,
  getRecentTeamsMeetingCandidates,
  getTeamsGraphErrorMessage,
  getTeamsMeetingById,
  isMeetingAccessDenied,
} from "../data/api";
import type { TeamsImportJob } from "@/features/recordings/data/api";
import type { TeamsMeeting, TeamsTranscriptBundle } from "../data/types";
import {
  isMicrosoftAuthConfigured,
  teamsGraphScopes,
  teamsRecordingGraphScopes,
} from "@/features/auth/config/msal";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { useMicrosoftGraphToken } from "@/features/auth/hooks/useMicrosoftAccessToken";
import { getTeamsImportJobs } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { getTeamsEventId } from "@/features/recordings/data/recording-source";


// Keep four meetings in flight, releasing a slot as soon as each finishes.
// Each meeting has its own query cache and renders independently.
function meetingRequestQueue() {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(request: () => Promise<T>): Promise<T> => {
    if (active >= 4)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await request();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

export interface SelectedTeamsTranscript {
  meeting: TeamsMeeting;
  bundle: TeamsTranscriptBundle;
}

export function useTeamsRecordings(enabled: boolean, meetingId?: string) {
  const queryClient = useQueryClient();
  const runMeetingRequest = useMemo(meetingRequestQueue, []);
  const [visibleCount, setVisibleCount] = useState(8);
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const isEntraUser = user?.auth_source === "entra";
  const token = useMicrosoftGraphToken(
    teamsGraphScopes,
    enabled && isEntraUser && isMicrosoftAuthConfigured,
  );
  const recordingToken = useMicrosoftGraphToken(
    teamsRecordingGraphScopes,
    enabled && isEntraUser && isMicrosoftAuthConfigured,
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [selectedTranscript, setSelectedTranscript] =
    useState<SelectedTeamsTranscript | null>(null);
  const [deniedMeetingIds, setDeniedMeetingIds] = useState<Array<string>>([]);
  const ready = enabled && isEntraUser && Boolean(token.accessToken);
  const recordingAvailable = Boolean(recordingToken.accessToken);

  const importsKey = [...recordingsKeys.base(), "teams-imports", user?.user_id];
  const importsQuery = useQuery({
    queryKey: importsKey,
    queryFn: getTeamsImportJobs,
    enabled: enabled && isEntraUser,
    staleTime: 30 * 1000,
    refetchInterval: (query) =>
      query.state.data?.some((job) =>
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
    retry: false,
    meta: { suppressGlobalErrorToast: true },
  });

  const candidatesQuery = useQuery({
    queryKey: ["teams", "calendar-candidates", user?.user_id, 90],
    queryFn: ({ signal }) =>
      getRecentTeamsMeetingCandidates(token.getAccessToken, new Date(), {
        signal,
        onMeetings: (meetings) => {
          if (!signal.aborted)
            queryClient.setQueryData(
              ["teams", "calendar-candidates", user?.user_id, 90],
              meetings,
            );
        },
      }),
    enabled: ready && !meetingId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { suppressGlobalErrorToast: true },
  });
  const candidates = candidatesQuery.data ?? [];
  const importedIds = new Set(importsQuery.data?.map(getTeamsEventId));
  const visibleCandidates = candidates.slice(0, visibleCount);
  const meetingQueries = useQueries({
    queries: visibleCandidates.map((meeting) => ({
      queryKey: [
        "teams",
        "meeting-media",
        user?.user_id,
        meeting.id,
        meeting.lastModifiedDateTime,
        recordingAvailable,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        runMeetingRequest(() => {
          signal.throwIfAborted();
          return getMeetingMedia(
            token.getAccessToken,
            meeting,
            recordingToken.accessToken ? recordingToken.getAccessToken : null,
            signal,
          );
        }),
      enabled:
        ready &&
        !meetingId &&
        !importsQuery.isPending &&
        !importedIds.has(meeting.id),
      initialData: () => {
        if (!recordingAvailable) return undefined;
        const transcriptMeeting = queryClient.getQueryData<TeamsMeeting | null>(
          [
            "teams",
            "meeting-media",
            user?.user_id,
            meeting.id,
            meeting.lastModifiedDateTime,
            false,
          ],
        );
        return transcriptMeeting?.transcriptIds?.length
          ? transcriptMeeting
          : undefined;
      },
      staleTime: 5 * 60 * 1000,
      retry: false,
      meta: { suppressGlobalErrorToast: true },
      refetchOnWindowFocus: false,
    })),
  });
  const detailQuery = useQuery({
    queryKey: [
      "teams",
      "meeting",
      user?.user_id,
      meetingId,
      recordingAvailable,
    ],
    queryFn: () =>
      getTeamsMeetingById(
        token.getAccessToken,
        meetingId!,
        recordingToken.accessToken ? recordingToken.getAccessToken : null,
      ),
    enabled:
      ready &&
      Boolean(meetingId) &&
      !importsQuery.isPending &&
      !importedIds.has(meetingId),
    initialData: () =>
      queryClient
        .getQueriesData<TeamsMeeting | null>({
          queryKey: ["teams", "meeting-media", user?.user_id],
        })
        .map(([, data]) => data)
        .find((meeting) => meeting?.id === meetingId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { suppressGlobalErrorToast: true },
  });
  const transcriptMutation = useMutation({
    meta: { suppressGlobalErrorToast: true },
    mutationFn: (meeting: TeamsMeeting) =>
      downloadTeamsTranscript(
        token.getAccessToken,
        meeting,
        recordingToken.accessToken ? recordingToken.getAccessToken : null,
      ),
    onSuccess: (bundle, meeting) => {
      if (!enabledRef.current) return;
      if (bundle.source === "transcript" && !bundle.hasSpeakerAttribution)
        toast.warning("Teams supplied this transcript without speaker names.");
      setSelectedTranscript({ meeting, bundle });
    },
    onError: (error, meeting) => {
      if (isMeetingAccessDenied(error) && meeting.transcriptIds?.length) {
        setDeniedMeetingIds((ids) =>
          ids.includes(meeting.id) ? ids : [...ids, meeting.id],
        );
      }
    },
  });

  useEffect(() => {
    if (!enabled) {
      setSelectedTranscript(null);
      setDeniedMeetingIds([]);
    }
  }, [enabled]);

  const activeError = meetingId
    ? detailQuery.error
    : meetingQueries.find((query) => query.error)?.error;
  let error: string | null = null;
  if (enabled && !isAuthLoading) {
    if (!isMicrosoftAuthConfigured || !isEntraUser) {
      error = "Sign in with your Microsoft work account to see Teams meetings.";
    } else if (!token.isLoading && (token.error || !token.accessToken)) {
      error =
        "Ask your administrator to enable Teams transcript access for Community Brief.";
    } else if (candidatesQuery.error && !meetingId) {
      error = getTeamsGraphErrorMessage(candidatesQuery.error);
    } else if (activeError) {
      error = getTeamsGraphErrorMessage(activeError);
    } else if (importsQuery.error) {
      error =
        "Unable to check previously processed Teams meetings. Refresh before processing a meeting again.";
    } else if (transcriptMutation.error) {
      error = getTeamsGraphErrorMessage(transcriptMutation.error);
    }
  }

  const meetings = meetingId
    ? detailQuery.data
      ? [detailQuery.data]
      : []
    : visibleCandidates.flatMap((meeting, index) => {
        if (importedIds.has(meeting.id)) return [meeting];
        const result = meetingQueries[index].data;
        return result ? [result] : [];
      });
  const waitingForMeetings = meetingId
    ? detailQuery.isPending
    : importsQuery.isPending ||
      candidatesQuery.isPending ||
      meetingQueries.some((query) => query.isFetching);
  return {
    candidates,
    calendarComplete: candidatesQuery.isSuccess && !candidatesQuery.isFetching,
    importedJobs: enabled && isEntraUser ? (importsQuery.data ?? []) : [],
    canProcess: !importsQuery.isPending && !importsQuery.isError,
    markImported: (meeting: TeamsMeeting, jobId: string, filename: string) => {
      queryClient.setQueryData<Array<TeamsImportJob>>(
        importsKey,
        (jobs = []) => [
          {
            id: jobId,
            teams_event_id: meeting.id,
            source: { kind: "teams", event_id: meeting.id },
            displayname: meeting.subject,
            file_name: filename,
            status: "uploaded",
            created_at: new Date().toISOString(),
          },
          ...jobs.filter((job) => job.id !== jobId),
        ],
      );
    },
    meetings: enabled && isEntraUser ? meetings : [],
    isLoading:
      enabled &&
      (isAuthLoading ||
        (isEntraUser &&
          (token.isLoading ||
            (Boolean(token.accessToken) && waitingForMeetings)))),
    isRefreshing:
      enabled &&
      (candidatesQuery.isFetching ||
        detailQuery.isFetching ||
        importsQuery.isFetching ||
        meetingQueries.some((query) => query.isFetching)),
    hasMoreMeetings: !meetingId && visibleCount < candidates.length,
    isLoadingMoreMeetings: meetingQueries.some((query) => query.isFetching),
    loadMoreMeetings: () => setVisibleCount((count) => count + 8),
    error,
    recordingWarning:
      enabled &&
      token.accessToken &&
      !recordingToken.isLoading &&
      !recordingToken.accessToken
        ? "Teams recordings are unavailable until an administrator grants recording access. Available transcripts can still be processed."
        : null,
    refresh: () => {
      if (!ready) return;
      if (meetingId) void detailQuery.refetch();
      else {
        void candidatesQuery.refetch();
        void queryClient.invalidateQueries({
          queryKey: ["teams", "meeting-media", user.user_id],
        });
      }
      void importsQuery.refetch();
    },
    process: (meeting: TeamsMeeting) => {
      if (
        importsQuery.isPending ||
        importsQuery.isError ||
        importedIds.has(meeting.id)
      )
        return;
      transcriptMutation.mutate(meeting);
    },
    isProcessing: transcriptMutation.isPending,
    processingMeetingId: transcriptMutation.isPending
      ? transcriptMutation.variables.id
      : null,
    selectedTranscript: enabled ? selectedTranscript : null,
    deniedMeetingIds: enabled ? deniedMeetingIds : [],
    closeTranscript: () => setSelectedTranscript(null),
  };
}
