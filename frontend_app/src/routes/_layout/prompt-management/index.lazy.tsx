import { createLazyFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { MotionDiv } from "@/components/ui/motion";
import { PromptManagementPage } from "@/features/prompt-management/pages/PromptManagementPage";
import { fadeInUp } from "@/lib/motion";
import { PermissionLevel } from "@/types/permissions";

export const Route = createLazyFileRoute("/_layout/prompt-management/")({
  component: PromptManagementRoute,
});

function PromptManagementRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.EDITOR}>
      <MotionDiv
        className="h-full flex-1"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <PromptManagementPage />
      </MotionDiv>
    </PermissionGuard>
  );
}
