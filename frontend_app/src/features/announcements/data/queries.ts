import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { announcementKeys } from './keys';
import {
  createAnnouncement,
  deleteAnnouncement,
  dismissAnnouncement,
  fetchAdminAnnouncements,
  fetchAnnouncements,
  markAnnouncementAsRead,
  updateAnnouncement,
} from './api';
import type { AnnouncementCreate, AnnouncementUpdate } from './types';

export { announcementKeys } from './keys';

const ANNOUNCEMENTS_POLLING_INTERVAL = 60 * 1000;

export function getAnnouncementsQuery() {
  return queryOptions({
    queryKey: announcementKeys.list(),
    queryFn: fetchAnnouncements,
    staleTime: ANNOUNCEMENTS_POLLING_INTERVAL,
    refetchInterval: ANNOUNCEMENTS_POLLING_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function getAdminAnnouncementsQuery(
  limit: number = 50,
  offset: number = 0
) {
  return queryOptions({
    queryKey: announcementKeys.admin(limit, offset),
    queryFn: () => fetchAdminAnnouncements(limit, offset),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useCreateAnnouncementMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AnnouncementCreate) => createAnnouncement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
  });
}

export function useUpdateAnnouncementMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AnnouncementUpdate }) =>
      updateAnnouncement(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
      queryClient.invalidateQueries({
        queryKey: announcementKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteAnnouncementMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
  });
}

export function useDismissAnnouncementMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dismissAnnouncement(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: announcementKeys.list() });

      const previousAnnouncements = queryClient.getQueryData(
        announcementKeys.list()
      );

      queryClient.setQueryData(
        announcementKeys.list(),
        (old: Array<{ id: string }> | undefined) => {
          if (!old) return old;
          return old.filter((item) => item.id !== id);
        }
      );

      return { previousAnnouncements };
    },
    onError: (_, __, context) => {
      if (context?.previousAnnouncements) {
        queryClient.setQueryData(
          announcementKeys.list(),
          context.previousAnnouncements
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.list() });
    },
  });
}

export function useMarkAnnouncementAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markAnnouncementAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.list() });
    },
  });
}
