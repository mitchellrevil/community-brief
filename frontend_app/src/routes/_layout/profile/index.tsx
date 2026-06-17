import { createFileRoute } from "@tanstack/react-router";
import { UserProfile } from "@/components/user-profile/user-profile";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute("/_layout/profile/")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
      <UserProfile />
    </MotionDiv>
  );
}
