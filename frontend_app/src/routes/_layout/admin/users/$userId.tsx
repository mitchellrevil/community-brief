import { createFileRoute } from "@tanstack/react-router";
import { UserDetailsV2 } from "@/features/users/ui/user-details/UserDetailsV2";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionLevel } from "@/types/permissions";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute("/_layout/admin/users/$userId")({
  component: UserDetailsPageRoute,
});

function UserDetailsPageRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.ADMIN}>
      <MotionDiv
        className="min-h-screen bg-background"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <UserDetailsV2 />
      </MotionDiv>
    </PermissionGuard>
  );
}
