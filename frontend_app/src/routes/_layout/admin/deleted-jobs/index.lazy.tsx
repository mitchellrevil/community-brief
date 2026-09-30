import { createLazyFileRoute } from '@tanstack/react-router';
import { AdminDeletedJobsPage } from '@/features/admin/ui/deleted-jobs-page';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PermissionLevel } from '@/types/permissions';
import { MotionDiv } from '@/components/ui/motion';
import { fadeInUp } from '@/lib/motion';

export const Route = createLazyFileRoute('/_layout/admin/deleted-jobs/')({
  component: AdminDeletedJobsRoute,
});

function AdminDeletedJobsRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.ADMIN}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <AdminDeletedJobsPage />
      </MotionDiv>
    </PermissionGuard>
  );
}
