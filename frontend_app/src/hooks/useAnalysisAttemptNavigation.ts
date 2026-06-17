import { useEffect, useMemo, useRef, useState } from 'react';

import {
  
  normalizeAnalysisAttempts
} from '../components/lazy/documentViewerAttempts';
import type {AnalysisAttempt} from '../components/lazy/documentViewerAttempts';

interface UseAnalysisAttemptNavigationParams {
  analysisAttempts?: Array<AnalysisAttempt>;
  analysisFilePath?: string;
}

export function useAnalysisAttemptNavigation({
  analysisAttempts,
  analysisFilePath,
}: UseAnalysisAttemptNavigationParams) {
  const normalizedAttempts = useMemo(
    () => normalizeAnalysisAttempts(analysisAttempts),
    [analysisAttempts],
  );

  const [attemptIndex, setAttemptIndex] = useState(0);
  const hasInitializedAttemptRef = useRef(false);

  useEffect(() => {
    const latest = normalizedAttempts.length - 1;
    if (!hasInitializedAttemptRef.current) {
      hasInitializedAttemptRef.current = true;
      setAttemptIndex(latest);
      return;
    }

    setAttemptIndex((previousIndex) => {
      if (previousIndex < 0) return 0;
      if (previousIndex > latest) return latest;
      return previousIndex;
    });
  }, [normalizedAttempts.length]);

  const activeAttempt = normalizedAttempts.length > 0 ? normalizedAttempts[attemptIndex] : undefined;
  const activeAnalysisFilePath = activeAttempt?.analysis_file_path || analysisFilePath;
  const activeAttemptNumber = activeAttempt?.attempt ?? attemptIndex + 1;
  const totalAttempts = Math.max(normalizedAttempts.length, 1);

  const shouldUseProvidedText =
    normalizedAttempts.length === 0 || attemptIndex === normalizedAttempts.length - 1;

  return {
    activeAnalysisFilePath,
    activeAttemptNumber,
    attemptIndex,
    normalizedAttempts,
    setAttemptIndex,
    shouldUseProvidedText,
    totalAttempts,
  };
}
