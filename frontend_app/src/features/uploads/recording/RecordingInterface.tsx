import { useEffect, useMemo, useRef, useState } from "react";
import { 
  AlertCircle, 
  ArrowLeft, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  
  Edit3,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Upload,
  
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";
import { TalkingPointsPanel } from "./TalkingPointsPanel";
import {
  flattenTalkingPoints,
  getNextTalkingPointIndex,
  getPreviousTalkingPointIndex,
} from "./talkingPointNavigation";
import type { TalkingPointSection } from "./talkingPointNavigation";
import type {DraftRecording} from "@/lib/draft-storage";
import type { AudioUploadMetadata, RecordingSettings } from "@/types/audio-upload";
import type { SubcategoryResponse } from "@/shared/data/taxonomy/types";
import { fetchSubcategories } from "@/shared/data/taxonomy/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { fetchAudioBlob, updateJobDisplayName, uploadFile  } from "@/features/recordings/data/api";
import { convertToWavWithFFmpeg } from "@/lib/ffmpegConvert";
import { compressAudioToMP3, getStorageLimits } from "@/lib/audio-compression";
import { recordingToasts, uploadToasts } from "@/lib/toast-utils";

import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isOnline } from "@/lib/online-status";
import { queueRecording } from "@/lib/pwa-queue";
import { 
   
  checkStorageAndWarn, 
  cleanupOldDrafts,
  deleteDraftRecording,
  getDraftRecording,
  saveDraftRecording 
} from "@/lib/draft-storage";
import { DraftRestorationBanner } from "@/components/ui/draft-restoration-banner";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import { MinimalAudioIndicator } from "@/components/audio-player/MinimalAudioIndicator";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/ui/page-header";

// Utility to detect iOS
function isIOS() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

interface RecordingInterfaceProps {
  categoryId: string;
  subcategoryId: string;
  categoryName: string;
  subcategoryName: string;
  subcategoryDetails?: SubcategoryResponse | null;
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
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [showPostUploadNamePrompt, setShowPostUploadNamePrompt] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  
  // FFmpeg conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStep, setConversionStep] = useState("");
  // Converted/compressed blob (available for download/fallback)
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  
  // Talking points state
  const [currentTalkingPointIndex, setCurrentTalkingPointIndex] = useState(0);
  
  // Draft recording state
  const [existingDraft, setExistingDraft] = useState<DraftRecording | null>(null);
  const [isRestoringDraft, setIsRestoringDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  // Refs
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Array<Blob>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);

  // Audio analysis
  const audioMetrics = useAudioAnalyzer(isRecording ? streamRef.current : null);

  const [resolvedSubcategory, setResolvedSubcategory] = useState<SubcategoryResponse | null>(subcategoryDetails ?? null);

  useEffect(() => {
    setResolvedSubcategory(subcategoryDetails ?? null);
  }, [subcategoryDetails, subcategoryId]);

  useEffect(() => {
    if (subcategoryDetails || !categoryId || !subcategoryId) {
      return;
    }

    const abortController = new AbortController();

    (async () => {
      try {
        const items = await fetchSubcategories(categoryId);
        if (abortController.signal.aborted) {
          return;
        }
        const match = items.find((item) => item.id === subcategoryId) ?? null;
        setResolvedSubcategory(match);
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

  const inSessionTalkingPoints = resolvedSubcategory?.inSessionTalkingPoints || [];
  
  const allTalkingPoints = useMemo(() => 
    flattenTalkingPoints(inSessionTalkingPoints as Array<TalkingPointSection>),
    [inSessionTalkingPoints]
  );

  // Auto-save logic (same as original)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const currentlyRecording = isRecordingRef.current;
      const hasRecording = audioBlobRef.current || audioChunks.current.length > 0;
      
      // Block navigation if uploading, converting, or has unsaved recording
      if (isUploading || isConverting || !hasRecording) {
        if (isUploading || isConverting) {
          event.preventDefault();
          event.returnValue = 'Upload in progress. Are you sure you want to leave?';
          return;
        }
        if (!hasRecording) return;
      }

      event.preventDefault();
      event.returnValue = 'You have an unsaved recording. It will be saved as a draft.';

      try {
        const blobToSave = audioBlobRef.current;
        if (blobToSave) {
          saveDraftRecording({
            categoryId,
            subcategoryId,
            categoryName,
            subcategoryName,
            audioBlob: blobToSave,
            duration: recordingTime,
            preSessionData,
            mimeType: blobToSave.type,
          });
        } else if (currentlyRecording && audioChunks.current.length > 0) {
          const partialBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
          saveDraftRecording({
            categoryId,
            subcategoryId,
            categoryName,
            subcategoryName,
            audioBlob: partialBlob,
            duration: recordingTime,
            preSessionData,
            mimeType: partialBlob.type,
          });
        }
      } catch (error) {
        console.error('Failed emergency save on unload:', error);
      }
    };

    let lastSaveTime = 0;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now();
        if (now - lastSaveTime < 5000) return;
        lastSaveTime = now;

        try {
          const currentlyRecording = isRecordingRef.current;
          const blobToSave = audioBlobRef.current;
          
          if (blobToSave) {
            const draftId = await saveDraftRecording({
              categoryId,
              subcategoryId,
              categoryName,
              subcategoryName,
              audioBlob: blobToSave,
              duration: recordingTime,
              preSessionData,
              mimeType: blobToSave.type,
            });
            setCurrentDraftId(draftId);
          } else if (currentlyRecording && audioChunks.current.length > 0) {
            const partialBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
            const draftId = await saveDraftRecording({
              categoryId,
              subcategoryId,
              categoryName,
              subcategoryName,
              audioBlob: partialBlob,
              duration: recordingTime,
              preSessionData,
              mimeType: partialBlob.type,
            });
            setCurrentDraftId(draftId);
          }
        } catch (error) {
          console.error('Failed background save:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [categoryId, subcategoryId, categoryName, subcategoryName, preSessionData, recordingTime, isUploading, isConverting]);

  // Periodic auto-save
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const interval = setInterval(async () => {
      try {
        if (audioChunks.current.length > 0) {
          const partialBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
          try {
            const draftId = await saveDraftRecording({
              categoryId,
              subcategoryId,
              categoryName,
              subcategoryName,
              audioBlob: partialBlob,
              duration: recordingTime,
              preSessionData,
              mimeType: partialBlob.type,
            });
            setCurrentDraftId(draftId);
          } catch (error) {
            console.warn('Periodic auto-save failed:', error);
          }
        }
      } catch (error) {
        console.warn('Failed to create periodic auto-save blob:', error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, categoryId, subcategoryId, categoryName, subcategoryName, preSessionData, recordingTime]);

  // Initialize drafts
  useEffect(() => {
    const initializeDrafts = async () => {
      try {
        cleanupOldDrafts().catch(console.warn);
        checkStorageAndWarn().catch(console.warn);
        const draft = await getDraftRecording(categoryId, subcategoryId);
        if (draft) setExistingDraft(draft);
      } catch (error) {
        console.error('Error initializing drafts:', error);
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
    setDisplayName(null);
    setShowPostUploadNamePrompt(false);
    setIsEditingDisplayName(false);
    audioChunks.current = [];
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, [categoryId, subcategoryId]);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioRef.current?.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Handlers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunks.current = [];
      setAudioURL(null);

      const options: MediaRecorderOptions = {};
      const mimeTypes = [
        'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'video/mp4', 'audio/webm;codecs=opus'
      ];
      
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          options.mimeType = mimeType;
          break;
        }
      }

      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;

      mr.onstart = () => {
        setIsRecording(true);
        isRecordingRef.current = true;
        setIsPaused(false);
        setRecordingTime(0);
      };

      mr.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mr.onpause = () => setIsPaused(true);
      mr.onresume = () => setIsPaused(false);

      mr.onstop = () => {
        const mimeType = mr.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        audioBlobRef.current = audioBlob;
        
        if (audioBlob.size === 0) {
          recordingToasts.empty();
          return;
        }
        
        const url = URL.createObjectURL(audioBlob);
        // Initialize a friendly display name if the blob has a filename
        const initialName = (audioBlob as any)?.name ?? null;
        if (initialName) setDisplayName(String(initialName).replace(/\.[a-z0-9]+$/i, ''));
        setAudioURL(url);
      };

      mr.start(1000);
    } catch (error) {
      console.error("Error starting recording:", error);
      recordingToasts.microphoneError();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr) {
      if (mr.state === 'paused') mr.resume();
      if (mr.state === 'recording') mr.stop();
      
      setIsRecording(false);
      isRecordingRef.current = false;
      setIsPaused(false);

      setTimeout(() => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        mediaRecorderRef.current = null;
        streamRef.current = null;

        setTimeout(async () => {
          const blobToSave = audioBlobRef.current;
          if (blobToSave) {
            await saveDraftFromBlob(blobToSave);
          } else if (audioURL) {
            await saveDraft();
          }
        }, 100);
      }, 500);
    }
  };

  const saveDraftFromBlob = async (blob: Blob) => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 3000) return;
    lastSaveTimeRef.current = now;

    if (currentDraftId) {
      try { await deleteDraftRecording(currentDraftId); } catch (e) { /* ignore */ }
    }

    try {
      const draftId = await saveDraftRecording({
        categoryId,
        subcategoryId,
        categoryName,
        subcategoryName,
        audioBlob: blob,
        duration: recordingTime,
        preSessionData,
        mimeType: blob.type,
      });
      setCurrentDraftId(draftId);
    } catch (error: any) {
      console.error('Failed to save draft:', error);
    }
  };

  const saveDraft = async () => {
    if (!audioURL) return;
    try {
      const blob = await fetchAudioBlob(audioURL);
      await saveDraftFromBlob(blob);
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  const restoreDraft = () => {
    if (!existingDraft) return;
    setIsRestoringDraft(true);
    try {
      const url = URL.createObjectURL(existingDraft.audioBlob);
      setAudioURL(url);
      setRecordingTime(existingDraft.duration);
      setCurrentDraftId(existingDraft.id);
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

  const downloadDraft = () => {
    if (!existingDraft) return;
    try {
      const url = URL.createObjectURL(existingDraft.audioBlob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = `draft-${new Date(existingDraft.timestamp).toISOString()}.webm`;
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
      settings?: RecordingSettings
    ): AudioUploadMetadata | undefined => {
      const metadata: AudioUploadMetadata = {};
      if (settings) metadata.recording_settings = settings;
      if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
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

      if (blob.size === 0) throw new Error('Empty recording');

      // If offline, prefer to compress original if it's too large for the queue
      if (!online) {
        const fileSizeMB = (blob.size / (1024 * 1024));
        if (fileSizeMB > singleMB) {
          // Try compressing the original to MP3
          setIsConverting(true);
          setConversionStep('Compressing original recording...');
          const compressed = await compressAudioToMP3(blob, limits.recommendedBitrate);
          setIsConverting(false);
          setConversionStep('');
          setConvertedBlob(compressed);

          if ((compressed.size / (1024 * 1024)) > singleMB) {
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
        toast.success("Queued for upload (Offline)");
        setExistingDraft(null);
        setCurrentDraftId(null);
        setIsUploading(false);
        return;
      }

      // Online: convert to WAV first, then compress if needed
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileExtension = blob.type.includes('mp4') ? 'm4a' : 'webm';
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

      const durationSeconds = ffmpegDurationSeconds ?? (recordingTime > 0 ? recordingTime : undefined);
      const wavSettings: RecordingSettings = {
        source_mime_type: file.type || blob.type,
        mime_type: wavFile.type || "audio/wav",
        sample_rate_hz: 16000,
        channels: 1,
        codec: "pcm_s16le",
      };
      const wavUploadMetadata = buildUploadMetadata(durationSeconds, wavSettings);

      // If converted WAV is too large, try compressing to MP3
      if ((wavFile.size / (1024 * 1024)) > singleMB) {
        setIsConverting(true);
        setConversionStep('Compressing converted recording...');
        const compressed = await compressAudioToMP3(wavFile, limits.recommendedBitrate);
        setIsConverting(false);
        setConversionStep('');
        setConvertedBlob(compressed);

        if ((compressed.size / (1024 * 1024)) > singleMB) {
          // Still too big — provide download option and show error
          uploadToasts.failed({
            errorMessage: `File is ${(compressed.size / (1024 * 1024)).toFixed(1)}MB. Maximum is ${singleMB}MB.`,
            onDownload: () => downloadRecording(true),
          });
          setIsUploading(false);
          return;
        }

        // Use compressed MP3 for upload
        const mp3File = new File([compressed], fileName.replace(/\.[^.]+$/, '.mp3'), { type: compressed.type || 'audio/mpeg' });

        const mp3Settings: RecordingSettings = {
          source_mime_type: file.type || blob.type,
          mime_type: mp3File.type || "audio/mpeg",
          codec: "mp3",
          bitrate_kbps: limits.recommendedBitrate,
        };
        const mp3UploadMetadata = buildUploadMetadata(durationSeconds, mp3Settings);

        const uploadResponse = await uploadFile(
          mp3File,
          categoryId,
          subcategoryId,
          preSessionData,
          (progress) => setUploadProgress(progress),
          mp3UploadMetadata
        );

        const returnedJobId = uploadResponse.job_id;
        const wasQueued = !!uploadResponse.queued;
        if (returnedJobId) setJobId(returnedJobId);

        setUploadSuccess(true);

        if (!wasQueued && returnedJobId) {
          if (displayName) {
            try {
              await updateJobDisplayName(returnedJobId, displayName);
            } catch (e) { }
          } else {
            setShowPostUploadNamePrompt(true);
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
        }).catch(console.warn);

        uploadToasts.success({
          jobId: returnedJobId,
          onView: () => {
            if (returnedJobId) router.navigate({ to: "/audio-recordings/$id", params: { id: returnedJobId } });
          }
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
        wavUploadMetadata
      );

      const returnedJobId = uploadResponse.job_id;
      const wasQueued = !!uploadResponse.queued;
      if (returnedJobId) setJobId(returnedJobId);

      setUploadSuccess(true);

      if (!wasQueued && returnedJobId) {
        if (displayName) {
          try {
            await updateJobDisplayName(returnedJobId, displayName);
          } catch (e) { }
        } else {
          setShowPostUploadNamePrompt(true);
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
      }).catch(console.warn);

      uploadToasts.success({
        jobId: returnedJobId,
        onView: () => {
          if (returnedJobId) router.navigate({ to: "/audio-recordings/$id", params: { id: returnedJobId } });
        }
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
    setUploadSuccess(false);
    setJobId(null);
    audioChunks.current = [];
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSaveDisplayNameForJob = async (jobIdToUpdate?: string | null) => {
    if (!jobIdToUpdate || !displayName || !displayName.trim()) return;
    try {
      await updateJobDisplayName(jobIdToUpdate, displayName.trim());
      setShowPostUploadNamePrompt(false);
      toast.success("Saved recording name");
    } catch (error) {
      toast.error("Failed to save recording name");
    }
  };

  const handleInlineSaveDisplayName = async () => {
    setIsEditingDisplayName(false);
    if (!jobId || !displayName || !displayName.trim()) return;
    try {
      await updateJobDisplayName(jobId, displayName.trim());
      toast.success("Saved recording name");
    } catch (e) {
      toast.error("Failed to save recording name");
    }
  };

  // Download helper
  const downloadBlob = (blob: Blob, filename: string) => {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
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
        const ext = convertedBlob.type.includes('mpeg') || convertedBlob.type.includes('mp3') ? 'mp3' : 'wav';
        const fileName = `recording-${new Date().toISOString()}.${ext}`;
        downloadBlob(convertedBlob, fileName);
        return;
      }

      if (audioBlobRef.current) {
        const blob = audioBlobRef.current;
        const ext = blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : (blob.type.includes('webm') ? 'webm' : 'wav');
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
    setCurrentTalkingPointIndex((previousIndex) => getPreviousTalkingPointIndex(previousIndex));
  };

  return (
    <div className="max-w-7xl mx-auto px-0 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden pb-32 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-full hover:bg-muted flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="min-w-0 w-full">
            <PageHeader
              noContainer
              title={"Recording Session"}
              description={(
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="font-normal truncate max-w-[120px] sm:max-w-[150px]">{categoryName}</Badge>
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  <Badge variant="secondary" className="font-normal truncate max-w-[120px] sm:max-w-[150px]">{subcategoryName}</Badge>
                </div>
              )}
            />
          </div>
        </div>
      </div>

      {/* Draft Banner */}
      {existingDraft && !audioURL && (
        <DraftRestorationBanner
          draft={existingDraft}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
          onDownload={downloadDraft}
          isRestoring={isRestoringDraft}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Recording Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm overflow-hidden relative">
            {/* Status Bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 h-1.5 transition-colors duration-300",
              isRecording 
                ? isPaused ? "bg-orange-500" : "bg-red-500 animate-pulse"
                : audioURL ? "bg-green-500" : "bg-muted"
            )} />
            
            <CardContent className="p-4 sm:p-8 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[420px] space-y-6 sm:space-y-8">
              {/* Timer Display */}
              <div className="flex flex-col items-center space-y-2">
                <div className={cn(
                  "text-3xl xs:text-4xl sm:text-5xl font-mono font-bold tracking-wider tabular-nums transition-colors",
                  isRecording ? "text-red-500" : "text-foreground"
                )}>
                  {formatTime(recordingTime)}
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                  {isRecording ? (
                    isPaused ? (
                      <span className="text-orange-500 flex items-center gap-1.5"><Pause className="w-3 h-3" /> Paused</span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span> Recording</span>
                    )
                  ) : audioURL ? (
                    <span className="text-green-500 flex items-center gap-1.5"><Check className="w-3 h-3" /> Ready to submit</span>
                  ) : (
                    <span className="text-muted-foreground">Ready to record</span>
                  )}
                </div>
              </div>

              {/* Visualizer / Placeholder */}
              <div className="w-full h-24 flex items-center justify-center">
                {isRecording ? (
                  <MinimalAudioIndicator metrics={audioMetrics} className="w-full max-w-xs" />
                ) : (
                  <div className="w-full h-1 bg-muted rounded-full max-w-xs" />
                )}
              </div>

              {/* Controls: keep desktop layout but provide a compact, sticky bottom control for mobile */}
              <div className="hidden lg:flex items-center gap-6">
                {!isRecording && !audioURL && (
                  <Button
                    data-tutorial="record-button"
                    onClick={startRecording}
                    size="lg"
                    className="h-36 w-36 rounded-full bg-red-600 hover:bg-red-700 shadow-2xl hover:shadow-red-600/30 transition-all hover:scale-105 ring-4 ring-red-200/40 flex flex-col items-center justify-center gap-1"
                    aria-label="Start recording"
                  >
                    <Mic className="w-12 h-12 sm:w-14 sm:h-14" />
                    <span className="font-bold text-lg tracking-widest">RECORD</span>
                  </Button>
                )}

                {isRecording && (
                  <>
                    <Button
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      variant="outline"
                      size="lg"
                      className="h-24 px-12 rounded-full bg-orange-500 text-white hover:bg-orange-600 hover:text-white gap-3"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-8 h-8" />
                          <span className="font-bold text-xl">RESUME</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-8 h-8" />
                          <span className="font-bold text-xl">PAUSE</span>
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={stopRecording}
                      size="lg"
                      className="h-36 w-36 rounded-full bg-red-600 hover:bg-red-700 shadow-2xl hover:shadow-red-600/30 transition-all hover:scale-105 ring-4 ring-red-200/40 flex-col gap-1"
                      aria-label="Stop recording"
                    >
                      <Square className="w-10 h-10 fill-current" />
                      <span className="font-bold text-lg tracking-widest">STOP</span>
                    </Button>
                  </>
                )}

                {audioURL && !isRecording && (
                  <div className="flex gap-4">
                    <Button
                      onClick={resetRecording}
                      variant="outline"
                      className="h-12 px-6 rounded-full border-2"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Redo
                    </Button>
                    <Button
                      onClick={uploadRecording}
                      disabled={isUploading || isConverting}
                      className="h-12 px-8 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isUploading || isConverting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {isConverting ? "Converting..." : "Uploading..."}
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Submit
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Mobile sticky control: centered, compact, prominent */}
              <div className="lg:hidden fixed left-0 right-0 bottom-20 z-40 flex items-center justify-center pointer-events-none px-4 pb-[env(safe-area-inset-bottom)]">
                <div className="pointer-events-auto bg-card/95 backdrop-blur-md rounded-full p-2.5 shadow-xl border border-border flex items-center gap-2.5">
                  {isRecording ? (
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={isPaused ? resumeRecording : pauseRecording}
                        variant="outline"
                        size="sm"
                        className="h-16 px-6 rounded-full bg-orange-500 text-white hover:bg-orange-600 hover:text-white gap-2"
                        aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                      >
                        {isPaused ? (
                          <>
                            <Play className="w-5 h-5" />
                            <span className="font-bold text-base">RESUME</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-5 h-5" />
                            <span className="font-bold text-base">PAUSE</span>
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={stopRecording}
                        size="sm"
                        className="h-20 w-20 rounded-full bg-red-600 hover:bg-red-700 shadow-lg transition transform hover:scale-105 ring-4 ring-red-200/30 flex-col gap-1"
                        aria-label="Stop recording"
                      >
                        <Square className="w-6 h-6 fill-current" />
                        <span className="font-bold text-[10px] tracking-widest">STOP</span>
                      </Button>
                    </div>
                  ) : audioURL ? (
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={resetRecording}
                        variant="outline"
                        className="h-10 px-3 rounded-full border-2"
                        aria-label="Redo recording"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Redo
                      </Button>
                      <Button
                        onClick={uploadRecording}
                        disabled={isUploading || isConverting}
                        className="h-10 px-4 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-md"
                        aria-label="Submit recording"
                      >
                        {isUploading || isConverting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {isConverting ? "Converting" : "Uploading"}
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Submit
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={startRecording}
                      size="sm"
                      className="h-20 w-20 rounded-full bg-red-600 hover:bg-red-700 shadow-lg transition transform hover:scale-105 ring-4 ring-red-200/30 flex flex-col items-center justify-center gap-0.5"
                      aria-label="Start recording"
                    >
                      <Mic className="w-6 h-6" />
                      <span className="font-bold text-[10px] tracking-widest">RECORD</span>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Alert className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Pro Tip</AlertTitle>
            <AlertDescription className="text-blue-600/80 dark:text-blue-400/80 text-xs mt-1">
              Speak clearly and keep your device close. You can pause at any time if you need a break.
            </AlertDescription>
          </Alert>
          {/* Playback Preview */}
          {audioURL && !isRecording && (
            <Card className="border-none bg-muted/30">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <FileAudio className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                      <div>
                        <p className="font-medium text-sm">Recording Preview</p>
                        <p className="text-xs text-muted-foreground">{formatTime(recordingTime)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isEditingDisplayName ? (
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Input
                              value={displayName ?? ''}
                              onChange={(e) => setDisplayName(e.target.value)}
                              className="h-8 text-sm w-full sm:w-48"
                              maxLength={255}
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={handleInlineSaveDisplayName} className="h-8 w-8 p-0 flex-shrink-0">
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium truncate max-w-[150px] sm:max-w-none">{displayName ?? 'Untitled recording'}</span>
                            <Button size="sm" variant="ghost" onClick={() => setIsEditingDisplayName(true)} className="h-6 w-6 p-0 opacity-80 flex-shrink-0">
                              <Edit3 className="w-3 h-3" />
                            </Button>

                            {/* Download button (downloads converted blob if available, otherwise original) */}
                            <Button size="sm" variant="ghost" onClick={() => downloadRecording(true)} className="h-6 w-6 p-0 opacity-80 flex-shrink-0">
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isIOS() && (
                    <audio src={audioURL} controls className="h-8 w-full sm:w-48 mt-2 sm:mt-0" />
                  )}
                </div>
                
                {/* Progress Bars */}
                {(isConverting || isUploading) && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{isConverting ? conversionStep : "Uploading..."}</span>
                      <span>{Math.round(isConverting ? conversionProgress : (uploadProgress?.percentage || 0))}%</span>
                    </div>
                    <Progress
                      value={isConverting ? conversionProgress : (uploadProgress?.percentage || 0)}
                      className="h-1.5"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Talking Points */}
        <div className="lg:col-span-1 space-y-6">
          <TalkingPointsPanel
            talkingPoints={allTalkingPoints}
            currentIndex={currentTalkingPointIndex}
            onPrevious={prevTalkingPoint}
            onNext={nextTalkingPoint}
          />


        </div>
      </div>

      {/* Success Modal - Refined Minimalist Design */}
      <Dialog open={uploadSuccess} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[400px] p-0 border-none shadow-2xl bg-card overflow-hidden [&>button]:hidden">
          <div className="flex flex-col items-center text-center pt-10 pb-8 px-6 space-y-6">
            
            {/* Minimalist Animated Icon */}
            <div className="relative flex items-center justify-center">
               <div className="absolute inset-0 bg-green-500/10 rounded-full animate-ping opacity-20 duration-1000" />
               <div className="relative h-20 w-20 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center animate-in zoom-in-50 duration-300">
                 <Check className="h-10 w-10 text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150" strokeWidth={3} />
               </div>
            </div>

            <div className="space-y-1.5 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-100">
              <h2 className="text-xl font-semibold tracking-tight">Recording Saved</h2>
              <p className="text-sm text-muted-foreground">Your audio is now being processed.</p>
            </div>

            {/* Input Area */}
            <div className="w-full space-y-4 pt-2 animate-in slide-in-from-bottom-8 fade-in duration-500 delay-200">
               <div className="bg-muted/30 border rounded-xl px-3 py-2 text-left focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground pl-1">Name (Optional)</label>
                  <Input 
                    value={displayName || ""} 
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Untitled Session"
                    className="w-full bg-transparent border-none p-0 h-7 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50 shadow-none"
                    autoFocus
                  />
               </div>

               <div className="flex flex-col gap-2.5">
                  <Button 
                    size="lg"
                    onClick={async () => {
                      if (jobId && displayName && displayName.trim()) {
                        try {
                          await updateJobDisplayName(jobId, displayName.trim());
                        } catch(e) {}
                      }
                      if (jobId) router.navigate({ to: `/audio-recordings/${jobId}` });
                    }}
                    className="w-full h-11 shadow-md font-medium"
                  >
                    View Result
                    <ChevronRight className="w-4 h-4 ml-1 opacity-60" />
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onUploadComplete} 
                    className="w-full h-9 text-muted-foreground hover:text-foreground"
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

