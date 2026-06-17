import { createFileRoute } from "@tanstack/react-router";
import { RecordingDetailsPage } from "@/features/recordings/ui/RecordingDetails/RecordingDetailsPage";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionLevel } from "@/types/permissions";

export const Route = createFileRoute("/_layout/audio-recordings/$id")({
  component: RecordingDetailsComponent,
});

function RecordingDetailsComponent() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <RecordingDetailsPage />
    </PermissionGuard>
  );
}
