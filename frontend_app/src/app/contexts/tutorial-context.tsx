import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CategoryResponse, SubcategoryResponse } from "@/features/prompt-management/data/api";

// Sample data for tutorial mode
export const TUTORIAL_SAMPLE_CATEGORY: CategoryResponse = {
  id: "tutorial-category-1",
  name: "Children's Services",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const TUTORIAL_SAMPLE_SUBCATEGORY: SubcategoryResponse = {
  id: "tutorial-subcategory-1",
  name: "Team Meeting Notes",
  category_id: "tutorial-category-1",
  prompts: {},
  created_at: Date.now(),
  updated_at: Date.now(),
};

export const TUTORIAL_SAMPLE_JOB = {
  id: "tutorial-job-1",
  display_name: "Sample Team Meeting Recording",
  displayname: "Sample Team Meeting Recording",
  file_name: "team-meeting-2024-01-15.mp3",
  filename: "team-meeting-2024-01-15.mp3",
  file_path: "",
  status: "completed" as const,
  created_at: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
  user_id: "tutorial-user",
  category_name: "Children's Services",
  subcategory_name: "Team Meeting Notes",
  _isTutorialSample: true,
};

export type TutorialStepId = 
  | "sidebar-record"
  | "progress-stepper"
  | "category-selection"
  | "subcategory-selection"
  | "details-continue"
  | "record-button"
  | "sidebar-my-files"
  | "recordings-list"
  | "complete";

interface TutorialState {
  isActive: boolean;
  currentStep: TutorialStepId;
  stepIndex: number;
}

interface TutorialContextValue {
  tutorialState: TutorialState;
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  setStep: (step: TutorialStepId) => void;
  isTutorialMode: boolean;
  getCurrentStepInfo: () => TutorialStepInfo | null;
}

export interface TutorialStepInfo {
  id: TutorialStepId;
  title: string;
  description: string;
  selector?: string;
  route?: string;
  waitForSelector?: boolean;
  clickToAdvance?: boolean; // If true, user must click the highlighted element to proceed
  autoAdvanceOnMount?: boolean; // Auto advance when element is found
}

export const TUTORIAL_STEPS: Array<TutorialStepInfo> = [
  // Step 1: Highlight sidebar Record & Upload, navigate to page
  {
    id: "sidebar-record",
    title: "Record & Upload",
    description: "Let's start by clicking 'Record & Upload' in the sidebar. This is where you'll record new audio or upload files.",
    selector: 'a[href="/simple-upload"]',
    route: undefined, // We're on the page already after business unit
    clickToAdvance: true,
  },
  // Step 2: Highlight the progress stepper
  {
    id: "progress-stepper",
    title: "Recording Steps",
    description: "This progress bar shows you the 3 steps to start a recording: Select your Service Area, choose a Meeting Type, and fill in Details.",
    selector: '[data-tutorial="progress-stepper"]',
    route: "/simple-upload",
    waitForSelector: true,
  },
  // Step 3: Highlight a sample category to click
  {
    id: "category-selection",
    title: "Select a Service Area",
    description: "Click on a Service Area (Directorate) that matches your recording. For this tutorial, click on the highlighted sample area.",
    selector: '[data-tutorial="sample-category"]',
    route: "/simple-upload",
    waitForSelector: true,
    clickToAdvance: true,
  },
  // Step 4: Highlight a sample subcategory
  {
    id: "subcategory-selection",
    title: "Select a Meeting Type",
    description: "Now select the type of meeting or session you're recording. Click on the highlighted meeting type.",
    selector: '[data-tutorial="sample-subcategory"]',
    route: "/simple-upload",
    waitForSelector: true,
    clickToAdvance: true,
  },
  // Step 5: Highlight the Continue button
  {
    id: "details-continue",
    title: "Continue to Recording",
    description: "After filling in any required details, click Continue to proceed to the recording interface.",
    selector: '[data-tutorial="continue-button"]',
    route: "/simple-upload",
    waitForSelector: true,
    clickToAdvance: true,
  },
  // Step 6: Highlight the Record button
  {
    id: "record-button",
    title: "Start Recording",
    description: "Click the big red Record button to start capturing audio. You can pause, resume, and stop when you're done.",
    selector: '[data-tutorial="record-button"]',
    route: "/simple-upload",
    waitForSelector: true,
  },
  // Step 7: Highlight My Files in sidebar
  {
    id: "sidebar-my-files",
    title: "My Files",
    description: "All your recordings are saved in 'My Files'. Click here to view your uploaded recordings and transcriptions.",
    selector: 'a[href="/audio-recordings"]',
    clickToAdvance: true,
  },
  // Step 8: Show recordings list with sample
  {
    id: "recordings-list",
    title: "Your Recordings",
    description: "Here you can see all your recordings. You can play audio, view transcriptions, share with colleagues, and manage your files.",
    selector: '[data-tutorial="recordings-list"]',
    route: "/audio-recordings",
    waitForSelector: true,
  },
];

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [tutorialState, setTutorialState] = useState<TutorialState>({
    isActive: false,
    currentStep: "sidebar-record",
    stepIndex: 0,
  });

  const startTutorial = useCallback(() => {
    setTutorialState({
      isActive: true,
      currentStep: "sidebar-record",
      stepIndex: 0,
    });
  }, []);

  const endTutorial = useCallback(() => {
    setTutorialState({
      isActive: false,
      currentStep: "sidebar-record",
      stepIndex: 0,
    });
  }, []);

  const nextStep = useCallback(() => {
    setTutorialState((prev) => {
      const nextIndex = prev.stepIndex + 1;
      if (nextIndex >= TUTORIAL_STEPS.length) {
        return { isActive: false, currentStep: "complete", stepIndex: 0 };
      }
      return {
        ...prev,
        stepIndex: nextIndex,
        currentStep: TUTORIAL_STEPS[nextIndex].id,
      };
    });
  }, []);

  const setStep = useCallback((step: TutorialStepId) => {
    const stepIndex = TUTORIAL_STEPS.findIndex((s) => s.id === step);
    if (stepIndex !== -1) {
      setTutorialState((prev) => ({
        ...prev,
        stepIndex,
        currentStep: step,
      }));
    }
  }, []);

  const getCurrentStepInfo = useCallback(() => {
    if (!tutorialState.isActive) return null;
    return TUTORIAL_STEPS[tutorialState.stepIndex] || null;
  }, [tutorialState]);

  const contextValue = useMemo(() => ({
    tutorialState,
    startTutorial,
    endTutorial,
    nextStep,
    setStep,
    isTutorialMode: tutorialState.isActive,
    getCurrentStepInfo,
  }), [tutorialState, startTutorial, endTutorial, nextStep, setStep, getCurrentStepInfo]);

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error("useTutorial must be used within a TutorialProvider");
  }
  return context;
}

// Optional hook for checking if in tutorial mode without throwing
export function useTutorialOptional() {
  return useContext(TutorialContext);
}

