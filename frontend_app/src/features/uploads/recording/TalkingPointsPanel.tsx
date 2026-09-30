import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";

import { MarkdownRenderer } from "./MarkdownRenderer";
import type { TalkingPointField } from "./talkingPointNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TalkingPointsPanelProps {
  talkingPoints: Array<TalkingPointField>;
  currentIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function TalkingPointsPanel({
  talkingPoints,
  currentIndex,
  onPrevious,
  onNext,
}: TalkingPointsPanelProps) {
  if (talkingPoints.length === 0) {
    return (
      <Card className="bg-card flex min-h-[300px] flex-col rounded-none border-x-0 border-b-0 shadow-none lg:block lg:min-h-0 lg:rounded-xl lg:border lg:shadow-sm">
        <CardHeader className="px-0 py-5 lg:hidden">
          <CardTitle className="text-xl">Talking points</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center lg:min-h-0 lg:p-5">
          <MessageSquare className="mx-auto mb-3 h-7 w-7 opacity-50" />
          <p className="max-w-xs text-sm leading-6">
            No talking points available for this meeting type.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeTalkingPoint = talkingPoints[currentIndex];

  return (
    <Card className="bg-card flex min-h-[360px] flex-col rounded-none border-x-0 border-b-0 shadow-none lg:h-[560px] lg:max-h-[calc(100vh-10rem)] lg:min-h-0 lg:rounded-xl lg:border lg:shadow-sm">
      <CardHeader className="px-0 py-5 lg:border-b lg:px-5 lg:py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl lg:text-base">
            <MessageSquare className="hidden h-4 w-4 lg:block" />
            Talking points
          </CardTitle>
          <Badge
            variant="secondary"
            className="text-muted-foreground lg:bg-secondary bg-transparent px-0 text-sm font-normal shadow-none lg:px-2.5 lg:text-xs lg:font-medium"
          >
            {currentIndex + 1}
            <span className="px-1 lg:hidden">of</span>
            <span className="hidden lg:inline"> / </span>
            {talkingPoints.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-0 pt-2 pb-6 lg:space-y-4 lg:px-5 lg:py-5">
          <div className="flex items-start gap-4 lg:block">
            <span className="bg-muted text-foreground flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold lg:hidden">
              {currentIndex + 1}
            </span>
            <div className="min-w-0 space-y-4">
              <h3 className="text-lg leading-7 font-semibold lg:text-base">
                {activeTalkingPoint.name || `Point ${currentIndex + 1}`}
              </h3>
              <div className="prose prose-sm text-foreground/75 dark:prose-invert max-w-none text-[15px] leading-7 lg:text-sm lg:leading-6 [&_li]:my-1.5 [&_ul]:pl-5">
                {activeTalkingPoint.type === "markdown" ? (
                  <MarkdownRenderer content={activeTalkingPoint.value ?? ""} />
                ) : (
                  activeTalkingPoint.value
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card flex shrink-0 items-center justify-between gap-3 border-t px-0 py-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={onPrevious}
              disabled={currentIndex === 0}
              aria-label="Previous talking point"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-muted-foreground text-sm font-medium">
              Previous
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Next</span>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={onNext}
              disabled={currentIndex === talkingPoints.length - 1}
              aria-label="Next talking point"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="bg-card sticky bottom-0 hidden shrink-0 items-center justify-between gap-3 border-t px-5 py-4 lg:flex">
          <Button
            variant="outline"
            size="sm"
            className="h-10 min-w-28 justify-center"
            onClick={onPrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 min-w-28 justify-center"
            onClick={onNext}
            disabled={currentIndex === talkingPoints.length - 1}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
