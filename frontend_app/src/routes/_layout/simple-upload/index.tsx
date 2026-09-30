import { createFileRoute } from '@tanstack/react-router'
import { SimpleUploadPage } from '@/features/uploads/recording/ui/SimpleUploadPage'
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionLevel } from "@/types/permissions";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute('/_layout/simple-upload/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <SimpleUploadPage />
      </MotionDiv>
    </PermissionGuard>
  );
}
