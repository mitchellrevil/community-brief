import { createLazyFileRoute } from '@tanstack/react-router';
import { UserManagementDashboard } from '@/features/users/ui/UserManagementDashboard';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PermissionLevel } from '@/types/permissions';
import { MotionDiv } from '@/components/ui/motion';
import { fadeInUp } from '@/lib/motion';

export const Route = createLazyFileRoute('/_layout/admin/user-management/')({
  component: AdminUserManagementPage,
});

function AdminUserManagementPage() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.ADMIN}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <UserManagementDashboard />
      </MotionDiv>
    </PermissionGuard>
  );
}
