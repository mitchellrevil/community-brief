import { createFileRoute } from "@tanstack/react-router";
import { MediaUploadHeader } from "@/features/uploads/media/header";
import { MediaUploadForm } from "@/features/uploads/media/upload-form";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionLevel } from "@/types/permissions";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute("/_layout/audio-upload/")({
  component: MediaUploadPage,
});

function MediaUploadPage() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.USER}>
      <MotionDiv
        className="w-full max-w-full"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <MediaUploadHeader />
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 md:space-y-8">
          <MediaUploadForm />
        </div>
      </MotionDiv>
    </PermissionGuard>
  );
}
