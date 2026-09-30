import { createLazyFileRoute } from '@tanstack/react-router';
import { AnnouncementsDashboard } from '@/features/announcements/ui/admin/AnnouncementsDashboard';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PermissionLevel } from '@/types/permissions';

export const Route = createLazyFileRoute('/_layout/admin/announcements/')({
  component: AdminAnnouncementsPage,
});

function AdminAnnouncementsPage() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.MODERATOR}>
      <AnnouncementsDashboard />
    </PermissionGuard>
  );
}
