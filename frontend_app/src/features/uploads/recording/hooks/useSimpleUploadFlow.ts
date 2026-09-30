import { useCallback, useEffect, useRef, useState } from "react";
import type { PromptTemplate } from "@/shared/data/templates";

import type { SimpleUploadSelection, SimpleUploadStep } from "../types";

const EMPTY_SELECTION: SimpleUploadSelection = {
  categoryId: "",
  subcategoryId: "",
  categoryName: "",
  subcategoryName: "",
  subcategoryDetails: null,
  preSessionData: {},
};

const TRANSITION_MS = 200;

export function useSimpleUploadFlow() {
  const [currentStep, setCurrentStep] =
    useState<SimpleUploadStep>("category-selection");
  const [selection, setSelection] =
    useState<SimpleUploadSelection>(EMPTY_SELECTION);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transition = useCallback((update: () => void) => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    setIsTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      update();
      setIsTransitioning(false);
      transitionTimerRef.current = null;
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const completeSelection = useCallback(
    (
      categoryId: string,
      subcategoryId: string,
      categoryName: string,
      subcategoryName: string,
      preSessionData: Record<string, any>,
      subcategoryDetails?: PromptTemplate,
    ) => {
      transition(() => {
        setSelection({
          categoryId,
          subcategoryId,
          categoryName,
          subcategoryName,
          subcategoryDetails: subcategoryDetails ?? null,
          preSessionData,
        });
        setCurrentStep("recording");
      });
    },
    [transition],
  );

  const backToSelection = useCallback(() => {
    transition(() => {
      setCurrentStep("category-selection");
      setSelection((current) => ({
        ...current,
        subcategoryDetails: null,
        preSessionData: {},
      }));
    });
  }, [transition]);

  const reset = useCallback(() => {
    transition(() => {
      setSelection(EMPTY_SELECTION);
      setCurrentStep("category-selection");
    });
  }, [transition]);

  return {
    currentStep,
    selection,
    isTransitioning,
    completeSelection,
    backToSelection,
    reset,
  };
}
