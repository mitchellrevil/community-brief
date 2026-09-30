import { createFileRoute } from "@tanstack/react-router";
import { SharedJobsPage } from "@/features/recordings/ui/SharedJobsPage";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionLevel } from "@/types/permissions";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute("/_layout/audio-recordings/shared/")({
  component: SharedRecordingsRoute,
});

function SharedRecordingsRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <SharedJobsPage />
      </MotionDiv>
    </PermissionGuard>
  );
}
