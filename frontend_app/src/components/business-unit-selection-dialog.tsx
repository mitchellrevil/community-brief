import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  selfAssignToBusinessUnits,
} from "@/shared/data/business-units/api";
import { useInfiniteBusinessUnits } from "@/hooks/useInfiniteBusinessUnits";
import { useIsMobile } from "@/hooks/useMobile";

interface BusinessUnitSelectionDialogProps {
  open: boolean;
  onComplete: (showTutorial?: boolean) => void;
}

export function BusinessUnitSelectionDialog({
  open,
  onComplete,
}: BusinessUnitSelectionDialogProps) {
  const [selectedUnits, setSelectedUnits] = useState<Array<string>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTutorialChoice, setShowTutorialChoice] = useState(false);
  const { toast } = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Use infinite scroll for business units
  const {
    businessUnits: allUnits,
    isLoading: isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteBusinessUnits(5); // smaller pageSize so 9 items => multiple pages (5 + 4)

  // Filter only business units (not categories/subcategories)
  const businessUnits = allUnits.filter((unit) => unit.is_business_unit);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !scrollContainerRef.current || !open) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        console.debug("BUSD: IntersectionObserver entry", entry.isIntersecting, {
          hasNextPage,
          isFetchingNextPage,
        });
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          console.debug("BUSD: calling fetchNextPage from observer");
          fetchNextPage();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "100px",
        threshold: 0.01,
      }
    );

    observer.observe(sentinelRef.current);
    console.debug("BUSD: observer attached", {
      sentinel: sentinelRef.current,
      root: scrollContainerRef.current,
    });

    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, open]);

  // Fallback: attach scroll listener to load more when user scrolls near bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !open) return;

    let timer: number | null = null;
    let localLoading = false;
    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        console.debug("BUSD: scroll event", {
          scrollTop: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          hasNextPage,
          isFetchingNextPage,
        });
        if (hasNextPage && !isFetchingNextPage && !localLoading) {
          const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
          const threshold = 120; // px before bottom to trigger
          if (remaining <= threshold) {
            localLoading = true;
            console.debug("BUSD: calling fetchNextPage from scroll handler");
            Promise.resolve(fetchNextPage()).finally(() => {
              localLoading = false;
            });
          }
        }
      }, 150);
    };

    el.addEventListener("scroll", onScroll);

    // If content is too short to allow scrolling but there are more pages, load until filled
    const tryFill = async () => {
      try {
        console.debug("BUSD: tryFill check", {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          hasNextPage,
          isFetchingNextPage,
        });

        // Keep fetching until content is taller than container or no more pages.
        let attempts = 0;
        const maxAttempts = 6; // safety cap to avoid infinite loops
        while (attempts < maxAttempts && hasNextPage && !isFetchingNextPage && el.scrollHeight <= el.clientHeight) {
          attempts += 1;
          console.debug("BUSD: tryFill auto-fetch attempt", { attempt: attempts });
           
          await fetchNextPage();
          // small delay to allow DOM to update
           
          await new Promise((r) => setTimeout(r, 60));
        }

        console.debug("BUSD: tryFill finished", {
          attempts,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          hasNextPage,
        });
      } catch (e) {
        console.debug("BUSD: tryFill error", e);
      }
    };

    // Run tryFill once after render
    tryFill();

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, open, allUnits.length]);

  // Debug mount info
  useEffect(() => {
    console.debug("BUSD: mount state", {
      open,
      unitsCount: allUnits.length,
      hasNextPage,
      isFetchingNextPage,
      sentinel: !!sentinelRef.current,
      scrollContainer: !!scrollContainerRef.current,
    });
  }, [open, allUnits.length, hasNextPage, isFetchingNextPage]);

  const handleToggleUnit = (unitId: string) => {
    setSelectedUnits((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  const handleSubmit = async () => {
    if (selectedUnits.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one business unit.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await selfAssignToBusinessUnits(selectedUnits);
      toast({
        title: "Success",
        description: "Business units assigned successfully.",
      });
      
      if (isMobile) {
        onComplete(false);
      } else {
        setShowTutorialChoice(true);
      }
    } catch (error) {
      console.error("Failed to assign business units:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to assign business units. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tutorial choice step after business unit assignment
  if (showTutorialChoice) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Welcome to Community Brief!</DialogTitle>
            <DialogDescription className="text-base mt-2">
              Would you like a quick tour of the application? We'll guide you through
              each section of the app to help you get started.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 pt-4 space-y-3">
            <Button
              onClick={() => onComplete(true)}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-base font-semibold"
              size="lg"
            >
              Continue with tutorial
            </Button>
            <Button
              variant="outline"
              onClick={() => onComplete(false)}
              className="w-full py-6 text-base"
              size="lg"
            >
              Continue without tutorial
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Business Units</DialogTitle>
          <DialogDescription>
            You haven't been assigned to any business units yet. Please select the business
            units you belong to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div ref={scrollContainerRef} className="space-y-3 max-h-64 overflow-y-auto">
            {isFetching ? (
              <div className="flex justify-center py-8">
                <div className="text-muted-foreground">Loading business units...</div>
              </div>
            ) : businessUnits.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="text-muted-foreground text-sm">No business units available</div>
              </div>
            ) : (
              businessUnits.map((unit) => (
                <div key={unit.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`unit-${unit.id}`}
                    checked={selectedUnits.includes(unit.id)}
                    onCheckedChange={() => handleToggleUnit(unit.id)}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor={`unit-${unit.id}`}
                    className="font-normal cursor-pointer flex-1"
                  >
                    {unit.name}
                  </Label>
                </div>
              ))
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {/* Loading indicator */}
            {isFetchingNextPage && (
              <div className="flex justify-center items-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                <span className="text-xs text-muted-foreground">Loading more...</span>
              </div>
            )}

            {/* Manual load-more for debugging */}
            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center py-2">
                <button
                  className="text-sm text-primary underline"
                  onClick={() => {
                    console.debug('BUSD: manual load more clicked');
                    fetchNextPage();
                  }}
                >
                  Load more (debug)
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isFetching || selectedUnits.length === 0 || businessUnits.length === 0}
          >
            {isSubmitting ? "Assigning..." : "Assign Business Units"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


