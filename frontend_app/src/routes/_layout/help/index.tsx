import { createFileRoute, redirect } from "@tanstack/react-router";
import { MotionDiv } from "@/components/ui/motion";
import { isHelpPageEnabled } from "@/config/features";
import { HelpPage } from "@/features/help/ui/HelpPage";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute("/_layout/help/")({
  beforeLoad: () => {
    if (!isHelpPageEnabled) {
      throw redirect({ to: "/simple-upload" });
    }
  },
  component: HelpRoute,
});

function HelpRoute() {
  return (
    <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
      <HelpPage />
    </MotionDiv>
  );
}
