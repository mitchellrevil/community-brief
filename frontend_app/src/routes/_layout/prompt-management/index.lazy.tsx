import { createLazyFileRoute } from '@tanstack/react-router';
import { PromptManagementPage } from '@/features/prompt-management/pages/PromptManagementPage';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PermissionLevel } from '@/types/permissions';
import { MotionDiv } from '@/components/ui/motion';
import { fadeInUp } from '@/lib/motion';

export const Route = createLazyFileRoute('/_layout/prompt-management/')({
  component: PromptManagementRoute,
});

function PromptManagementRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <MotionDiv
        className="flex-1 h-full"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <PromptManagementPage />
      </MotionDiv>
    </PermissionGuard>
  );
}
