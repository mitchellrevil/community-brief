import { createLazyFileRoute } from '@tanstack/react-router';
import { AdminAllJobsPage } from '@/features/admin/ui/all-jobs-page';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PermissionLevel } from '@/types/permissions';
import { MotionDiv } from '@/components/ui/motion';
import { fadeInUp } from '@/lib/motion';

export const Route = createLazyFileRoute('/_layout/admin/all-jobs/')({
  component: AdminAllJobsRoute,
});

function AdminAllJobsRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.MODERATOR}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <AdminAllJobsPage />
      </MotionDiv>
    </PermissionGuard>
  );
}
