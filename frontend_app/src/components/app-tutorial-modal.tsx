import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TUTORIAL_STEPS, useTutorial } from "@/app/contexts/tutorial-context";
import { useIsMobile } from "@/hooks/useMobile";

interface AppTutorialModalProps {
  open: boolean;
  onComplete: () => void;
}

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: "left" | "top" | "right" | "bottom";
}

export function AppTutorialModal({ open, onComplete }: AppTutorialModalProps) {
  const [spotlightPos, setSpotlightPos] = useState<SpotlightPosition | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [elementFound, setElementFound] = useState(false);
  const positionRef = useRef<{ spotlight: SpotlightPosition | null; tooltip: TooltipPosition | null }>({ 
    spotlight: null, 
    tooltip: null 
  });
  const retryCountRef = useRef(0);
  const maxRetries = 30; // Try for up to 3 seconds (30 * 100ms)
  
  const navigate = useNavigate();
  const location = useLocation();
  const { tutorialState, nextStep, endTutorial, getCurrentStepInfo } = useTutorial();
  const isMobile = useIsMobile();
  
  const step = getCurrentStepInfo();

  // Handle tutorial completion
  const handleComplete = useCallback(() => {
    endTutorial();
    onComplete();
  }, [endTutorial, onComplete]);

  // Handle Escape key to skip tutorial
  useEffect(() => {
    if (!open || isMobile) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleComplete();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, isMobile, handleComplete]);

  // End tutorial if on mobile
  useEffect(() => {
    if (open && isMobile) {
      handleComplete();
    }
  }, [open, isMobile, handleComplete]);

  // Navigate to step's route if needed
  useEffect(() => {
    if (!open || !step?.route) return;
    
    const currentPath = location.pathname;
    const targetRoute = step.route;
    
    // Check if we need to navigate
    if (currentPath !== targetRoute) {
      setIsNavigating(true);
      setElementFound(false);
      retryCountRef.current = 0;
      
      navigate({ to: targetRoute as any }).then(() => {
        // Give the page time to render
        setTimeout(() => {
          setIsNavigating(false);
        }, 300);
      });
    }
  }, [open, step?.route, step?.id, location.pathname, navigate]);

  // Helper to find the best matching/visible element for a selector
  const findBestElement = useCallback((sel: string): Element | null => {
    try {
      const all = Array.from(document.querySelectorAll(sel));
      if (all.length === 0) return null;

      // Filter out elements not rendered/visible
      const visible = all.filter((el) => {
        const rects = el.getClientRects();
        if (rects.length === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        if ((el as HTMLElement).offsetParent === null && style.position !== "fixed") return false;
        return true;
      });

      // Prefer the visible elements; otherwise fall back to first match
      const candidates = visible.length ? visible : all;

      // Score candidates by visible area (w*h) and choose the largest
      let best: Element | null = null;
      let bestArea = 0;
      for (const c of candidates) {
        const r = c.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area > bestArea) {
          bestArea = area;
          best = c;
        }
      }

      return best || candidates[0] || null;
    } catch (err) {
      return document.querySelector(sel);
    }
  }, []);

  // Find and highlight element
  const updatePositions = useCallback(() => {
    if (!open || isNavigating) return;

    const selector = step?.selector;
    if (!selector) {
      setElementFound(true);
      return;
    }

    // Find the element to highlight. Use a helper strategy to pick a visible
    // / best candidate when there are multiple matching elements (e.g., mobile
    // + desktop anchors for the same href).
    let element: Element | null = null;
    // If selector looks like a sidebar link, try to find the best candidate
    // (desktop vs mobile anchors or extra wrappers) and prefer visible items.
    element = findBestElement(selector);

    if (element) {
      setElementFound(true);
      retryCountRef.current = 0;
      
      const rect = element.getBoundingClientRect();
      const padding = 8;

      const newSpotlight: SpotlightPosition = {
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      };

      // Position tooltip
      const tooltipWidth = 360;
      const tooltipHeight = 240;
      const gap = 24;

      let newTooltipPos: TooltipPosition;

      // Check if there's room to the right
      if (rect.right + gap + tooltipWidth < window.innerWidth) {
        newTooltipPos = {
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
          left: rect.right + gap,
          arrowPosition: "left",
        };
      } else if (rect.left - gap - tooltipWidth > 0) {
        // Position to the left
        newTooltipPos = {
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
          left: rect.left - gap - tooltipWidth,
          arrowPosition: "right",
        };
      } else if (rect.bottom + gap + tooltipHeight < window.innerHeight) {
        // Position below
        newTooltipPos = {
          top: rect.bottom + gap,
          left: Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2),
          arrowPosition: "top",
        };
      } else {
        // Position above
        newTooltipPos = {
          top: rect.top - gap - tooltipHeight,
          left: Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2),
          arrowPosition: "bottom",
        };
      }

      // Keep tooltip in viewport
      newTooltipPos.top = Math.max(16, Math.min(newTooltipPos.top, window.innerHeight - tooltipHeight - 16));
      newTooltipPos.left = Math.max(16, Math.min(newTooltipPos.left, window.innerWidth - tooltipWidth - 16));

      // Only update if position actually changed significantly (avoid jank)
      const spotlightChanged = !positionRef.current.spotlight || 
        Math.abs(positionRef.current.spotlight.top - newSpotlight.top) > 3 ||
        Math.abs(positionRef.current.spotlight.left - newSpotlight.left) > 3;
      
      if (spotlightChanged) {
        positionRef.current.spotlight = newSpotlight;
        positionRef.current.tooltip = newTooltipPos;
        setSpotlightPos(newSpotlight);
        setTooltipPos(newTooltipPos);
      }
    } else {
      // Element not found - retry if waitForSelector is true
      if (step.waitForSelector && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        return; // Will retry on next interval
      }
      
      // Reset spotlight if element truly not found
      if (positionRef.current.spotlight !== null) {
        positionRef.current.spotlight = null;
        positionRef.current.tooltip = null;
        setSpotlightPos(null);
        setTooltipPos(null);
      }
      setElementFound(false);
    }
  }, [open, step, isNavigating]);

  // Reset when step changes
  useEffect(() => {
    if (!open || !step) return;
    
    // Reset state when step changes
    positionRef.current = { spotlight: null, tooltip: null };
    setSpotlightPos(null);
    setTooltipPos(null);
    setElementFound(false);
    retryCountRef.current = 0;
    
    // Small delay to ensure DOM is ready after navigation
    const timer = setTimeout(updatePositions, 150);
    return () => clearTimeout(timer);
  }, [tutorialState.stepIndex, open, step?.id, updatePositions]);

  // Polling for element positions
  useEffect(() => {
    if (!open || isNavigating) return;

    const handleResize = () => {
      positionRef.current = { spotlight: null, tooltip: null };
      updatePositions();
    };
    
    window.addEventListener("resize", handleResize);

    // Poll more frequently while looking for element, slower once found
    const pollInterval = setInterval(
      updatePositions, 
      elementFound ? 500 : 100
    );

    return () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(pollInterval);
    };
  }, [open, isNavigating, elementFound, updatePositions]);

  // Handle click on highlighted element for clickToAdvance steps
  useEffect(() => {
    if (!open || !step?.clickToAdvance || !step.selector) return;

    const handleClick = (e: MouseEvent) => {
      const selector = step.selector;
      if (!selector) return;
      
      // Check if the clicked element matches or is within the highlighted element
      const targetElement = findBestElement(selector);
      if (targetElement && (targetElement === e.target || targetElement.contains(e.target as Node))) {
        // Check if this is a tutorial-aware element (they handle step advancement internally)
        const isTutorialAwareElement = targetElement.hasAttribute('data-tutorial') && 
          ['sample-category', 'sample-subcategory', 'continue-button'].includes(targetElement.getAttribute('data-tutorial') || '');
        
        // Tutorial-aware elements call nextStep() in their onClick handlers,
        // so we don't need to do anything here for them
        if (isTutorialAwareElement) {
          return;
        }
        
        // For sidebar links and other elements, handle step advancement
        const nextStepIndex = tutorialState.stepIndex + 1;
        const nextStepInfo = TUTORIAL_STEPS[nextStepIndex];
        
        // If next step needs navigation, wait a bit for the click action to complete
        setTimeout(() => {
          if (nextStepInfo.route && nextStepInfo.route !== window.location.pathname) {
            setIsNavigating(true);
            // Wait for the click-triggered navigation to settle
            setTimeout(() => {
              setIsNavigating(false);
              nextStep();
            }, 400);
          } else {
            nextStep();
          }
        }, 100);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [open, step?.clickToAdvance, step?.selector, tutorialState.stepIndex, nextStep]);

  const handleNext = () => {
    if (tutorialState.stepIndex >= TUTORIAL_STEPS.length - 1) {
      handleComplete();
      return;
    }
    
    // Get current and next step info
    const currentStepInfo = step;
    const nextStepIndex = tutorialState.stepIndex + 1;
    const nextStepInfo = TUTORIAL_STEPS[nextStepIndex];
    
    // If current step is clickToAdvance, try to trigger the click action
    // The element's onClick handler will call nextStep() if it's a tutorial-aware element
    // For sidebar links, we just click and the click handler advances the step
    if (currentStepInfo?.clickToAdvance && currentStepInfo.selector) {
      const element = findBestElement(currentStepInfo.selector);
      if (element instanceof HTMLElement) {
        // For tutorial-aware elements (sample-category, sample-subcategory, continue-button),
        // clicking them will advance the step automatically
        // For regular elements (sidebar links), we need to advance after clicking
        const isTutorialAwareElement = element.hasAttribute('data-tutorial') && 
          ['sample-category', 'sample-subcategory', 'continue-button'].includes(element.getAttribute('data-tutorial') || '');
        
        element.click();
        
        // For sidebar links and other non-tutorial-aware elements, 
        // handle the navigation and step advancement ourselves
        if (!isTutorialAwareElement) {
          // If next step needs navigation, wait for it
          if (nextStepInfo.route && nextStepInfo.route !== location.pathname) {
            setIsNavigating(true);
            // Wait for navigation triggered by the click
            setTimeout(() => {
              setIsNavigating(false);
              nextStep();
            }, 400);
          } else {
            nextStep();
          }
        }
        // If it's a tutorial-aware element, it will call nextStep() itself
        return;
      }
    }
    
    // For non-clickToAdvance steps, just advance
    // If next step needs navigation, do it
    if (nextStepInfo.route && nextStepInfo.route !== location.pathname) {
      setIsNavigating(true);
      navigate({ to: nextStepInfo.route as any }).then(() => {
        setTimeout(() => {
          setIsNavigating(false);
          nextStep();
        }, 300);
      });
    } else {
      nextStep();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!open || !step || isMobile) return null;

  // Show loading state while navigating
  if (isNavigating) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center">
        <div className="bg-background rounded-xl p-6 shadow-2xl text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description">
      {/* SVG mask for spotlight effect - creates a bright hole in the overlay */}
      {/* pointer-events: none on the SVG so clicks pass through to the spotlight area */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="spotlight-mask">
            {/* White = visible (dark overlay), Black = hidden (spotlight hole) */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlightPos && (
              <rect
                x={spotlightPos.left}
                y={spotlightPos.top}
                width={spotlightPos.width}
                height={spotlightPos.height}
                rx="12"
                ry="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Dark overlay with spotlight cutout */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.85)"
          mask="url(#spotlight-mask)"
        />
      </svg>
      
      {/* Invisible clickable overlay areas around the spotlight to block unwanted clicks */}
      {spotlightPos && (
        <>
          {/* Top area */}
          <div 
            className="absolute left-0 right-0 top-0 pointer-events-auto" 
            style={{ height: Math.max(0, spotlightPos.top) }}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Bottom area */}
          <div 
            className="absolute left-0 right-0 bottom-0 pointer-events-auto" 
            style={{ top: spotlightPos.top + spotlightPos.height }}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Left area */}
          <div 
            className="absolute left-0 pointer-events-auto" 
            style={{ 
              top: spotlightPos.top, 
              width: Math.max(0, spotlightPos.left),
              height: spotlightPos.height 
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Right area */}
          <div 
            className="absolute right-0 pointer-events-auto" 
            style={{ 
              top: spotlightPos.top, 
              left: spotlightPos.left + spotlightPos.width,
              height: spotlightPos.height 
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
      
      {/* When no spotlight, block all clicks */}
      {!spotlightPos && (
        <div className="absolute inset-0 pointer-events-auto" onClick={(e) => e.stopPropagation()} />
      )}

      {/* Highlight border around spotlight */}
      {spotlightPos && (
        <div
          className="absolute rounded-xl pointer-events-none animate-pulse"
          style={{
            top: spotlightPos.top,
            left: spotlightPos.left,
            width: spotlightPos.width,
            height: spotlightPos.height,
            border: "3px solid hsl(var(--primary))",
            boxShadow: "0 0 40px 15px hsl(var(--primary) / 0.5), inset 0 0 25px hsl(var(--primary) / 0.15)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className={cn(
          "absolute bg-background border-2 border-primary/40 rounded-xl shadow-2xl p-6 pointer-events-auto",
          "transition-all duration-300 ease-out",
          !tooltipPos && "opacity-0"
        )}
        style={{
          top: tooltipPos?.top ?? window.innerHeight / 2 - 120,
          left: tooltipPos?.left ?? window.innerWidth / 2 - 180,
          width: 360,
        }}
      >
        {/* Arrow - only show if we have valid position */}
        {tooltipPos && (
          <div
            className={cn(
              "absolute w-4 h-4 bg-background rotate-45",
              tooltipPos.arrowPosition === "left" && "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 border-l-2 border-b-2 border-primary/40",
              tooltipPos.arrowPosition === "top" && "top-0 left-10 -translate-y-1/2 border-l-2 border-t-2 border-primary/40",
              tooltipPos.arrowPosition === "right" && "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 border-r-2 border-t-2 border-primary/40",
              tooltipPos.arrowPosition === "bottom" && "bottom-0 left-10 translate-y-1/2 border-r-2 border-b-2 border-primary/40",
            )}
          />
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4" aria-label={`Tutorial step ${tutorialState.stepIndex + 1} of ${TUTORIAL_STEPS.length}`}>
          <div className="flex gap-1.5">
            {TUTORIAL_STEPS.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === tutorialState.stepIndex
                    ? "bg-primary w-6"
                    : index < tutorialState.stepIndex
                    ? "bg-primary/50 w-2"
                    : "bg-muted w-2"
                )}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {tutorialState.stepIndex + 1} of {TUTORIAL_STEPS.length}
          </span>
        </div>

        {/* Content */}
        <h3 id="tutorial-title" className="text-xl font-bold mb-3">{step.title}</h3>
        <p id="tutorial-description" className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {step.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground text-xs"
            aria-label="Skip tutorial tour"
          >
            Skip tour
          </Button>
          <Button onClick={handleNext} size="sm" className="gap-1.5" aria-label={tutorialState.stepIndex === TUTORIAL_STEPS.length - 1 ? "Finish tutorial and get started" : "Go to next tutorial step"}>
            {tutorialState.stepIndex === TUTORIAL_STEPS.length - 1 ? (
              <>
                Get Started
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
