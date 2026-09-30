import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Edit3,
  FileAudio,
  Info,
  Loader2,
  Mic,
  MonitorUp,
  Pause,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { createRecordingCapture } from "./audio-capture";
import { useRecordingNavigationGuard } from "./hooks/useRecordingNavigationGuard";
import { useRecordingAudioAlerts } from "./hooks/useRecordingAudioAlerts";
import {
  flattenTalkingPoints,
  getNextTalkingPointIndex,
  getPreviousTalkingPointIndex,
} from "./talkingPointNavigation";
import { TalkingPointsPanel } from "./TalkingPointsPanel";
import { RecordingAlertBanner } from "./ui/RecordingAlertBanner";
import { RecordingControls } from "./ui/RecordingControls";
import { RecordingLevelIndicator } from "./ui/RecordingLevelIndicator";
import type { DraftRecording } from "@/lib/draft-storage";
import type { PromptTemplate } from "@/shared/data/templates";
import type {
  AudioUploadMetadata,
  RecordingConsentEvidence,
  RecordingSettings,
} from "@/types/audio-upload";
import type { RecordingCapture, RecordingMode } from "./audio-capture";
import type { TalkingPointSection } from "./talkingPointNavigation";
import { RECORDING_CONSENT_POLICY_VERSION } from "@/types/audio-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DraftRestorationBanner } from "@/components/ui/draft-restoration-banner";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_RECORDING_DISCLAIMER } from "@/config/recordingDisclaimer";
import {
  fetchAudioBlob,
  updateJobDisplayName,
  uploadFile,
} from "@/features/recordings/data/api";
import { PromptMetadataDisclaimer } from "@/features/uploads/shared/PromptMetadataDisclaimer";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import { compressAudioToMP3, getStorageLimits } from "@/lib/audio-compression";
import {
  checkStorageAndWarn,
  cleanupOldDrafts,
  deleteDraftRecording,
  getDraftRecording,
  saveDraftRecording,
} from "@/lib/draft-storage";
import {
  concatenateAudioSegments,
  convertToWavWithFFmpeg,
} from "@/lib/ffmpegConvert";
import { isOnline } from "@/lib/online-status";
import { queueRecording } from "@/lib/pwa-queue";
import { recordingToasts, uploadToasts } from "@/lib/toast-utils";
import { cn } from "@/lib/utils";
import { getTemplate } from "@/shared/data/templates";


// Utility to detect iOS
function isIOS() {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  );
}

const RECORDING_MIME_TYPES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "video/mp4",
  "audio/webm;codecs=opus",
];

function getMediaRecorderOptions(): MediaRecorderOptions {
  const mimeType = RECORDING_MIME_TYPES.find(MediaRecorder.isTypeSupported);
  return mimeType ? { mimeType } : {};
}

interface RecordingInterfaceProps {
  categoryId: string;
  subcategoryId: string;
  categoryName: string;
  subcategoryName: string;
  subcategoryDetails?: PromptTemplate | null;
  preSessionData?: Record<string, any>;
  onBack: () => void;
  onUploadComplete: () => void;
}

export function RecordingInterface(props: RecordingInterfaceProps) {
  const {
    categoryId,
    subcategoryId,
    categoryName,
    subcategoryName,
    subcategoryDetails,
    preSessionData = {},
    onBack,
    onUploadComplete,
  } = props;

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const wakeLockStatus = useScreenWakeLock(isRecording);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [queuedForUpload, setQueuedForUpload] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isPreparingRecording, setIsPreparingRecording] = useState(false);
  const [recordingMode, setRecordingMode] =
    useState<RecordingMode>("microphone");
  const [voiceIsolationEnabled, setVoiceIsolationEnabled] = useState(false);
  const [voiceIsolationApplied, setVoiceIsolationApplied] = useState(false);
  const [systemAudioAvailable, setSystemAudioAvailable] = useState(false);
  const [micMeterStream, setMicMeterStream] = useState<MediaStream | null>(
    null,
  );
  const [systemMeterStream, setSystemMeterStream] =
    useState<MediaStream | null>(null);
  const [pendingRecordingConsentAction, setPendingRecordingConsentAction] =
    useState<"start" | "continue" | null>(null);

  // FFmpeg conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStep, setConversionStep] = useState("");
  // Converted/compressed blob (available for download/fallback)
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);

  // Talking points state
  const [currentTalkingPointIndex, setCurrentTalkingPointIndex] = useState(0);

  // Draft recording state
  const [existingDraft, setExistingDraft] = useState<DraftRecording | null>(
    null,
  );
  const [isRestoringDraft, setIsRestoringDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<{
    loaded: number;
    total: number;
    percentage: number;
  } | null>(null);

  // Refs
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Array<Blob>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const continuationBaseRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingCaptureRef = useRef<RecordingCapture | null>(null);
  const recordingSettingsRef = useRef<Pick<
    RecordingSettings,
    | "capture_mode"
    | "system_audio_requested"
    | "system_audio_captured"
    | "voice_isolation_enabled"
    | "voice_isolation_applied"
    | "mix_strategy"
  > | null>(null);
  // Retained with drafts/queued uploads so reloads and retries preserve the acceptance event.
  const recordingConsentRef = useRef<RecordingConsentEvidence | undefined>(
    undefined,
  );
  const lastSaveTimeRef = useRef<number>(0);
  const periodicSaveInFlightRef = useRef(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const saveSnapshotRef = useRef<() => Promise<void>>(async () => {});
  const isRecordingRef = useRef<boolean>(false);
  const elapsedRecordingMsRef = useRef<number>(0);
  const recordingRunStartedAtRef = useRef<number | null>(null);

  const { guardBack, navigationDialog } = useRecordingNavigationGuard(
    isPreparingRecording || isRecording || isUploading || isConverting ||
    (Boolean(audioURL) && !uploadSuccess && !queuedForUpload),
  );

  const micMetrics = useAudioAnalyzer(micMeterStream);
  const {
    alert: recordingAudioAlert,
    dismissAlert: dismissRecordingAudioAlert,
  } = useRecordingAudioAlerts({
    currentLevel: micMetrics.currentLevel,
    isRecording,
    isPaused,
  });

  const [resolvedSubcategory, setResolvedSubcategory] =
    useState<PromptTemplate | null>(subcategoryDetails ?? null);

  useEffect(() => {
    setResolvedSubcategory(subcategoryDetails ?? null);
  }, [subcategoryDetails, subcategoryId]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 1023px)").matches
    ) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (subcategoryDetails || !categoryId || !subcategoryId) {
      return;
    }

    const abortController = new AbortController();

    (async () => {
      try {
        const template = await getTemplate(subcategoryId, "runtime");
        if (abortController.signal.aborted) {
          return;
        }
        setResolvedSubcategory(
          template.folder_id === categoryId ? template : null,
        );
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to resolve subcategory details:", error);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [subcategoryDetails, categoryId, subcategoryId]);

  const inSessionTalkingPoints =
    resolvedSubcategory?.in_session_talking_points || [];
  const recordingDisclaimerEnabled =
    resolvedSubcategory?.recording_disclaimer_enabled ?? false;
  const recordingDisclaimer =
    resolvedSubcategory?.recording_disclaimer?.trim() ||
    DEFAULT_RECORDING_DISCLAIMER;
  const recordingDisclaimerLines = useMemo(
    () =>
      recordingDisclaimer
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
    [recordingDisclaimer],
  );
  const recordingDisclaimerScriptIndex = recordingDisclaimerLines.findIndex(
    (line) => line.startsWith("["),
  );
  const recordingDisclaimerGuidance =
    recordingDisclaimerScriptIndex >= 0
      ? recordingDisclaimerLines.slice(0, recordingDisclaimerScriptIndex)
      : recordingDisclaimerLines;
  const recordingDisclaimerScript =
    recordingDisclaimerScriptIndex >= 0
      ? recordingDisclaimerLines
          .slice(recordingDisclaimerScriptIndex)
          .join("\n")
      : null;

  const allTalkingPoints = useMemo(
    () =>
      flattenTalkingPoints(
        inSessionTalkingPoints as Array<TalkingPointSection>,
      ),
    [inSessionTalkingPoints],
  );

  const getElapsedRecordingMs = () => {
    const startedAt = recordingRunStartedAtRef.current;
    return (
      elapsedRecordingMsRef.current + (startedAt ? Date.now() - startedAt : 0)
    );
  };

  const commitRecordingTime = () => {
    setRecordingTime(Math.floor(getElapsedRecordingMs() / 1000));
  };

  const startRecordingClock = (resetElapsed = false) => {
    if (resetElapsed) elapsedRecordingMsRef.current = 0;
    recordingRunStartedAtRef.current = Date.now();
    commitRecordingTime();
  };

  const pauseRecordingClock = () => {
    if (!recordingRunStartedAtRef.current) return;
    elapsedRecordingMsRef.current = getElapsedRecordingMs();
    recordingRunStartedAtRef.current = null;
    commitRecordingTime();
  };

  // Snapshot before the tab is suspended; unload writes cannot be guaranteed.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") void saveSnapshotRef.current();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    categoryId,
    subcategoryId,
    categoryName,
    subcategoryName,
    preSessionData,
    recordingTime,
    isUploading,
    isConverting,
  ]);

  // The clock renders every second; it must never restart this interval.
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => { void saveSnapshotRef.current(); }, 5000);
    return () => clearInterval(interval);
  }, [isRecording]);

  saveSnapshotRef.current = async () => {
    if (periodicSaveInFlightRef.current || uploadSuccess || queuedForUpload) return;
    periodicSaveInFlightRef.current = true;
    try {
      const partial = audioChunks.current.length
        ? new Blob(audioChunks.current, { type: mediaRecorderRef.current?.mimeType || audioChunks.current[0].type || "audio/webm" })
        : null;
      const base = continuationBaseRef.current;
      // Preserve separately encoded continuation segments without requiring a
      // costly media conversion while capture is running.
      const blob = base || (isRecordingRef.current ? partial : audioBlobRef.current);
      if (!blob?.size) return;
      const draftId = await saveDraftRecording({
        categoryId, subcategoryId, categoryName, subcategoryName,
        audioBlob: blob,
        continuationBlob: base ? partial ?? undefined : undefined,
        duration: Math.floor(getElapsedRecordingMs() / 1000),
        preSessionData, mimeType: blob.type,
        recordingConsent: recordingConsentRef.current,
      });
      setCurrentDraftId(draftId);
      setDraftSaveError(false);
    } catch (error) {
      console.warn("Draft save failed:", error);
      setDraftSaveError(true);
    } finally {
      periodicSaveInFlightRef.current = false;
    }
  };

  // Initialize drafts
  useEffect(() => {
    const initializeDrafts = async () => {
      try {
        cleanupOldDrafts().catch(console.warn);
        checkStorageAndWarn().catch(console.warn);
        const draft = await getDraftRecording(categoryId, subcategoryId);
        if (draft) setExistingDraft(draft);
      } catch (error) {
        console.error("Error initializing drafts:", error);
      }
    };
    initializeDrafts();
  }, [categoryId, subcategoryId]);

  // Reset form state when category/subcategory changes (e.g., when returning from success screen)
  useEffect(() => {
    setUploadSuccess(false);
    setJobId(null);
    setAudioURL(null);
    setRecordingTime(0);
    elapsedRecordingMsRef.current = 0;
    recordingRunStartedAtRef.current = null;
    setDisplayName(null);
    setIsEditingDisplayName(false);
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
    audioChunks.current = [];
    recordingSettingsRef.current = null;
    recordingConsentRef.current = undefined;
    setVoiceIsolationApplied(false);
    setSystemAudioAvailable(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, [categoryId, subcategoryId]);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      commitRecordingTime();
      timerRef.current = setInterval(() => {
        commitRecordingTime();
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  const cleanupRecordingCapture = () => {
    recordingCaptureRef.current?.cleanup();
    recordingCaptureRef.current = null;
    streamRef.current = null;
    setMicMeterStream(null);
    setSystemMeterStream(null);
    setSystemAudioAvailable(false);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      cleanupRecordingCapture();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!audioURL) return;
    return () => URL.revokeObjectURL(audioURL);
  }, [audioURL]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audioURL || !audio) return;

    const handleLoadedMetadata = () =>
      setPreviewDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleTimeUpdate = () => setPreviewCurrentTime(audio.currentTime);
    const handlePlay = () => setIsPreviewPlaying(true);
    const handlePause = () => setIsPreviewPlaying(false);
    const handleEnded = () => setIsPreviewPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioURL]);

  // Handlers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const changeRecordingMode = (mode: RecordingMode) => {
    if (
      isRecording ||
      isPreparingRecording ||
      isUploading ||
      isConverting ||
      audioURL
    )
      return;
    setRecordingMode(mode);
    setVoiceIsolationEnabled(false);
    setVoiceIsolationApplied(false);
  };

  const prepareRecordingCapture = async () => {
    cleanupRecordingCapture();
    const capture = await createRecordingCapture({
      mode: recordingMode,
      voiceIsolation: voiceIsolationEnabled,
      onSourceEnded: () => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recordingToasts.interrupted();
          recorder.stop();
        }
      },
    });

    recordingCaptureRef.current = capture;
    streamRef.current = capture.recordingStream;
    setMicMeterStream(capture.micMonitorStream);
    setSystemMeterStream(capture.systemMonitorStream);
    setSystemAudioAvailable(capture.systemAudioAvailable);
    setVoiceIsolationApplied(capture.voiceIsolationApplied);
    recordingSettingsRef.current = {
      capture_mode: recordingMode,
      system_audio_requested: recordingMode === "hybrid",
      system_audio_captured: capture.systemAudioAvailable,
      voice_isolation_enabled: voiceIsolationEnabled,
      voice_isolation_applied: capture.voiceIsolationApplied,
      mix_strategy:
        recordingMode === "hybrid" ? "single_mixed_track" : undefined,
    };

    if (recordingMode === "hybrid" && !capture.systemAudioAvailable) {
      toast(
        "System audio was not available for that share. Recording microphone audio only.",
      );
    }

    return capture.recordingStream;
  };

  const togglePreviewPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPreviewPlaying) {
      audio.pause();
      return;
    }

    audio.play().catch(() => toast.error("Failed to play recording"));
  };

  const seekPreview = (value: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextTime = Number(value);
    audio.currentTime = nextTime;
    setPreviewCurrentTime(nextTime);
  };

  const beginRecording = async (continuationBase: Blob | null) => {
    if (isPreparingRecording) return;
    const continuationElapsedMs = continuationBase
      ? elapsedRecordingMsRef.current
      : 0;
    const restoreContinuationBase = () => {
      if (!continuationBase) return;
      elapsedRecordingMsRef.current = continuationElapsedMs;
      recordingRunStartedAtRef.current = null;
      setRecordingTime(Math.floor(continuationElapsedMs / 1000));
      setAudioURL(URL.createObjectURL(continuationBase));
    };
    setQueuedForUpload(false);
    setIsPreparingRecording(true);
    try {
      const stream = await prepareRecordingCapture();
      audioChunks.current = [];
      continuationBaseRef.current = continuationBase;
      if (!continuationBase) audioBlobRef.current = null;
      setConvertedBlob(null);
      setAudioURL(null);
      setIsPreviewPlaying(false);
      setPreviewCurrentTime(0);
      setPreviewDuration(0);

      const mr = new MediaRecorder(stream, getMediaRecorderOptions());
      mediaRecorderRef.current = mr;

      mr.onstart = () => {
        setIsRecording(true);
        isRecordingRef.current = true;
        setIsPaused(false);
        startRecordingClock(!continuationBase);
      };

      mr.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mr.onpause = () => {
        pauseRecordingClock();
        setIsPaused(true);
        void saveSnapshotRef.current();
      };
      mr.onresume = () => {
        startRecordingClock();
        setIsPaused(false);
      };

      mr.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        recordingToasts.interrupted();
      };

      mr.onstop = async () => {
        pauseRecordingClock();
        setIsRecording(false);
        isRecordingRef.current = false;
        setIsPaused(false);
        const mimeType = mr.mimeType || "audio/webm";
        const segment = new Blob(audioChunks.current, { type: mimeType });
        mediaRecorderRef.current = null;
        cleanupRecordingCapture();

        if (segment.size === 0) {
          recordingToasts.empty();
          restoreContinuationBase();
          continuationBaseRef.current = null;
          return;
        }

        let completedRecording: Blob = segment;
        if (continuationBase) {
          setIsConverting(true);
          setConversionStep("Joining recording segments...");
          try {
            completedRecording = await concatenateAudioSegments(
              [continuationBase, segment],
              { setConversionProgress, setConversionStep },
            );
          } catch (error) {
            console.error("Failed to join recording segments:", error);
            toast.error(
              "Could not add the new segment. Your previous recording was preserved.",
            );
            restoreContinuationBase();
            continuationBaseRef.current = null;
            setIsConverting(false);
            setConversionProgress(0);
            setConversionStep("");
            return;
          }
          setIsConverting(false);
          setConversionProgress(0);
          setConversionStep("");
        }

        continuationBaseRef.current = null;
        audioBlobRef.current = completedRecording;
        setAudioURL(URL.createObjectURL(completedRecording));
        void saveDraftFromBlob(
          completedRecording,
          Math.floor(getElapsedRecordingMs() / 1000),
          true,
        );
      };

      mr.start(1000);
    } catch (error) {
      console.error(
        continuationBase
          ? "Error continuing recording:"
          : "Error starting recording:",
        error,
      );
      mediaRecorderRef.current = null;
      cleanupRecordingCapture();
      setIsRecording(false);
      isRecordingRef.current = false;
      setIsPaused(false);
      continuationBaseRef.current = null;
      restoreContinuationBase();
      recordingToasts.microphoneError();
    } finally {
      setIsPreparingRecording(false);
    }
  };

  const startRecording = () => beginRecording(null);

  const continueRecording = () => {
    const existingAudio = audioBlobRef.current;
    if (existingAudio) void beginRecording(existingAudio);
  };

  const requestStartRecording = () => {
    if (!recordingDisclaimerEnabled) {
      void startRecording();
      return;
    }
    setPendingRecordingConsentAction("start");
  };

  const requestContinueRecording = () => {
    if (!recordingDisclaimerEnabled) {
      continueRecording();
      return;
    }
    setPendingRecordingConsentAction("continue");
  };

  const confirmRecordingConsent = () => {
    const action = pendingRecordingConsentAction;
    setPendingRecordingConsentAction(null);
    if (action) {
      recordingConsentRef.current = {
        accepted: true,
        policy_version: RECORDING_CONSENT_POLICY_VERSION,
        accepted_at: new Date().toISOString(),
      };
    }
    if (action === "start") void startRecording();
    if (action === "continue") continueRecording();
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;

    if (mr.state === "paused") {
      toast.warning("Resume the recording before stopping.", {
        description: "Your paused audio is still safe.",
        id: "recording-stop-paused",
      });
      return;
    }

    mr.stop();
  };

  const saveDraftFromBlob = async (
    blob: Blob,
    duration = recordingTime,
    force = false,
  ) => {
    const now = Date.now();
    if (!force && now - lastSaveTimeRef.current < 3000) return;
    lastSaveTimeRef.current = now;

    try {
      const draftId = await saveDraftRecording({
        categoryId,
        subcategoryId,
        categoryName,
        subcategoryName,
        audioBlob: blob,
        duration,
        preSessionData,
        mimeType: blob.type,
        recordingConsent: recordingConsentRef.current,
      });
      setCurrentDraftId(draftId);
      setDraftSaveError(false);
    } catch (error: any) {
      setDraftSaveError(true);
      console.error("Failed to save draft:", error);
    }
  };

  const saveDraft = async () => {
    if (!audioURL) return;
    try {
      const blob = await fetchAudioBlob(audioURL);
      await saveDraftFromBlob(blob);
    } catch (error) {
      setDraftSaveError(true);
      console.error("Failed to save draft:", error);
    }
  };

  const restoreDraft = async () => {
    if (!existingDraft) return;
    setIsRestoringDraft(true);
    try {
      const restoredBlob = existingDraft.continuationBlob
        ? await concatenateAudioSegments([existingDraft.audioBlob, existingDraft.continuationBlob], { setConversionProgress, setConversionStep })
        : existingDraft.audioBlob;
      const url = URL.createObjectURL(restoredBlob);
      audioBlobRef.current = restoredBlob;
      setAudioURL(url);
      setRecordingTime(existingDraft.duration);
      elapsedRecordingMsRef.current = existingDraft.duration * 1000;
      recordingRunStartedAtRef.current = null;
      setCurrentDraftId(existingDraft.id);
      recordingConsentRef.current = existingDraft.recordingConsent;
      setExistingDraft(null);
      toast.success("Draft restored successfully");
    } catch (error) {
      toast.error("Failed to restore draft");
    } finally {
      setIsRestoringDraft(false);
    }
  };

  const discardDraft = async () => {
    if (!existingDraft) return;
    try {
      await deleteDraftRecording(existingDraft.id);
      setExistingDraft(null);
      toast.success("Draft discarded");
    } catch (error) {
      toast.error("Failed to discard draft");
    }
  };

  const downloadDraft = async () => {
    if (!existingDraft) return;
    try {
      const blob = existingDraft.continuationBlob
        ? await concatenateAudioSegments([existingDraft.audioBlob, existingDraft.continuationBlob], { setConversionProgress, setConversionStep })
        : existingDraft.audioBlob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extension = blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") ? "m4a" : "webm";
      const fileName = `draft-${new Date(existingDraft.timestamp).toISOString().replace(/:/g, "-")}.${extension}`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to download draft");
    }
  };

  const uploadRecording = async () => {
    if (!audioURL) return;
    setIsUploading(true);
    setConvertedBlob(null);

    const buildUploadMetadata = (
      durationSeconds: number | undefined,
      settings?: RecordingSettings,
    ): AudioUploadMetadata | undefined => {
      const metadata: AudioUploadMetadata = {};
      const captureSettings = recordingSettingsRef.current;
      if (settings || captureSettings) {
        metadata.recording_settings = {
          ...captureSettings,
          ...settings,
        };
      }
      if (recordingConsentRef.current) {
        metadata.recording_consent = recordingConsentRef.current;
      }
      if (
        typeof durationSeconds === "number" &&
        Number.isFinite(durationSeconds)
      ) {
        metadata.audio_duration_seconds = durationSeconds;
        metadata.audio_duration_minutes = durationSeconds / 60;
      }
      return Object.keys(metadata).length > 0 ? metadata : undefined;
    };

    try {
      const limits = getStorageLimits();
      const singleMB = limits.singleFileMB;

      const online = await isOnline();
      const blob = await fetchAudioBlob(audioURL);

      if (blob.size === 0) throw new Error("Empty recording");

      // If offline, prefer to compress original if it's too large for the queue
      if (!online) {
        const fileSizeMB = blob.size / (1024 * 1024);
        if (fileSizeMB > singleMB) {
          // Try compressing the original to MP3
          setIsConverting(true);
          setConversionStep("Compressing original recording...");
          const compressed = await compressAudioToMP3(
            blob,
            limits.recommendedBitrate,
          );
          setIsConverting(false);
          setConversionStep("");
          setConvertedBlob(compressed);

          if (compressed.size / (1024 * 1024) > singleMB) {
            uploadToasts.failed({
              errorMessage: `File is ${(blob.size / (1024 * 1024)).toFixed(1)}MB. Maximum is ${singleMB}MB.`,
              onDownload: () => downloadRecording(true),
            });
            setIsUploading(false);
            return;
          }

          await queueRecording(compressed, {
            categoryId,
            subcategoryId,
            categoryName,
            subcategoryName,
            preSessionData,
            timestamp: Date.now(),
            uploadMetadata: buildUploadMetadata(recordingTime, {
              mime_type: compressed.type || blob.type,
              source_mime_type: blob.type,
            }),
          });

          setQueuedForUpload(true);
          toast.success("Queued for upload (Offline)");
          setExistingDraft(null);
          setCurrentDraftId(null);
          setIsUploading(false);
          return;
        }

        await queueRecording(blob, {
          categoryId,
          subcategoryId,
          categoryName,
          subcategoryName,
          preSessionData,
          timestamp: Date.now(),
          uploadMetadata: buildUploadMetadata(recordingTime, {
            mime_type: blob.type,
            source_mime_type: blob.type,
          }),
        });
        setQueuedForUpload(true);
          toast.success("Queued for upload (Offline)");
        setExistingDraft(null);
        setCurrentDraftId(null);
        setIsUploading(false);
        return;
      }

      // Online: convert to WAV first, then compress if needed
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileExtension = blob.type.includes("mp4") ? "m4a" : "webm";
      const fileName = `recording-${timestamp}.${fileExtension}`;
      const file = new File([blob], fileName, { type: blob.type });

      setIsConverting(true);
      setConversionStep("Converting...");
      let ffmpegDurationSeconds: number | undefined;
      const wavFile = await convertToWavWithFFmpeg(file, {
        setConversionProgress,
        setConversionStep,
        onMetadata: (meta) => {
          ffmpegDurationSeconds = meta.durationSeconds;
        },
      });
      setIsConverting(false);

      // Save converted blob for download/fallback
      setConvertedBlob(wavFile);

      const durationSeconds =
        ffmpegDurationSeconds ??
        (recordingTime > 0 ? recordingTime : undefined);
      const wavSettings: RecordingSettings = {
        source_mime_type: file.type || blob.type,
        mime_type: wavFile.type || "audio/wav",
        sample_rate_hz: 16000,
        channels: 1,
        codec: "pcm_s16le",
      };
      const wavUploadMetadata = buildUploadMetadata(
        durationSeconds,
        wavSettings,
      );

      // If converted WAV is too large, try compressing to MP3
      if (wavFile.size / (1024 * 1024) > singleMB) {
        setIsConverting(true);
        setConversionStep("Compressing converted recording...");
        const compressed = await compressAudioToMP3(
          wavFile,
          limits.recommendedBitrate,
        );
        setIsConverting(false);
        setConversionStep("");
        setConvertedBlob(compressed);

        if (compressed.size / (1024 * 1024) > singleMB) {
          // Still too big — provide download option and show error
          uploadToasts.failed({
            errorMessage: `File is ${(compressed.size / (1024 * 1024)).toFixed(1)}MB. Maximum is ${singleMB}MB.`,
            onDownload: () => downloadRecording(true),
          });
          setIsUploading(false);
          return;
        }

        // Use compressed MP3 for upload
        const mp3File = new File(
          [compressed],
          fileName.replace(/\.[^.]+$/, ".mp3"),
          { type: compressed.type || "audio/mpeg" },
        );

        const mp3Settings: RecordingSettings = {
          source_mime_type: file.type || blob.type,
          mime_type: mp3File.type || "audio/mpeg",
          codec: "mp3",
          bitrate_kbps: limits.recommendedBitrate,
        };
        const mp3UploadMetadata = buildUploadMetadata(
          durationSeconds,
          mp3Settings,
        );

        const uploadResponse = await uploadFile(
          mp3File,
          categoryId,
          subcategoryId,
          preSessionData,
          (progress) => setUploadProgress(progress),
          mp3UploadMetadata,
        );

        const returnedJobId = uploadResponse.job_id;
        const wasQueued = !!uploadResponse.queued;
        if (returnedJobId) setJobId(returnedJobId);

        setUploadSuccess(true);

        if (!wasQueued && returnedJobId) {
          if (displayName) {
            try {
              await updateJobDisplayName(returnedJobId, displayName);
            } catch (e) {}
          }
        }

        setExistingDraft(null);
        setCurrentDraftId(null);

        // Save as uploaded draft (use original blob)
        saveDraftRecording({
          categoryId,
          subcategoryId,
          categoryName,
          subcategoryName,
          audioBlob: blob,
          duration: recordingTime,
          preSessionData,
          uploaded: true,
          jobId: returnedJobId,
          recordingConsent: recordingConsentRef.current,
        }).catch(console.warn);

        uploadToasts.success({
          jobId: returnedJobId,
          onView: () => {
            if (returnedJobId)
              router.navigate({
                to: "/audio-recordings/$id",
                params: { id: returnedJobId },
              });
          },
        });

        return;
      }

      // WAV is within limits — upload it
      const uploadResponse = await uploadFile(
        wavFile,
        categoryId,
        subcategoryId,
        preSessionData,
        (progress) => setUploadProgress(progress),
        wavUploadMetadata,
      );

      const returnedJobId = uploadResponse.job_id;
      const wasQueued = !!uploadResponse.queued;
      if (returnedJobId) setJobId(returnedJobId);

      setUploadSuccess(true);

      if (!wasQueued && returnedJobId) {
        if (displayName) {
          try {
            await updateJobDisplayName(returnedJobId, displayName);
          } catch (e) {}
        }
      }

      setExistingDraft(null);
      setCurrentDraftId(null);

      // Save as uploaded draft
      saveDraftRecording({
        categoryId,
        subcategoryId,
        categoryName,
        subcategoryName,
        audioBlob: blob,
        duration: recordingTime,
        preSessionData,
        uploaded: true,
        jobId: returnedJobId,
        recordingConsent: recordingConsentRef.current,
      }).catch(console.warn);

      uploadToasts.success({
        jobId: returnedJobId,
        onView: () => {
          if (returnedJobId)
            router.navigate({
              to: "/audio-recordings/$id",
              params: { id: returnedJobId },
            });
        },
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      uploadToasts.failed({
        errorMessage: error.message,
        onRetry: uploadRecording,
        onDownload: () => downloadRecording(true),
      });
    } finally {
      setIsUploading(false);
      setIsConverting(false);
      setUploadProgress(null);
    }
  };

  const resetRecording = () => {
    setAudioURL(null);
    setRecordingTime(0);
    elapsedRecordingMsRef.current = 0;
    recordingRunStartedAtRef.current = null;
    setUploadSuccess(false);
    setJobId(null);
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
    setConvertedBlob(null);
    audioChunks.current = [];
    audioBlobRef.current = null;
    continuationBaseRef.current = null;
    recordingSettingsRef.current = null;
    recordingConsentRef.current = undefined;
    setVoiceIsolationApplied(false);
    setSystemAudioAvailable(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const saveDisplayName = async (targetJobId = jobId) => {
    const trimmedName = displayName?.trim();
    if (!targetJobId || !trimmedName) return;
    await updateJobDisplayName(targetJobId, trimmedName);
  };

  const handleInlineSaveDisplayName = async () => {
    setIsEditingDisplayName(false);
    if (!jobId || !displayName || !displayName.trim()) return;
    try {
      await saveDisplayName();
      toast.success("Saved recording name");
    } catch (e) {
      toast.error("Failed to save recording name");
    }
  };

  // Download helper
  const downloadBlob = (blob: Blob, filename: string) => {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to download recording");
    }
  };

  const downloadRecording = async (preferConverted = true) => {
    try {
      if (preferConverted && convertedBlob) {
        const ext =
          convertedBlob.type.includes("mpeg") ||
          convertedBlob.type.includes("mp3")
            ? "mp3"
            : "wav";
        const fileName = `recording-${new Date().toISOString()}.${ext}`;
        downloadBlob(convertedBlob, fileName);
        return;
      }

      if (audioBlobRef.current) {
        const blob = audioBlobRef.current;
        const ext =
          blob.type.includes("mp4") || blob.type.includes("m4a")
            ? "m4a"
            : blob.type.includes("webm")
              ? "webm"
              : "wav";
        downloadBlob(blob, `recording-${new Date().toISOString()}.${ext}`);
        return;
      }

      if (audioURL) {
        const blob = await fetchAudioBlob(audioURL);
        downloadBlob(blob, `recording-${new Date().toISOString()}.webm`);
        return;
      }

      toast.error("No recording available to download");
    } catch (error) {
      toast.error("Failed to download recording");
    }
  };

  // Render Helpers
  const nextTalkingPoint = () => {
    setCurrentTalkingPointIndex((previousIndex) =>
      getNextTalkingPointIndex(previousIndex, allTalkingPoints.length),
    );
  };

  const prevTalkingPoint = () => {
    setCurrentTalkingPointIndex((previousIndex) =>
      getPreviousTalkingPointIndex(previousIndex),
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 overflow-x-hidden px-0 pt-0 pb-48 sm:py-4 sm:pb-48 md:pb-36 lg:pb-6">
      {navigationDialog}
      {draftSaveError && (
        <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">
          Your latest audio could not be saved as a draft. Keep this page open and
          upload or download your recording before leaving.
        </div>
      )}
      <RecordingAlertBanner
        alert={recordingAudioAlert}
        onDismiss={dismissRecordingAudioAlert}
      />
      <div className="border-border/70 flex flex-col justify-between gap-3 border-b pb-4 lg:flex-row lg:items-center lg:border-0 lg:pb-0">
        <div className="flex min-w-0 items-start gap-3 lg:items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => guardBack(onBack)}
            className="hover:bg-muted h-11 w-11 flex-shrink-0 rounded-xl lg:h-9 lg:w-9 lg:rounded-full"
            aria-label="Back to meeting details"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="w-full min-w-0">
            <PageHeader
              noContainer
              title={"Recording Session"}
              titleClassName="text-xl sm:text-2xl font-semibold text-foreground"
              description={
                <SmartBreadcrumb
                  showHome={false}
                  items={[
                    { label: categoryName },
                    { label: subcategoryName, isCurrentPage: true },
                  ]}
                />
              }
            />
            <div className="mt-1 sm:hidden">
              <SmartBreadcrumb
                showHome={false}
                items={[
                  { label: categoryName },
                  { label: subcategoryName, isCurrentPage: true },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <PromptMetadataDisclaimer
        metadata={resolvedSubcategory?.prompt_metadata}
      />

      {existingDraft && !audioURL && (
        <DraftRestorationBanner
          draft={existingDraft}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
          onDownload={downloadDraft}
          isRestoring={isRestoringDraft}
        />
      )}

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)] lg:gap-5">
        <div className="space-y-4">
          <Card className="bg-card relative overflow-hidden rounded-none border-x-0 border-b-0 shadow-none lg:rounded-xl lg:border lg:shadow-sm">
            <div
              className={cn(
                "absolute top-0 right-0 left-0 hidden h-1 transition-colors duration-300 lg:block",
                isRecording
                  ? isPaused
                    ? "bg-orange-500"
                    : "animate-pulse bg-red-500"
                  : audioURL
                    ? "bg-green-500"
                    : "bg-muted",
              )}
            />

            <CardContent className="flex min-h-0 flex-col items-stretch justify-start gap-4 px-1 py-5 sm:px-3 lg:min-h-[350px] lg:items-center lg:justify-center lg:gap-0 lg:space-y-7 lg:p-7">
              <div className="text-muted-foreground order-3 flex w-full max-w-xl flex-wrap items-center justify-between gap-2 text-sm lg:order-none lg:justify-center lg:gap-x-4 lg:gap-y-2 lg:text-xs">
                <div className="bg-muted/20 lg:bg-muted/40 inline-flex shrink-0 items-center rounded-lg border p-1 lg:rounded-md lg:border-0 lg:p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      recordingMode === "microphone" ? "secondary" : "ghost"
                    }
                    className="h-10 gap-1.5 rounded-md px-2.5 text-sm lg:h-7 lg:gap-1 lg:rounded lg:px-2 lg:text-xs"
                    onClick={() => changeRecordingMode("microphone")}
                    disabled={
                      isRecording ||
                      isPreparingRecording ||
                      isUploading ||
                      isConverting ||
                      Boolean(audioURL)
                    }
                  >
                    <Mic className="h-3.5 w-3.5" />
                    Mic
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={recordingMode === "hybrid" ? "secondary" : "ghost"}
                    className="h-10 gap-1.5 rounded-md px-2.5 text-sm lg:h-7 lg:gap-1 lg:rounded lg:px-2 lg:text-xs"
                    onClick={() => changeRecordingMode("hybrid")}
                    disabled={
                      isRecording ||
                      isPreparingRecording ||
                      isUploading ||
                      isConverting ||
                      Boolean(audioURL)
                    }
                  >
                    <MonitorUp className="h-3.5 w-3.5" />
                    Hybrid
                  </Button>
                </div>

                <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-2 py-2 text-[13px] lg:min-h-0 lg:rounded-none lg:border-0 lg:px-0 lg:py-0 lg:text-xs">
                  <Switch
                    checked={voiceIsolationEnabled}
                    onCheckedChange={setVoiceIsolationEnabled}
                    disabled={
                      isRecording ||
                      isPreparingRecording ||
                      isUploading ||
                      isConverting ||
                      Boolean(audioURL)
                    }
                    aria-label="Voice Isolation"
                    className="h-5 w-9"
                    thumbClassName="h-4 w-4 shadow-sm data-[state=checked]:translate-x-4"
                  />
                  <span className="lg:hidden">Voice isolation</span>
                  <span className="hidden lg:inline">Voice Isolation</span>
                  {voiceIsolationApplied && (
                    <Badge variant="secondary" className="text-[10px]">
                      Active
                    </Badge>
                  )}
                </label>

                {isPreparingRecording && (
                  <span className="flex basis-full items-center justify-center gap-1.5 lg:basis-auto">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {recordingMode === "hybrid"
                      ? "Preparing hybrid audio"
                      : "Preparing"}
                  </span>
                )}
              </div>

              <div className="order-1 flex flex-col items-center space-y-2 lg:order-none">
                <div
                  className={cn(
                    "font-mono text-5xl font-bold tracking-tight tabular-nums transition-colors",
                    isRecording ? "text-red-500" : "text-foreground",
                  )}
                >
                  {formatTime(recordingTime)}
                </div>
                <div className="flex items-center gap-2 text-xs font-medium sm:text-sm">
                  {isPreparingRecording ? (
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {recordingMode === "hybrid"
                        ? "Opening share picker"
                        : "Preparing"}
                    </span>
                  ) : isRecording ? (
                    isPaused ? (
                      <span className="flex items-center gap-1.5 text-orange-500">
                        <Pause className="h-3 w-3" /> Paused
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-red-500">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                        </span>{" "}
                        Recording
                      </span>
                    )
                  ) : audioURL ? (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <Check className="h-3 w-3" /> Ready to submit
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Ready to record
                    </span>
                  )}
                </div>
              </div>

              <div className="order-2 flex min-h-4 w-full items-center justify-center lg:order-none lg:min-h-12">
                {isRecording ? (
                  <div
                    className={cn(
                      "grid w-full gap-3",
                      recordingMode === "hybrid"
                        ? "max-w-xl sm:grid-cols-2"
                        : "max-w-xs",
                    )}
                  >
                    <div className="space-y-1.5">
                      <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
                        <span>Mic</span>
                        <span>
                          {voiceIsolationApplied ? "Isolated" : "Live"}
                        </span>
                      </div>
                      {micMeterStream && (
                        <RecordingLevelIndicator
                          stream={micMeterStream}
                          metrics={micMetrics}
                          className="w-full"
                        />
                      )}
                    </div>
                    {recordingMode === "hybrid" && (
                      <div className="space-y-1.5">
                        <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
                          <span>System</span>
                          <span>
                            {systemAudioAvailable ? "Live" : "Unavailable"}
                          </span>
                        </div>
                        {systemAudioAvailable ? (
                          systemMeterStream && (
                            <RecordingLevelIndicator
                              stream={systemMeterStream}
                              className="w-full"
                            />
                          )
                        ) : (
                          <div className="bg-muted h-1.5 w-full rounded-full" />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-muted h-1 w-full max-w-xs rounded-full" />
                )}
              </div>

              {isRecording && wakeLockStatus === "unavailable" && (
                <p role="status" className="order-4 max-w-md text-center text-sm text-amber-700 dark:text-amber-400">
                  Your screen may lock during recording. Keep this app visible
                  and check your device’s auto-lock and battery-saving settings.
                </p>
              )}
              <RecordingControls
                isRecording={isRecording}
                isPaused={isPaused}
                hasAudio={Boolean(audioURL)}
                isUploading={isUploading}
                isConverting={isConverting}
                isPreparing={isPreparingRecording}
                onStart={requestStartRecording}
                onPause={pauseRecording}
                onResume={resumeRecording}
                onStop={stopRecording}
                onReset={resetRecording}
                onContinue={requestContinueRecording}
                onUpload={uploadRecording}
              />
              <div className="text-muted-foreground order-5 hidden max-w-md items-center gap-2 px-2 text-center text-xs lg:order-none lg:flex lg:px-0">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Local draft is kept until you submit or start over.</span>
              </div>
            </CardContent>
          </Card>

          {audioURL && !isRecording && (
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                        <FileAudio className="text-muted-foreground h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Review Recording</p>
                        <p className="text-muted-foreground text-xs">
                          {formatTime(recordingTime)}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                      {isEditingDisplayName ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={displayName ?? ""}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="h-8 w-44 text-sm"
                            maxLength={255}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleInlineSaveDisplayName}
                            className="h-8 w-8 flex-shrink-0 p-0"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="hidden max-w-[180px] truncate text-sm font-medium sm:inline">
                            {displayName ?? "Untitled recording"}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditingDisplayName(true)}
                            className="h-8 w-8 flex-shrink-0 p-0"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => downloadRecording(true)}
                            className="h-8 w-8 flex-shrink-0 p-0"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {!isIOS() && (
                    <div className="flex items-center gap-3">
                      <audio
                        ref={audioRef}
                        src={audioURL}
                        preload="metadata"
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-full"
                        onClick={togglePreviewPlayback}
                      >
                        {isPreviewPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <input
                        type="range"
                        min={0}
                        max={previewDuration || recordingTime || 1}
                        step={0.1}
                        value={previewCurrentTime}
                        onChange={(event) => seekPreview(event.target.value)}
                        className="accent-primary h-1 flex-1"
                        aria-label="Seek recording"
                      />
                      <span className="text-muted-foreground w-20 text-right font-mono text-xs">
                        {formatTime(Math.floor(previewCurrentTime))} /{" "}
                        {formatTime(
                          Math.floor(previewDuration || recordingTime),
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {(isConverting || isUploading) && (
                  <div className="mt-4 space-y-2">
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span>
                        {isConverting ? conversionStep : "Uploading..."}
                      </span>
                      <span>
                        {Math.round(
                          isConverting
                            ? conversionProgress
                            : uploadProgress?.percentage || 0,
                        )}
                        %
                      </span>
                    </div>
                    <Progress
                      value={
                        isConverting
                          ? conversionProgress
                          : uploadProgress?.percentage || 0
                      }
                      className="h-1.5"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <TalkingPointsPanel
            talkingPoints={allTalkingPoints}
            currentIndex={currentTalkingPointIndex}
            onPrevious={prevTalkingPoint}
            onNext={nextTalkingPoint}
          />
        </div>
      </div>

      <AlertDialog
        open={Boolean(pendingRecordingConsentAction)}
        onOpenChange={(open) => {
          if (!open) setPendingRecordingConsentAction(null);
        }}
      >
        <AlertDialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-hidden p-6 sm:max-w-[600px]">
          <AlertDialogHeader className="text-left sm:text-left">
            <AlertDialogTitle className="text-xl">
              Recording consent
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1 text-left">
                <div className="bg-muted/35 rounded-md p-4">
                  <div className="text-foreground mb-3 text-sm font-semibold">
                    Before recording
                  </div>
                  <div className="space-y-3">
                    {recordingDisclaimerGuidance.map((line, index) => (
                      <p
                        key={`${line}-${index}`}
                        className="text-foreground/80 text-[15px] leading-7"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
                {recordingDisclaimerScript ? (
                  <div className="border-border bg-background rounded-md border p-4">
                    <div className="text-foreground mb-3 text-sm font-semibold">
                      Say this aloud
                    </div>
                    <p className="text-foreground text-[15px] leading-7 font-medium whitespace-pre-wrap">
                      {recordingDisclaimerScript}
                    </p>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRecordingConsent}>
              I agree, record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Modal - Refined Minimalist Design */}
      <Dialog open={uploadSuccess} onOpenChange={() => {}}>
        <DialogContent className="bg-card overflow-hidden border-none p-0 shadow-2xl sm:max-w-[400px] [&>button]:hidden">
          <div className="flex flex-col items-center space-y-6 px-6 pt-10 pb-8 text-center">
            {/* Minimalist Animated Icon */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-green-500/10 opacity-20 duration-1000" />
              <div className="animate-in zoom-in-50 relative flex h-20 w-20 items-center justify-center rounded-full bg-green-50 duration-300 dark:bg-green-900/20">
                <Check
                  className="animate-in fade-in slide-in-from-bottom-2 h-10 w-10 text-green-600 delay-150 duration-500 dark:text-green-400"
                  strokeWidth={3}
                />
              </div>
            </div>

            <div className="animate-in slide-in-from-bottom-4 fade-in space-y-1.5 delay-100 duration-500">
              <h2 className="text-xl font-semibold tracking-tight">
                Recording Saved
              </h2>
              <p className="text-muted-foreground text-sm">
                Your audio is now being processed.
              </p>
            </div>

            {/* Input Area */}
            <div className="animate-in slide-in-from-bottom-8 fade-in w-full space-y-4 pt-2 delay-200 duration-500">
              <div className="bg-muted/30 focus-within:ring-primary/20 rounded-xl border px-3 py-2 text-left transition-all focus-within:ring-2">
                <label className="text-muted-foreground pl-1 text-[10px] font-semibold tracking-wider uppercase">
                  Name (Optional)
                </label>
                <Input
                  value={displayName || ""}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Untitled Session"
                  className="placeholder:text-muted-foreground/50 h-7 w-full border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2.5">
                <Button
                  size="lg"
                  onClick={async () => {
                    try {
                      await saveDisplayName();
                    } catch (e) {}
                    if (jobId)
                      router.navigate({ to: `/audio-recordings/${jobId}` });
                  }}
                  className="h-11 w-full font-medium shadow-md"
                >
                  View Result
                  <ChevronRight className="ml-1 h-4 w-4 opacity-60" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await saveDisplayName();
                    } catch (e) {}
                    onUploadComplete();
                  }}
                  className="text-muted-foreground hover:text-foreground h-9 w-full"
                >
                  Start New Recording
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
