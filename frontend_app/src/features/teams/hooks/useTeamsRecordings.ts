import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  downloadTeamsTranscript,
  getRecentTeamsMeetingCandidates,
  getTeamsGraphErrorMessage,
  getTeamsMeetingById,
  getTeamsMeetingsPage,
  isMeetingAccessDenied,
} from "../data/api";
import type { TeamsMeeting, TeamsTranscriptBundle } from "../data/types";
import {
  isMicrosoftAuthConfigured,
  teamsGraphScopes,
  teamsRecordingGraphScopes,
} from "@/features/auth/config/msal";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { useMicrosoftGraphToken } from "@/features/auth/hooks/useMicrosoftAccessToken";

export interface SelectedTeamsTranscript {
  meeting: TeamsMeeting;
  bundle: TeamsTranscriptBundle;
}

export function useTeamsRecordings(enabled: boolean, meetingId?: string) {
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
  const ready = enabled && isEntraUser && Boolean(token.accessToken) && !recordingToken.isLoading;
  const recordingAvailable = Boolean(recordingToken.accessToken);

  const candidatesQuery = useQuery({
    queryKey: ["teams", "calendar-candidates", user?.user_id, 90],
    queryFn: () => getRecentTeamsMeetingCandidates(token.accessToken!),
    enabled: ready && !meetingId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const meetingsQuery = useInfiniteQuery({
    queryKey: ["teams", "meeting-pages", user?.user_id, 90, candidatesQuery.dataUpdatedAt, recordingAvailable],
    queryFn: ({ pageParam }) =>
      getTeamsMeetingsPage(
        token.accessToken!,
        candidatesQuery.data!,
        pageParam,
        8,
        recordingToken.accessToken,
      ),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: ready && !meetingId && Boolean(candidatesQuery.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["teams", "meeting", user?.user_id, meetingId, recordingAvailable],
    queryFn: () =>
      getTeamsMeetingById(token.accessToken!, meetingId!, recordingToken.accessToken),
    enabled: ready && Boolean(meetingId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const transcriptMutation = useMutation({
    mutationFn: (meeting: TeamsMeeting) =>
      downloadTeamsTranscript(token.accessToken!, meeting, recordingToken.accessToken),
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

  const activeQuery = meetingId ? detailQuery : meetingsQuery;
  let error: string | null = null;
  if (enabled && !isAuthLoading) {
    if (!isMicrosoftAuthConfigured || !isEntraUser) {
      error = "Sign in with your Microsoft work account to see Teams meetings.";
    } else if (!token.isLoading && (token.error || !token.accessToken)) {
      error = "Ask your administrator to enable Teams transcript access for Community Brief.";
    } else if (candidatesQuery.error && !meetingId) {
      error = getTeamsGraphErrorMessage(candidatesQuery.error);
    } else if (activeQuery.error) {
      error = getTeamsGraphErrorMessage(activeQuery.error);
    } else if (transcriptMutation.error) {
      error = getTeamsGraphErrorMessage(transcriptMutation.error);
    }
  }

  const meetings = meetingId
    ? detailQuery.data ? [detailQuery.data] : []
    : meetingsQuery.data?.pages.flatMap((page) => page.meetings) ?? [];
  const waitingForMeetings = meetingId
    ? detailQuery.isPending
    : candidatesQuery.isPending || (!candidatesQuery.isError && meetingsQuery.isPending);
  return {
    meetings: enabled && isEntraUser ? meetings : [],
    isLoading: enabled && (
      isAuthLoading || (
        isEntraUser && (
          token.isLoading ||
          recordingToken.isLoading ||
          (Boolean(token.accessToken) && waitingForMeetings)
        )
      )
    ),
    isRefreshing: enabled && (candidatesQuery.isFetching || activeQuery.isFetching),
    hasMoreMeetings: !meetingId && Boolean(meetingsQuery.hasNextPage),
    isLoadingMoreMeetings: meetingsQuery.isFetchingNextPage,
    loadMoreMeetings: () => { if (meetingsQuery.hasNextPage) void meetingsQuery.fetchNextPage(); },
    error,
    recordingWarning: enabled && token.accessToken && !recordingToken.isLoading &&
      !recordingToken.accessToken
        ? "Teams recordings are unavailable until an administrator grants recording access. Available transcripts can still be processed."
        : null,
    refresh: () => {
      if (!ready) return;
      if (meetingId) void detailQuery.refetch();
      else void candidatesQuery.refetch();
    },
    process: transcriptMutation.mutate,
    isProcessing: transcriptMutation.isPending,
    processingMeetingId: transcriptMutation.isPending ? transcriptMutation.variables.id : null,
    selectedTranscript: enabled ? selectedTranscript : null,
    deniedMeetingIds: enabled ? deniedMeetingIds : [],
    closeTranscript: () => setSelectedTranscript(null),
  };
}
