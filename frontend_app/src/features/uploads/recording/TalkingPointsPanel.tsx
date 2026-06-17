import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';

import { MarkdownRenderer } from './MarkdownRenderer';
import type { TalkingPointField } from './talkingPointNavigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


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
      <Card className="border-none bg-muted/30">
        <CardContent className="p-6 text-center text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No talking points available for this meeting type.</p>
        </CardContent>
      </Card>
    );
  }

  const activeTalkingPoint = talkingPoints[currentIndex];

  return (
    <Card className="flex h-full flex-col border-none bg-card/50 shadow-md backdrop-blur-sm">
      <CardHeader className="border-b pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Talking Points
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {currentIndex + 1} / {talkingPoints.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-6">
        <div className="flex-1 space-y-4">
          <h3 className="text-lg font-semibold">
            {activeTalkingPoint.name || `Point ${currentIndex + 1}`}
          </h3>
          <div className="prose prose-sm max-w-none text-sm leading-relaxed text-muted-foreground dark:prose-invert">
            {activeTalkingPoint.type === 'markdown' ? (
              <MarkdownRenderer content={activeTalkingPoint.value ?? ''} />
            ) : (
              activeTalkingPoint.value
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-6">
          <Button variant="outline" size="sm" onClick={onPrevious} disabled={currentIndex === 0}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
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
