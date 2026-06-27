import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { MotionDiv } from "@/components/ui/motion";
import { UserDetails } from "@/features/users/ui/user-details/UserDetails";
import { fadeInUp } from "@/lib/motion";
import { PermissionLevel } from "@/types/permissions";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/admin/users/$userId")({
  component: UserDetailsPageRoute,
});

function UserDetailsPageRoute() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.ADMIN}>
      <MotionDiv
        className="bg-background min-h-screen"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <UserDetails />
      </MotionDiv>
    </PermissionGuard>
  );
}
