import { createFileRoute } from "@tanstack/react-router";
import { MotionDiv } from "@/components/ui/motion";
import { TemplateSuggestionPage } from "@/features/users/ui/TemplateSuggestionPage";
import { fadeInUp } from "@/lib/motion";

export const Route = createFileRoute("/_layout/suggest-template/")({
  component: SuggestTemplateRoute,
});

function SuggestTemplateRoute() {
  return (
    <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
      <TemplateSuggestionPage />
    </MotionDiv>
  );
}