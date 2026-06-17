import { AnnouncementsDashboard } from '../ui/admin/AnnouncementsDashboard';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PermissionLevel } from '@/types/permissions';
import { MotionDiv } from '@/components/ui/motion';
import { fadeInUp } from '@/lib/motion';

export function AdminAnnouncementsPage() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.MODERATOR}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <AnnouncementsDashboard />
      </MotionDiv>
    </PermissionGuard>
  );
}
