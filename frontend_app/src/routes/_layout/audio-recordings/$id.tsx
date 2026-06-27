import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { RecordingDetailsPage } from "@/features/recordings/ui/RecordingDetails/RecordingDetailsPage";
import { PermissionLevel } from "@/types/permissions";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_layout/audio-recordings/$id")({
  component: RecordingDetailsComponent,
  validateSearch: z.object({
    from: z.enum(["files", "shared", "all-files"]).optional().default("files"),
  }),
});

function RecordingDetailsComponent() {
  const { from } = Route.useSearch();
  const backTo =
    from === "shared"
      ? "/audio-recordings/shared"
      : from === "all-files"
        ? "/admin/all-jobs"
        : "/audio-recordings";

  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <RecordingDetailsPage backTo={backTo} />
    </PermissionGuard>
  );
}
