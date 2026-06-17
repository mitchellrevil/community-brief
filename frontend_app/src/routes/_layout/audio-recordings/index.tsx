import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { AudioListValues } from "@/shared/schema/audio-list.schema";
import { AudioRecordingsPage } from "@/features/recordings/ui/AudioRecordingsPage";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionLevel } from "@/types/permissions";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

const audioRecordingsSearchSchema = z.object({
  page: z.number().min(1).optional().default(1),
  per_page: z.number().min(1).max(100).optional().default(12),
  search: z.string().optional(),
  status: z.enum(["all", "uploaded", "processing", "completed", "failed"]).optional().default("all"),
  created_at: z.string().optional(),
  created_at_start: z.string().optional(),
  created_at_end: z.string().optional(),
});

export const Route = createFileRoute("/_layout/audio-recordings/")({
  component: AudioRecordingsIndexComponent,
  validateSearch: audioRecordingsSearchSchema,
});

function AudioRecordingsIndexComponent() {
  const { page, per_page, search, status, created_at, created_at_start, created_at_end } = Route.useSearch();

  const initialFilters: AudioListValues & { page: number; per_page: number } = {
    search: search || "",
    status,
    created_at,
    created_at_start,
    created_at_end,
    page,
    per_page,
  };

  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <AudioRecordingsPage initialFilters={initialFilters} />
      </MotionDiv>
    </PermissionGuard>
  );
}
